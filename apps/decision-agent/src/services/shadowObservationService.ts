import {
  AiTradeOpportunity,
  ShadowPerformanceRecord,
  CurrencyPair,
  TradingSession,
  EvidenceSource,
  ShadowTelemetryCounters
} from '../../../../src/types';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import { shadowAnalyticsService, ShadowAnalyticsService } from '../../../../src/server/services/shadowAnalyticsService';

export interface ShadowPosition {
  id: string;
  signalId: string;
  pair: CurrencyPair;
  timeframe: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  invalidationLevel?: number;
  status: 'OPEN' | 'CLOSED';
  entryTimestamp: number;
  closeTimestamp?: number;
  exitPrice?: number;
  exitReason?: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'INVALIDATION' | 'TIMEOUT' | 'MANUAL_SHADOW_CLOSE';
  realizedR?: number;
  pnlPips?: number;
  mfePips: number;
  maePips: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  highestPriceObserved: number;
  lowestPriceObserved: number;
  session: TradingSession;
  evidenceSource: EvidenceSource;
  observationTimestamp: number;
  reopenedAfterRestart?: boolean;
  signalSnapshot: Readonly<AiTradeOpportunity>;
}

export interface ShadowEntryValidationResult {
  accepted: boolean;
  reason?: string;
  position?: ShadowPosition;
}

export interface ShadowServiceStateSnapshot {
  version: string;
  timestamp: number;
  positions: ShadowPosition[];
  processedSignalIds: string[];
  processedCloseIds: string[];
  counters: ShadowTelemetryCounters;
}

export class ShadowObservationService {
  private static instance: ShadowObservationService;
  private positions: Map<string, ShadowPosition> = new Map();
  private processedSignalIds: Set<string> = new Set();
  private processedCloseIds: Set<string> = new Set();

  private counters: ShadowTelemetryCounters = {
    signalsEvaluated: 0,
    validBuyCount: 0,
    validSellCount: 0,
    noSetupCount: 0,
    waitCount: 0,
    vetoCount: 0,
    admittedCount: 0,
    rejectedCount: 0,
    currentlyOpenCount: 0,
    closedCount: 0,
    slExitCount: 0,
    tp1HitCount: 0,
    tp2ExitCount: 0,
    invalidStaleCount: 0,
    duplicateRejectedCount: 0,
    postMortemsGeneratedCount: 0,
    postMortemsPersistedCount: 0,
    learningUpdatesAppliedCount: 0
  };

  public static getInstance(): ShadowObservationService {
    if (!ShadowObservationService.instance) {
      ShadowObservationService.instance = new ShadowObservationService();
    }
    return ShadowObservationService.instance;
  }

  public clearPositions(): void {
    this.positions.clear();
    this.processedSignalIds.clear();
    this.processedCloseIds.clear();
    this.resetCounters();
  }

  public resetCounters(): void {
    this.counters = {
      signalsEvaluated: 0,
      validBuyCount: 0,
      validSellCount: 0,
      noSetupCount: 0,
      waitCount: 0,
      vetoCount: 0,
      admittedCount: 0,
      rejectedCount: 0,
      currentlyOpenCount: 0,
      closedCount: 0,
      slExitCount: 0,
      tp1HitCount: 0,
      tp2ExitCount: 0,
      invalidStaleCount: 0,
      duplicateRejectedCount: 0,
      postMortemsGeneratedCount: 0,
      postMortemsPersistedCount: 0,
      learningUpdatesAppliedCount: 0
    };
  }

  public getTelemetryCounters(): Readonly<ShadowTelemetryCounters> {
    this.counters.currentlyOpenCount = this.getOpenPositions().length;
    this.counters.closedCount = Array.from(this.positions.values()).filter(p => p.status === 'CLOSED').length;
    return { ...this.counters };
  }

  public getOpenPositions(): ShadowPosition[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'OPEN');
  }

  public getAllPositions(): ShadowPosition[] {
    return Array.from(this.positions.values());
  }

  public getPositionById(id: string): ShadowPosition | undefined {
    return this.positions.get(id);
  }

  /**
   * Classifies current UTC timestamp into standard global trading sessions.
   */
  public static determineTradingSession(timestampMs: number = Date.now()): TradingSession {
    const date = new Date(timestampMs);
    const utcHour = date.getUTCHours();

    // London / NY Overlap: 12:00 - 16:00 UTC
    if (utcHour >= 12 && utcHour < 16) {
      return 'OVERLAP_LONDON_NY';
    }
    // London: 07:00 - 16:00 UTC
    if (utcHour >= 7 && utcHour < 16) {
      return 'LONDON';
    }
    // New York: 12:00 - 21:00 UTC
    if (utcHour >= 16 && utcHour < 21) {
      return 'NEW_YORK';
    }
    // Asian / Tokyo: 00:00 - 08:00 UTC
    if (utcHour >= 0 && utcHour < 7) {
      return 'ASIAN';
    }
    // Sydney / Off Hours: 21:00 - 24:00 UTC
    if (utcHour >= 21) {
      return 'SYDNEY';
    }
    return 'OFF_HOURS';
  }

  /**
   * Evaluates a candidate signal and opens an immutable shadow position if valid.
   */
  public evaluateAndOpenShadowPosition(
    opportunity: AiTradeOpportunity,
    currentMarketPrice: number,
    activeSymbol?: CurrencyPair,
    evidenceSource: EvidenceSource = 'REAL_MARKET'
  ): ShadowEntryValidationResult {
    this.counters.signalsEvaluated++;

    // 1. Symbol Match Protection
    if (activeSymbol && opportunity.pair !== activeSymbol) {
      this.counters.rejectedCount++;
      return { accepted: false, reason: `SYMBOL_MISMATCH: Opportunity for ${opportunity.pair} does not match active ${activeSymbol}` };
    }

    // 2. Non-Trade Gate
    if (opportunity.action === 'NO_SETUP') {
      this.counters.noSetupCount++;
      this.counters.rejectedCount++;
      return { accepted: false, reason: 'REJECTED: Signal is NO_SETUP' };
    }
    if (opportunity.action === 'WAIT_FOR_CONFIRMATION') {
      this.counters.waitCount++;
      this.counters.rejectedCount++;
      return { accepted: false, reason: 'REJECTED: Signal is WAIT_FOR_CONFIRMATION' };
    }
    if (opportunity.action === 'VETO' || opportunity.status === 'VETOED') {
      this.counters.vetoCount++;
      this.counters.rejectedCount++;
      return { accepted: false, reason: 'REJECTED: Signal is VETOED by Adaptive Learning' };
    }
    if (opportunity.action !== 'BUY' && opportunity.action !== 'SELL') {
      this.counters.rejectedCount++;
      return { accepted: false, reason: `REJECTED: Invalid signal action ${opportunity.action}` };
    }

    if (opportunity.action === 'BUY') this.counters.validBuyCount++;
    if (opportunity.action === 'SELL') this.counters.validSellCount++;

    // 3. Stale Signal Check (Timestamp > 60s old)
    const signalAgeMs = Date.now() - (opportunity.timestamp || Date.now());
    if (signalAgeMs > 60000) {
      this.counters.invalidStaleCount++;
      this.counters.rejectedCount++;
      return { accepted: false, reason: `STALE_SIGNAL: Signal age ${signalAgeMs}ms exceeds 60s threshold` };
    }

    // 4. Geometry Validation
    const sl = opportunity.stopLoss;
    const tp1 = opportunity.takeProfit1;
    const tp2 = opportunity.takeProfit2 ?? tp1;
    const entryMin = opportunity.entryZone?.min;
    const entryMax = opportunity.entryZone?.max;

    if (!sl || !tp1 || !entryMin || !entryMax) {
      this.counters.rejectedCount++;
      return { accepted: false, reason: 'INVALID_GEOMETRY: Missing required SL, TP1, or EntryZone' };
    }

    if (opportunity.action === 'BUY') {
      if (!(sl < entryMin && entryMin <= entryMax && entryMax < tp1 && tp1 <= tp2!)) {
        this.counters.rejectedCount++;
        return { accepted: false, reason: 'INVALID_GEOMETRY: BUY requires SL < EntryMin <= EntryMax < TP1 <= TP2' };
      }
    } else {
      if (!(tp2! <= tp1 && tp1 < entryMin && entryMin <= entryMax && entryMax < sl)) {
        this.counters.rejectedCount++;
        return { accepted: false, reason: 'INVALID_GEOMETRY: SELL requires TP2 <= TP1 < EntryMin <= EntryMax < SL' };
      }
    }

    // 5. Idempotency Check on Signal ID
    const signalId = opportunity.proposalId || `sig-${opportunity.pair}-${opportunity.timestamp}`;
    if (this.processedSignalIds.has(signalId)) {
      this.counters.duplicateRejectedCount++;
      this.counters.rejectedCount++;
      return { accepted: false, reason: `DUPLICATE_SIGNAL: Signal ${signalId} has already created a shadow position` };
    }

    // 6. Create Immutable Shadow Position
    const positionId = `shadow-pos-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const actualEntry = currentMarketPrice > 0 ? currentMarketPrice : (entryMin + entryMax) / 2;
    const now = Date.now();
    const session = ShadowObservationService.determineTradingSession(now);

    const position: ShadowPosition = {
      id: positionId,
      signalId,
      pair: opportunity.pair,
      timeframe: opportunity.timeframe || 'M15',
      direction: opportunity.action,
      entryPrice: actualEntry,
      stopLoss: sl,
      takeProfit1: tp1,
      takeProfit2: tp2,
      invalidationLevel: opportunity.invalidationLevel ?? undefined,
      status: 'OPEN',
      entryTimestamp: now,
      mfePips: 0,
      maePips: 0,
      tp1Hit: false,
      tp2Hit: false,
      highestPriceObserved: actualEntry,
      lowestPriceObserved: actualEntry,
      session,
      evidenceSource,
      observationTimestamp: now,
      // Deep freeze / immutable snapshot of entry signal state
      signalSnapshot: Object.freeze(JSON.parse(JSON.stringify(opportunity)))
    };

    this.positions.set(positionId, position);
    this.processedSignalIds.add(signalId);
    this.counters.admittedCount++;

    return { accepted: true, position };
  }

  /**
   * Updates open shadow positions against observed market price ticks/candles.
   */
  public updatePositionsWithMarketPrice(
    pair: CurrencyPair,
    currentPrice: number,
    highPrice?: number,
    lowPrice?: number
  ): ShadowPosition[] {
    const high = highPrice ?? currentPrice;
    const low = lowPrice ?? currentPrice;
    const pipFactor = pair === 'USD/JPY' ? 100 : (pair === 'XAU/USD' || pair === 'NASDAQ' || pair === 'BTC/USD') ? 1 : 10000;

    const updatedPositions: ShadowPosition[] = [];

    this.getOpenPositions().filter(p => p.pair === pair).forEach(pos => {
      // 1. Update Observed Extrema
      if (high > pos.highestPriceObserved) pos.highestPriceObserved = high;
      if (low < pos.lowestPriceObserved) pos.lowestPriceObserved = low;

      // 2. Compute MFE & MAE
      const mfeMae = ShadowAnalyticsService.calculateMfeMae(
        pos.entryPrice,
        pos.highestPriceObserved,
        pos.lowestPriceObserved,
        pos.direction,
        pipFactor
      );
      pos.mfePips = mfeMae.mfePips;
      pos.maePips = mfeMae.maePips;

      // 3. Evaluate Exit / Partial TP Conditions
      if (pos.direction === 'BUY') {
        // Stop Loss Check
        if (low <= pos.stopLoss) {
          this.closeShadowPosition(pos.id, pos.stopLoss, 'STOP_LOSS');
          updatedPositions.push(pos);
          return;
        }

        // Invalidation Check
        if (pos.invalidationLevel && low <= pos.invalidationLevel) {
          this.closeShadowPosition(pos.id, pos.invalidationLevel, 'INVALIDATION');
          updatedPositions.push(pos);
          return;
        }

        // Take Profit 2 Check
        if (pos.takeProfit2 && high >= pos.takeProfit2) {
          pos.tp1Hit = true;
          pos.tp2Hit = true;
          this.counters.tp1HitCount++;
          this.counters.tp2ExitCount++;
          this.closeShadowPosition(pos.id, pos.takeProfit2, 'TAKE_PROFIT_2');
          updatedPositions.push(pos);
          return;
        }

        // Take Profit 1 Check
        if (high >= pos.takeProfit1 && !pos.tp1Hit) {
          pos.tp1Hit = true;
          this.counters.tp1HitCount++;
          if (!pos.takeProfit2 || pos.takeProfit2 === pos.takeProfit1) {
            this.closeShadowPosition(pos.id, pos.takeProfit1, 'TAKE_PROFIT_1');
            updatedPositions.push(pos);
            return;
          }
        }
      } else {
        // SELL Stop Loss Check
        if (high >= pos.stopLoss) {
          this.closeShadowPosition(pos.id, pos.stopLoss, 'STOP_LOSS');
          updatedPositions.push(pos);
          return;
        }

        // SELL Invalidation Check
        if (pos.invalidationLevel && high >= pos.invalidationLevel) {
          this.closeShadowPosition(pos.id, pos.invalidationLevel, 'INVALIDATION');
          updatedPositions.push(pos);
          return;
        }

        // SELL Take Profit 2 Check
        if (pos.takeProfit2 && low <= pos.takeProfit2) {
          pos.tp1Hit = true;
          pos.tp2Hit = true;
          this.counters.tp1HitCount++;
          this.counters.tp2ExitCount++;
          this.closeShadowPosition(pos.id, pos.takeProfit2, 'TAKE_PROFIT_2');
          updatedPositions.push(pos);
          return;
        }

        // SELL Take Profit 1 Check
        if (low <= pos.takeProfit1 && !pos.tp1Hit) {
          pos.tp1Hit = true;
          this.counters.tp1HitCount++;
          if (!pos.takeProfit2 || pos.takeProfit2 === pos.takeProfit1) {
            this.closeShadowPosition(pos.id, pos.takeProfit1, 'TAKE_PROFIT_1');
            updatedPositions.push(pos);
            return;
          }
        }
      }

      updatedPositions.push(pos);
    });

    return updatedPositions;
  }

  /**
   * Closes a shadow position, computes realized metrics, dispatches TradeClosed event,
   * and records into ShadowAnalyticsService.
   */
  public closeShadowPosition(
    positionId: string,
    exitPrice: number,
    exitReason: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'INVALIDATION' | 'TIMEOUT' | 'MANUAL_SHADOW_CLOSE'
  ): ShadowPosition | undefined {
    const pos = this.positions.get(positionId);
    if (!pos || pos.status === 'CLOSED') return pos;

    // Idempotency check on close event
    const closeKey = `close-${positionId}`;
    if (this.processedCloseIds.has(closeKey)) return pos;
    this.processedCloseIds.add(closeKey);

    if (exitReason === 'STOP_LOSS') this.counters.slExitCount++;

    const pipFactor = pos.pair === 'USD/JPY' ? 100 : (pos.pair === 'XAU/USD' || pos.pair === 'NASDAQ' || pos.pair === 'BTC/USD') ? 1 : 10000;
    const realizedR = ShadowAnalyticsService.calculateRMultiple(pos.entryPrice, exitPrice, pos.stopLoss, pos.direction);
    const pnlPips = Number(((pos.direction === 'BUY' ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice)) * pipFactor).toFixed(1));
    const outcome = realizedR > 0 ? 'WIN' : realizedR < 0 ? 'LOSS' : 'BREAKEVEN';

    pos.status = 'CLOSED';
    pos.closeTimestamp = Date.now();
    pos.exitPrice = exitPrice;
    pos.exitReason = exitReason;
    pos.realizedR = realizedR;
    pos.pnlPips = pnlPips;

    // 1. Record in canonical ShadowPerformanceRecord in ShadowAnalyticsService
    const perfRecord: ShadowPerformanceRecord = {
      id: `perf-${pos.id}`,
      signalId: pos.signalId,
      pair: pos.pair,
      timeframe: pos.timeframe as any,
      direction: pos.direction,
      setupType: pos.signalSnapshot.setupType || 'NONE',
      entryType: pos.signalSnapshot.entryType || 'NONE',
      marketRegime: pos.signalSnapshot.marketRegime || 'RANGING_CHOPPY',
      signalStatus: pos.signalSnapshot.status || 'VALID_PROPOSAL',
      provenanceSource: 'AI_SHADOW',
      signalTimestamp: pos.signalSnapshot.timestamp,
      entryTimestamp: pos.entryTimestamp,
      closeTimestamp: pos.closeTimestamp,
      plannedEntry: pos.entryPrice,
      actualShadowEntry: pos.entryPrice,
      stopLoss: pos.stopLoss,
      takeProfit1: pos.takeProfit1,
      takeProfit2: pos.takeProfit2,
      invalidationLevel: pos.invalidationLevel,
      learningVersion: pos.signalSnapshot.strategyVersion || '1.0',
      learningAdjustment: pos.signalSnapshot.confidenceBreakdown?.learningAdjustment || 0,
      learningRuleIds: pos.signalSnapshot.learningRuleIds || [],
      learningEvidence: pos.signalSnapshot.learningEvidence || [],
      vetoed: pos.signalSnapshot.action === 'VETO',
      confirmationRequired: (pos.signalSnapshot.confirmationRequirements?.length || 0) > 0,
      outcome,
      exitPrice,
      exitReason,
      realizedR,
      pnlPips,
      mfePips: pos.mfePips,
      maePips: pos.maePips,
      holdingDurationMs: pos.closeTimestamp - pos.entryTimestamp,
      session: pos.session,
      evidenceSource: pos.evidenceSource,
      observationTimestamp: pos.observationTimestamp,
      reopenedAfterRestart: pos.reopenedAfterRestart
    };

    shadowAnalyticsService.recordShadowTrade(perfRecord);

    // 2. Dispatch canonical TradeClosed event to event bus (triggers LearningService)
    this.counters.postMortemsGeneratedCount++;
    globalEventBus.publish({
      id: `evt-trade-closed-${pos.id}`,
      type: EventTypes.TradeClosed,
      timestamp: new Date(),
      payload: {
        positionId: pos.id,
        tradeId: pos.id,
        symbol: pos.pair,
        outcome,
        realizedProfit: pnlPips * 10,
        pnlDollars: pnlPips * 10,
        pnlPips,
        exitPrice,
        exitReason,
        learningVersion: pos.signalSnapshot.strategyVersion || '1.0',
        strategyId: pos.signalSnapshot.strategyId || 'SMC_QUANT_V1',
        strategyVersion: pos.signalSnapshot.strategyVersion || '1.0',
        evidenceSource: pos.evidenceSource,
        session: pos.session
      }
    }).then(() => {
      this.counters.postMortemsPersistedCount++;
      if (outcome === 'LOSS') {
        this.counters.learningUpdatesAppliedCount++;
      }
    }).catch(err => {
      console.error(`[SHADOW_OBSERVATION] Error publishing TradeClosed event: ${err.message}`);
    });

    return pos;
  }

  /**
   * Exports current in-memory observation state for durable persistence or restart.
   */
  public exportState(): ShadowServiceStateSnapshot {
    return {
      version: '1.0',
      timestamp: Date.now(),
      positions: Array.from(this.positions.values()).map(p => ({
        ...p,
        signalSnapshot: JSON.parse(JSON.stringify(p.signalSnapshot))
      })),
      processedSignalIds: Array.from(this.processedSignalIds),
      processedCloseIds: Array.from(this.processedCloseIds),
      counters: { ...this.counters }
    };
  }

  /**
   * Recovers state on application restart with strict fail-closed integrity validation.
   */
  public importState(snapshot: ShadowServiceStateSnapshot): { success: boolean; recoveredCount: number; error?: string } {
    if (!snapshot || !Array.isArray(snapshot.positions) || !Array.isArray(snapshot.processedSignalIds)) {
      return { success: false, recoveredCount: 0, error: 'INVALID_SNAPSHOT: Missing mandatory snapshot structures' };
    }

    let recovered = 0;
    for (const rawPos of snapshot.positions) {
      // Validate schema integrity
      if (!rawPos.id || !rawPos.pair || !rawPos.direction || !rawPos.entryPrice || !rawPos.stopLoss || !rawPos.signalSnapshot) {
        // Fail closed on corrupt position rather than guessing
        return { success: false, recoveredCount: recovered, error: `CORRUPT_POSITION: Position ${rawPos.id || 'unknown'} failed schema validation` };
      }

      const position: ShadowPosition = {
        ...rawPos,
        reopenedAfterRestart: true,
        signalSnapshot: Object.freeze(JSON.parse(JSON.stringify(rawPos.signalSnapshot)))
      };

      this.positions.set(position.id, position);
      recovered++;
    }

    snapshot.processedSignalIds.forEach(id => this.processedSignalIds.add(id));
    snapshot.processedCloseIds?.forEach(id => this.processedCloseIds.add(id));

    if (snapshot.counters) {
      this.counters = { ...snapshot.counters };
    }

    return { success: true, recoveredCount: recovered };
  }
}

export const shadowObservationService = ShadowObservationService.getInstance();
