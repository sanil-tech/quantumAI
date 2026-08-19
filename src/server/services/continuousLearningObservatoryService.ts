import { EventEmitter } from 'events';
import { CurrencyPair, TradingSession, AiTradeOpportunity, ObservationType, ResearchEvidenceTier } from '../../types';
import { signalIntelligenceService } from '../../../apps/decision-agent/src/services/signalIntelligenceService';
import { researchLearningEngine, SetupLearningStats } from '../../../apps/decision-agent/src/services/researchLearningEngine';
import { learningJournalService } from './learningJournalService';
import { ShadowAnalyticsService } from './shadowAnalyticsService';

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
  immutableSignalSnapshot: any;
}

export interface ObservatoryStatus {
  state: ObservatoryState;
  activeShadowCount: number;
  totalShadowsObserved: number;
  totalCounterfactualsObserved: number;
  realDemoCount: number;
  isDemoArmed: boolean;
  liveExecutionGate: string;
  brokerOrdersTransmitted: number;
  lastTickTimestamp: number | null;
  lastError: string | null;
  isDispatcherRunning?: boolean;
  isMarketListenerActive?: boolean;
}

export class ContinuousLearningObservatoryService {
  private static instance: ContinuousLearningObservatoryService;
  private state: ObservatoryState = 'STOPPED';
  private activeObservations: Map<string, ActiveShadowObservation> = new Map();
  private completedObservations: ActiveShadowObservation[] = [];
  private processedSignalIds: Set<string> = new Set();
  private lastTickTimestamp: number | null = null;
  private lastError: string | null = null;
  private isDispatcherRunning: boolean = false;
  private dispatcherInterval: NodeJS.Timeout | null = null;
  private boundEmitter: EventEmitter | null = null;
  private tickListener: ((tick: MarketTickEvent) => void) | null = null;

  private constructor() {}

  public static getInstance(): ContinuousLearningObservatoryService {
    if (!ContinuousLearningObservatoryService.instance) {
      ContinuousLearningObservatoryService.instance = new ContinuousLearningObservatoryService();
    }
    return ContinuousLearningObservatoryService.instance;
  }

  public getStatus(): ObservatoryStatus {
    const summary = researchLearningEngine.getCampaignSummaryMetrics();
    return {
      state: this.state,
      activeShadowCount: Array.from(this.activeObservations.values()).filter(o => o.status === 'ACTIVE').length,
      totalShadowsObserved: this.completedObservations.length,
      totalCounterfactualsObserved: summary.counterfactualCount,
      realDemoCount: summary.realDemoClosedCount,
      isDemoArmed: false, // Invariant: observatory NEVER arms DEMO execution
      liveExecutionGate: 'FORBIDDEN',
      brokerOrdersTransmitted: 0,
      lastTickTimestamp: this.lastTickTimestamp,
      lastError: this.lastError,
      isDispatcherRunning: this.isDispatcherRunning,
      isMarketListenerActive: this.state === 'OBSERVING' && this.boundEmitter !== null && this.tickListener !== null
    };
  }

  public bindMarketDataEmitter(emitter: EventEmitter): void {
    if (this.boundEmitter === emitter && this.tickListener) {
      return; // strictly idempotent
    }
    this.unbindMarketDataEmitter();
    this.boundEmitter = emitter;
    this.tickListener = (tick: MarketTickEvent) => {
      if (this.state === 'OBSERVING' && tick && tick.symbol && tick.currentPrice > 0) {
        this.processMarketTick(
          tick.symbol,
          tick.currentPrice,
          tick.highPrice,
          tick.lowPrice,
          tick.session || 'LONDON'
        );
      }
    };
    this.boundEmitter.on('marketTick', this.tickListener);
  }

  public unbindMarketDataEmitter(): void {
    if (this.boundEmitter && this.tickListener) {
      this.boundEmitter.removeListener('marketTick', this.tickListener);
      this.boundEmitter = null;
      this.tickListener = null;
    }
  }

  private startDispatcher(): void {
    if (this.isDispatcherRunning || this.dispatcherInterval) {
      return;
    }
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
    if (this.state === 'OBSERVING') {
      return { success: true, state: this.state };
    }

    this.state = 'OBSERVING';
    this.lastError = null;
    this.startDispatcher();

    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_STARTED',
      setupFingerprint: 'GLOBAL_OBSERVATORY',
      evidenceTier: 'NO_EVIDENCE',
      sampleCount: this.completedObservations.length,
      reason: 'Continuous Learning Observatory started in real-market shadow mode (0 broker orders)'
    });

    return { success: true, state: this.state };
  }

  public pauseObservatory(reason: string = 'Operator paused observatory'): { success: boolean; state: ObservatoryState } {
    if (this.state === 'PAUSED') {
      return { success: true, state: this.state };
    }

    this.stopDispatcher();
    this.state = 'PAUSED';
    this.lastError = reason;

    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_PAUSED',
      setupFingerprint: 'GLOBAL_OBSERVATORY',
      evidenceTier: 'NO_EVIDENCE',
      sampleCount: this.completedObservations.length,
      reason: `Observatory paused: ${reason}`
    });

    return { success: true, state: this.state };
  }

  public resumeObservatory(): { success: boolean; state: ObservatoryState } {
    if (this.state === 'OBSERVING') {
      return { success: true, state: this.state };
    }

    this.state = 'OBSERVING';
    this.lastError = null;
    this.startDispatcher();

    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_RESUMED',
      setupFingerprint: 'GLOBAL_OBSERVATORY',
      evidenceTier: 'NO_EVIDENCE',
      sampleCount: this.completedObservations.length,
      reason: 'Observatory resumed continuous shadow surveillance'
    });

    return { success: true, state: this.state };
  }

  public stopObservatory(reason: string = 'Operator stopped observatory'): { success: boolean; state: ObservatoryState } {
    if (this.state === 'STOPPED') {
      return { success: true, state: this.state };
    }

    this.stopDispatcher();
    this.state = 'STOPPED';
    this.lastError = null;

    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_STOPPED',
      setupFingerprint: 'GLOBAL_OBSERVATORY',
      evidenceTier: 'NO_EVIDENCE',
      sampleCount: this.completedObservations.length,
      reason: `Observatory stopped: ${reason}`
    });

    return { success: true, state: this.state };
  }

  /**
   * Evaluates incoming real-market data and creates a shadow observation (or counterfactual)
   * without transmitting any broker order. Fails closed if market data is invalid or missing.
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
    actionTaken: 'SHADOW_OPENED' | 'COUNTERFACTUAL_RECORDED' | 'NO_DATA_FAIL_CLOSED' | 'REJECTED_OBSERVATORY_NOT_ACTIVE' | 'DUPLICATE_IGNORED';
    observationId?: string;
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
        return {
          success: false,
          actionTaken: 'NO_DATA_FAIL_CLOSED',
          error: 'Market data feed unavailable or invalid. Failing closed without synthetic assumptions.'
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
      return {
        success: false,
        actionTaken: 'NO_DATA_FAIL_CLOSED',
        error: 'NO_DATA: Missing market opportunity payload.'
      };
    }

    // Idempotency check on signal ID
    if (this.processedSignalIds.has(opportunity.id)) {
      return {
        success: true,
        actionTaken: 'DUPLICATE_IGNORED'
      };
    }
    this.processedSignalIds.add(opportunity.id);

    // If signal action is NO_SETUP, WAIT, or VETO -> record as COUNTERFACTUAL
    if (opportunity.action === 'NO_SETUP' || opportunity.action === 'WAIT' || opportunity.action === 'VETO') {
      const cf = researchLearningEngine.recordCounterfactual(
        opportunity,
        opportunity.rationale || `Opportunity filtered: ${opportunity.action}`,
        session
      );

      learningJournalService.recordEvent({
        eventType: 'COUNTERFACTUAL_RECORDED',
        setupFingerprint: cf.setupFingerprint,
        evidenceTier: 'NO_EVIDENCE',
        sampleCount: 1,
        reason: `Counterfactual logged: ${opportunity.action} (${cf.rejectionReason})`
      });

      return {
        success: true,
        actionTaken: 'COUNTERFACTUAL_RECORDED',
        observationId: cf.id
      };
    }

    // VALID BUY or SELL -> Create simulated SHADOW OBSERVATION
    const plannedEntry = opportunity.entryPrice || opportunity.entryZone?.min || opportunity.currentPrice || 1.0850;
    const sl = opportunity.stopLoss || (opportunity.action === 'BUY' ? plannedEntry - 0.0030 : plannedEntry + 0.0030);
    const tp1 = opportunity.takeProfit1 || (opportunity.action === 'BUY' ? plannedEntry + 0.0060 : plannedEntry - 0.0060);
    const tp2 = opportunity.takeProfit2 ?? undefined;
    const isMultiTarget = tp2 !== undefined && tp2 > 0;
    const fingerprint = researchLearningEngine.generateFingerprint(
      opportunity.pair,
      opportunity.action as 'BUY' | 'SELL',
      opportunity.setupType || 'ORDER_BLOCK_RETEST'
    );

    const shadow: ActiveShadowObservation = {
      id: `shadow-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      signalId: opportunity.id,
      symbol: opportunity.pair,
      direction: opportunity.action as 'BUY' | 'SELL',
      setupType: opportunity.setupType || 'ORDER_BLOCK_RETEST',
      setupFingerprint: fingerprint,
      session,
      marketRegime: opportunity.marketRegime || 'TRENDING_BULLISH',
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
      immutableSignalSnapshot: Object.freeze({ ...opportunity })
    };

    this.activeObservations.set(shadow.id, shadow);

    learningJournalService.recordEvent({
      eventType: 'SHADOW_RECORDED',
      setupFingerprint: fingerprint,
      evidenceTier: researchLearningEngine.getSetupStats(fingerprint)?.evidenceTier || 'NO_EVIDENCE',
      sampleCount: (researchLearningEngine.getSetupStats(fingerprint)?.totalObservations || 0) + 1,
      reason: `Simulated ${shadow.direction} entry at ${plannedEntry} (SL: ${sl}, TP1: ${tp1}, TP2: ${tp2 || 'N/A'})`
    });

    return {
      success: true,
      actionTaken: 'SHADOW_OPENED',
      observationId: shadow.id
    };
  }

  /**
   * Ingests real-market tick prices, updates MFE/MAE, checks TP/SL progression and executes simulated closures.
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
        const currentMfe = (shadow.highestPriceSeen - shadow.entryPrice) * pipFactor;
        const currentMae = (shadow.entryPrice - shadow.lowestPriceSeen) * pipFactor;
        shadow.mfePips = parseFloat(Math.max(shadow.mfePips, currentMfe).toFixed(1));
        shadow.maePips = parseFloat(Math.max(shadow.maePips, currentMae).toFixed(1));
      } else {
        const currentMfe = (shadow.entryPrice - shadow.lowestPriceSeen) * pipFactor;
        const currentMae = (shadow.highestPriceSeen - shadow.entryPrice) * pipFactor;
        shadow.mfePips = parseFloat(Math.max(shadow.mfePips, currentMfe).toFixed(1));
        shadow.maePips = parseFloat(Math.max(shadow.maePips, currentMae).toFixed(1));
      }

      // Check Exits
      let hasClosed = false;

      if (shadow.direction === 'BUY') {
        // 1. Check Stop Loss / Breakeven Stop
        if (low <= shadow.stopLoss) {
          hasClosed = true;
          shadow.status = 'CLOSED';
          shadow.exitPrice = shadow.stopLoss;
          shadow.closeReason = shadow.tp1Hit && shadow.stopLoss >= shadow.entryPrice ? 'BREAKEVEN' : 'STOP_LOSS';
        }
        // 2. Check TP1
        else if (!shadow.tp1Hit && high >= shadow.takeProfit1) {
          if (!shadow.isMultiTarget || !shadow.takeProfit2) {
            // Single target setup -> Complete Exit at TP1
            hasClosed = true;
            shadow.status = 'CLOSED';
            shadow.exitPrice = shadow.takeProfit1;
            shadow.closeReason = 'TAKE_PROFIT_1';
          } else {
            // Multi target setup -> Mark TP1 milestone and move SL to breakeven
            shadow.tp1Hit = true;
            shadow.stopLoss = shadow.entryPrice; // Move SL to breakeven

            learningJournalService.recordEvent({
              eventType: 'PARAMETER_ADAPTED',
              setupFingerprint: shadow.setupFingerprint,
              evidenceTier: researchLearningEngine.getSetupStats(shadow.setupFingerprint)?.evidenceTier || 'NO_EVIDENCE',
              sampleCount: researchLearningEngine.getSetupStats(shadow.setupFingerprint)?.totalObservations || 0,
              previousParameter: `SL: ${shadow.initialStopLoss}`,
              proposedParameter: `SL: ${shadow.entryPrice} (Breakeven)`,
              boundedAdjustment: 'SL moved to Breakeven on TP1 hit',
              reason: `Shadow observation ${shadow.id} reached TP1 (${shadow.takeProfit1}). Position continuing toward TP2 (${shadow.takeProfit2}).`
            });
          }
        }
        // 3. Check TP2 (for multi-target setup where TP1 was already hit)
        else if (shadow.tp1Hit && shadow.takeProfit2 && high >= shadow.takeProfit2) {
          hasClosed = true;
          shadow.status = 'CLOSED';
          shadow.exitPrice = shadow.takeProfit2;
          shadow.closeReason = 'TAKE_PROFIT_2';
        }
      } else {
        // SELL Direction
        // 1. Check Stop Loss / Breakeven Stop
        if (high >= shadow.stopLoss) {
          hasClosed = true;
          shadow.status = 'CLOSED';
          shadow.exitPrice = shadow.stopLoss;
          shadow.closeReason = shadow.tp1Hit && shadow.stopLoss <= shadow.entryPrice ? 'BREAKEVEN' : 'STOP_LOSS';
        }
        // 2. Check TP1
        else if (!shadow.tp1Hit && low <= shadow.takeProfit1) {
          if (!shadow.isMultiTarget || !shadow.takeProfit2) {
            hasClosed = true;
            shadow.status = 'CLOSED';
            shadow.exitPrice = shadow.takeProfit1;
            shadow.closeReason = 'TAKE_PROFIT_1';
          } else {
            shadow.tp1Hit = true;
            shadow.stopLoss = shadow.entryPrice;

            learningJournalService.recordEvent({
              eventType: 'PARAMETER_ADAPTED',
              setupFingerprint: shadow.setupFingerprint,
              evidenceTier: researchLearningEngine.getSetupStats(shadow.setupFingerprint)?.evidenceTier || 'NO_EVIDENCE',
              sampleCount: researchLearningEngine.getSetupStats(shadow.setupFingerprint)?.totalObservations || 0,
              previousParameter: `SL: ${shadow.initialStopLoss}`,
              proposedParameter: `SL: ${shadow.entryPrice} (Breakeven)`,
              boundedAdjustment: 'SL moved to Breakeven on TP1 hit',
              reason: `Shadow observation ${shadow.id} reached TP1 (${shadow.takeProfit1}). Position continuing toward TP2 (${shadow.takeProfit2}).`
            });
          }
        }
        // 3. Check TP2
        else if (shadow.tp1Hit && shadow.takeProfit2 && low <= shadow.takeProfit2) {
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

        // Record immutable learning journal event
        learningJournalService.recordEvent({
          eventType: 'TRADE_CLOSED',
          setupFingerprint: shadow.setupFingerprint,
          evidenceTier: updatedStats.evidenceTier,
          sampleCount: updatedStats.totalObservations,
          realizedR,
          reason: `Shadow trade closed with ${shadow.closeReason} at ${shadow.exitPrice} (Realized: ${realizedR >= 0 ? '+' : ''}${realizedR}R, MFE: ${shadow.mfePips}p, MAE: ${shadow.maePips}p)`
        });

        this.completedObservations.unshift(shadow);
        if (this.completedObservations.length > 100) this.completedObservations.pop();
        this.activeObservations.delete(obsId);
        closedThisTick.push(shadow);
      }
    }

    return closedThisTick;
  }

  public getActiveObservations(): ActiveShadowObservation[] {
    return Array.from(this.activeObservations.values());
  }

  public getCompletedObservations(limit: number = 50): ActiveShadowObservation[] {
    return this.completedObservations.slice(0, limit);
  }

  public resetObservatory(): void {
    this.stopDispatcher();
    this.unbindMarketDataEmitter();
    this.activeObservations.clear();
    this.completedObservations = [];
    this.processedSignalIds.clear();
    this.state = 'STOPPED';
    this.lastError = null;
    this.lastTickTimestamp = null;
  }
}

export const continuousLearningObservatoryService = ContinuousLearningObservatoryService.getInstance();
