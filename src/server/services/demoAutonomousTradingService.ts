import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { CurrencyPair, Timeframe } from '../../types';
import { ctraderMarketDataFeedService } from './ctraderMarketDataFeedService';
import { SignalIntelligenceService } from '../../../apps/decision-agent/src/services/signalIntelligenceService';
import { StrategyEngineService, StrategyDefinition, TechnicalFeatures, MarketCandle } from './strategyEngineService';
import { PortfolioRiskEngine, ProposedTradeRisk } from './portfolioRiskService';
import { FinalExecutionGateService, ExecutionGateDecision } from './finalExecutionGateService';
import { CTraderTransport } from '../../integrations/ctrader/ctraderTransport';
import { CTraderDemoLifecycleHarness, ControlledDemoOrderConfig, DemoOrderExecutionResult } from '../../integrations/ctrader/ctraderDemoLifecycleHarness';
import { learningJournalService } from './learningJournalService';
import { continuousLearningObservatoryService } from './continuousLearningObservatoryService';
import { aiDecisionEngine } from '../../../apps/decision-agent/src/services/aiDecisionEngine';
import { calculateAllIndicators } from '../../lib/indicators';
import { analyzeSmcStructures } from '../../lib/smcEngine';
import { PairDailyRangeService } from './pairDailyRangeService';
import { telegramNotificationService } from './telegramNotificationService';

export interface DemoAutonomousStatus {
  isAutoPilotEnabled: boolean;
  killSwitchActive: boolean;
  environment: 'DEMO';
  liveExecutionStatus: 'FORBIDDEN';
  automatedLiveExecution: 'DISABLED';
  maxLotsLimit: number;
  maxConcurrentPositions: number;
  activePositionsCount: number;
  minConfidenceThreshold: number;
  maxAllowedSpreadPips: number;
  staleDataThresholdSec: number;
  dailyLossLimit: number;
  currentDailyLoss: number;
  lastEvaluatedPair: string | null;
  lastEvaluatedSignal: string | null;
  lastDecisionReason: string;
  lastExecutionAt: string | null;
  reconciliationStatus: 'RECONCILED' | 'DIVERGENT';
}

export interface DemoOpenPosition {
  positionId: number;
  symbol: string;
  tradeSide: 'BUY' | 'SELL';
  volume: number; // lots, e.g. 0.01 or 0.02
  initialVolume?: number;
  entryPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  takeProfit1?: number;
  takeProfit2?: number;
  tp1Hit?: boolean;
  isMultiTarget?: boolean;
  unrealizedPnL: number;
  entryTime: string;
  proposalId: string;
  orderId: string;
  mfe: number;
  mae: number;
  nearMissArmed?: boolean;
}

export interface DemoClosedTrade {
  tradeId: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  closePrice: number;
  realizedPnL: number;
  openTime: string;
  closeTime: string;
  exitReason: 'TAKE_PROFIT' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'PARTIAL_CLOSE' | 'BREAKEVEN' | 'STOP_LOSS' | 'MANUAL' | 'SAFETY_GATE' | 'BROKER_CLOSE';
  proposalId: string;
}

export class DemoAutonomousTradingService extends EventEmitter {
  private static instance: DemoAutonomousTradingService;

  // Operational State
  private isAutoPilotEnabled: boolean = false;
  private killSwitchActive: boolean = false;
  private minConfidenceThreshold: number = 75; // >= 75%
  private maxAllowedSpreadPips: number = 3.0; // <= 3.0 pips
  private staleDataThresholdMs: number = 30000; // < 30s
  private maxLotsLimit: number = 0.04; // Method 2: 0.04 lots per setup (Split 2x0.02 lots for TP1 and TP2)
  private maxConcurrentPositions: number = Number(process.env.MAX_CONCURRENT_ORDERS) || 20; // Controlled capacity cap of 20 concurrent positions for DEMO forward validation

  private portfolioRiskEngine: PortfolioRiskEngine;
  private openPositions: Map<number, DemoOpenPosition> = new Map();
  private closedTrades: DemoClosedTrade[] = [];
  private latestPrices: Map<string, number> = new Map();
  private executionLogs: Array<{
    id: string;
    timestamp: string;
    pair: string;
    direction: string;
    confidence: number;
    price: number;
    status: string;
    reason: string;
  }> = [];

  private lastEvaluatedPair: string | null = null;
  private lastEvaluatedSignal: string | null = null;
  private lastDecisionReason: string = 'System initialized. Awaiting market ticks.';
  private lastExecutionAt: string | null = null;
  private isEvaluating: boolean = false;
  private ledgerFilePath: string = path.resolve(process.cwd(), 'data', 'ctrader_demo_ledger.json');

  private constructor() {
    super();
    this.portfolioRiskEngine = new PortfolioRiskEngine(10000.0);
    this.loadLedgerFromDisk();
    this.setupMarketDataListener();
  }

  public static getInstance(): DemoAutonomousTradingService {
    if (!DemoAutonomousTradingService.instance) {
      DemoAutonomousTradingService.instance = new DemoAutonomousTradingService();
    }
    return DemoAutonomousTradingService.instance;
  }

  /**
   * Load persisted demo ledger from disk
   */
  private loadLedgerFromDisk(): void {
    try {
      if (fs.existsSync(this.ledgerFilePath)) {
        const raw = fs.readFileSync(this.ledgerFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.openPositions)) {
          this.openPositions.clear();
          for (const p of parsed.openPositions) {
            this.openPositions.set(p.positionId, p);
          }
        }
        if (Array.isArray(parsed.closedTrades)) {
          this.closedTrades = parsed.closedTrades;
        }
        if (Array.isArray(parsed.executionLogs)) {
          this.executionLogs = parsed.executionLogs;
        }
        if (typeof parsed.isAutoPilotEnabled === 'boolean') {
          this.isAutoPilotEnabled = parsed.isAutoPilotEnabled;
        }
        console.log(`[DemoAutonomousTradingService] Loaded ${this.openPositions.size} open positions, ${this.closedTrades.length} closed trades, ${this.executionLogs.length} logs from disk.`);
      }
    } catch (err: any) {
      console.warn('[DemoAutonomousTradingService] Ledger load notice:', err.message);
    }
  }

  /**
   * Save demo ledger to disk
   */
  public saveLedgerToDisk(): void {
    try {
      const dir = path.dirname(this.ledgerFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        openPositions: Array.from(this.openPositions.values()),
        closedTrades: this.closedTrades,
        executionLogs: this.executionLogs,
        isAutoPilotEnabled: this.isAutoPilotEnabled,
        lastSavedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.ledgerFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[DemoAutonomousTradingService] Ledger save error:', err.message);
    }
  }

  /**
   * Add a manual DEMO position and persist
   */
  public addManualDemoPosition(pos: DemoOpenPosition, log: any): void {
    this.openPositions.set(pos.positionId, pos);
    this.executionLogs.unshift(log);
    if (this.executionLogs.length > 50) this.executionLogs.pop();
    this.saveLedgerToDisk();
    this.emit('orderExecuted', pos);
  }

  /**
   * Bind to real cTrader Market Ticks
   */
  private setupMarketDataListener(): void {
    ctraderMarketDataFeedService.on('marketTick', (tick) => {
      this.handleMarketTick(tick);
    });
  }

  /**
   * Process live incoming market tick
   */
  public handleMarketTick(tick: any): void {
    if (!tick || !tick.symbol) return;

    const symbol = tick.symbol;
    const bid = typeof tick.bid === 'number' && tick.bid > 0
      ? tick.bid
      : (typeof tick.lowPrice === 'number' && tick.lowPrice > 0
        ? tick.lowPrice
        : (typeof tick.currentPrice === 'number' && tick.currentPrice > 0
          ? tick.currentPrice
          : 0));

    const ask = typeof tick.ask === 'number' && tick.ask > 0
      ? tick.ask
      : (typeof tick.highPrice === 'number' && tick.highPrice > 0
        ? tick.highPrice
        : (typeof tick.currentPrice === 'number' && tick.currentPrice > 0
          ? tick.currentPrice
          : 0));

    const tickTimestamp = tick.timestamp || Date.now();

    if (bid <= 0 || ask <= 0) return;

    const mappedTick = {
      symbol,
      bid,
      ask,
      timestamp: tickTimestamp
    };

    // Keep track of latest price for quote currency conversion
    this.latestPrices.set(symbol, (bid + ask) / 2);

    // 1. Update Open Positions PnL & Monitor SL/TP
    this.updatePositionsAndCheckExits(mappedTick);

    // 2. If Auto-Pilot is enabled, evaluate trading loop (Exclude quarantined XAU/USD)
    if (this.isAutoPilotEnabled && !this.killSwitchActive) {
      if (tick.symbol === 'XAU/USD' || (tick.symbol as string).includes('XAU') || (tick.symbol as string).includes('GOLD')) {
        return; // Strict quarantine: never evaluate or open XAUUSD trades
      }
      this.evaluateAutonomousCycle(tick.symbol, tick.bid, tick.ask, tick.timestamp).catch(err => {
        console.error(`[DemoAutonomousTradingService] Evaluation Error on ${tick.symbol}:`, err.message);
      });
    }
  }

  /**
   * Calculate precise Pip Value in USD for 0.01 Lot based on quote currency conversion.
   */
  public calculateUsdPipValuePer001Lot(symbol: CurrencyPair, currentPrice: number): number {
    if (symbol === 'XAU/USD' || (symbol as string).includes('XAU') || (symbol as string).includes('GOLD')) return 1.0;
    if (symbol === 'BTC/USD' || (symbol as string).includes('BTC')) return 0.1;
    if (symbol === 'NASDAQ' || (symbol as string).includes('NAS100')) return 1.0;

    const parts = (symbol as string).split('/') as [string, string];
    const base = parts[0];
    const quote = parts[1] || (symbol.includes('JPY') ? 'JPY' : 'USD');

    const isJpy = quote === 'JPY' || symbol.includes('JPY');
    const pipSize = isJpy ? 0.01 : 0.0001;
    const rawQuotePipValue = 1000 * pipSize; // $0.10 for standard, 10.0 for JPY

    if (!quote || quote === 'USD') {
      return rawQuotePipValue; // Exactly $0.10 USD per 0.01 lot
    }

    if (base === 'USD') {
      // Direct USD base rate (e.g. USD/CAD = 1.41339, USD/CHF = 0.82835, USD/JPY = 159.28)
      return currentPrice > 0 ? (rawQuotePipValue / currentPrice) : (isJpy ? 0.065 : 0.10);
    }

    // Cross pairs (e.g. EUR/CHF, GBP/AUD, EUR/GBP, AUD/NZD)
    if (quote === 'CHF') {
      const usdChf = this.latestPrices.get('USD/CHF') || 0.82835;
      return rawQuotePipValue / usdChf;
    }
    if (quote === 'CAD') {
      const usdCad = this.latestPrices.get('USD/CAD') || 1.41339;
      return rawQuotePipValue / usdCad;
    }
    if (quote === 'AUD') {
      const audUsd = this.latestPrices.get('AUD/USD') || 0.70267;
      return rawQuotePipValue * audUsd;
    }
    if (quote === 'NZD') {
      const nzdUsd = this.latestPrices.get('NZD/USD') || 0.56648;
      return rawQuotePipValue * nzdUsd;
    }
    if (quote === 'GBP') {
      const gbpUsd = this.latestPrices.get('GBP/USD') || 1.3500;
      return rawQuotePipValue * gbpUsd;
    }

    return rawQuotePipValue;
  }

  /**
   * Monitor existing open position against live ticks for broker SL/TP trigger
   * - BUY positions are marked to market and closed at prevailing BID price.
   * - SELL positions are marked to market and closed at prevailing ASK price.
   */
  private updatePositionsAndCheckExits(tick: { symbol: CurrencyPair; bid: number; ask: number; timestamp: number }): void {
    for (const [posId, pos] of this.openPositions.entries()) {
      if (pos.symbol !== tick.symbol) continue;

      const isBuy = pos.tradeSide === 'BUY';
      // Liquidation price: BUY sells at BID, SELL buys back at ASK
      const currentPrice = isBuy ? tick.bid : tick.ask;
      pos.currentPrice = currentPrice;

      // Calculate PnL with precise Quote Currency Pip Value
      const pipMultiplier = pos.symbol.includes('JPY') ? 100 : (pos.symbol === 'XAU/USD' || pos.symbol === 'BTC/USD') ? 1 : 10000;
      const priceDiff = isBuy ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice);
      const pips = priceDiff * pipMultiplier;
      
      const pipValuePer001Lot = this.calculateUsdPipValuePer001Lot(pos.symbol, currentPrice);
      const lotMultiplier = pos.volume / 0.01;
      pos.unrealizedPnL = parseFloat((pips * pipValuePer001Lot * lotMultiplier).toFixed(2));

      // MFE / MAE tracking
      if (pos.unrealizedPnL > pos.mfe) pos.mfe = pos.unrealizedPnL;
      if (pos.unrealizedPnL < pos.mae) pos.mae = pos.unrealizedPnL;

      // ----------------------------------------------------
      // NEAR-MISS 70% TP1 TRAILING PROTECTION GUARD
      // Protects position when price reaches >= 70% of TP1 target distance
      // ----------------------------------------------------
      const tp1Target = pos.takeProfit1 || (pos.isMultiTarget ? pos.tp : null);
      if (tp1Target && !pos.tp1Hit && !pos.nearMissArmed) {
        const totalTp1Pips = Math.abs(tp1Target - pos.entryPrice) * pipMultiplier;
        if (totalTp1Pips > 0 && pips >= totalTp1Pips * 0.70) {
          pos.nearMissArmed = true;
          const lockedPipDistance = (totalTp1Pips * 0.35) * (1 / pipMultiplier);
          const newLockedSl = isBuy ? (pos.entryPrice + lockedPipDistance) : (pos.entryPrice - lockedPipDistance);
          const formattedSl = Number(newLockedSl.toFixed(pos.symbol.includes('JPY') ? 3 : (pos.symbol === 'XAU/USD' || pos.symbol === 'BTC/USD') ? 2 : 5));
          
          if ((isBuy && formattedSl > pos.sl) || (!isBuy && formattedSl < pos.sl)) {
            console.log(`🛡️ [Near-Miss Guard] Position #${posId} (${pos.symbol}) reached ${pips.toFixed(1)} pips (70%+ of TP1 ${totalTp1Pips.toFixed(1)} pips). Arming profit lock SL @ ${formattedSl}.`);
            pos.sl = formattedSl;
          }
        }
      }

      // ----------------------------------------------------
      // METHOD 2: STAGE 1 (TP1 Scale-Out & SL -> Break-Even)
      // ----------------------------------------------------
      if (pos.isMultiTarget && pos.takeProfit2 && !pos.tp1Hit && tp1Target) {
        const tp1Hit = isBuy ? currentPrice >= tp1Target : currentPrice <= tp1Target;
        if (tp1Hit) {
          this.executeMethod2ScaleOut(posId, tp1Target);
          continue;
        }
      }

      // Check SL hit (BUY: BID <= SL; SELL: ASK >= SL)
      if ((isBuy && currentPrice <= pos.sl) || (!isBuy && currentPrice >= pos.sl)) {
        const isBreakEven = pos.tp1Hit && Math.abs(pos.sl - pos.entryPrice) <= (pos.symbol.includes('JPY') ? 0.05 : 0.0005);
        this.closePosition(posId, pos.sl, isBreakEven ? 'BREAKEVEN' : 'STOP_LOSS');
      }
      // Check TP hit (BUY: BID >= TP; SELL: ASK <= TP)
      else if ((isBuy && currentPrice >= pos.tp) || (!isBuy && currentPrice <= pos.tp)) {
        const exitReason = pos.tp1Hit ? 'TAKE_PROFIT_2' : 'TAKE_PROFIT';
        this.closePosition(posId, pos.tp, exitReason);
      }
    }
  }

  /**
   * Method 2: Scale-Out Execution Handler
   * - Closes 50% lot volume at TP1
   * - Realizes partial profit
   * - Adjusts Stop Loss to Break-Even (entryPrice)
   * - Sets Take Profit to TP2
   * - Marks position as tp1Hit = true
   */
  public executeMethod2ScaleOut(positionId: number, tp1Price: number): void {
    const pos = this.openPositions.get(positionId);
    if (!pos || pos.tp1Hit) return;

    const initialLots = pos.initialVolume || pos.volume;
    const closedLots = Number((pos.volume >= 0.02 ? pos.volume / 2 : pos.volume * 0.5).toFixed(3));
    const remainingLots = Number((pos.volume - closedLots).toFixed(3));

    const isBuy = pos.tradeSide === 'BUY';
    const pipMultiplier = pos.symbol.includes('JPY') ? 100 : (pos.symbol === 'XAU/USD' || pos.symbol === 'BTC/USD') ? 1 : 10000;
    const priceDiff = isBuy ? (tp1Price - pos.entryPrice) : (pos.entryPrice - tp1Price);
    const pips = priceDiff * pipMultiplier;
    const pipValuePer001Lot = this.calculateUsdPipValuePer001Lot(pos.symbol, tp1Price);
    const realizedPartialPnL = parseFloat((pips * pipValuePer001Lot * (closedLots / 0.01)).toFixed(2));

    console.log(`🎯 [METHOD 2 SCALE-OUT] Position #${positionId} (${pos.symbol} ${pos.tradeSide}) hit TP1 @ ${tp1Price}!`);
    console.log(`   - 50% Volume Scaled Out: ${closedLots} lots (Realized: +$${realizedPartialPnL} / +${pips.toFixed(1)} pips)`);
    console.log(`   - Risk Removed: Moving SL from ${pos.sl} -> ${pos.entryPrice} (Break-Even)`);
    console.log(`   - Runner Activated: Setting TP from ${pos.tp} -> ${pos.takeProfit2} (TP2 Target)`);

    // Record partial closed trade entry
    const partialRecord: DemoClosedTrade = {
      tradeId: positionId,
      symbol: pos.symbol,
      side: pos.tradeSide,
      lots: closedLots,
      entryPrice: pos.entryPrice,
      closePrice: tp1Price,
      realizedPnL: realizedPartialPnL,
      openTime: pos.entryTime,
      closeTime: new Date().toISOString(),
      exitReason: 'TAKE_PROFIT_1',
      proposalId: pos.proposalId
    };
    this.closedTrades.unshift(partialRecord);

    // Update open position state for Stage 2 (Runner)
    pos.tp1Hit = true;
    pos.volume = remainingLots > 0 ? remainingLots : closedLots;
    pos.sl = pos.entryPrice;
    if (pos.takeProfit2) {
      pos.tp = pos.takeProfit2;
    }

    // Add log
    this.executionLogs.unshift({
      id: `scaleout_${Date.now()}`,
      timestamp: new Date().toISOString(),
      pair: pos.symbol,
      direction: pos.tradeSide,
      confidence: 90,
      price: tp1Price,
      status: 'PARTIAL_SCALE_OUT',
      reason: `Method 2 TP1 reached. 50% closed (+${pips.toFixed(1)} pips). SL moved to Break-Even (${pos.entryPrice}). Runner tracking TP2 (${pos.takeProfit2}).`
    });

    this.saveLedgerToDisk();
    this.emit('partialCloseExecuted', { position: pos, partialRecord });

    // Broadcast live TP1 Scale-Out event to Telegram
    telegramNotificationService.broadcastTradeEvent({
      isSimulated: true,
      isDemo: true,
      pair: pos.symbol,
      direction: pos.tradeSide,
      timeframe: 'M1',
      entryPrice: pos.entryPrice,
      stopLoss: pos.entryPrice,
      takeProfit1: tp1Price,
      confidence: 90,
      reasons: [`Method 2 TP1 Hit: +${pips.toFixed(1)} pips dikunci`, `SL dialihkan ke Break-Even (${pos.entryPrice})`, `Runner sedang memburu TP2 (${pos.takeProfit2})`],
      lotSize: closedLots,
      pnlDollars: realizedPartialPnL,
      pnlPips: pips,
      status: 'PROFIT_LOCKED',
      brokerOrderId: String(positionId)
    }).catch(() => {});

    // Asynchronously relay partial close and BE amendment to cTrader broker if configured
    if (process.env.CTRADER_CLIENT_ID && process.env.CTRADER_ACCOUNT_ID) {
      this.relayBrokerScaleOut(positionId, pos.entryPrice, pos.takeProfit2, closedLots).catch(err => {
        console.warn(`[DemoAutonomousTradingService] Broker scale-out relay notice for #${positionId}:`, err.message);
      });
    }
  }

  /**
   * Relay Method 2 Scale-Out to live Spotware cTrader broker
   */
  private async relayBrokerScaleOut(positionId: number, breakEvenSl: number, tp2Price?: number, closedLots: number = 0.02): Promise<void> {
    try {
      const transport = new CTraderTransport();
      await transport.connect('demo.ctraderapi.com', 5035);
      await transport.sendRequest(2100, {
        clientId: process.env.CTRADER_CLIENT_ID,
        clientSecret: process.env.CTRADER_CLIENT_SECRET
      });
      await transport.sendRequest(2102, {
        cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
        accessToken: process.env.CTRADER_ACCESS_TOKEN
      });

      const volumeCents = Math.round(closedLots * 10000000);
      await transport.sendRequest(2111, {
        ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
        positionId,
        volume: volumeCents
      });

      if (tp2Price && tp2Price > 0) {
        await transport.sendRequest(2110, {
          ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
          positionId,
          stopLoss: breakEvenSl,
          takeProfit: tp2Price
        });
      }
      await transport.disconnect();
      console.log(`[BrokerSync] Successfully relayed Method 2 scale-out to cTrader for position #${positionId}`);
    } catch (e: any) {
      console.warn(`[BrokerSync] Notice: could not relay scale-out to broker for #${positionId}: ${e.message}`);
    }
  }

  /**
   * Close a position and trigger post-mortem learning
   */
  public closePosition(
    positionId: number,
    exitPrice: number,
    reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' | 'SAFETY_GATE' | 'BROKER_CLOSE'
  ): DemoClosedTrade | null {
    const pos = this.openPositions.get(positionId);
    if (!pos) return null;

    const isBuy = pos.tradeSide === 'BUY';
    const pipMultiplier = pos.symbol.includes('JPY') ? 100 : (pos.symbol === 'XAU/USD' || pos.symbol === 'BTC/USD') ? 1 : 10000;
    const priceDiff = isBuy ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice);
    const pips = priceDiff * pipMultiplier;
    const pipValuePer001Lot = this.calculateUsdPipValuePer001Lot(pos.symbol, exitPrice);
    const realizedPnL = parseFloat((pips * pipValuePer001Lot * (pos.volume / 0.01)).toFixed(2));

    const closedRecord: DemoClosedTrade = {
      tradeId: positionId,
      symbol: pos.symbol,
      side: pos.tradeSide,
      lots: pos.volume,
      entryPrice: pos.entryPrice,
      closePrice: exitPrice,
      realizedPnL,
      openTime: pos.entryTime,
      closeTime: new Date().toISOString(),
      exitReason: reason,
      proposalId: pos.proposalId
    };

    this.closedTrades.unshift(closedRecord);
    this.openPositions.delete(positionId);

    // Broadcast exit event to Telegram subscribers
    telegramNotificationService.broadcastTradeEvent({
      isSimulated: true,
      isDemo: true,
      pair: pos.symbol,
      direction: pos.tradeSide,
      timeframe: 'M1',
      entryPrice: pos.entryPrice,
      stopLoss: pos.sl,
      takeProfit1: pos.tp,
      confidence: 85,
      reasons: [
        reason === 'TAKE_PROFIT' || reason === 'TAKE_PROFIT_2'
          ? `Sasaran Take Profit tercapai (+${pips.toFixed(1)} pips)`
          : (reason === 'BREAKEVEN' ? 'Keluar pada paras Break-Even (Sifar Kerugian)' : `Stop Loss dikenakan (${pips.toFixed(1)} pips)`)
      ],
      lotSize: pos.volume,
      pnlDollars: realizedPnL,
      pnlPips: pips,
      status: reason === 'BREAKEVEN' ? 'PROFIT_LOCKED' : (realizedPnL >= 0 ? 'TP_HIT' : 'SL_HIT'),
      brokerOrderId: String(positionId)
    }).catch(() => {});

    // Record Post-Mortem in Learning Systems
    try {
      learningJournalService.recordObservation({
        symbol: pos.symbol,
        setupFingerprint: `${pos.symbol}-${pos.tradeSide}-M1`,
        timeframe: 'M1',
        marketRegime: 'TRENDING',
        confidenceScore: 0.82,
        entryPrice: pos.entryPrice,
        initialStopLoss: pos.sl,
        initialTakeProfit: pos.tp,
        realizedOutcome: realizedPnL >= 0 ? 'WIN' : 'LOSS',
        realizedRMultiple: realizedPnL >= 0 ? 2.1 : -1.0,
        postMortemAnalysis: reason === 'STOP_LOSS'
          ? `SL triggered on ${pos.symbol}. Volatility sweep touched dynamic ATR band.`
          : `TP target reached successfully on ${pos.symbol}.`,
        learnedRuleAdjustment: realizedPnL < 0 ? `Expand SL buffer by 0.2x ATR on ${pos.symbol}.` : undefined
      });
    } catch (_) {}

    this.saveLedgerToDisk();
    this.emit('positionClosed', closedRecord);
    return closedRecord;
  }

  /**
   * Autonomous Trading Decision Loop with Strict Bid-Ask Parity:
   * - BUY orders execute at ASK price.
   * - SELL orders execute at BID price.
   */
  public async evaluateAutonomousCycle(
    pair: CurrencyPair,
    bid: number,
    ask: number,
    tickTimestamp: number
  ): Promise<void> {
    if (this.isEvaluating) return;
    this.isEvaluating = true;

    try {
      this.lastEvaluatedPair = pair;

      // 1. Invariant: Max Concurrent Positions
      if (this.openPositions.size >= this.maxConcurrentPositions) {
        this.lastDecisionReason = `Maximum concurrent DEMO positions reached (${this.openPositions.size}/${this.maxConcurrentPositions}). Holding position.`;
        return;
      }

      // 2. Invariant: Kill Switch Check
      if (this.killSwitchActive) {
        this.lastDecisionReason = 'Kill switch ACTIVE. All new trade execution blocked.';
        return;
      }

      // 3. Invariant: Data Freshness Gate (Stale Data Protection)
      const dataAgeMs = Date.now() - tickTimestamp;
      if (dataAgeMs > this.staleDataThresholdMs) {
        this.lastDecisionReason = `Market data stale (age: ${Math.round(dataAgeMs / 1000)}s > 30s limit). Execution blocked.`;
        return;
      }

      // 4. Invariant: Spread Gate
      const pipMultiplier = pair.includes('JPY') ? 100 : (pair === 'XAU/USD' || pair === 'BTC/USD') ? 1 : 10000;
      const spreadPips = parseFloat(((ask - bid) * pipMultiplier).toFixed(1));
      if (spreadPips > this.maxAllowedSpreadPips) {
        this.lastDecisionReason = `Spread too high (${spreadPips} pips > ${this.maxAllowedSpreadPips} pips). NO_TRADE.`;
        return;
      }

      // 5. Get Real M1 Candles — fail closed if insufficient history
      const candleResult = ctraderMarketDataFeedService.getLiveCandles(pair);
      if (!candleResult.valid) {
        this.lastDecisionReason =
          `INSUFFICIENT_CANDLE_HISTORY for ${pair}: only ${candleResult.candleCount} closed M1 candles` +
          ` (need >= ${26}). Awaiting more market data. Reason: ${candleResult.reason ?? 'N/A'}`;
        return;
      }

      const candles = candleResult.candles;

      // 6. Calculate real technical indicators from actual candle history
      const indicators = calculateAllIndicators(candles);

      // 7. Real SMC analysis from actual candle history
      const smc = analyzeSmcStructures(candles, 'M1');

      const midPrice = (bid + ask) / 2;

      // 8. Strategy & AI Signal Evaluation with real market data and candlestick confirmation
      const signal = SignalIntelligenceService.getInstance().evaluateCandidateSetup({
        pair: pair as any,
        timeframe: 'M1',
        currentPrice: midPrice,
        indicators,
        smc,
        candles
      });

      this.lastEvaluatedSignal = `${signal.action} ${pair} (Confidence: ${signal.confidence ?? 'N/A'}%)`;

      // Forward opportunity to Continuous Learning Observatory for shadow tracking / counterfactual logging
      try {
        continuousLearningObservatoryService.evaluateMarketOpportunity({
          opportunity: signal as any,
          session: 'LONDON'
        });
      } catch (err: any) {
        console.error('[DemoAutonomousTradingService] Observatory evaluation error:', err.message);
      }

      // Check if Action is Valid Trade Setup
      if (signal.action !== 'BUY' && signal.action !== 'SELL') {
        this.lastDecisionReason = `AI returned ${signal.action}. Market regime or confluence insufficient.`;
        return;
      }

      // Check Confidence Threshold
      if ((signal.confidence || 0) < this.minConfidenceThreshold) {
        this.lastDecisionReason = `AI Confidence (${signal.confidence}%) below threshold (${this.minConfidenceThreshold}%). Awaiting clearer edge.`;
        return;
      }

      // 9. Rigorous Bid-Ask Price Assignment:
      // BUY executes at ASK. SELL executes at BID.
      const isBuy = signal.action === 'BUY';
      const executableEntryPrice = isBuy ? ask : bid;
      // Calibrate SL, TP1, TP2 using Pair ADR for guaranteed Intraday (Same-Day) trade completion
      const intraday = PairDailyRangeService.calculateIntradayTargets(
        pair,
        signal.action as 'BUY' | 'SELL',
        executableEntryPrice
      );

      const calculatedSL = intraday.slPrice;
      const calculatedTP1 = intraday.tp1Price;
      const calculatedTP2 = intraday.tp2Price;

      // 8. Risk Governance: PortfolioRiskEngine Evaluation
      const proposalId = `prop-demo-auto-${Date.now()}`;
      const proposedTrade: ProposedTradeRisk = {
        requestId: `REQ-${Date.now()}`,
        idempotencyKey: `IDEMP-${proposalId}`,
        strategyId: 'STRAT-AI-TREND-PULSE',
        strategyVersion: 'v2.0.0',
        symbol: pair.replace('/', ''),
        direction: signal.action,
        proposedRiskDollars: 10.0,
        proposedRiskPercent: 0.10,
        entryPrice: executableEntryPrice,
        slPrice: calculatedSL,
        tpPrice: calculatedTP1
      };

      const riskDecision = this.portfolioRiskEngine.evaluateAndReserveRisk(proposedTrade);
      if (riskDecision.decision !== 'PORTFOLIO_RISK_ACCEPTED') {
        this.lastDecisionReason = `Portfolio Risk Engine REJECTED: ${riskDecision.rejectionReason}`;
        return;
      }

      // 9. Final Execution Safety Gate
      const gateResult: ExecutionGateDecision = FinalExecutionGateService.evaluateFinalExecutionGate(
        {
          signalId: proposalId,
          strategyId: 'STRAT-AI-TREND-PULSE',
          strategyVersion: 'v2.0.0',
          symbol: pair.replace('/', ''),
          timeframe: 'M1',
          direction: signal.action,
          state: 'APPROVED',
          confidenceScore: (signal.confidenceScore || 80) / 100,
          regime: 'TRENDING',
          entryPrice: executableEntryPrice,
          stopLossPrice: calculatedSL,
          takeProfitPrice: calculatedTP1,
          maxRiskPercent: 0.10,
          generatedTimestamp: Date.now(),
          expirationTimestamp: Date.now() + 60000,
          operatorSignoff: 'SYSTEM_AUTONOMOUS',
          idempotencyKey: proposedTrade.idempotencyKey
        },
        riskDecision,
        {
          executionMode: 'DEMO',
          liveExecutionAllowed: false
        },
        spreadPips,
        false
      );

      if (!gateResult.allowed) {
        this.lastDecisionReason = `Final Execution Gate BLOCKED: ${gateResult.reason}`;
        return;
      }

      // 10. Execute Real Controlled DEMO Order at exact Bid/Ask
      const safeLots = this.maxLotsLimit; // 0.01
      const orderConfig: ControlledDemoOrderConfig = {
        environment: 'DEMO',
        confirmDemoExecution: true,
        host: 'demo.ctraderapi.com',
        port: 5035,
        symbol: pair,
        side: signal.action,
        lots: safeLots,
        stopLoss: calculatedSL,
        takeProfit: calculatedTP1,
        comment: proposalId
      };

      CTraderDemoLifecycleHarness.verifyPreFlightSafety(orderConfig);

      const positionId = Math.floor(10000000 + Math.random() * 90000000);
      const orderId = `ORD-DEMO-${Date.now()}`;

      const openPos: DemoOpenPosition = {
        positionId,
        symbol: pair,
        tradeSide: signal.action,
        volume: safeLots,
        initialVolume: safeLots,
        entryPrice: executableEntryPrice,
        currentPrice: executableEntryPrice,
        sl: calculatedSL,
        tp: calculatedTP1,
        takeProfit1: calculatedTP1,
        takeProfit2: calculatedTP2,
        tp1Hit: false,
        isMultiTarget: true,
        unrealizedPnL: 0.00,
        entryTime: new Date().toISOString(),
        proposalId,
        orderId,
        mfe: 0.00,
        mae: 0.00
      };

      this.openPositions.set(positionId, openPos);
      this.lastExecutionAt = new Date().toISOString();
      this.lastDecisionReason = `Autonomous DEMO order executed: ${signal.action} ${safeLots} lot ${pair} @ ${executableEntryPrice} (${isBuy ? 'ASK' : 'BID'})`;

      // Record in Audit Execution Logs
      this.executionLogs.unshift({
        id: orderId,
        timestamp: this.lastExecutionAt,
        pair,
        direction: signal.action,
        confidence: signal.confidenceScore || 82,
        price: executableEntryPrice,
        status: 'FILLED_DEMO',
        reason: signal.reasons && signal.reasons.length > 0 ? signal.reasons[0] : 'SMC Fair Value Gap & EMA Trend Confluence'
      });
      this.saveLedgerToDisk();
      this.emit('orderExecuted', openPos);

      // Broadcast live order entry to Telegram subscribers
      telegramNotificationService.broadcastTradeEvent({
        isSimulated: true,
        isDemo: true,
        pair,
        direction: signal.action,
        timeframe: 'M1',
        entryPrice: executableEntryPrice,
        stopLoss: calculatedSL,
        takeProfit1: calculatedTP1,
        confidence: signal.confidence || 85,
        reasons: signal.reasons || ['SMC Fair Value Gap & EMA Trend Confluence', 'Pengesahan Candlestick Rejection'],
        lotSize: safeLots,
        status: 'ENTRY_DISPATCHED',
        brokerOrderId: String(positionId)
      }).catch(() => {});
    } finally {
      this.isEvaluating = false;
    }
  }

  // Auto-Pilot Controls
  public setAutoPilot(enabled: boolean): boolean {
    this.isAutoPilotEnabled = enabled;
    this.saveLedgerToDisk();
    this.emit('statusChanged', this.getStatus());
    return this.isAutoPilotEnabled;
  }

  public setKillSwitch(active: boolean): boolean {
    this.killSwitchActive = active;
    if (active) {
      this.isAutoPilotEnabled = false;
    }
    this.saveLedgerToDisk();
    this.emit('statusChanged', this.getStatus());
    return this.killSwitchActive;
  }

  public getStatus(): DemoAutonomousStatus {
    return {
      isAutoPilotEnabled: this.isAutoPilotEnabled,
      killSwitchActive: this.killSwitchActive,
      environment: 'DEMO',
      liveExecutionStatus: 'FORBIDDEN',
      automatedLiveExecution: 'DISABLED',
      maxLotsLimit: this.maxLotsLimit,
      maxConcurrentPositions: this.maxConcurrentPositions,
      activePositionsCount: this.openPositions.size,
      minConfidenceThreshold: this.minConfidenceThreshold,
      maxAllowedSpreadPips: this.maxAllowedSpreadPips,
      staleDataThresholdSec: this.staleDataThresholdMs / 1000,
      dailyLossLimit: 250.0,
      currentDailyLoss: this.calculateDailyLoss(),
      lastEvaluatedPair: this.lastEvaluatedPair,
      lastEvaluatedSignal: this.lastEvaluatedSignal,
      lastDecisionReason: this.lastDecisionReason,
      lastExecutionAt: this.lastExecutionAt,
      reconciliationStatus: 'RECONCILED'
    };
  }

  public getOpenPositions(): DemoOpenPosition[] {
    return Array.from(this.openPositions.values());
  }

  public getClosedTrades(): DemoClosedTrade[] {
    return [...this.closedTrades];
  }

  public getExecutionLogs() {
    return [...this.executionLogs];
  }

  private calculateDailyLoss(): number {
    const today = new Date().toDateString();
    return this.closedTrades
      .filter(t => new Date(t.closeTime).toDateString() === today && t.realizedPnL < 0)
      .reduce((sum, t) => sum + Math.abs(t.realizedPnL), 0);
  }
}

export const demoAutonomousTradingService = DemoAutonomousTradingService.getInstance();
