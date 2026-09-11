import { EventEmitter } from 'events';
import { CurrencyPair, TradingSession, AiTradeOpportunity, ResearchEvidenceTier } from '../../types';
import { signalIntelligenceService } from '../../../apps/decision-agent/src/services/signalIntelligenceService';
import { researchLearningEngine } from '../../../apps/decision-agent/src/services/researchLearningEngine';
import { learningJournalService } from './learningJournalService';
import { ShadowAnalyticsService } from './shadowAnalyticsService';
import { calculateAllIndicators } from '../../lib/indicators';
import { analyzeSmcStructures } from '../../lib/smcEngine';
import { ctraderMarketDataFeedService, CTraderMarketDataFeedService } from './ctraderMarketDataFeedService';
import { shadowForwardTestService } from './shadowForwardTestService';
import { shadowObservationRepository } from '@iati/database';

export type ObservatoryState = 'STOPPED' | 'OBSERVING' | 'PAUSED';

export interface MarketTickEvent {
  symbol: CurrencyPair;
  currentPrice: number;
  highPrice?: number;
  lowPrice?: number;
  session?: TradingSession;
  timestamp?: number;
}

export interface ActiveShadowObservation {
  id: string;
  signalId: string;
  symbol: CurrencyPair;
  direction: 'BUY' | 'SELL';
  setupType: string;
  setupFingerprint: string;
  session: TradingSession;
  marketRegime: string;
  entryPrice: number;
  currentPrice?: number;
  unrealizedPnlPips?: number;
  unrealizedPnlDollars?: number;
  stopLoss: number;
  initialStopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  isMultiTarget: boolean;
  tp1Hit: boolean;
  status: 'ACTIVE' | 'CLOSED';
  closeReason?: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'BREAKEVEN' | 'MANUAL_CLOSE' | 'TIMEOUT';
  exitPrice?: number;
  realizedR?: number;
  mfePips: number;
  maePips: number;
  highestPriceSeen: number;
  lowestPriceSeen: number;
  openedAt: number;
  closedAt?: number;
  observationType: 'SHADOW_OBSERVATION';
  executionQualityAssumptions: {
    spreadPips: number;
    slippagePips: number;
    latencyMs: number;
  };
  monitoringState?: 'LIVE_MONITORING' | 'DATA_STALE';
  monitoringPausedReason?: string;
  immutableSignalSnapshot: any;
  persistence?: 'POSTGRESQL' | 'WAL_PENDING' | 'MEMORY_DEGRADED';
}

/**
 * Pipeline telemetry counters — expose the true health of every stage.
 * Every field is an integer counter or a nullable timestamp/string.
 */
export interface PipelineTelemetry {
  ticksReceived: number;
  candlesCompleted: number;
  indicatorCalculations: number;
  indicatorFailures: number;
  smcCalculations: number;
  smcFailures: number;
  signalsEvaluated: number;
  buySignals: number;
  sellSignals: number;
  waitSignals: number;
  noSetupSignals: number;
  vetoSignals: number;
  shadowOpened: number;
  counterfactualsRecorded: number;
  shadowClosed: number;
  duplicateSignals: number;
  noDataRejected: number;
  lastSignalTimestamp: number | null;
  lastShadowOpenedTimestamp: number | null;
  lastError: string | null;
}

export interface ObservatoryStatus {
  state: ObservatoryState;
  activeShadowCount: number;
  totalShadowsObserved: number;
  totalCounterfactualsObserved: number;
  realDemoCount: number;
  isDemoArmed: false; // Invariant: NEVER true
  liveExecutionGate: 'FORBIDDEN'; // Invariant: ALWAYS FORBIDDEN
  brokerOrdersTransmitted: 0; // Invariant: ALWAYS 0
  lastTickTimestamp: number | null;
  lastError: string | null;
  isDispatcherRunning: boolean;
  isMarketListenerActive: boolean;
  pipeline: PipelineTelemetry;
}

export class ContinuousLearningObservatoryService {
  private static instance: ContinuousLearningObservatoryService;
  public static readonly MAX_ACTIVE_SHADOW_OBSERVATIONS = 4;
  public static readonly MAX_ACTIVE_PER_PAIR = 1;

  private state: ObservatoryState = 'STOPPED';
  private activeObservations: Map<string, ActiveShadowObservation> = new Map();
  private completedObservations: ActiveShadowObservation[] = [];
  private processedSignalIds: Set<string> = new Set();
  private lastClosedTimestampByPair: Map<string, number> = new Map();
  private lastTickTimestamp: number | null = null;
  private lastError: string | null = null;
  private isDispatcherRunning: boolean = false;
  private dispatcherInterval: NodeJS.Timeout | null = null;
  private boundEmitter: EventEmitter | null = null;
  private tickListener: ((tick: MarketTickEvent) => void) | null = null;
  private candleClosedListener: ((event: { symbol: CurrencyPair; candle: any; session: string }) => void) | null = null;
  private isHydrated: boolean = false;

  // ─── Pipeline Telemetry ────────────────────────────────────────────────────
  private telemetry: PipelineTelemetry = {
    ticksReceived: 0,
    candlesCompleted: 0,
    indicatorCalculations: 0,
    indicatorFailures: 0,
    smcCalculations: 0,
    smcFailures: 0,
    signalsEvaluated: 0,
    buySignals: 0,
    sellSignals: 0,
    waitSignals: 0,
    noSetupSignals: 0,
    vetoSignals: 0,
    shadowOpened: 0,
    counterfactualsRecorded: 0,
    shadowClosed: 0,
    duplicateSignals: 0,
    noDataRejected: 0,
    lastSignalTimestamp: null,
    lastShadowOpenedTimestamp: null,
    lastError: null
  };

  private constructor() {}

  public static getInstance(): ContinuousLearningObservatoryService {
    if (!ContinuousLearningObservatoryService.instance) {
      ContinuousLearningObservatoryService.instance = new ContinuousLearningObservatoryService();
    }
    return ContinuousLearningObservatoryService.instance;
  }

  /**
   * Boot Hydration: Restore ACTIVE and COMPLETED shadow observations from PostgreSQL
   */
  public async initPersistence(): Promise<void> {
    if (this.isHydrated) return;
    try {
      // 0. Replay any pending local WAL entries to PostgreSQL first
      await shadowObservationRepository.replayWal().catch(() => {});

      await learningJournalService.initPersistence();
      
      // 1. Hydrate ACTIVE observations
      const active = await shadowObservationRepository.getActiveShadowObservations();
      for (const obs of active) {
        if (!this.activeObservations.has(obs.id)) {
          this.activeObservations.set(obs.id, { ...obs, persistence: 'POSTGRESQL' });
          if (obs.signalId) this.processedSignalIds.add(obs.signalId);
        }
      }

      // 2. Hydrate COMPLETED observations (latest 100)
      const completed = await shadowObservationRepository.getCompletedShadowObservations(100);
      const existingCompletedIds = new Set(this.completedObservations.map(o => o.id));
      for (const obs of completed) {
        if (!existingCompletedIds.has(obs.id)) {
          this.completedObservations.push({ ...obs, persistence: 'POSTGRESQL' });
          existingCompletedIds.add(obs.id);
          if (obs.signalId) this.processedSignalIds.add(obs.signalId);
        }
      }

      this.isHydrated = true;
    } catch (err: any) {
      // Fail-soft: remain functional in memory
      this.isHydrated = false;
    }
  }

  public getStatus(): ObservatoryStatus {
    const summary = researchLearningEngine.getCampaignSummaryMetrics();
    return {
      state: this.state,
      activeShadowCount: Array.from(this.activeObservations.values()).filter(o => o.status === 'ACTIVE').length,
      totalShadowsObserved: this.completedObservations.length,
      totalCounterfactualsObserved: summary.counterfactualCount,
      realDemoCount: summary.closedTrades,
      isDemoArmed: false,
      liveExecutionGate: 'FORBIDDEN',
      brokerOrdersTransmitted: 0,
      lastTickTimestamp: this.lastTickTimestamp,
      lastError: this.lastError,
      isDispatcherRunning: this.isDispatcherRunning,
      isMarketListenerActive:
        this.state === 'OBSERVING' &&
        this.boundEmitter !== null &&
        this.candleClosedListener !== null,
      pipeline: { ...this.telemetry }
    };
  }

  /**
   * Bind to the cTrader market data feed emitter.
   *
   * Responsibilities:
   *   - tickListener       → update lastTickTimestamp + monitor existing shadow MFE/MAE
   *   - candleClosedListener → controlled evaluation dispatcher (one per new M1 candle per pair)
   */
  public bindMarketDataEmitter(emitter: EventEmitter): void {
    if (this.boundEmitter === emitter && this.tickListener && this.candleClosedListener) {
      return; // strictly idempotent
    }
    this.unbindMarketDataEmitter();
    this.boundEmitter = emitter;

    // Tick listener: update telemetry + monitor existing open shadows only
    this.tickListener = (tick: MarketTickEvent) => {
      if (this.state !== 'OBSERVING' || !tick?.symbol || !(tick.currentPrice > 0)) return;
      this.telemetry.ticksReceived++;
      this.lastTickTimestamp = Date.now();
      this.processMarketTick(
        tick.symbol,
        tick.currentPrice,
        tick.highPrice,
        tick.lowPrice,
        tick.session || 'LONDON'
      );
    };

    // Candle-closed listener: controlled shadow evaluation dispatcher
    this.candleClosedListener = (event: { symbol: CurrencyPair; candle: any; session: string }) => {
      if (this.state !== 'OBSERVING') return;
      this.onCandleClosed(event.symbol, event.session as TradingSession).catch(err => {
        const msg = `[OBSERVATORY] onCandleClosed error for ${event.symbol}: ${err?.message || err}`;
        console.error(msg);
        this.telemetry.lastError = msg;
        this.lastError = msg;
      });
    };

    this.boundEmitter.on('marketTick', this.tickListener);
    this.boundEmitter.on('candleClosed', this.candleClosedListener);
  }

  public unbindMarketDataEmitter(): void {
    if (this.boundEmitter) {
      if (this.tickListener) {
        this.boundEmitter.removeListener('marketTick', this.tickListener);
        this.tickListener = null;
      }
      if (this.candleClosedListener) {
        this.boundEmitter.removeListener('candleClosed', this.candleClosedListener);
        this.candleClosedListener = null;
      }
      this.boundEmitter = null;
    }
  }

  private startDispatcher(): void {
    if (this.isDispatcherRunning || this.dispatcherInterval) return;
    this.isDispatcherRunning = true;
    this.dispatcherInterval = setInterval(() => {
      if (this.state !== 'OBSERVING') {
        this.stopDispatcher();
        return;
      }
      if (this.activeObservations.size > 0) {
        this.lastTickTimestamp = Date.now();
      }
    }, 3000);
  }

  private stopDispatcher(): void {
    this.isDispatcherRunning = false;
    if (this.dispatcherInterval) {
      clearInterval(this.dispatcherInterval);
      this.dispatcherInterval = null;
    }
  }

  public startObservatory(): { success: boolean; state: ObservatoryState; error?: string } {
    if (this.state === 'OBSERVING') return { success: true, state: this.state };
    this.state = 'OBSERVING';
    this.lastError = null;
    this.initPersistence().catch(() => {});
    this.startDispatcher();
    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_STARTED',
      setupFingerprint: 'GLOBAL_OBSERVATORY',
      symbol: 'EUR/USD' as CurrencyPair,
      session: 'LONDON' as TradingSession,
      direction: 'BUY',
      observationType: 'SHADOW' as any,
      evidenceTier: 'NO_EVIDENCE' as any,
      sampleCount: this.completedObservations.length,
      previousLearningWeight: 0,
      newLearningWeight: 0,
      affectedFutureSetupFingerprint: 'GLOBAL_OBSERVATORY',
      reason: 'Continuous Learning Observatory started in real-market shadow mode (0 broker orders)'
    });
    return { success: true, state: this.state };
  }

  public pauseObservatory(reason: string = 'Operator paused observatory'): { success: boolean; state: ObservatoryState } {
    if (this.state === 'PAUSED') return { success: true, state: this.state };
    this.stopDispatcher();
    this.state = 'PAUSED';
    this.lastError = reason;
    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_PAUSED',
      setupFingerprint: 'GLOBAL_OBSERVATORY',
      symbol: 'EUR/USD' as CurrencyPair,
      session: 'LONDON' as TradingSession,
      direction: 'BUY',
      observationType: 'SHADOW' as any,
      evidenceTier: 'NO_EVIDENCE' as any,
      sampleCount: this.completedObservations.length,
      previousLearningWeight: 0,
      newLearningWeight: 0,
      affectedFutureSetupFingerprint: 'GLOBAL_OBSERVATORY',
      reason: `Observatory paused: ${reason}`
    });
    return { success: true, state: this.state };
  }

  public resumeObservatory(): { success: boolean; state: ObservatoryState } {
    if (this.state === 'OBSERVING') return { success: true, state: this.state };
    this.state = 'OBSERVING';
    this.lastError = null;
    this.startDispatcher();
    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_RESUMED',
      setupFingerprint: 'GLOBAL_OBSERVATORY',
      symbol: 'EUR/USD' as CurrencyPair,
      session: 'LONDON' as TradingSession,
      direction: 'BUY',
      observationType: 'SHADOW' as any,
      evidenceTier: 'NO_EVIDENCE' as any,
      sampleCount: this.completedObservations.length,
      previousLearningWeight: 0,
      newLearningWeight: 0,
      affectedFutureSetupFingerprint: 'GLOBAL_OBSERVATORY',
      reason: 'Observatory resumed continuous shadow surveillance'
    });
    return { success: true, state: this.state };
  }

  public stopObservatory(reason: string = 'Operator stopped observatory'): { success: boolean; state: ObservatoryState } {
    if (this.state === 'STOPPED') return { success: true, state: this.state };
    this.stopDispatcher();
    this.state = 'STOPPED';
    this.lastError = null;
    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_STOPPED',
      setupFingerprint: 'GLOBAL_OBSERVATORY',
      symbol: 'EUR/USD' as CurrencyPair,
      session: 'LONDON' as TradingSession,
      direction: 'BUY',
      observationType: 'SHADOW' as any,
      evidenceTier: 'NO_EVIDENCE' as any,
      sampleCount: this.completedObservations.length,
      previousLearningWeight: 0,
      newLearningWeight: 0,
      affectedFutureSetupFingerprint: 'GLOBAL_OBSERVATORY',
      reason: `Observatory stopped: ${reason}`
    });
    return { success: true, state: this.state };
  }

  /**
   * Controlled shadow evaluation dispatcher.
   * Called once per M1 candle close, per pair.
   *
   * Pipeline:
   *   Real candles → Real indicators → Real SMC → Signal evaluation → evaluateMarketOpportunity
   *
   * SAFETY: This method never transmits broker orders. It terminates at SHADOW_OPENED.
   */
  public async onCandleClosed(symbol: CurrencyPair, session: TradingSession = 'LONDON'): Promise<void> {
    if (this.state !== 'OBSERVING') return;

    this.telemetry.candlesCompleted++;

    // ── PHASE 1: Get real M1 candles ─────────────────────────────────────────
    const candleResult = ctraderMarketDataFeedService.getLiveCandles(symbol);
    if (!candleResult.valid) {
      this.telemetry.noDataRejected++;
      this.telemetry.lastError =
        `[SHADOW_PIPELINE] pair=${symbol} stage=MARKET_DATA ` +
        `reason=${candleResult.reason} candleCount=${candleResult.candleCount}`;
      console.warn(this.telemetry.lastError);
      return;
    }

    const candles = candleResult.candles;
    const currentPrice = candles[candles.length - 1].close;

    console.log(
      `[SHADOW_PIPELINE] pair=${symbol} stage=MARKET_DATA` +
      ` candles=${candleResult.candleCount} price=${currentPrice}`
    );

    // ── PHASE 2: Calculate real technical indicators ──────────────────────────
    let indicators: any;
    try {
      indicators = calculateAllIndicators(candles);
      this.telemetry.indicatorCalculations++;
      console.log(
        `[SHADOW_PIPELINE] pair=${symbol} stage=INDICATORS valid=true` +
        ` ema20=${indicators.ema20?.toFixed(5)} ema50=${indicators.ema50?.toFixed(5)}` +
        ` ema200=${indicators.ema200?.toFixed(5)} rsi=${indicators.rsi}` +
        ` atr=${indicators.atr} adx=${indicators.adx?.adx}`
      );
    } catch (err: any) {
      this.telemetry.indicatorFailures++;
      this.telemetry.noDataRejected++;
      const msg = `[SHADOW_PIPELINE] pair=${symbol} stage=INDICATORS error=${err?.message}`;
      console.error(msg);
      this.telemetry.lastError = msg;
      return;
    }

    // ── PHASE 3: Real SMC analysis ────────────────────────────────────────────
    let smc: any;
    try {
      smc = analyzeSmcStructures(candles, 'M1');
      this.telemetry.smcCalculations++;
      const obCount = smc?.orderBlocks?.length ?? 0;
      const fvgCount = smc?.fairValueGaps?.length ?? 0;
      console.log(
        `[SHADOW_PIPELINE] pair=${symbol} stage=SMC` +
        ` orderBlocks=${obCount} fvg=${fvgCount}` +
        ` bos=${smc?.lastBos?.type ?? 'NONE'} choch=${smc?.lastChoch?.type ?? 'NONE'}`
      );
    } catch (err: any) {
      this.telemetry.smcFailures++;
      // SMC failure is non-fatal — proceed with empty SMC
      smc = { orderBlocks: [], fairValueGaps: [] };
      const msg = `[SHADOW_PIPELINE] pair=${symbol} stage=SMC error=${err?.message} (proceeding with empty SMC)`;
      console.warn(msg);
    }

    // ── PHASE 4/5: Determine AI provider ─────────────────────────────────────
    const hasGeminiKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
    const decisionProvider: 'GEMINI' | 'DETERMINISTIC' = hasGeminiKey ? 'GEMINI' : 'DETERMINISTIC';
    console.log(
      `[SHADOW_PIPELINE] pair=${symbol} stage=SIGNAL_PROVIDER AI_PROVIDER=${decisionProvider}`
    );

    // ── PHASE 4: Signal intelligence evaluation ───────────────────────────────
    let signal: any;
    try {
      signal = signalIntelligenceService.evaluateCandidateSetup({
        pair: symbol,
        timeframe: 'M1',
        currentPrice,
        indicators,
        smc,
        dataMode: 'LIVE'
      });
    } catch (err: any) {
      this.telemetry.noDataRejected++;
      const msg = `[SHADOW_PIPELINE] pair=${symbol} stage=SIGNAL error=${err?.message}`;
      console.error(msg);
      this.telemetry.lastError = msg;
      return;
    }

    this.telemetry.signalsEvaluated++;
    this.telemetry.lastSignalTimestamp = Date.now();

    // Record action telemetry
    const action: string = signal?.action || 'NO_SETUP';
    if (action === 'BUY') this.telemetry.buySignals++;
    else if (action === 'SELL') this.telemetry.sellSignals++;
    else if (action === 'WAIT' || action === 'WAIT_FOR_CONFIRMATION') this.telemetry.waitSignals++;
    else if (action === 'VETO') this.telemetry.vetoSignals++;
    else this.telemetry.noSetupSignals++;

    console.log(
      `[SHADOW_PIPELINE] pair=${symbol} stage=SIGNAL` +
      ` provider=${decisionProvider} action=${action}` +
      ` confidence=${signal?.confidence ?? 'N/A'}`
    );

    // Attach decision provider to signal snapshot
    signal.decisionProvider = decisionProvider;

    // ── PHASE 8: Send to Observatory ─────────────────────────────────────────
    const result = this.evaluateMarketOpportunity({ opportunity: signal, session });

    console.log(
      `[SHADOW_PIPELINE] pair=${symbol} stage=OBSERVATORY` +
      ` actionTaken=${result.actionTaken}` +
      (result.observationId ? ` observationId=${result.observationId}` : '')
    );

    // ── PHASE 9: Path B Shadow Forward-Test Parallel Comparison (Async / Non-blocking) ──
    try {
      shadowForwardTestService.analyzeSignalShadow({
        pair: symbol,
        timeframe: 'M1',
        signalDirection: action === 'BUY' ? 'BUY' : action === 'SELL' ? 'SELL' : null,
        signalConfidence: Number(signal?.confidence || 0),
        signalReasons: Array.isArray(signal?.reasons)
          ? signal.reasons
          : (signal?.rationale ? [signal.rationale] : []),
        currentPrice,
        candles,
        accountId: process.env.CTRADER_ACCOUNT_ID || 'DEFAULT',
        environment: (process.env.EXECUTION_ENVIRONMENT as 'DEMO' | 'LIVE') || 'DEMO'
      }).catch(shadowErr => {
        console.warn(`[SHADOW_FORWARD_TEST] Async evaluation error for ${symbol}:`, shadowErr?.message || shadowErr);
      });
    } catch (e: any) {
      console.warn(`[SHADOW_FORWARD_TEST] Dispatch failed for ${symbol}:`, e?.message || e);
    }
  }

  /**
   * Evaluates incoming real-market data and creates a shadow observation (or counterfactual)
   * without transmitting any broker order. Fails closed if market data is invalid or missing.
   *
   * SAFETY INVARIANT: This method does NOT and MUST NOT call any broker execution adapter.
   */
  public evaluateMarketOpportunity(data: {
    opportunity?: AiTradeOpportunity;
    rawMarketData?: {
      pair: CurrencyPair;
      currentPrice?: number;
      indicators?: any;
      smc?: any;
    };
    session?: TradingSession;
  }): {
    success: boolean;
    actionTaken: 'SHADOW_OPENED' | 'COUNTERFACTUAL_RECORDED' | 'NO_DATA_FAIL_CLOSED' | 'REJECTED_OBSERVATORY_NOT_ACTIVE' | 'DUPLICATE_IGNORED' | 'CAPACITY_IGNORED';
    observationId?: string;
    reason?: string;
    error?: string;
  } {
    if (this.state !== 'OBSERVING') {
      return {
        success: false,
        actionTaken: 'REJECTED_OBSERVATORY_NOT_ACTIVE',
        error: `Observatory is ${this.state}`
      };
    }

    const session: TradingSession = data.session || 'LONDON';

    let opportunity = data.opportunity;
    if (!opportunity && data.rawMarketData) {
      if (!data.rawMarketData.currentPrice || isNaN(data.rawMarketData.currentPrice)) {
        this.telemetry.noDataRejected++;
        return {
          success: false,
          actionTaken: 'NO_DATA_FAIL_CLOSED',
          error: 'Market data feed unavailable or invalid. Failing closed without synthetic assumptions.'
        };
      }

      if (!data.rawMarketData.indicators) {
        this.telemetry.noDataRejected++;
        return {
          success: false,
          actionTaken: 'NO_DATA_FAIL_CLOSED',
          error: 'NO_DATA: indicators object missing — cannot evaluate without real indicators.'
        };
      }

      opportunity = signalIntelligenceService.evaluateCandidateSetup({
        pair: data.rawMarketData.pair,
        currentPrice: data.rawMarketData.currentPrice,
        indicators: data.rawMarketData.indicators,
        smc: data.rawMarketData.smc
      });
    }

    if (!opportunity) {
      this.telemetry.noDataRejected++;
      return {
        success: false,
        actionTaken: 'NO_DATA_FAIL_CLOSED',
        error: 'NO_DATA: Missing market opportunity payload.'
      };
    }

    // ── Idempotency check ────────────────────────────────────────────────────
    const signalId = (opportunity as any).id || (opportunity as any).proposalId;
    if (signalId && this.processedSignalIds.has(signalId)) {
      this.telemetry.duplicateSignals++;
      return { success: true, actionTaken: 'DUPLICATE_IGNORED', reason: 'SIGNAL_ID_ALREADY_PROCESSED' };
    }

    // ── Counterfactual branch (NO_SETUP / WAIT / VETO) ────────────────────
    const action = opportunity.action;
    if (action === 'NO_SETUP' || action === 'WAIT' || action === 'WAIT_FOR_CONFIRMATION' || action === 'VETO') {
      // Record signal ID only after successful recording
      const cf = researchLearningEngine.recordCounterfactual(
        opportunity,
        opportunity.rationale || `Opportunity filtered: ${action}`,
        session
      );

      if (signalId) this.processedSignalIds.add(signalId);
      this.telemetry.counterfactualsRecorded++;

      learningJournalService.recordEvent({
        eventType: 'COUNTERFACTUAL_RECORDED',
        setupFingerprint: cf.setupFingerprint,
        evidenceTier: 'NO_EVIDENCE',
        sampleCount: 1,
        reason: `Counterfactual logged: ${action} (${cf.rejectionReason})`
      });

      return {
        success: true,
        actionTaken: 'COUNTERFACTUAL_RECORDED',
        observationId: cf.id
      };
    }

    // ── SHADOW_OPENED branch (BUY or SELL) ────────────────────────────────
    if (action !== 'BUY' && action !== 'SELL') {
      this.telemetry.noDataRejected++;
      return {
        success: false,
        actionTaken: 'NO_DATA_FAIL_CLOSED',
        error: `Unknown signal action: ${action}`
      };
    }

    // ── P25 ADMISSION GOVERNANCE: 1. Active Pair Deduplication Guard ───────
    const canonicalPair = opportunity.pair;
    const activeOnPair = Array.from(this.activeObservations.values()).filter(
      obs => obs.symbol === canonicalPair && obs.status === 'ACTIVE'
    );
    if (activeOnPair.length >= ContinuousLearningObservatoryService.MAX_ACTIVE_PER_PAIR) {
      this.telemetry.duplicateSignals++;
      return {
        success: true,
        actionTaken: 'DUPLICATE_IGNORED',
        reason: 'ACTIVE_SHADOW_EXISTS'
      };
    }

    // ── P25 ADMISSION GOVERNANCE: 2. Global Concurrency Cap Guard ──────────
    const totalActive = Array.from(this.activeObservations.values()).filter(
      obs => obs.status === 'ACTIVE'
    ).length;
    if (totalActive >= ContinuousLearningObservatoryService.MAX_ACTIVE_SHADOW_OBSERVATIONS) {
      this.telemetry.duplicateSignals++;
      return {
        success: true,
        actionTaken: 'CAPACITY_IGNORED',
        reason: 'GLOBAL_SHADOW_CAP_REACHED'
      };
    }

    // ── P25 ADMISSION GOVERNANCE: 3. Re-entry Cooldown ─────────────────────
    const lastClosed = this.lastClosedTimestampByPair.get(canonicalPair) || 0;
    if (Date.now() - lastClosed < 500) {
      this.telemetry.duplicateSignals++;
      return {
        success: true,
        actionTaken: 'DUPLICATE_IGNORED',
        reason: 'REENTRY_COOLDOWN_ACTIVE'
      };
    }

    // ── SL/TP fail-closed: reject if not calculable ───────────────────────
    const plannedEntry = opportunity.entryPrice || opportunity.entryZone?.min || opportunity.currentPrice;
    if (!plannedEntry || plannedEntry <= 0) {
      this.telemetry.noDataRejected++;
      return {
        success: false,
        actionTaken: 'NO_DATA_FAIL_CLOSED',
        error: 'NO_DATA: Entry price not calculable from strategy — rejecting safely.'
      };
    }

    const sl = opportunity.stopLoss;
    const tp1 = opportunity.takeProfit1;

    if (sl === null || sl === undefined || sl <= 0) {
      this.telemetry.noDataRejected++;
      return {
        success: false,
        actionTaken: 'NO_DATA_FAIL_CLOSED',
        error: 'NO_DATA: StopLoss not calculable from strategy — rejecting safely (NO_DATA_FAIL_CLOSED).'
      };
    }

    if (tp1 === null || tp1 === undefined || tp1 <= 0) {
      this.telemetry.noDataRejected++;
      return {
        success: false,
        actionTaken: 'NO_DATA_FAIL_CLOSED',
        error: 'NO_DATA: TakeProfit1 not calculable from strategy — rejecting safely (NO_DATA_FAIL_CLOSED).'
      };
    }

    const tp2 = opportunity.takeProfit2 ?? undefined;
    const isMultiTarget = tp2 !== undefined && tp2 > 0;

    const fingerprint = researchLearningEngine.generateFingerprint(
      opportunity.pair,
      opportunity.action as 'BUY' | 'SELL',
      opportunity.setupType || 'ORDER_BLOCK_RETEST'
    );

    // Build immutable snapshot including decision provider
    const immutableSnapshot = Object.freeze({
      ...opportunity,
      decisionProvider: (opportunity as any).decisionProvider ?? 'DETERMINISTIC',
      snapshotTimestamp: Date.now()
    });

    const shadow: ActiveShadowObservation = {
      id: `shadow-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      signalId: signalId || shadow_id_fallback(),
      symbol: opportunity.pair,
      direction: action as 'BUY' | 'SELL',
      setupType: opportunity.setupType || 'ORDER_BLOCK_RETEST',
      setupFingerprint: fingerprint,
      session,
      marketRegime: opportunity.marketRegime || 'UNKNOWN',
      entryPrice: plannedEntry,
      stopLoss: sl,
      initialStopLoss: sl,
      takeProfit1: tp1,
      takeProfit2: tp2,
      isMultiTarget,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: plannedEntry,
      lowestPriceSeen: plannedEntry,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: {
        spreadPips: 0.8,
        slippagePips: 0.2,
        latencyMs: 18.5
      },
      immutableSignalSnapshot: immutableSnapshot
    };

    this.activeObservations.set(shadow.id, shadow);

    // Record signal ID only after successful observation creation
    if (signalId) this.processedSignalIds.add(signalId);

    this.telemetry.shadowOpened++;
    this.telemetry.lastShadowOpenedTimestamp = Date.now();

    // Async durable persistence to PostgreSQL (fail-soft, non-blocking)
    shadowObservationRepository.saveShadowObservation(shadow).catch(() => {
      // Repository tracks degraded state
    });

    learningJournalService.recordEvent({
      eventType: 'SHADOW_RECORDED',
      setupFingerprint: fingerprint,
      evidenceTier: researchLearningEngine.getSetupStats(fingerprint)?.evidenceTier || 'NO_EVIDENCE',
      sampleCount: (researchLearningEngine.getSetupStats(fingerprint)?.totalObservations || 0) + 1,
      reason: `Simulated ${shadow.direction} entry at ${plannedEntry} (SL: ${sl}, TP1: ${tp1}, TP2: ${tp2 ?? 'N/A'})`
    });

    return {
      success: true,
      actionTaken: 'SHADOW_OPENED',
      observationId: shadow.id
    };
  }

  /**
   * Ingests real-market tick prices, updates MFE/MAE, checks TP/SL progression
   * and executes simulated closures for existing ACTIVE shadow observations.
   *
   * SAFETY: This method does NOT and MUST NOT transmit broker orders.
   */
  public processMarketTick(
    symbol: CurrencyPair,
    currentPrice: number,
    highPrice?: number,
    lowPrice?: number,
    session: TradingSession = 'LONDON'
  ): ActiveShadowObservation[] {
    if (this.state !== 'OBSERVING' || isNaN(currentPrice) || currentPrice <= 0) {
      return [];
    }

    this.lastTickTimestamp = Date.now();
    const high = highPrice !== undefined ? highPrice : currentPrice;
    const low = lowPrice !== undefined ? lowPrice : currentPrice;
    const pipFactor = symbol === 'USD/JPY' ? 100 : (symbol === 'XAU/USD' || symbol === 'NASDAQ' || symbol === 'BTC/USD') ? 1 : 10000;

    const closedThisTick: ActiveShadowObservation[] = [];

    for (const [obsId, shadow] of this.activeObservations.entries()) {
      if (shadow.symbol !== symbol || shadow.status !== 'ACTIVE') continue;

      shadow.highestPriceSeen = Math.max(shadow.highestPriceSeen, high);
      shadow.lowestPriceSeen = Math.min(shadow.lowestPriceSeen, low);

      // Calculate MFE / MAE
      if (shadow.direction === 'BUY') {
        shadow.mfePips = parseFloat(Math.max(shadow.mfePips, (shadow.highestPriceSeen - shadow.entryPrice) * pipFactor).toFixed(1));
        shadow.maePips = parseFloat(Math.max(shadow.maePips, (shadow.entryPrice - shadow.lowestPriceSeen) * pipFactor).toFixed(1));
      } else {
        shadow.mfePips = parseFloat(Math.max(shadow.mfePips, (shadow.entryPrice - shadow.lowestPriceSeen) * pipFactor).toFixed(1));
        shadow.maePips = parseFloat(Math.max(shadow.maePips, (shadow.highestPriceSeen - shadow.entryPrice) * pipFactor).toFixed(1));
      }

      let hasClosed = false;

      if (shadow.direction === 'BUY') {
        if (low <= shadow.stopLoss) {
          hasClosed = true;
          shadow.status = 'CLOSED';
          shadow.exitPrice = shadow.stopLoss;
          shadow.closeReason = shadow.tp1Hit && shadow.stopLoss >= shadow.entryPrice ? 'BREAKEVEN' : 'STOP_LOSS';
        } else if (!shadow.tp1Hit && high >= shadow.takeProfit1) {
          if (!shadow.isMultiTarget || !shadow.takeProfit2) {
            hasClosed = true;
            shadow.status = 'CLOSED';
            shadow.exitPrice = shadow.takeProfit1;
            shadow.closeReason = 'TAKE_PROFIT_1';
          } else {
            shadow.tp1Hit = true;
            shadow.stopLoss = shadow.entryPrice;
            shadowObservationRepository.updateShadowObservation({
              id: shadow.id,
              tp1Hit: true,
              stopLoss: shadow.entryPrice
            }).catch(() => {});
            learningJournalService.recordEvent({
              eventType: 'PARAMETER_ADAPTED',
              setupFingerprint: shadow.setupFingerprint,
              evidenceTier: researchLearningEngine.getSetupStats(shadow.setupFingerprint)?.evidenceTier || 'NO_EVIDENCE',
              sampleCount: researchLearningEngine.getSetupStats(shadow.setupFingerprint)?.totalObservations || 0,
              previousParameter: `SL: ${shadow.initialStopLoss}`,
              proposedParameter: `SL: ${shadow.entryPrice} (Breakeven)`,
              boundedAdjustment: 'SL moved to Breakeven on TP1 hit',
              reason: `Shadow ${shadow.id} reached TP1 (${shadow.takeProfit1}). Continuing toward TP2 (${shadow.takeProfit2}).`
            });
          }
        } else if (shadow.tp1Hit && shadow.takeProfit2 && high >= shadow.takeProfit2) {
          hasClosed = true;
          shadow.status = 'CLOSED';
          shadow.exitPrice = shadow.takeProfit2;
          shadow.closeReason = 'TAKE_PROFIT_2';
        }
      } else {
        // SELL direction
        if (high >= shadow.stopLoss) {
          hasClosed = true;
          shadow.status = 'CLOSED';
          shadow.exitPrice = shadow.stopLoss;
          shadow.closeReason = shadow.tp1Hit && shadow.stopLoss <= shadow.entryPrice ? 'BREAKEVEN' : 'STOP_LOSS';
        } else if (!shadow.tp1Hit && low <= shadow.takeProfit1) {
          if (!shadow.isMultiTarget || !shadow.takeProfit2) {
            hasClosed = true;
            shadow.status = 'CLOSED';
            shadow.exitPrice = shadow.takeProfit1;
            shadow.closeReason = 'TAKE_PROFIT_1';
          } else {
            shadow.tp1Hit = true;
            shadow.stopLoss = shadow.entryPrice;
            shadowObservationRepository.updateShadowObservation({
              id: shadow.id,
              tp1Hit: true,
              stopLoss: shadow.entryPrice
            }).catch(() => {});
            learningJournalService.recordEvent({
              eventType: 'PARAMETER_ADAPTED',
              setupFingerprint: shadow.setupFingerprint,
              evidenceTier: researchLearningEngine.getSetupStats(shadow.setupFingerprint)?.evidenceTier || 'NO_EVIDENCE',
              sampleCount: researchLearningEngine.getSetupStats(shadow.setupFingerprint)?.totalObservations || 0,
              previousParameter: `SL: ${shadow.initialStopLoss}`,
              proposedParameter: `SL: ${shadow.entryPrice} (Breakeven)`,
              boundedAdjustment: 'SL moved to Breakeven on TP1 hit',
              reason: `Shadow ${shadow.id} reached TP1 (${shadow.takeProfit1}). Continuing toward TP2 (${shadow.takeProfit2}).`
            });
          }
        } else if (shadow.tp1Hit && shadow.takeProfit2 && low <= shadow.takeProfit2) {
          hasClosed = true;
          shadow.status = 'CLOSED';
          shadow.exitPrice = shadow.takeProfit2;
          shadow.closeReason = 'TAKE_PROFIT_2';
        }
      }

      if (hasClosed && shadow.exitPrice !== undefined) {
        shadow.closedAt = Date.now();
        const realizedR = ShadowAnalyticsService.calculateRMultiple(
          shadow.entryPrice,
          shadow.exitPrice,
          shadow.initialStopLoss,
          shadow.direction
        );
        shadow.realizedR = realizedR;

        const outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' =
          shadow.closeReason === 'BREAKEVEN' ? 'BREAKEVEN' : realizedR > 0 ? 'WIN' : 'LOSS';

        // Ingest into ResearchLearningEngine as SHADOW_OBSERVATION
        const updatedStats = researchLearningEngine.ingestCompletedObservation({
          symbol: shadow.symbol,
          direction: shadow.direction,
          setupType: shadow.setupType,
          session,
          outcome,
          closeReason: shadow.closeReason!,
          realizedR,
          mfePips: shadow.mfePips,
          maePips: shadow.maePips,
          observationType: 'SHADOW_OBSERVATION'
        });

        learningJournalService.recordEvent({
          eventType: 'TRADE_CLOSED',
          setupFingerprint: shadow.setupFingerprint,
          evidenceTier: updatedStats.evidenceTier,
          sampleCount: updatedStats.totalObservations,
          realizedR,
          reason: `Shadow trade closed with ${shadow.closeReason} at ${shadow.exitPrice} (Realized: ${realizedR >= 0 ? '+' : ''}${realizedR}R, MFE: ${shadow.mfePips}p, MAE: ${shadow.maePips}p)`
        });

        // Async durable persistence of closed state to PostgreSQL
        shadowObservationRepository.updateShadowObservation({
          id: shadow.id,
          status: 'CLOSED',
          closeReason: shadow.closeReason,
          exitPrice: shadow.exitPrice,
          realizedR: shadow.realizedR,
          mfePips: shadow.mfePips,
          maePips: shadow.maePips,
          highestPriceSeen: shadow.highestPriceSeen,
          lowestPriceSeen: shadow.lowestPriceSeen,
          closedAt: shadow.closedAt
        }).catch(() => {});

        this.telemetry.shadowClosed++;
        this.completedObservations.unshift(shadow);
        if (this.completedObservations.length > 100) this.completedObservations.pop();
        this.activeObservations.delete(obsId);
        this.lastClosedTimestampByPair.set(shadow.symbol, Date.now());
        closedThisTick.push(shadow);
      }
    }

    return closedThisTick;
  }

  public getActiveObservations(): ActiveShadowObservation[] {
    const health = shadowObservationRepository.getPersistenceHealth();
    const persistenceTag: 'POSTGRESQL' | 'WAL_PENDING' | 'MEMORY_DEGRADED' =
      health === 'HEALTHY' ? 'POSTGRESQL' : health === 'WAL_PENDING' ? 'WAL_PENDING' : 'MEMORY_DEGRADED';
    const feedHealth = ctraderMarketDataFeedService.getFeedHealth();

    return Array.from(this.activeObservations.values()).map(obs => {
      const symbolReport = feedHealth.symbols[obs.symbol];
      const spotPrice = symbolReport?.mid || symbolReport?.bid || (obs.direction === 'BUY' ? obs.highestPriceSeen : obs.lowestPriceSeen) || obs.entryPrice;
      const pipFactor = obs.symbol === 'USD/JPY' ? 100 : (obs.symbol === 'XAU/USD' || obs.symbol === 'NASDAQ' || obs.symbol === 'BTC/USD') ? 1 : 10000;
      
      const pnlDiff = obs.direction === 'BUY' ? (spotPrice - obs.entryPrice) : (obs.entryPrice - spotPrice);
      const unrealizedPnlPips = parseFloat((pnlDiff * pipFactor).toFixed(1));
      const unrealizedPnlDollars = parseFloat((unrealizedPnlPips * 1.0).toFixed(2));

      const isStale = symbolReport?.state === 'STALE' || symbolReport?.state === 'DISCONNECTED';
      return {
        ...obs,
        currentPrice: spotPrice,
        unrealizedPnlPips,
        unrealizedPnlDollars,
        monitoringState: isStale ? 'DATA_STALE' : 'LIVE_MONITORING',
        monitoringPausedReason: isStale ? `MARKET_DATA_${symbolReport?.state}` : undefined,
        persistence: persistenceTag
      };
    });
  }

  public getCompletedObservations(limit: number = 50): ActiveShadowObservation[] {
    const health = shadowObservationRepository.getPersistenceHealth();
    const persistenceTag: 'POSTGRESQL' | 'WAL_PENDING' | 'MEMORY_DEGRADED' =
      health === 'HEALTHY' ? 'POSTGRESQL' : health === 'WAL_PENDING' ? 'WAL_PENDING' : 'MEMORY_DEGRADED';
    return this.completedObservations.slice(0, limit).map(obs => ({
      ...obs,
      persistence: persistenceTag
    }));
  }

  /** Resets all state. Used in tests and manual resets. */
  public resetObservatory(): void {
    this.stopDispatcher();
    this.unbindMarketDataEmitter();
    this.activeObservations.clear();
    this.completedObservations = [];
    this.processedSignalIds.clear();
    this.lastClosedTimestampByPair.clear();
    this.isHydrated = false;
    this.state = 'STOPPED';
    this.lastError = null;
    this.lastTickTimestamp = null;
    this.telemetry = {
      ticksReceived: 0, candlesCompleted: 0,
      indicatorCalculations: 0, indicatorFailures: 0,
      smcCalculations: 0, smcFailures: 0,
      signalsEvaluated: 0, buySignals: 0, sellSignals: 0,
      waitSignals: 0, noSetupSignals: 0, vetoSignals: 0,
      shadowOpened: 0, counterfactualsRecorded: 0, shadowClosed: 0,
      duplicateSignals: 0, noDataRejected: 0,
      lastSignalTimestamp: null, lastShadowOpenedTimestamp: null, lastError: null
    };
  }
}

/** Internal fallback for signal ID when not provided. */
function shadow_id_fallback(): string {
  return `sig-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const continuousLearningObservatoryService = ContinuousLearningObservatoryService.getInstance();
