import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { CurrencyPair, Timeframe, CandleData, IndicatorValues, SmcStructures } from '../../types';
import { ctraderMarketDataFeedService } from './ctraderMarketDataFeedService';
import { fetchRealCandleHistory, aggregateCandles } from '../../lib/marketDataGenerator';
import { calculateAllIndicators } from '../../lib/indicators';
import { analyzeSmcStructures, detectSupportResistance } from '../../lib/smcEngine';
import { detectChartPatterns, DetectedChartPattern } from '../../lib/chartPatternEngine';
import { aiDecisionEngine } from '../../../apps/decision-agent/src/services/aiDecisionEngine';
import { TradingRepository } from '@iati/database';
import { CTraderAdapter } from '../../../apps/execution-router/src/adapters/ctraderAdapter';

import { SignalIntelligenceService } from '../../../apps/decision-agent/src/services/signalIntelligenceService';
import { EconomicContextService } from './economicContextService';
import { economicCalendarProvider } from './economicCalendarProvider';
import { telegramNotificationService } from './telegramNotificationService';
import { getMarketStatus } from '../../lib/marketHours';

export interface DiscoveredSetup {
  id: string;
  timestamp: number;
  pair: CurrencyPair;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL';
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  breakEvenPrice?: number;
  reasons: string[];
  pattern?: DetectedChartPattern;
  status: 'EXECUTED' | 'SKIPPED_ALREADY_OPEN' | 'SKIPPED_PENDING_ORDER_EXISTS' | 'SKIPPED_COOLDOWN' | 'SKIPPED_RISK' | 'SKIPPED_ECONOMIC_EVENT' | 'SKIPPED_MARKET_CLOSED' | 'FAILED' | 'DISCOVERED' | 'DISCOVERED_BROADCAST_ONLY' | 'INVALID' | 'EXPIRED';
  executionDetails?: any;
  isValid?: boolean;
  invalidatedAt?: number;
  invalidationReason?: string;
  telegramBroadcastSent?: boolean;
  cancellationAlertSent?: boolean;
}

export class AutonomousMarketScannerService extends EventEmitter {
  private static instance: AutonomousMarketScannerService;
  private tradingRepo: TradingRepository;
  private isScanning: boolean = false;
  private scanTimer: NodeJS.Timeout | null = null;
  private scanIntervalMs: number = 20000; // Scan cycle every 20 seconds
  private lastScannedAt: number = 0;
  private currentlyScanning: { pair: CurrencyPair; timeframe?: Timeframe } | null = null;
  private cacheFilePath: string = path.resolve(process.cwd(), 'data', 'scanner_discovered_setups.json');

  private watchlist: CurrencyPair[] = [
    'EUR/USD', 'GBP/USD', 'EUR/JPY', 'GBP/JPY', 'USD/CHF',
    'NZD/USD', 'USD/CAD', 'AUD/USD'
  ];

  private timeframes: Timeframe[] = ['M15', 'H1', 'H4'];
  private cooldownLedger: Map<string, number> = new Map(); // pairKey -> last executed timestamp
  private pushedSignalLedger: Map<string, number> = new Map(); // pairKey -> last pushed signal timestamp
  private discoveredSetups: DiscoveredSetup[] = [];
  private activeEvaluatingSymbols: Set<string> = new Set(); // Symbol-level mutex
  private maxAccountConcurrentOrders: number = 2; // Strict cap on total concurrent active + pending orders
  private totalScanEvaluations: number = 0;
  private gradeACandidatesFound: number = 0;
  private secondOpinionsRequested: number = 0;
  private secondOpinionsConfirmed: number = 0;
  private secondOpinionsVetoed: number = 0;
  private secondOpinionCooldownLedger: Map<string, { timestamp: number; result: any }> = new Map();
  public static readonly SECOND_OPINION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes quota-protection throttle

  private constructor() {
    super();
    this.tradingRepo = new TradingRepository();
    this.loadFromDisk();
  }

  public static getInstance(): AutonomousMarketScannerService {
    if (!AutonomousMarketScannerService.instance) {
      AutonomousMarketScannerService.instance = new AutonomousMarketScannerService();
    }
    return AutonomousMarketScannerService.instance;
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.discoveredSetups = parsed;
          console.log(`[AutonomousMarketScanner] Loaded ${parsed.length} persisted setups from disk.`);
        }
      }
    } catch (err: any) {
      console.warn('[AutonomousMarketScanner] Cache load warning:', err.message);
    }
  }

  private lastSavedJson: string = '';

  private saveToDisk(): void {
    try {
      const currentJson = JSON.stringify(this.discoveredSetups, null, 2);
      if (currentJson === this.lastSavedJson) return; // No change, skip write
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFilePath, currentJson, 'utf-8');
      this.lastSavedJson = currentJson;
    } catch (err: any) {
      console.error('[AutonomousMarketScanner] Cache save error:', err.message);
    }
  }

  /**
   * Start the continuous background scanner daemon
   */
  public start(): void {
    if (this.isScanning) return;
    this.isScanning = true;
    console.log('🛰️ [AutonomousMarketScanner] Background multi-pair scanner daemon STARTED.');
    this.triggerScanCycle().catch(() => {});
    this.scanTimer = setInterval(() => {
      this.triggerScanCycle().catch(() => {});
    }, this.scanIntervalMs);
  }

  /**
   * Stop background scanner
   */
  public stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    this.isScanning = false;
    console.log('🛑 [AutonomousMarketScanner] Background multi-pair scanner daemon STOPPED.');
  }

  /**
   * Status overview
   */
  public getStatus() {
    this.pruneInvalidAndExpiredSetups().catch(() => {});
    const callsSaved = Math.max(0, this.totalScanEvaluations - this.secondOpinionsRequested);
    const savingsPercent = this.totalScanEvaluations > 0
      ? Number(((callsSaved / this.totalScanEvaluations) * 100).toFixed(1))
      : 100.0;

    return {
      isScanning: this.isScanning,
      scanIntervalMs: this.scanIntervalMs,
      lastScannedAt: this.lastScannedAt,
      currentlyScanning: this.currentlyScanning,
      watchlist: this.watchlist,
      timeframes: this.timeframes,
      maxAccountConcurrentOrders: this.maxAccountConcurrentOrders,
      discoveredSetupsCount: this.discoveredSetups.length,
      recentSetups: this.discoveredSetups.slice(0, 25),
      secondOpinionTelemetry: {
        totalEvaluations: this.totalScanEvaluations,
        gradeACandidatesFound: this.gradeACandidatesFound,
        secondOpinionsRequested: this.secondOpinionsRequested,
        secondOpinionsConfirmed: this.secondOpinionsConfirmed,
        secondOpinionsVetoed: this.secondOpinionsVetoed,
        geminiCallsSaved: callsSaved,
        geminiCallsSavedPercent: savingsPercent
      }
    };
  }

  public getDiscoveredSetups(): DiscoveredSetup[] {
    return this.discoveredSetups;
  }

  /**
   * Broadcast signal cancellation notification to Telegram subscribers
   */
  private notifySignalCancellation(setup: DiscoveredSetup, reason: string): void {
    if (setup.cancellationAlertSent) return;
    const wasBroadcast = setup.telegramBroadcastSent || setup.confidence >= 75;
    if (!wasBroadcast) return;

    setup.cancellationAlertSent = true;
    setup.invalidationReason = reason;

    telegramNotificationService.broadcastTradeEvent({
      pair: setup.pair,
      direction: setup.direction,
      timeframe: setup.timeframe,
      entryPrice: setup.entryPrice,
      stopLoss: setup.stopLoss,
      takeProfit1: setup.takeProfit1,
      takeProfit2: setup.takeProfit2,
      confidence: setup.confidence,
      status: 'SIGNAL_CANCELLED',
      cancellationReason: reason,
      tier: setup.confidence >= 85 ? 'FREE' : 'VIP'
    }).catch(err => {
      console.warn(`[AutonomousMarketScanner] Invalidation alert dispatch warning:`, err.message);
    });

    console.log(`🚫 [AutonomousMarketScanner] Dispatched SIGNAL CANCELLED alert to Telegram for ${setup.pair} (${reason}).`);
  }

  /**
   * Evaluates all currently stored setups and prunes any that are:
   * 1. Expired by Time-To-Live (TTL): M15=2h, H1=6h, H4=24h
   * 2. Invalidation Break (Price breaches SL before entry)
   * 3. Target Reached Without Entry (Price reached TP without retracement)
   */
  public async pruneInvalidAndExpiredSetups(): Promise<void> {
    const now = Date.now();
    const validSetups: DiscoveredSetup[] = [];
    let openDb: any[] = [];
    try {
      openDb = await this.tradingRepo.getOpenPositions('48282756');
    } catch {
      openDb = [];
    }

    for (const setup of this.discoveredSetups) {
      const pairKey = setup.pair.replace('/', '').toUpperCase();
      const isAlreadyOpen = openDb.some((p: any) => (p.symbol || '').replace('/', '').toUpperCase() === pairKey);

      // If position is active in broker/DB, mark as active
      if (isAlreadyOpen) {
        setup.status = 'SKIPPED_ALREADY_OPEN';
        validSetups.push(setup);
        continue;
      } else if (setup.status === 'SKIPPED_ALREADY_OPEN') {
        // Position was closed, unfreeze status to DISCOVERED
        setup.status = 'DISCOVERED';
      }

      // Check TTL based on timeframe
      const ttlMs = setup.timeframe === 'M15' 
        ? 2 * 60 * 60 * 1000 
        : (setup.timeframe === 'H1' ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000);

      const ctrader = new CTraderAdapter({ accountId: '48282756' });
      const INVALIDATION_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes cooling off period

      // If already marked INVALID: check if 2-minute cooling off period has expired
      if (setup.status === 'INVALID' || setup.isValid === false) {
        const invTime = setup.invalidatedAt || setup.timestamp || now;
        if (now - invTime >= INVALIDATION_COOLDOWN_MS) {
          console.log(`🗑️ [AutonomousMarketScanner] Auto-deleted expired INVALID setup for ${setup.pair} (${setup.direction}) after 2-minute cooldown period.`);
          if (setup.executionDetails?.brokerOrderId) {
            ctrader.cancelOrder(setup.executionDetails.brokerOrderId).catch(() => {});
          }
          continue; // Purged from discovered setups!
        } else {
          // Still within 2-minute cooldown: keep visible in radar with countdown
          validSetups.push(setup);
          continue;
        }
      }

      if (now - setup.timestamp > ttlMs) {
        console.log(`🧹 [AutonomousMarketScanner] Marked EXPIRED setup for ${setup.pair} (${setup.timeframe} ${setup.direction}) - Age > ${ttlMs / 3600000}h. Auto-delete in 2m.`);
        setup.status = 'INVALID';
        setup.isValid = false;
        setup.invalidatedAt = now;
        setup.invalidationReason = `Tamat tempoh sah (> ${ttlMs / 3600000} jam)`;
        this.notifySignalCancellation(setup, `Setup expired (> ${ttlMs / 3600000}h without fill)`);
        this.cooldownLedger.set(pairKey, now + INVALIDATION_COOLDOWN_MS);

        if (setup.executionDetails?.brokerOrderId) {
          ctrader.cancelOrder(setup.executionDetails.brokerOrderId).catch(() => {});
          delete setup.executionDetails.brokerOrderId;
        }
        validSetups.push(setup);
        continue;
      }

      // Check current live price for structural invalidation
      const liveCandles = ctraderMarketDataFeedService.getLiveCandles(setup.pair);
      const currentPrice = liveCandles.valid && liveCandles.candles.length > 0 
        ? liveCandles.candles[liveCandles.candles.length - 1].close 
        : null;

      if (currentPrice !== null && currentPrice > 0 && typeof setup.stopLoss === 'number' && typeof setup.takeProfit1 === 'number') {
        // Invalidation condition 1: Price breached Stop Loss before entry was triggered
        const isSlBreached = setup.direction === 'BUY' 
          ? currentPrice <= setup.stopLoss 
          : currentPrice >= setup.stopLoss;

        if (isSlBreached) {
          console.log(`❌ [AutonomousMarketScanner] Marked INVALID setup for ${setup.pair} (${setup.direction}) - Price ${currentPrice} breached SL ${setup.stopLoss}. Auto-delete in 2m. No cTrader pending order.`);
          setup.status = 'INVALID';
          setup.isValid = false;
          setup.invalidatedAt = now;
          setup.invalidationReason = `Harga pasaran (${currentPrice}) melepasi SL (${setup.stopLoss}) sebelum entri`;
          this.notifySignalCancellation(setup, `Market price (${currentPrice}) breached SL (${setup.stopLoss}) before entry fill`);
          this.cooldownLedger.set(pairKey, now + INVALIDATION_COOLDOWN_MS);

          // CANCEL any pending order at cTrader immediately
          if (setup.executionDetails?.brokerOrderId) {
            ctrader.cancelOrder(setup.executionDetails.brokerOrderId).catch(() => {});
            delete setup.executionDetails.brokerOrderId;
          }
          validSetups.push(setup);
          continue;
        }

        // Invalidation condition 2: Price reached TP without triggering entry
        const isTpHitEarly = setup.direction === 'BUY'
          ? currentPrice >= setup.takeProfit1
          : currentPrice <= setup.takeProfit1;

        if (isTpHitEarly) {
          console.log(`🎯 [AutonomousMarketScanner] Marked INVALID (TP1 Hit Early) setup for ${setup.pair} (${setup.direction}) - Auto-delete in 2m. No cTrader pending order.`);
          setup.status = 'INVALID';
          setup.isValid = false;
          setup.invalidatedAt = now;
          setup.invalidationReason = `Harga pasaran (${currentPrice}) mencecah TP1 (${setup.takeProfit1}) sebelum sempat entri`;
          this.notifySignalCancellation(setup, `Market price (${currentPrice}) reached TP1 (${setup.takeProfit1}) before entry fill`);
          this.cooldownLedger.set(pairKey, now + INVALIDATION_COOLDOWN_MS);

          // CANCEL any pending order at cTrader immediately
          if (setup.executionDetails?.brokerOrderId) {
            ctrader.cancelOrder(setup.executionDetails.brokerOrderId).catch(() => {});
            delete setup.executionDetails.brokerOrderId;
          }
          validSetups.push(setup);
          continue;
        }
      }

      setup.isValid = true;
      validSetups.push(setup);
    }

    if (validSetups.length !== this.discoveredSetups.length || validSetups.some(s => s.status === 'INVALID')) {
      this.discoveredSetups = validSetups;
      this.saveToDisk();
    }
  }

  /**
   * Continuous self-healing broker watchdog:
   * 1. Auto-cancels duplicate pending orders for the same symbol (keeps only newest).
   * 2. Auto-cancels extreme-distance orders (>100 pips on FX/JPY, >$50 on Gold).
   * 3. Auto-cancels unhedged pending orders missing SL/TP.
   */
  public async reconcileAndHealBrokerOrders(pendingOrders: any[], ctrader: CTraderAdapter): Promise<any[]> {
    if (!pendingOrders || pendingOrders.length === 0) return [];

    const ordersBySymbol: Map<string, any[]> = new Map();
    for (const order of pendingOrders) {
      const symKey = (order.symbol || '').replace('/', '').toUpperCase();
      if (!ordersBySymbol.has(symKey)) ordersBySymbol.set(symKey, []);
      ordersBySymbol.get(symKey)!.push(order);
    }

    const survivingOrders: any[] = [];

    for (const [symKey, orders] of ordersBySymbol.entries()) {
      // Sort newest first
      orders.sort((a, b) => Number(b.orderId) - Number(a.orderId));
      const [newestOrder, ...duplicates] = orders;

      // 1. Auto-cancel duplicate orders on same symbol
      for (const dup of duplicates) {
        console.log(`🛡️ [Self-Healing Watchdog] Auto-cancelling duplicate pending order #${dup.orderId} on ${symKey}.`);
        await ctrader.cancelOrder(dup.orderId).catch(() => {});
      }

      // 2. Check price distance vs current live market spot
      const liveCandles = ctraderMarketDataFeedService.getLiveCandles(newestOrder.symbol as any);
      const currentSpot = liveCandles.valid && liveCandles.candles.length > 0
        ? liveCandles.candles[liveCandles.candles.length - 1].close
        : null;

      let isInvalid = false;
      if (currentSpot !== null && currentSpot > 0 && typeof newestOrder.limitPrice === 'number') {
        const isJpy = symKey.includes('JPY');
        const isGold = symKey.includes('XAU') || symKey.includes('GOLD');
        const maxDist = isGold ? 50.0 : (isJpy ? 1.0 : 0.0100); // 100 pips max allowed pending limit distance

        const dist = Math.abs(currentSpot - newestOrder.limitPrice);
        if (dist > maxDist) {
          console.log(`🛡️ [Self-Healing Watchdog] Auto-cancelling extreme distance pending order #${newestOrder.orderId} on ${symKey} (distance: ${dist.toFixed(4)} > max ${maxDist}).`);
          await ctrader.cancelOrder(newestOrder.orderId).catch(() => {});
          isInvalid = true;
        }
      }

      // 3. Auto-cancel unhedged pending orders missing Stop Loss
      if (!isInvalid && (!newestOrder.stopLoss || newestOrder.stopLoss <= 0)) {
        console.log(`🛡️ [Self-Healing Watchdog] Auto-cancelling unhedged pending order #${newestOrder.orderId} on ${symKey} (missing SL).`);
        await ctrader.cancelOrder(newestOrder.orderId).catch(() => {});
        isInvalid = true;
      }

      if (!isInvalid) {
        survivingOrders.push(newestOrder);
      }
    }

    return survivingOrders;
  }

  /**
   * Execute one full scan cycle across all pairs sequentially per symbol to eliminate race conditions
   */
  public async triggerScanCycle(): Promise<void> {
    try {
      this.lastScannedAt = Date.now();
      await this.pruneInvalidAndExpiredSetups();

      // Query live broker state (both active positions and pending limit orders)
      const ctrader = new CTraderAdapter({ accountId: '48282756' });
      let pendingOrders: any[] = [];
      let openDbPositions: any[] = [];

      try {
        const { brokerReconciliationService } = await import('../../../apps/execution-router/src/services/brokerReconciliationService');
        await brokerReconciliationService.reconcile('48282756').catch(() => {});
      } catch (_) {}

      try {
        const rawPending = await ctrader.getPendingOrders();
        pendingOrders = await this.reconcileAndHealBrokerOrders(rawPending, ctrader);
      } catch (err: any) {
        console.warn('[AutonomousMarketScanner] Notice: could not fetch broker pending orders:', err.message);
        pendingOrders = [];
      }

      try {
        const allOpenDb = await this.tradingRepo.query(`SELECT * FROM positions WHERE status = 'OPEN'`);
        openDbPositions = allOpenDb.rows.map(r => this.tradingRepo.mapPositionRow(r));
      } catch {
        openDbPositions = [];
      }

      // Authoritative live broker positions directly from cTrader Open API
      let liveBrokerSymbols = new Set<string>();
      try {
        const livePositions = await ctrader.getOpenPositions();
        for (const p of livePositions) {
          const sym = (p.symbol || '').replace('/', '').toUpperCase();
          if (sym) liveBrokerSymbols.add(sym);
        }
      } catch (_) {}

      const totalActiveAndPending = pendingOrders.length + Math.max(openDbPositions.length, liveBrokerSymbols.size);

      // Evaluate each watchlist pair (sequential per pair to avoid concurrency collisions)
      for (const pair of this.watchlist) {
        await this.evaluateSinglePair(pair, ctrader, pendingOrders, openDbPositions, liveBrokerSymbols, totalActiveAndPending);
      }

      await this.pruneInvalidAndExpiredSetups();
      this.currentlyScanning = null;
    } catch (err: any) {
      console.error('[AutonomousMarketScanner] Scan cycle error:', err.message);
    }
  }

  /**
   * Evaluate all timeframes for a single pair and choose the SINGLE best setup
   */
  private async evaluateSinglePair(
    pair: CurrencyPair,
    ctrader: CTraderAdapter,
    brokerPendingOrders: any[],
    openDbPositions: any[],
    liveBrokerSymbols: Set<string>,
    totalActiveAndPending: number
  ): Promise<void> {
    const pairKey = pair.replace('/', '').toUpperCase();

    // Acquire symbol-level mutex
    if (this.activeEvaluatingSymbols.has(pairKey)) {
      return;
    }
    this.activeEvaluatingSymbols.add(pairKey);

    try {
      this.currentlyScanning = { pair };

      // 1. Strict Invariant: Check if there is already an OPEN position on this pair (DB or live Broker)
      const isAlreadyOpen = openDbPositions.some(
        (p: any) => (p.symbol || '').replace('/', '').toUpperCase() === pairKey
      ) || liveBrokerSymbols.has(pairKey);
      if (isAlreadyOpen) {
        return;
      }

      // 2. Check existing broker pending orders for this pair
      const existingPending = brokerPendingOrders.filter(
        (o: any) => (o.symbol || '').replace('/', '').toUpperCase() === pairKey
      );

      // 3. Scan all timeframes for this pair and collect candidate setups
      const candidateSetups: Array<{
        timeframe: Timeframe;
        direction: 'BUY' | 'SELL';
        confidence: number;
        entryPrice: number;
        stopLoss: number;
        takeProfit1: number;
        reasons: string[];
        pattern?: DetectedChartPattern;
        lotSize: number;
      }> = [];

      for (const tf of this.timeframes) {
        const res = await this.analyzePairTimeframe(pair, tf);
        if (res) {
          candidateSetups.push(res);
        }
      }

      if (candidateSetups.length === 0) {
        return; // No valid A-Grade setup found on any timeframe
      }

      // 4. Select the single best setup with highest confidence
      candidateSetups.sort((a, b) => b.confidence - a.confidence);
      const best = candidateSetups[0];

      const setupId = `setup_${pairKey}_${best.timeframe}_${best.direction}`;
      const existingIdx = this.discoveredSetups.findIndex(s => s.pair === pair);
      const existingSetup = existingIdx >= 0 ? this.discoveredSetups[existingIdx] : null;

      // 5. If broker already has a valid pending order for this pair:
      if (existingPending.length > 0) {
        const activeOrder = existingPending[0];

        // Check if existing pending order is for the exact same direction and within price tolerance
        const isSameDirection = activeOrder.tradeSide === best.direction;
        const priceDiffPips = activeOrder.limitPrice
          ? Math.abs(activeOrder.limitPrice - best.entryPrice) * (pair.includes('JPY') ? 100 : 10000)
          : 0;

        if (isSameDirection && priceDiffPips <= 5.0) {
          // Existing order is already optimal — do not duplicate
          const item: DiscoveredSetup = {
            id: setupId,
            timestamp: Date.now(),
            pair,
            timeframe: best.timeframe,
            direction: best.direction,
            confidence: best.confidence,
            entryPrice: best.entryPrice,
            stopLoss: best.stopLoss,
            takeProfit1: best.takeProfit1,
            reasons: best.reasons,
            pattern: best.pattern,
            status: 'SKIPPED_PENDING_ORDER_EXISTS'
          };
          if (existingIdx >= 0) this.discoveredSetups[existingIdx] = item;
          else this.recordDiscoveredSetup(item);
          return;
        }

        // Stale or divergent pending order exists -> CANCEL the old order first before replacing
        for (const staleOrder of existingPending) {
          console.log(`🔄 [AutonomousMarketScanner] Cancelling stale pending order #${staleOrder.orderId} on ${pair} before placing updated setup.`);
          await ctrader.cancelOrder(staleOrder.orderId).catch(err => {
            console.warn(`[AutonomousMarketScanner] Warning: could not cancel stale order #${staleOrder.orderId}:`, err.message);
          });
        }
      }

      // 6. Check Account-Wide Concurrent Exposure Limit
      const isMasterAccountFull = totalActiveAndPending >= this.maxAccountConcurrentOrders;
      if (isMasterAccountFull) {
        console.log(`ℹ️ [AutonomousMarketScanner] Note: Master account currently at max capacity (${totalActiveAndPending}/${this.maxAccountConcurrentOrders}). Scanner will continue discovering Grade-A signals for Telegram subscribers.`);
      }

      // 7. Enforce In-Memory Micro Cooldown (2 minutes between consecutive executions or invalidation cooling off)
      const EXECUTION_COOLDOWN_MS = 2 * 60 * 1000;
      const lastExec = this.cooldownLedger.get(pairKey);
      if (lastExec) {
        const cooldownRemaining = lastExec > Date.now() 
          ? (lastExec - Date.now()) 
          : (EXECUTION_COOLDOWN_MS - (Date.now() - lastExec));

        if (cooldownRemaining > 0) {
          console.log(`⏳ [AutonomousMarketScanner] Skipping ${pair} - Pair in micro cooling off period (${Math.ceil(cooldownRemaining / 1000)}s remaining). No cTrader order.`);
          const item: DiscoveredSetup = {
            id: setupId,
            timestamp: Date.now(),
            pair,
            timeframe: best.timeframe,
            direction: best.direction,
            confidence: best.confidence,
            entryPrice: best.entryPrice,
            stopLoss: best.stopLoss,
            takeProfit1: best.takeProfit1,
            reasons: best.reasons,
            pattern: best.pattern,
            status: 'SKIPPED_COOLDOWN',
            isValid: true
          };
          if (existingIdx >= 0) this.discoveredSetups[existingIdx] = item;
          else this.recordDiscoveredSetup(item);
          return;
        }
      }

      // 8. Enforce Real-Time Global Economic Calendar & News Blackout Defense (±30m)
      economicCalendarProvider.getWeeklyEvents();
      const econEval = EconomicContextService.evaluateEconomicContext({
        symbol: pairKey,
        windowMinutes: 30
      });

      if (!econEval.decisionAllowed || econEval.hasHighImpactEventActive) {
        console.log(`🛡️ [AutonomousMarketScanner] Economic Veto Active for ${pair}: ${econEval.reason} (High-impact news active in ±30m window). No cTrader order.`);
        const item: DiscoveredSetup = {
          id: setupId,
          timestamp: Date.now(),
          pair,
          timeframe: best.timeframe,
          direction: best.direction,
          confidence: best.confidence,
          entryPrice: best.entryPrice,
          stopLoss: best.stopLoss,
          takeProfit1: best.takeProfit1,
          reasons: [`🔴 DIELAKKAN: Peristiwa Ekonomi Berimpak Tinggi (${econEval.reason}) dalam tempoh ±30m`, ...best.reasons],
          pattern: best.pattern,
          status: 'SKIPPED_ECONOMIC_EVENT',
          isValid: true
        };
        if (existingIdx >= 0) this.discoveredSetups[existingIdx] = item;
        else this.recordDiscoveredSetup(item);

        // Alert subscribers that capital was protected from high-impact news
        telegramNotificationService.broadcastNewsAlert({
          eventId: `veto-${pair}-${Date.now()}`,
          title: econEval.reason || 'High-Impact Economic News Active',
          currency: pairKey.slice(0, 3),
          impact: 'HIGH',
          timeStr: new Date().toUTCString(),
          timestamp: Date.now(),
          affectedPairs: [pair],
          type: 'TRADE_VETO',
          reason: econEval.reason
        }).catch(() => {});

        return;
      }

      // 9. Enforce Weekend Market Hours Awareness (Forex/Metals/Indices closed, Crypto 24/7 active)
      const marketStatus = getMarketStatus(pair);
      if (!marketStatus.isOpen) {
        console.log(`⏸️ [AutonomousMarketScanner] Market Closed for ${pair} (Weekend). Next open: ${marketStatus.formattedNextOpenEn}. No broker order.`);
        const item: DiscoveredSetup = {
          id: setupId,
          timestamp: Date.now(),
          pair,
          timeframe: best.timeframe,
          direction: best.direction,
          confidence: best.confidence,
          entryPrice: best.entryPrice,
          stopLoss: best.stopLoss,
          takeProfit1: best.takeProfit1,
          reasons: [`🔴 PASARAN DITUTUP: Pasaran ${pair} ditutup untuk hujung minggu. Dibuka semula ${marketStatus.formattedNextOpenMs}.`, ...best.reasons],
          pattern: best.pattern,
          status: 'SKIPPED_MARKET_CLOSED',
          isValid: true
        };
        if (existingIdx >= 0) this.discoveredSetups[existingIdx] = item;
        else this.recordDiscoveredSetup(item);
        return;
      }

      // Set cooldown on this pair immediately
      this.cooldownLedger.set(pairKey, Date.now());

      console.log(`🎯 [AutonomousMarketScanner] Discovered Best A-Grade setup on ${pair} ${best.timeframe} (${best.direction} Limit @ ${best.entryPrice}, SL: ${best.stopLoss}, TP: ${best.takeProfit1}, Conf: ${best.confidence}%, Lot: ${best.lotSize}).`);

      // Calculate runner TP2 (2x risk:reward)
      const tp2Runner = best.direction === 'BUY'
        ? +(best.entryPrice + (best.takeProfit1 - best.entryPrice) * 1.8).toFixed(pair.includes('JPY') ? 3 : 5)
        : +(best.entryPrice - (best.entryPrice - best.takeProfit1) * 1.8).toFixed(pair.includes('JPY') ? 3 : 5);

      const discovered: DiscoveredSetup = {
        id: setupId,
        timestamp: Date.now(),
        pair,
        timeframe: best.timeframe,
        direction: best.direction,
        confidence: best.confidence,
        entryPrice: best.entryPrice,
        stopLoss: best.stopLoss,
        takeProfit1: best.takeProfit1,
        takeProfit2: tp2Runner,
        breakEvenPrice: best.entryPrice,
        reasons: best.reasons,
        pattern: best.pattern,
        status: 'DISCOVERED',
        isValid: true
      };

      if (existingIdx >= 0) this.discoveredSetups[existingIdx] = discovered;
      else this.recordDiscoveredSetup(discovered);
      this.emit('tradeExecuted', discovered);

      // PUSH TO TELEGRAM IMMEDIATELY UPON GRADE-A SIGNAL DISCOVERY!
      const lastPushed = this.pushedSignalLedger.get(pairKey);
      const PUSH_DEBOUNCE_MS = 15 * 60 * 1000; // 15 mins debounce per pair
      const canPushTelegram = !lastPushed || (Date.now() - lastPushed > PUSH_DEBOUNCE_MS);

      if (canPushTelegram && best.confidence >= 75) {
        discovered.telegramBroadcastSent = true;
        this.pushedSignalLedger.set(pairKey, Date.now());
        telegramNotificationService.broadcastTradeEvent({
          pair: best.pair || pair,
          direction: best.direction,
          timeframe: best.timeframe,
          entryPrice: best.entryPrice,
          stopLoss: best.stopLoss,
          takeProfit1: best.takeProfit1,
          takeProfit2: tp2Runner,
          confidence: best.confidence,
          reasons: best.reasons,
          lotSize: best.lotSize,
          tier: best.confidence >= 85 ? 'FREE' : 'VIP',
          status: 'ENTRY_DISPATCHED'
        }).catch(() => {});
        this.saveToDisk();
        console.log(`📡 [AutonomousMarketScanner] PUSHED Grade-A Signal on ${pair} (${best.direction} @ ${best.entryPrice}, Conf: ${best.confidence}%) directly to Telegram upon discovery!`);
      }

      // Guard: Never dispatch to cTrader if status is INVALID, not valid, or confidence < 70
      if (discovered.status === 'INVALID' || discovered.isValid === false || best.confidence < 70) {
        console.warn(`🛑 [AutonomousMarketScanner] Pending order to cTrader BLOCKED: Signal is INVALID or confidence < 70% (${best.confidence}%).`);
        return;
      }

      // Guard: Check if Master account is full
      if (isMasterAccountFull) {
        console.log(`🛡️ [AutonomousMarketScanner] Master account position limit reached (${totalActiveAndPending}/${this.maxAccountConcurrentOrders}). Grade-A Signal was successfully pushed to Telegram subscribers, but master cTrader broker order skipped.`);
        discovered.status = 'DISCOVERED_BROADCAST_ONLY';
        return;
      }

      // Auto-dispatch single pending limit order to cTrader DEMO
      try {
        await ctrader.connect();
        const orderResult = await ctrader.placeOrder({
          order_id: `ord_${setupId}_${Date.now()}`,
          proposal_id: setupId,
          symbol: pair,
          direction: best.direction,
          order_type: 'LIMIT',
          quantity: best.lotSize,
          price: best.entryPrice,
          stop_loss: best.stopLoss,
          take_profit: best.takeProfit1,
          time_in_force: 'GTC',
          broker_id: 'ctrader-broker-01',
          timestamp: new Date()
        });

        console.log(`🚀 [AutonomousMarketScanner] Auto-dispatched Single Pending ${best.direction} Limit order for ${pair} to cTrader DEMO. Broker Order ID: ${orderResult.broker_order_id || orderResult.report_id}`);

        discovered.status = 'EXECUTED';
        discovered.executionDetails = {
          brokerOrderId: orderResult.broker_order_id || orderResult.report_id,
          dispatchedAt: Date.now()
        };
        const updatedIdx = this.discoveredSetups.findIndex(s => s.id === setupId);
        if (updatedIdx >= 0) {
          this.discoveredSetups[updatedIdx] = discovered;
        }
        this.saveToDisk();
      } catch (autoErr: any) {
        console.warn(`[AutonomousMarketScanner] Auto-dispatch notice for ${pair}:`, autoErr.message);
      }
    } finally {
      this.activeEvaluatingSymbols.delete(pairKey);
    }
  }

  /**
   * Internal analysis for a specific pair and timeframe
   */
  private async analyzePairTimeframe(pair: CurrencyPair, tf: Timeframe) {
    try {
      let candles: CandleData[] = [];
      const liveResult = ctraderMarketDataFeedService.getLiveCandles(pair);
      if (liveResult.valid && liveResult.candles.length >= 15) {
        if (tf === 'M1') {
          candles = liveResult.candles;
        } else {
          candles = aggregateCandles(liveResult.candles, tf as any);
        }
      }

      if (candles.length < 15) {
        const fallback = await fetchRealCandleHistory(pair, tf as any, 100).catch(() => []);
        if (fallback && fallback.length > 0) {
          candles = fallback;
        }
      }

      if (!candles || candles.length < 15) {
        return null;
      }

      const livePrice = ctraderMarketDataFeedService.getLivePrice(pair);
      if (livePrice && livePrice > 0) {
        const lastClose = candles[candles.length - 1].close;
        if (lastClose > 0 && Math.abs(lastClose - livePrice) / livePrice > 0.03) {
          const ratio = livePrice / lastClose;
          candles = candles.map(c => ({
            ...c,
            open: Number((c.open * ratio).toFixed(5)),
            high: Number((c.high * ratio).toFixed(5)),
            low: Number((c.low * ratio).toFixed(5)),
            close: Number((c.close * ratio).toFixed(5))
          }));
        }
      }

      const latest = candles[candles.length - 1];
      const currentPrice = (livePrice && livePrice > 0) ? livePrice : latest.close;

      this.totalScanEvaluations++;

      const indicators: IndicatorValues = calculateAllIndicators(candles);
      const smcData: SmcStructures = analyzeSmcStructures(candles, tf);

      // Evaluate Real-Time Economic Context for this symbol
      economicCalendarProvider.getWeeklyEvents();
      const rawSym = pair.replace(/[\/\-_]/g, '').toUpperCase();
      const econEval = EconomicContextService.evaluateEconomicContext({
        symbol: rawSym,
        windowMinutes: 30
      });

      const activeEventsSummary = econEval.activeEvents.map(e => `${e.title} (${e.impact}) @ ${e.time}`).join(', ');
      const newsContextStr = econEval.hasHighImpactEventActive
        ? `⚠️ HIGH IMPACT ECONOMIC EVENT ACTIVE (±30m blackout): ${activeEventsSummary || econEval.reason}`
        : (activeEventsSummary ? `Upcoming events: ${activeEventsSummary}` : 'No immediate high impact news scheduled.');

      // PASS 1: Fast local quantitative SMC evaluation with candlestick confirmation
      const candidateSetup = SignalIntelligenceService.getInstance().evaluateCandidateSetup({
        pair,
        timeframe: tf,
        style: 'DAY_TRADER',
        currentPrice,
        indicators,
        smc: smcData,
        newsContext: newsContextStr,
        postMortemReviews: aiDecisionEngine.getPostMortemReviews(),
        candles
      });

      if (!candidateSetup) return null;

      const rawAction = String((candidateSetup as any).type || candidateSetup.action || (candidateSetup.bias === 'BULLISH' ? 'BUY' : candidateSetup.bias === 'BEARISH' ? 'SELL' : '')).toUpperCase();
      let direction: 'BUY' | 'SELL' | null = null;
      if (rawAction.includes('BUY')) direction = 'BUY';
      else if (rawAction.includes('SELL')) direction = 'SELL';

      const confidence = Number(candidateSetup.confidence || 0);

      // Check if setup meets A-Grade standard (Confidence >= 70%)
      // If NOT Grade A, discard immediately without invoking Gemini (saves 95%+ API calls!)
      if (!direction || confidence < 70) {
        return null;
      }

      this.gradeACandidatesFound++;

      // PASS 2: Gemini AI Second Opinion & Risk Veto Gate (Throttled to at most ONCE per 30 minutes per symbol/TF)
      const secondOpinionKey = `${pair}_${tf}_${direction}`;
      const existingSecondOpinion = this.secondOpinionCooldownLedger.get(secondOpinionKey);
      let secondOpinion: any;

      if (existingSecondOpinion && (Date.now() - existingSecondOpinion.timestamp < AutonomousMarketScannerService.SECOND_OPINION_COOLDOWN_MS)) {
        // Reuse cached second opinion within 30-minute window (0 API calls!)
        secondOpinion = existingSecondOpinion.result;
      } else {
        this.secondOpinionsRequested++;
        secondOpinion = await aiDecisionEngine.getSecondOpinion({
          pair,
          timeframe: tf,
          direction,
          currentPrice,
          entryZone: candidateSetup.entryZone,
          stopLoss: candidateSetup.stopLoss,
          takeProfit1: candidateSetup.takeProfit1,
          takeProfit2: candidateSetup.takeProfit2,
          riskRewardRatio: candidateSetup.riskRewardRatio,
          confidence,
          reasons: candidateSetup.reasons || [],
          indicators,
          smc: smcData,
          newsContext: newsContextStr,
          postMortemReviews: aiDecisionEngine.getPostMortemReviews()
        }).catch(err => {
          console.warn(`[AutonomousMarketScanner] Second opinion failed for ${pair} ${tf}:`, err.message);
          return {
            confirmed: true,
            decision: 'CONFIRM' as const,
            confidence,
            reasons: candidateSetup.reasons || [],
            source: 'DETERMINISTIC_LOCAL' as const
          };
        });

        this.secondOpinionCooldownLedger.set(secondOpinionKey, {
          timestamp: Date.now(),
          result: secondOpinion
        });
      }

      // If Gemini AI Risk Controller vetoed this Grade A candidate, respect the veto!
      if (!secondOpinion.confirmed || secondOpinion.decision === 'VETO') {
        this.secondOpinionsVetoed++;
        console.log(`🛑 [AutonomousMarketScanner] Grade A candidate for ${pair} (${tf} ${direction}) VETOED by Gemini Second Opinion: ${secondOpinion.vetoReason || 'Risk boundary conflict'}`);
        return null;
      }

      this.secondOpinionsConfirmed++;

      // Chart Patterns Detection
      const detectedPatterns = detectChartPatterns(candles, tf);
      const primaryPattern = detectedPatterns.find(p => (direction === 'BUY' && p.direction === 'UP') || (direction === 'SELL' && p.direction === 'DOWN')) || detectedPatterns[0];

      let finalConfidence = secondOpinion.confidence || confidence;
      const combinedReasons = [...(secondOpinion.reasons || candidateSetup.reasons || [])];
      if (secondOpinion.source === 'GEMINI_AI_LIVE') {
        combinedReasons.unshift(`🤖 Gemini Second Opinion: Disahkan (Keyakinan ${finalConfidence}%) - ${secondOpinion.decision}`);
      }
      if (primaryPattern) {
        if ((direction === 'BUY' && primaryPattern.direction === 'UP') || (direction === 'SELL' && primaryPattern.direction === 'DOWN')) {
          finalConfidence = Math.min(96, confidence + 4);
          combinedReasons.unshift(`📐 Autochartist: Corak ${primaryPattern.name} disahkan (Kualiti ${primaryPattern.quality}/10) menyokong ${direction}.`);
        } else {
          combinedReasons.push(`⚠️ Autochartist: Amaran corak ${primaryPattern.name} (${primaryPattern.direction}).`);
        }
      }

      const isJpy = pair.includes('JPY');
      const isGold = pair.includes('XAU') || pair.includes('GOLD');
      const isBtc = pair.includes('BTC');
      const isNas = pair.includes('NAS') || pair.includes('TECH') || pair.includes('USTEC');

      const pipMultiplier = isJpy ? 0.01 : (isGold || isBtc || isNas) ? 1 : 0.0001;
      const pullbackPips = isJpy ? 15.0 : (isGold ?  8.0 : (isNas ? 40.0 : (isBtc ? 200.0 : 10.0)));
      const slPips = isJpy ? 35.0 : (isGold ?  45.0 : (isNas ? 100.0 : (isBtc ? 500.0 : 30.0)));
      const tpPips = isJpy ? 70.0 : (isGold ?  90.0 : (isNas ? 200.0 : (isBtc ? 1000.0 : 60.0)));

      const retracementEntryPrice = direction === 'BUY' 
        ? currentPrice - (pullbackPips * pipMultiplier) 
        : currentPrice + (pullbackPips * pipMultiplier);

      const calculatedSl = direction === 'BUY' 
        ? retracementEntryPrice - (slPips * pipMultiplier) 
        : retracementEntryPrice + (slPips * pipMultiplier);

      const calculatedTp = direction === 'BUY' 
        ? retracementEntryPrice + (tpPips * pipMultiplier) 
        : retracementEntryPrice - (tpPips * pipMultiplier);

      const decimals = isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5;
      const finalEntryPrice = Number(retracementEntryPrice.toFixed(decimals));
      const slVal = Number(calculatedSl.toFixed(decimals));
      const tpVal = Number(calculatedTp.toFixed(decimals));

      const lotSize = isNas ? 1.0 : (isBtc ? 0.01 : (finalConfidence >= 80 ? 0.02 : 0.01));

      return {
        timeframe: tf,
        direction,
        confidence: finalConfidence,
        entryPrice: finalEntryPrice,
        stopLoss: slVal,
        takeProfit1: tpVal,
        reasons: combinedReasons,
        pattern: primaryPattern,
        lotSize
      };
    } catch {
      return null;
    }
  }

  private recordDiscoveredSetup(setup: DiscoveredSetup) {
    this.discoveredSetups.unshift(setup);
    if (this.discoveredSetups.length > 50) {
      this.discoveredSetups.pop();
    }
    this.saveToDisk();
  }
}

export const autonomousMarketScannerService = AutonomousMarketScannerService.getInstance();
