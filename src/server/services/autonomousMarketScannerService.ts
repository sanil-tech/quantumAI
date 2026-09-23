import { observeClosedTrend } from './positionTrendObserver';
import { approveCopierSignal, confirmMasterOrder, MIN_AUTOMATED_SIGNAL_CONFIDENCE } from './copierSafetyPolicy';
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
import { getMarketStatus, isCryptoPair } from '../../lib/marketHours';
import { signalValidationGate } from './validation/signalValidationGate';
import { executionEligibilityGate } from './validation/executionEligibilityGate';
import { CanonicalSignal, ValidationReport } from './validation/signalValidationTypes';

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
  status: 'EXECUTED' | 'SKIPPED_ALREADY_OPEN' | 'SKIPPED_PENDING_ORDER_EXISTS' | 'SKIPPED_COOLDOWN' | 'SKIPPED_RISK' | 'SKIPPED_ECONOMIC_EVENT' | 'SKIPPED_MARKET_CLOSED' | 'FAILED' | 'DISCOVERED' | 'DISCOVERED_CAPACITY_REACHED' | 'DISCOVERED_BROADCAST_ONLY' | 'DISCOVERED_EXECUTION_FAILED' | 'INVALID' | 'EXPIRED';
  executionDetails?: any;
  isValid?: boolean;
  invalidatedAt?: number;
  invalidationReason?: string;
  telegramBroadcastSent?: boolean;
  cancellationAlertSent?: boolean;
  entryMode?: string;
  distancePips?: number;
  canonicalSignal?: CanonicalSignal;
  validationReport?: ValidationReport;
}

export class AutonomousMarketScannerService extends EventEmitter {
  private static instance: AutonomousMarketScannerService;
  private tradingRepo: TradingRepository;
  private isScanning: boolean = false;
  private scanCycleRunning = false;
  private waitingOpportunities = new Map<string, DiscoveredSetup>();
  private positionObserverBroker = new CTraderAdapter({accountId:'48282756'});
  private positionTrendObservation: any = {mode: 'OBSERVE_ONLY', executionAllowed: false, status: 'NOT_RUN', positions: []};
  private scanTimer: NodeJS.Timeout | null = null;
  private scanIntervalMs: number = 60000; // Scan cycle every 60 seconds (1-minute candle close aligned)
  private lastScannedAt: number = 0;
  private currentlyScanning: { pair: CurrencyPair; timeframe?: Timeframe } | null = null;
  private cacheFilePath: string = path.resolve(process.cwd(), 'data', 'scanner_discovered_setups.json');

  private watchlist: CurrencyPair[] = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'NZD/USD', 'USD/CAD',
    'EUR/GBP', 'EUR/JPY', 'EUR/AUD', 'EUR/CAD', 'EUR/CHF', 'EUR/NZD',
    'GBP/JPY', 'GBP/AUD', 'GBP/CAD', 'GBP/CHF', 'GBP/NZD',
    'AUD/JPY', 'AUD/CAD', 'AUD/CHF', 'AUD/NZD',
    'NZD/JPY', 'NZD/CAD', 'NZD/CHF',
    'CAD/JPY', 'CAD/CHF',
    'CHF/JPY'
  ];

  private timeframes: Timeframe[] = ['M5', 'M15', 'H1', 'H4'];
  private cooldownLedger: Map<string, number> = new Map(); // pairKey -> last executed timestamp
  private pushedSignalLedger: Map<string, number> = new Map(); // pairKey -> last pushed signal timestamp
  private discoveredSetups: DiscoveredSetup[] = [];
  private activeEvaluatingSymbols: Set<string> = new Set(); // Symbol-level mutex
  private maxAccountConcurrentOrders: number = Number(process.env.MAX_CONCURRENT_ORDERS) || 8; // Raised concurrent active + pending orders cap to 8
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
          this.discoveredSetups = parsed.map((setup: any) => {
            const econ = EconomicContextService.evaluateEconomicContext({ symbol: setup.pair });
            if (econ.decisionAllowed && !econ.hasHighImpactEventActive) {
              if (setup.status === 'SKIPPED_ECONOMIC_EVENT') {
                setup.status = 'DISCOVERED';
              }
              if (Array.isArray(setup.reasons)) {
                setup.reasons = setup.reasons.filter(
                  (r: string) => !r.includes('DIELAKKAN: Peristiwa Ekonomi Berimpak Tinggi') && !r.includes('ECONOMIC_CALENDAR_UNAVAILABLE')
                );
              }
            }
            return setup;
          });
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
  private scanDiagnostics = new Map<string, {pair: string; timeframe?: string; stage: string; observedAt: number; details: Record<string, unknown>}>();

  private recordScanDiagnostic(pair: string, timeframe: string | undefined, stage: string, details: Record<string, unknown> = {}) {
    this.scanDiagnostics.set(pair + ':' + (timeframe || 'ALL'), {pair, timeframe, stage, observedAt: Date.now(), details});
  }

  public getStatus() {
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
      recentSetups: [...Array.from(this.waitingOpportunities.values()).filter(s=>Date.now()-s.timestamp<120000), ...this.discoveredSetups].slice(0, 40),
      scanDiagnostics: Array.from(this.scanDiagnostics.values()),
      positionTrendObservation: this.positionTrendObservation,
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
   * Manually archives/purges a setup by ID and unfreezes the pair for immediate new signals
   */
  public archiveSetup(setupId: string): boolean {
    const idx = this.discoveredSetups.findIndex(s => s.id === setupId || s.pair === setupId);
    if (idx === -1) return false;

    const setup = this.discoveredSetups[idx];
    const pairKey = setup.pair.replace('/', '').toUpperCase();

    console.log(`📦 [AutonomousMarketScanner] Archiving setup #${setup.id} for ${setup.pair}. Pair unfrozen for new signals.`);
    this.discoveredSetups.splice(idx, 1);
    this.cooldownLedger.delete(pairKey);
    this.pushedSignalLedger.delete(pairKey);
    this.waitingOpportunities.delete(setup.pair);

    this.saveToDisk();
    return true;
  }

  /**
   * Broadcast signal cancellation notification to Telegram subscribers
   */
  private notifySignalCancellation(setup: DiscoveredSetup, reason: string): void {
    if (setup.cancellationAlertSent) return;
    const wasBroadcast = setup.telegramBroadcastSent || setup.confidence >= 70;
    if (!wasBroadcast) return;

    setup.cancellationAlertSent = true;
    setup.invalidationReason = reason;

    // Suppress weekend cancellation broadcast for closed Forex / Commodities markets
    if (!isCryptoPair(setup.pair) && getMarketStatus(setup.pair).status === 'WEEKEND_CLOSED') {
      console.log(`⏸️ [AutonomousMarketScanner] Suppressed weekend cancellation broadcast for closed pair ${setup.pair}.`);
      return;
    }

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

    const ctrader = new CTraderAdapter({ accountId: '48282756' });
    let liveBrokerSymbols = new Set<string>();
    let liveBrokerPendingSymbols = new Set<string>();
    try {
      const openPos = await ctrader.getOpenPositions();
      for (const p of openPos) {
        const sym = (p.symbol || '').replace('/', '').toUpperCase();
        if (sym) liveBrokerSymbols.add(sym);
      }
      const pendingOrd = await ctrader.getPendingOrders(true);
      for (const o of pendingOrd) {
        const sym = (o.symbol || '').replace('/', '').toUpperCase();
        if (sym) liveBrokerPendingSymbols.add(sym);
      }
    } catch (_) {}

    for (const setup of this.discoveredSetups) {
      const pairKey = setup.pair.replace('/', '').toUpperCase();
      const isAlreadyOpen = openDb.some((p: any) => (p.symbol || '').replace('/', '').toUpperCase() === pairKey) || liveBrokerSymbols.has(pairKey);
      const isPendingExisting = liveBrokerPendingSymbols.has(pairKey);

      // Handle manually closed positions or cancelled pending orders on cTrader
      if ((setup.status === 'SKIPPED_ALREADY_OPEN' && !isAlreadyOpen) || 
          (setup.status === 'SKIPPED_PENDING_ORDER_EXISTS' && !isPendingExisting) ||
          (setup.status === 'EXECUTED' && !isAlreadyOpen && !isPendingExisting)) {
        
        console.log(`✅ [AutonomousMarketScanner] cTrader position/order for ${setup.pair} was closed manually. Clearing setup from radar to make way for new signals.`);
        setup.status = 'INVALID';
        setup.isValid = false;
        setup.invalidatedAt = now;
        setup.invalidationReason = 'Posisi / Pesanan di cTrader telah selesai / ditutup secara manual';
        
        // Unfreeze pair cooldown so new signals can be generated immediately
        this.cooldownLedger.delete(pairKey);
        this.pushedSignalLedger.delete(pairKey);
      }

      // Unfreeze economic veto status if economic context is now clear
      const econCheck = EconomicContextService.evaluateEconomicContext({ symbol: setup.pair });
      if (econCheck.decisionAllowed && !econCheck.hasHighImpactEventActive) {
        if (setup.status === 'SKIPPED_ECONOMIC_EVENT') {
          setup.status = 'DISCOVERED';
        }
        if (Array.isArray(setup.reasons)) {
          setup.reasons = setup.reasons.filter(
            (r: string) => !r.includes('DIELAKKAN: Peristiwa Ekonomi Berimpak Tinggi') && !r.includes('ECONOMIC_CALENDAR_UNAVAILABLE')
          );
        }
      }

      // If position is active in broker/DB, mark as active
      if (isAlreadyOpen) {
        setup.status = 'SKIPPED_ALREADY_OPEN';
        validSetups.push(setup);
        continue;
      } else if (isPendingExisting) {
        setup.status = 'SKIPPED_PENDING_ORDER_EXISTS';
        validSetups.push(setup);
        continue;
      }

      // Check TTL based on timeframe
      const ttlMs = setup.timeframe === 'M5'
        ? 1 * 60 * 60 * 1000
        : (setup.timeframe === 'M15' ? 2 * 60 * 60 * 1000 : (setup.timeframe === 'H1' ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));

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
      if (typeof newestOrder.limitPrice === 'number' && newestOrder.limitPrice > 0) {
        const limitPrice = newestOrder.limitPrice;

        // Auto-cancel cross-symbol mis-mapped pending orders
        if (symKey === 'EURUSD' && limitPrice > 1.35) {
          console.log(`🛡️ [Self-Healing Watchdog] Auto-cancelling mis-mapped EUR/USD pending order #${newestOrder.orderId} (price: ${limitPrice} is a GBP/AUD price).`);
          await ctrader.cancelOrder(newestOrder.orderId).catch(() => {});
          isInvalid = true;
        } else if (symKey === 'EURJPY' && limitPrice < 170.0) {
          console.log(`🛡️ [Self-Healing Watchdog] Auto-cancelling mis-mapped EUR/JPY pending order #${newestOrder.orderId} (price: ${limitPrice} is a USD/JPY price).`);
          await ctrader.cancelOrder(newestOrder.orderId).catch(() => {});
          isInvalid = true;
        } else if (currentSpot !== null && currentSpot > 0) {
          const isJpy = symKey.includes('JPY');
          const isGold = symKey.includes('XAU') || symKey.includes('GOLD');
          const maxDist = isGold ? 50.0 : (isJpy ? 1.0 : 0.0100); // 100 pips max allowed pending limit distance

          const dist = Math.abs(currentSpot - limitPrice);
          if (dist > maxDist) {
            console.log(`🛡️ [Self-Healing Watchdog] Auto-cancelling extreme distance pending order #${newestOrder.orderId} on ${symKey} (distance: ${dist.toFixed(4)} > max ${maxDist}).`);
            await ctrader.cancelOrder(newestOrder.orderId).catch(() => {});
            isInvalid = true;
          }
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
    if (this.scanCycleRunning) return;
    this.scanCycleRunning = true;
    try {
      this.lastScannedAt = Date.now();
      await this.pruneInvalidAndExpiredSetups();
      ctraderMarketDataFeedService.healOpenPositions().catch(() => {});

      // Query live broker state (both active positions and pending limit orders)
      const ctrader = new CTraderAdapter({ accountId: '48282756' });
      // Independent of entry eligibility: observe existing positions before pending-order checks.
      try {
        const positions = await this.positionObserverBroker.getBrokerLivePositions(true);
        const observations: any[] = [];
        for (const position of positions) {
          observations.push(await (async () => {
          const matches = this.discoveredSetups.filter(setup => position.comment === 'QuantumAI_' + setup.id && setup.pair.replace('/', '') === position.symbol.replace('/', '') && setup.direction === position.tradeSide);
          const setup = matches.length === 1 ? matches[0] : undefined;
          const base = {positionId: position.positionId, symbol: position.symbol, direction: position.tradeSide};
          if (!setup) return {...base,status:'UNAVAILABLE',reasons:['ORIGINAL_SETUP_NOT_UNIQUELY_LINKED']};
          const feed = ctraderMarketDataFeedService.getLiveCandles(setup.pair);
          if (!feed.valid) return {...base,status:'UNAVAILABLE',reasons:[feed.reason || 'BROKER_DATA_UNAVAILABLE']};
          try {
            const candles=await this.positionObserverBroker.getPositionTrendHistory(position.symbolId,setup.timeframe);
            return {...base,setupId:setup.id,...observeClosedTrend(position.tradeSide,setup.timeframe,candles)};
          } catch {return {...base,status:'UNAVAILABLE',reasons:['BROKER_HISTORY_UNAVAILABLE']};}
          })());
        }
        this.positionTrendObservation = {mode:'OBSERVE_ONLY',executionAllowed:false,status:'OBSERVED',observedAt:Date.now(),positions:observations};
      } catch {
        this.positionTrendObservation = {mode:'OBSERVE_ONLY',executionAllowed:false,status:'BROKER_UNAVAILABLE',observedAt:Date.now(),positions:[]};
      }
      let pendingOrders: any[] = [];
      let openDbPositions: any[] = [];

      try {
        const { brokerReconciliationService } = await import('../../../apps/execution-router/src/services/brokerReconciliationService');
        await brokerReconciliationService.reconcile('48282756').catch(() => {});
      } catch (_) {}

      try {
        const rawPending = await ctrader.getPendingOrders(true);
        pendingOrders = await this.reconcileAndHealBrokerOrders(rawPending, ctrader);
      } catch (err: any) {
        console.warn('[AutonomousMarketScanner] Notice: could not fetch broker pending orders:', err.message);
        return; // Unknown broker state must never be treated as an empty order book.
      }

      try {
        const masterAccountId = process.env.CTRADER_ACCOUNT_ID || '48282756';
        const allOpenDb = await this.tradingRepo.query(
          `SELECT * FROM positions WHERE status = 'OPEN' AND (account_id = $1 OR account_id = 'master' OR account_id IS NULL OR account_id = '')`,
          [masterAccountId]
        );
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
    } finally {
      this.scanCycleRunning = false;
      this.currentlyScanning = null;
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
      for (const key of this.scanDiagnostics.keys()) if (key.startsWith(pair + ':')) this.scanDiagnostics.delete(key);

      // 1. Strict Invariant: Check if there is already an OPEN position on this pair (DB or live Broker)
      const isAlreadyOpen = openDbPositions.some(
        (p: any) => (p.symbol || '').replace('/', '').toUpperCase() === pairKey
      ) || liveBrokerSymbols.has(pairKey);
      this.waitingOpportunities.delete(pair);
      if (isAlreadyOpen) {
        this.recordScanDiagnostic(pair, undefined, 'EXISTING_OPEN_POSITION', {brokerPosition: liveBrokerSymbols.has(pairKey), databasePosition: openDbPositions.some((p: any) => (p.symbol || '').replace('/', '').toUpperCase() === pairKey)});
      }

      // 2. Check existing broker pending orders for this pair
      const existingPending = brokerPendingOrders.filter(
        (o: any) => (o.symbol || '').replace('/', '').toUpperCase() === pairKey
      );

      if (existingPending.length > 0) {
        this.recordScanDiagnostic(pair, undefined, 'EXISTING_PENDING_ORDER', {orderIds: existingPending.map(o => o.orderId)});
        // Continue analysis for display; execution remains blocked below.
      }

      // 3. Scan all timeframes for this pair and collect candidate setups
      const candidateSetups: NonNullable<Awaited<ReturnType<AutonomousMarketScannerService['analyzePairTimeframe']>>>[] = [];

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

      // Display opportunity without replacing an executed setup, cancelling orders or publishing copies.
      if (isAlreadyOpen || existingPending.length > 0) {
        const status = isAlreadyOpen ? 'SKIPPED_ALREADY_OPEN' : 'SKIPPED_PENDING_ORDER_EXISTS';
        const reason = isAlreadyOpen ? 'Menunggu: pair mempunyai posisi terbuka. Bukan order baharu.' : 'Menunggu: pair mempunyai pending order. Bukan order baharu.';
        this.waitingOpportunities.set(pair, {
          id: 'waiting:' + pair, timestamp: Date.now(), pair, timeframe: best.timeframe,
          direction: best.direction, confidence: best.confidence, entryPrice: best.entryPrice,
          stopLoss: best.stopLoss, takeProfit1: best.takeProfit1, takeProfit2: best.takeProfit2,
          reasons: [reason, 'Perlu dinilai semula sebelum execution; bukan barisan order automatik.', ...best.reasons],
          status, isValid: true, executionDetails: {displayOnly:true,finalExecutionApproval:false,blockers:[...(isAlreadyOpen?['OPEN_POSITION']:[]),...(existingPending.length?['PENDING_ORDER']:[])]}
        });
        return;
      }
      if (!best.canonicalSignal) return;
      const eligibility = executionEligibilityGate.evaluateEligibility(best.canonicalSignal, {currentPrice:best.canonicalSignal.currentPrice,spreadPips:1.2});
      let approval;
      try { approval = approveCopierSignal(best.canonicalSignal, eligibility.executionEligibility); }
      catch (err: any) { this.recordScanDiagnostic(pair, best.timeframe, 'FINAL_APPROVAL_BLOCKED', {error: err.message, eligibility: eligibility.executionEligibility}); console.warn('[Scanner Grade A Gate]', err.message); return; }
      // Opportunity-specific identity prevents permanent cBot deduplication by pair/timeframe.
      const setupId = best.canonicalSignal.signalId;
      const existingIdx = this.discoveredSetups.findIndex(s => s.pair === pair);
      const existingSetup = existingIdx >= 0 ? this.discoveredSetups[existingIdx] : null;

      // 6. Check Account-Wide Concurrent Exposure Limit
      const isMasterAccountFull = totalActiveAndPending >= this.maxAccountConcurrentOrders;
      if (isMasterAccountFull) {
        console.log(`ℹ️ [AutonomousMarketScanner] Note: Master account currently at max capacity (${totalActiveAndPending}/${this.maxAccountConcurrentOrders}). Scanner will continue discovering Grade-A signals for Telegram subscribers.`);
      }

      // 7. Enforce In-Memory Micro Cooldown (2 minutes between consecutive broker executions or invalidation cooling off)
      const EXECUTION_COOLDOWN_MS = 2 * 60 * 1000;
      const lastExec = this.cooldownLedger.get(pairKey);
      if (lastExec) {
        const cooldownRemaining = lastExec > Date.now() 
          ? (lastExec - Date.now()) 
          : (EXECUTION_COOLDOWN_MS - (Date.now() - lastExec));

        if (cooldownRemaining > 0) {
          // If a valid setup is already active, keep it intact instead of corrupting it into SKIPPED_COOLDOWN
          if (existingSetup && existingSetup.isValid && existingSetup.status !== 'INVALID') {
            return;
          }

          console.log(`⏳ [AutonomousMarketScanner] Skipping ${pair} - Pair in micro cooling off period (${Math.ceil(cooldownRemaining / 1000)}s remaining).`);
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
            isValid: false
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

      // Keep the exact TP2 approved by the canonical validation gate.
      const tp2Runner = best.takeProfit2 || 0;

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
        isValid: true,
        entryMode: best.entryMode,
        distancePips: best.distancePips,
        canonicalSignal: best.canonicalSignal,
        validationReport: best.validationReport
      };

      if (existingIdx >= 0) this.discoveredSetups[existingIdx] = discovered;
      else this.recordDiscoveredSetup(discovered);
      this.emit('tradeExecuted', discovered);

      // Guard: Never dispatch to cTrader if status is INVALID, not valid, or confidence < MIN_AUTOMATED_SIGNAL_CONFIDENCE
      if (discovered.status === 'INVALID' || discovered.isValid === false || best.confidence < MIN_AUTOMATED_SIGNAL_CONFIDENCE) {
        console.warn(`🛑 [AutonomousMarketScanner] Pending order to cTrader BLOCKED: Signal is INVALID or confidence < 75% (${best.confidence}%).`);
        return;
      }

      // 1. Immediate Broadcast of Grade-A Discovered Signal to Telegram Subscribers
      // Master-first: no subscriber publication when capacity blocks the master.
      if (isMasterAccountFull) {
        discovered.status = 'DISCOVERED_CAPACITY_REACHED';
        this.saveToDisk();
        return;
      }

      // 2. Authoritative Master cTrader Broker Order Dispatch
      try {
        // Deterministic Execution Eligibility Gate Check before Broker Call
        if (best.canonicalSignal) {
          const executionEval = executionEligibilityGate.evaluateEligibility(best.canonicalSignal, {
            currentPrice: best.canonicalSignal.currentPrice || best.entryPrice,
            spreadPips: 1.2
          });

          // Fail-closed invariant assertion: pending limit orders must not be placed for BLOCKED / REJECTED / EXPIRED signals
          try {
            executionEligibilityGate.assertExecutionInvariant(best.canonicalSignal, executionEval.executionEligibility, 'LIMIT');
          } catch (invErr: any) {
            console.error(`🛑 [AutonomousMarketScanner] Execution Eligibility Gate VETO: ${invErr.message}`);
            console.log(executionEligibilityGate.formatExecutionGateLog({
              signalId: setupId,
              symbol: pair,
              direction: best.direction,
              entryMode: (best.entryMode as any) || 'BUY_PULLBACK',
              currentPrice: best.canonicalSignal.currentPrice,
              plannedEntry: best.entryPrice,
              distancePips: best.distancePips,
              validationStatus: best.validationStatus || 'PASS',
              executionEligibility: executionEval.executionEligibility,
              validationConfidence: best.validationConfidence || 80,
              decision: `BLOCKED — ${invErr.message}`,
              brokerOrderAction: 'NOT_CALLED'
            }));
            return;
          }

          console.log(executionEligibilityGate.formatExecutionGateLog({
            signalId: setupId,
            symbol: pair,
            direction: best.direction,
            entryMode: (best.entryMode as any) || 'BUY_PULLBACK',
            currentPrice: best.canonicalSignal.currentPrice,
            plannedEntry: best.entryPrice,
            distancePips: best.distancePips,
            validationStatus: best.validationStatus || 'PASS',
            executionEligibility: executionEval.executionEligibility,
            validationConfidence: best.validationConfidence || 80,
            decision: executionEval.decision,
            brokerOrderAction: 'LIMIT_PLACED'
          }));
        }

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

        const rawBrokerOrderId = orderResult.broker_order_id || orderResult.brokerOrderId;
        const isConfirmed = orderResult && ['FILLED','ACCEPTED','PENDING','PARTIALLY_FILLED'].includes(orderResult.status) && /^[1-9]\d*$/.test(String(rawBrokerOrderId || ''));

        // Strict Broker Confirmation Verification
        if (!isConfirmed) {
          console.warn(`🛑 [AutonomousMarketScanner] Master broker REJECTED order for ${pair}. Copier dispatch BLOCKED. Reason: ${orderResult?.reason || 'Broker rejected order'}`);
          discovered.status = 'INVALID';
          discovered.isValid = false;
          discovered.invalidationReason = `Broker rejected: ${orderResult?.reason || 'Order rejected'}`;
          this.notifySignalCancellation(discovered, `Broker rejected entry: ${orderResult?.reason || 'Market condition'}`);
          this.saveToDisk();
          return;
        }

        confirmMasterOrder(approval, orderResult, 'LIMIT');

        // Idempotency: Record successful execution in ledger
        executionEligibilityGate.recordExecution(setupId, String(rawBrokerOrderId));

        // Link canonical signal to broker order for Second Opinion outcome correlation
        const canonicalSigId = best.canonicalSignal?.signalId || setupId;
        import('../../../apps/decision-agent/src/services/secondOpinionObservationService').then(({ secondOpinionObservationService }) => {
          secondOpinionObservationService.linkBrokerOrder(canonicalSigId, String(rawBrokerOrderId));
        }).catch(() => {});

        console.log(`🚀 [AutonomousMarketScanner] Master pending limit order CONFIRMED by cTrader broker! Broker Order ID: #${rawBrokerOrderId}`);

        discovered.status = 'EXECUTED';
        discovered.executionDetails = {
          brokerOrderId: String(rawBrokerOrderId),
          dispatchedAt: Date.now()
        };

        // Ensure Telegram broadcast is dispatched for confirmed broker orders
        if (!discovered.telegramBroadcastSent) {
          discovered.telegramBroadcastSent = true;
          this.pushedSignalLedger.set(pairKey, Date.now());
          telegramNotificationService.broadcastTradeEvent({
            pair: pair,
            direction: best.direction,
            timeframe: best.timeframe,
            entryPrice: best.entryPrice,
            currentPrice: best.canonicalSignal?.currentPrice,
            entryMode: best.entryMode,
            distancePips: best.distancePips,
            setupStatus: best.canonicalSignal?.executionStatus,
            stopLoss: best.stopLoss,
            takeProfit1: best.takeProfit1,
            takeProfit2: tp2Runner,
            confidence: best.confidence,
            modelConfidence: best.modelConfidence,
            validationConfidence: best.validationConfidence,
            reasons: best.reasons,
            bullishEvidence: best.bullishEvidence,
            bearishEvidence: best.bearishEvidence,
            riskWarnings: best.riskWarnings,
            lotSize: best.lotSize,
            tier: best.confidence >= 85 ? 'FREE' : 'VIP',
            status: 'ENTRY_DISPATCHED',
            brokerOrderId: String(rawBrokerOrderId)
          }).catch((err) => {
            console.warn(`[AutonomousMarketScanner] Broadcast error on broker confirmation:`, err.message);
          });
          console.log(`📡 [AutonomousMarketScanner] PUSHED Confirmed Master Order #${rawBrokerOrderId} for ${pair} (Confidence: ${best.confidence}%) to Telegram!`);
        }

        const updatedIdx = this.discoveredSetups.findIndex(s => s.id === setupId);
        if (updatedIdx >= 0) {
          this.discoveredSetups[updatedIdx] = discovered;
        }
        this.saveToDisk();

        // A single confirmed master order feeds both receiver channels.
        const { multiClientCopierService } = await import('./multiClientCopierService');
        const copies = await multiClientCopierService.dispatchMasterTrade({
          pair, direction: best.direction, entryPrice: best.entryPrice,
          stopLoss: best.stopLoss, takeProfit1: best.takeProfit1,
          takeProfit2: tp2Runner, confidence: best.confidence
        }, approval);
        discovered.executionDetails.copyResults = copies.results;
        this.saveToDisk();
      } catch (autoErr: any) {
        console.warn(`🛑 [AutonomousMarketScanner] Master order execution failed or timed out for ${pair} (${autoErr.message}).`);
        discovered.status = 'DISCOVERED_EXECUTION_FAILED';
        this.saveToDisk();
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
      if (['USD/JPY','EUR/GBP','AUD/JPY','EUR/CHF','EUR/AUD','GBP/AUD'].includes(pair) && ctraderMarketDataFeedService.getSymbolHealth(pair) !== 'HEALTHY') { this.recordScanDiagnostic(pair,tf,'BROKER_FEED_NOT_READY'); return null; }
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
        this.recordScanDiagnostic(pair, tf, 'INSUFFICIENT_CANDLES', {candleCount: candles?.length || 0, liveValid: liveResult.valid});
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

      if (!candidateSetup) { this.recordScanDiagnostic(pair, tf, 'NO_CANDIDATE'); return null; }

      const rawAction = String((candidateSetup as any).type || candidateSetup.action || (candidateSetup.bias === 'BULLISH' ? 'BUY' : candidateSetup.bias === 'BEARISH' ? 'SELL' : '')).toUpperCase();
      let direction: 'BUY' | 'SELL' | null = null;
      if (rawAction.includes('BUY')) direction = 'BUY';
      else if (rawAction.includes('SELL')) direction = 'SELL';

      const confidence = Number(candidateSetup.confidence || 0);

      // Check if setup meets A-Grade standard (Confidence >= 75%)
      // If NOT Grade A, discard immediately without invoking Gemini (saves 95%+ API calls!)
      if (!direction || confidence < MIN_AUTOMATED_SIGNAL_CONFIDENCE) {
        this.recordScanDiagnostic(pair, tf, !direction ? 'WAIT_OR_NO_SETUP' : 'BELOW_GRADE_A', {action: candidateSetup.action, confidence, minimumConfidence: MIN_AUTOMATED_SIGNAL_CONFIDENCE, reasons: candidateSetup.reasons, confirmationRequirements: candidateSetup.confirmationRequirements, vetoReasons: candidateSetup.vetoReasons, candleCount: candles.length, currentPrice});
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
            confirmed: false,
            decision: 'VETO' as const,
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
        this.recordScanDiagnostic(pair, tf, 'SECOND_OPINION_VETO', {reason: secondOpinion.vetoReason, reasons: secondOpinion.reasons});
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
      const tp2Val = direction === 'BUY'
        ? Number((finalEntryPrice + (tpVal - finalEntryPrice) * 1.8).toFixed(decimals))
        : Number((finalEntryPrice - (finalEntryPrice - tpVal) * 1.8).toFixed(decimals));

      const lotSize = isNas ? 1.0 : (isBtc ? 0.01 : (finalConfidence >= 80 ? 0.02 : 0.01));

      // ── PRODUCTION SIGNAL VALIDATION GATE (FAIL-CLOSED) ──────────────────────
      const validationResult = signalValidationGate.validateSignal({
        symbol: pair,
        timeframe: tf,
        direction,
        currentPrice,
        entryPrice: finalEntryPrice,
        stopLoss: slVal,
        takeProfit1: tpVal,
        takeProfit2: tp2Val,
        recommendedLot: lotSize,
        modelConfidence: finalConfidence,
        indicators: {
          ema50: indicators.ema50,
          ema200: indicators.ema200,
          rsi14: indicators.rsi,
          adx: indicators.adx?.adx,
          plusDI: indicators.adx?.plusDI,
          minusDI: indicators.adx?.minusDI,
          superTrendDirection: indicators.superTrend?.trend,
          atr: indicators.atr,
          macdHistogram: indicators.macd?.histogram,
          vwap: indicators.vwap
        },
        reasoningEvidence: combinedReasons,
        patternName: primaryPattern?.name
      });

      this.recordScanDiagnostic(pair, tf, 'FINAL_VALIDATION', {candidateConfidence: confidence, finalConfidence: validationResult.canonicalSignal.confidence, validationStatus: validationResult.canonicalSignal.validationStatus, isExecutable: validationResult.isExecutable, errors: validationResult.validationReport.errors, warnings: validationResult.validationReport.warnings, eligibility: validationResult.canonicalSignal.executionEligibility, secondOpinionSource: secondOpinion.source});
      if (!validationResult.isExecutable || !['PASS', 'WARNING'].includes(validationResult.canonicalSignal.validationStatus) || validationResult.canonicalSignal.confidence < MIN_AUTOMATED_SIGNAL_CONFIDENCE) {
        console.warn(`🛑 [AutonomousMarketScanner] Candidate for ${pair} (${tf} ${direction}) REJECTED by SignalValidationGate: ${validationResult.validationReport.errors.join(' | ')}`);
        return null;
      }

      console.log(`🛡️ [SignalValidationGate] Passed (${validationResult.canonicalSignal.validationStatus}): ${pair} ${tf} ${direction} (${validationResult.canonicalSignal.entryMode}) | Effective Conf: ${validationResult.canonicalSignal.confidence}%`);

      // ── PHASE 1: OPENAI INDEPENDENT SECOND OPINION (SHADOW OBSERVATION MODE) ──
      import('../../../apps/decision-agent/src/services/secondOpinionService').then(({ secondOpinionService, buildEconomicContextForSymbol }) => {
        secondOpinionService.reviewSignal({
          signalId: validationResult.canonicalSignal.signalId,
          pair,
          timeframe: tf,
          candidateDirection: direction,
          candidateConfidence: validationResult.canonicalSignal.confidence,
          entry: validationResult.canonicalSignal.entryPrice,
          stopLoss: validationResult.canonicalSignal.stopLoss,
          takeProfit1: validationResult.canonicalSignal.takeProfit1,
          takeProfit2: validationResult.canonicalSignal.takeProfit2,
          indicators: {
            ema50: indicators.ema50,
            ema200: indicators.ema200,
            rsi14: indicators.rsi,
            adx: indicators.adx?.adx,
            plusDI: indicators.adx?.plusDI,
            minusDI: indicators.adx?.minusDI,
            superTrendDirection: indicators.superTrend?.trend
          },
          evidence: validationResult.canonicalSignal.reasoningEvidence,
          economicContext: buildEconomicContextForSymbol(pair),
          dataMode: 'LIVE_CTRADER'
        }).catch((err) => {
          console.debug(`[AutonomousMarketScanner] Shadow second opinion notice:`, err.message);
        });
      }).catch(() => {});

      return {
        timeframe: tf,
        direction,
        confidence: validationResult.canonicalSignal.confidence,
        modelConfidence: validationResult.canonicalSignal.modelConfidence,
        validationConfidence: validationResult.canonicalSignal.validationConfidence,
        entryPrice: validationResult.canonicalSignal.entryPrice,
        entryMode: validationResult.canonicalSignal.entryMode,
        distancePips: validationResult.canonicalSignal.distancePips,
        stopLoss: validationResult.canonicalSignal.stopLoss,
        takeProfit1: validationResult.canonicalSignal.takeProfit1,
        takeProfit2: validationResult.canonicalSignal.takeProfit2,
        reasons: validationResult.canonicalSignal.reasoningEvidence,
        bullishEvidence: validationResult.canonicalSignal.bullishEvidence,
        bearishEvidence: validationResult.canonicalSignal.bearishEvidence,
        riskWarnings: validationResult.canonicalSignal.riskWarnings,
        validationReport: validationResult.validationReport,
        canonicalSignal: validationResult.canonicalSignal,
        validationStatus: validationResult.canonicalSignal.validationStatus,
        pattern: primaryPattern,
        lotSize
      };
    } catch (err: any) {
      this.recordScanDiagnostic(pair, tf, 'ANALYSIS_ERROR', {error: err?.message || String(err)});
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

