/**
 * Phase 1.1 — Second Opinion Observation Intelligence & Outcome Correlation
 * QuantumAI IATI OS
 * 
 * PERSISTENT OBSERVATION & CORRELATION SERVICE:
 * - Records persistent second-opinion observations for every evaluated signalId.
 * - Preserves data lineage: LIVE, SHADOW, SYNTHETIC, BACKTEST, UNKNOWN.
 * - Correlates closed broker trades (cTrader) to canonical signal observations.
 * - Strictly observational: Never authorizes or blocks execution.
 * - Fail-closed: Uncertain correlations produce UNMATCHED, never fabricated outcomes.
 */

import fs from 'fs';
import path from 'path';
import {
  SecondOpinionInput,
  SecondOpinionResult,
  SecondOpinionReview,
  SecondOpinionBias,
  SecondOpinionAgreement,
  ContradictionLevel
} from './secondOpinionService';

export type ObservationDataMode = 'LIVE' | 'SHADOW' | 'SYNTHETIC' | 'BACKTEST' | 'UNKNOWN';

export type ObservationOutcomeStatus =
  | 'OPEN'
  | 'CLOSED_WIN'
  | 'CLOSED_LOSS'
  | 'CLOSED_BREAKEVEN'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'UNMATCHED'
  | 'UNKNOWN';

export interface SecondOpinionObservation {
  id: string;
  signalId: string;
  symbol: string;
  timeframe: string;

  quantumAiDirection: 'BUY' | 'SELL' | 'NEUTRAL';
  quantumAiConfidence: number;

  openAiReview: SecondOpinionReview;
  openAiBias: SecondOpinionBias;
  openAiConfidence: number;
  agreement: SecondOpinionAgreement;
  contradictionLevel: ContradictionLevel;

  economicRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  riskFlags: string[];
  keyConcerns: string[];
  invalidationConcerns: string[];

  entry?: number;
  stopLoss?: number;
  takeProfit?: number;

  executionEligibilityAtReview: string;

  signalCreatedAt: number | string;
  secondOpinionAt: string;

  model: string;
  latencyMs: number;

  dataMode: ObservationDataMode;
  dataLineage?: Record<string, unknown>;

  outcomeStatus: ObservationOutcomeStatus;
  outcomeDirection?: 'BUY' | 'SELL';
  outcomePnl?: number;
  outcomePips?: number;
  outcomeRecordedAt?: string;

  brokerOrderId?: string;
  brokerPositionId?: string;
  correlationMethod?: string;

  createdAt: string;
  updatedAt: string;
}

export interface ObservationQueryFilters {
  symbol?: string;
  timeframe?: string;
  agreement?: SecondOpinionAgreement;
  review?: SecondOpinionReview;
  economicRisk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  dataMode?: ObservationDataMode;
  outcomeStatus?: ObservationOutcomeStatus;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface ObservationSummaryMetrics {
  totalObservations: number;
  openAiAvailable: number;
  openAiUnavailable: number;

  agreementCount: number;
  partialCount: number;
  disagreementCount: number;

  passCount: number;
  reviewCount: number;
  rejectCount: number;

  highEconomicRiskCount: number;

  outcomeLinkedCount: number;
  outcomeUnmatchedCount: number;
  liveOutcomeCount: number;
  shadowOutcomeCount: number;
}

export interface ClosedTradeCorrelationInput {
  brokerPositionId?: string;
  brokerOrderId?: string;
  signalId?: string;
  symbol: string;
  realizedProfit: number;
  pnlPips?: number;
  direction?: 'BUY' | 'SELL';
  closedAt?: Date | string;
  dataMode?: ObservationDataMode;
}

export interface PipelineHealthDiagnostic {
  secondOpinionEnabled: boolean;
  secondOpinionMode: string;
  observationPersistenceHealthy: boolean;
  observationCount: number;
  latestObservationAt: string | null;
  latestObservationSignalId: string | null;
  unmatchedOutcomeCount: number;
  openObservationCount: number;
  lastCorrelationAt: string | null;
  openAiUnavailableCount: number;
}

export interface ObservationDashboardCard {
  signal: {
    id: string;
    symbol: string;
    timeframe: string;
    direction: string;
    confidence: number;
    createdAt: string | number;
  };
  secondOpinion: {
    bias: string;
    confidence: number;
    review: string;
    agreement: string;
    contradiction: string;
    model: string;
    latencyMs: number;
    reviewedAt: string;
  };
  economicContext: {
    economicRisk: string;
    riskFlags: string[];
    keyConcerns: string[];
  };
  execution: {
    eligibilityAtReview: string;
    entry?: number;
    stopLoss?: number;
    takeProfit?: number;
    dataMode: string;
  };
  outcome: {
    status: string;
    pnl?: number;
    pips?: number;
    recordedAt?: string;
    correlationMethod?: string;
  };
}

export class SecondOpinionObservationService {
  private static instance: SecondOpinionObservationService;
  private observations: Map<string, SecondOpinionObservation> = new Map();
  private signalToObsMap: Map<string, string> = new Map(); // signalId -> obsId
  private brokerOrderToObsMap: Map<string, string> = new Map(); // brokerOrderId -> obsId
  private brokerPosToObsMap: Map<string, string> = new Map(); // brokerPositionId -> obsId
  private cacheFilePath: string;
  private lastSavedJson: string = '';
  private unmatchedCorrelationsCount: number = 0;

  public constructor() {
    this.cacheFilePath = path.resolve(process.cwd(), 'data', 'second_opinion_observations.json');
    this.loadFromDisk();
    this.subscribeToEventBus();
  }

  public static getInstance(): SecondOpinionObservationService {
    if (!SecondOpinionObservationService.instance) {
      SecondOpinionObservationService.instance = new SecondOpinionObservationService();
    }
    return SecondOpinionObservationService.instance;
  }

  private subscribeToEventBus(): void {
    try {
      import('@iati/event-bus').then(({ globalEventBus, EventTypes }) => {
        globalEventBus.subscribe(EventTypes.TradeClosed, async (event: any) => {
          try {
            const payload = event?.payload;
            if (!payload || !payload.symbol || payload.pnlDollars === undefined) return;
            this.correlateClosedPosition({
              brokerPositionId: payload.positionId,
              brokerOrderId: payload.tradeId,
              signalId: payload.proposalId,
              symbol: payload.symbol,
              realizedProfit: Number(payload.pnlDollars),
              pnlPips: payload.pnlPips !== undefined ? Number(payload.pnlPips) : undefined,
              direction: payload.direction as any,
              closedAt: payload.closedAt,
              dataMode: payload.isOfflineMock || payload.environment === 'SYNTHETIC' ? 'SYNTHETIC' : 'LIVE'
            });
          } catch (_) {}
        });
      }).catch(() => {});
    } catch (_) {}
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
        if (raw.trim()) {
          const list: SecondOpinionObservation[] = JSON.parse(raw);
          for (const obs of list) {
            this.observations.set(obs.id, obs);
            if (obs.signalId) this.signalToObsMap.set(obs.signalId, obs.id);
            if (obs.brokerOrderId) this.brokerOrderToObsMap.set(obs.brokerOrderId, obs.id);
            if (obs.brokerPositionId) this.brokerPosToObsMap.set(obs.brokerPositionId, obs.id);
          }
          this.lastSavedJson = raw;
        }
      }
    } catch (err: any) {
      console.warn('[SecondOpinionObservationService] Warning loading cache:', err.message);
    }
  }

  private saveToDisk(): void {
    try {
      const list = Array.from(this.observations.values());
      const currentJson = JSON.stringify(list, null, 2);
      if (currentJson === this.lastSavedJson) return;

      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFilePath, currentJson, 'utf-8');
      this.lastSavedJson = currentJson;
    } catch (err: any) {
      console.error('[SecondOpinionObservationService] Error saving cache:', err.message);
    }
  }

  /**
   * Normalizes and verifies data lineage
   */
  public normalizeDataMode(mode?: string): ObservationDataMode {
    if (!mode) return 'UNKNOWN';
    const clean = mode.toUpperCase();
    if (clean === 'LIVE' || clean === 'LIVE_CTRADER' || clean === 'REAL') return 'LIVE';
    if (clean === 'SHADOW' || clean === 'OBSERVATION') return 'SHADOW';
    if (clean === 'SYNTHETIC' || clean === 'MOCK') return 'SYNTHETIC';
    if (clean === 'BACKTEST' || clean === 'HISTORICAL') return 'BACKTEST';
    return 'UNKNOWN';
  }

  /**
   * Record a new observation or update an existing one for a signalId
   */
  public recordObservation(
    input: SecondOpinionInput,
    result: SecondOpinionResult,
    options?: {
      executionEligibilityAtReview?: string;
      brokerOrderId?: string;
      brokerPositionId?: string;
      signalCreatedAt?: number | string;
    }
  ): SecondOpinionObservation {
    const existingId = this.signalToObsMap.get(input.signalId);
    const nowIso = new Date().toISOString();
    const dataMode = this.normalizeDataMode(input.dataMode);

    if (existingId && this.observations.has(existingId)) {
      const existing = this.observations.get(existingId)!;
      const updated: SecondOpinionObservation = {
        ...existing,
        openAiReview: result.review,
        openAiBias: result.independentBias,
        openAiConfidence: result.confidence,
        agreement: result.agreement,
        contradictionLevel: result.contradictionLevel,
        economicRisk: result.economicRisk,
        riskFlags: result.riskFlags,
        keyConcerns: result.keyConcerns,
        invalidationConcerns: result.invalidationConcerns,
        executionEligibilityAtReview: options?.executionEligibilityAtReview || existing.executionEligibilityAtReview,
        model: result.model,
        latencyMs: result.latencyMs,
        secondOpinionAt: result.reviewedAt || nowIso,
        brokerOrderId: options?.brokerOrderId || existing.brokerOrderId,
        brokerPositionId: options?.brokerPositionId || existing.brokerPositionId,
        updatedAt: nowIso
      };

      this.observations.set(existingId, updated);
      if (updated.brokerOrderId) this.brokerOrderToObsMap.set(updated.brokerOrderId, existingId);
      if (updated.brokerPositionId) this.brokerPosToObsMap.set(updated.brokerPositionId, existingId);
      this.saveToDisk();
      return updated;
    }

    const obsId = `obs_${input.signalId}_${Date.now()}`;
    const newObs: SecondOpinionObservation = {
      id: obsId,
      signalId: input.signalId,
      symbol: input.pair,
      timeframe: input.timeframe,
      quantumAiDirection: input.candidateDirection,
      quantumAiConfidence: input.candidateConfidence,
      openAiReview: result.review,
      openAiBias: result.independentBias,
      openAiConfidence: result.confidence,
      agreement: result.agreement,
      contradictionLevel: result.contradictionLevel,
      economicRisk: result.economicRisk,
      riskFlags: result.riskFlags,
      keyConcerns: result.keyConcerns,
      invalidationConcerns: result.invalidationConcerns,
      entry: input.entry,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit1,
      executionEligibilityAtReview: options?.executionEligibilityAtReview || "WAITING_FOR_ENTRY",
      signalCreatedAt: options?.signalCreatedAt || nowIso,
      secondOpinionAt: result.reviewedAt || nowIso,
      model: result.model,
      latencyMs: result.latencyMs,
      dataMode,
      dataLineage: input.dataLineage || { source: input.dataMode || 'LIVE_CTRADER' },
      outcomeStatus: 'OPEN',
      brokerOrderId: options?.brokerOrderId,
      brokerPositionId: options?.brokerPositionId,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    this.observations.set(obsId, newObs);
    this.signalToObsMap.set(input.signalId, obsId);
    if (newObs.brokerOrderId) this.brokerOrderToObsMap.set(newObs.brokerOrderId, obsId);
    if (newObs.brokerPositionId) this.brokerPosToObsMap.set(newObs.brokerPositionId, obsId);

    this.saveToDisk();
    return newObs;
  }

  /**
   * Link broker order/position ID to an existing observation by signalId
   */
  public linkBrokerOrder(signalId: string, brokerOrderId: string, brokerPositionId?: string): boolean {
    const obsId = this.signalToObsMap.get(signalId);
    if (!obsId || !this.observations.has(obsId)) return false;

    const obs = this.observations.get(obsId)!;
    obs.brokerOrderId = brokerOrderId;
    if (brokerPositionId) obs.brokerPositionId = brokerPositionId;
    obs.updatedAt = new Date().toISOString();

    this.brokerOrderToObsMap.set(brokerOrderId, obsId);
    if (brokerPositionId) this.brokerPosToObsMap.set(brokerPositionId, obsId);

    this.saveToDisk();
    return true;
  }

  /**
   * Correlate closed broker position to originating signal observation
   */
  public correlateClosedPosition(trade: ClosedTradeCorrelationInput): {
    matched: boolean;
    observation?: SecondOpinionObservation;
    reason?: string;
  } {
    let obsId: string | undefined;

    // 1. Preferred correlation by canonical brokerOrderId
    if (trade.brokerOrderId && this.brokerOrderToObsMap.has(trade.brokerOrderId)) {
      obsId = this.brokerOrderToObsMap.get(trade.brokerOrderId);
    }

    // 2. Correlation by brokerPositionId
    if (!obsId && trade.brokerPositionId && this.brokerPosToObsMap.has(trade.brokerPositionId)) {
      obsId = this.brokerPosToObsMap.get(trade.brokerPositionId);
    }

    // 3. Correlation by explicit signalId
    if (!obsId && trade.signalId && this.signalToObsMap.has(trade.signalId)) {
      obsId = this.signalToObsMap.get(trade.signalId);
    }

    if (!obsId || !this.observations.has(obsId)) {
      this.unmatchedCorrelationsCount++;
      return {
        matched: false,
        reason: 'UNMATCHED: No canonical second-opinion observation matches the broker trade identifier.'
      };
    }

    const obs = this.observations.get(obsId)!;

    // Lineage verification: Do not allow non-LIVE observations to claim LIVE broker trade stats
    if (obs.dataMode !== 'LIVE') {
      return {
        matched: false,
        reason: `LINEAGE_MISMATCH: Observation dataMode is '${obs.dataMode}' (non-LIVE); cannot record as live broker trade outcome.`
      };
    }

    // Determine deterministic outcome status
    let outcomeStatus: ObservationOutcomeStatus = 'UNKNOWN';
    if (trade.realizedProfit > 0.5) {
      outcomeStatus = 'CLOSED_WIN';
    } else if (trade.realizedProfit < -0.5) {
      outcomeStatus = 'CLOSED_LOSS';
    } else {
      outcomeStatus = 'CLOSED_BREAKEVEN';
    }

    const nowIso = new Date().toISOString();
    obs.outcomeStatus = outcomeStatus;
    obs.outcomePnl = Number(trade.realizedProfit.toFixed(2));
    obs.outcomePips = trade.pnlPips !== undefined ? Number(trade.pnlPips.toFixed(1)) : undefined;
    obs.outcomeDirection = trade.direction;
    obs.outcomeRecordedAt = trade.closedAt ? new Date(trade.closedAt).toISOString() : nowIso;
    obs.correlationMethod = trade.brokerOrderId
      ? 'CANONICAL_BROKER_ORDER_ID'
      : (trade.brokerPositionId ? 'CANONICAL_BROKER_POSITION_ID' : 'CANONICAL_SIGNAL_ID');
    obs.updatedAt = nowIso;

    this.saveToDisk();

    console.log(`🔗 [SecondOpinionObservation] Successfully correlated closed trade to Signal ${obs.signalId}: ${outcomeStatus} (${obs.outcomePnl >= 0 ? '+' : ''}$${obs.outcomePnl})`);

    return {
      matched: true,
      observation: obs
    };
  }

  /**
   * Retrieve single observation by signalId
   */
  public getObservationBySignalId(signalId: string): SecondOpinionObservation | undefined {
    const obsId = this.signalToObsMap.get(signalId);
    if (!obsId) return undefined;
    return this.observations.get(obsId);
  }

  /**
   * Retrieve single observation by ID
   */
  public getObservationById(id: string): SecondOpinionObservation | undefined {
    return this.observations.get(id);
  }

  /**
   * Query observations with flexible filters
   */
  public queryObservations(filters: ObservationQueryFilters = {}): {
    total: number;
    observations: SecondOpinionObservation[];
  } {
    let list = Array.from(this.observations.values());

    if (filters.symbol) {
      const sym = filters.symbol.replace(/[\/\-_]/g, '').toUpperCase();
      list = list.filter(o => o.symbol.replace(/[\/\-_]/g, '').toUpperCase().includes(sym));
    }

    if (filters.timeframe) {
      list = list.filter(o => o.timeframe.toUpperCase() === filters.timeframe!.toUpperCase());
    }

    if (filters.agreement) {
      list = list.filter(o => o.agreement === filters.agreement);
    }

    if (filters.review) {
      list = list.filter(o => o.openAiReview === filters.review);
    }

    if (filters.economicRisk) {
      list = list.filter(o => o.economicRisk === filters.economicRisk);
    }

    if (filters.dataMode) {
      list = list.filter(o => o.dataMode === filters.dataMode);
    }

    if (filters.outcomeStatus) {
      list = list.filter(o => o.outcomeStatus === filters.outcomeStatus);
    }

    if (filters.startDate) {
      const startMs = new Date(filters.startDate).getTime();
      list = list.filter(o => new Date(o.createdAt).getTime() >= startMs);
    }

    if (filters.endDate) {
      const endMs = new Date(filters.endDate).getTime();
      list = list.filter(o => new Date(o.createdAt).getTime() <= endMs);
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const paginated = list.slice(offset, offset + limit);

    return { total, observations: paginated };
  }

  /**
   * Calculate exact summary count metrics (strictly counts, no AI effectiveness claims)
   */
  public getSummaryMetrics(): ObservationSummaryMetrics {
    const list = Array.from(this.observations.values());

    let openAiAvailable = 0;
    let openAiUnavailable = 0;
    let agreementCount = 0;
    let partialCount = 0;
    let disagreementCount = 0;
    let passCount = 0;
    let reviewCount = 0;
    let rejectCount = 0;
    let highEconomicRiskCount = 0;
    let outcomeLinkedCount = 0;
    let outcomeUnmatchedCount = 0;
    let liveOutcomeCount = 0;
    let shadowOutcomeCount = 0;

    for (const o of list) {
      if (o.openAiReview === 'UNAVAILABLE') {
        openAiUnavailable++;
      } else {
        openAiAvailable++;
      }

      if (o.agreement === 'AGREE') agreementCount++;
      else if (o.agreement === 'PARTIAL') partialCount++;
      else if (o.agreement === 'DISAGREE') disagreementCount++;

      if (o.openAiReview === 'PASS') passCount++;
      else if (o.openAiReview === 'REVIEW') reviewCount++;
      else if (o.openAiReview === 'REJECT') rejectCount++;

      if (o.economicRisk === 'HIGH') highEconomicRiskCount++;

      if (o.outcomeStatus === 'CLOSED_WIN' || o.outcomeStatus === 'CLOSED_LOSS' || o.outcomeStatus === 'CLOSED_BREAKEVEN') {
        outcomeLinkedCount++;
        if (o.dataMode === 'LIVE') liveOutcomeCount++;
        else shadowOutcomeCount++;
      } else if (o.outcomeStatus === 'UNMATCHED') {
        outcomeUnmatchedCount++;
      }
    }

    return {
      totalObservations: list.length,
      openAiAvailable,
      openAiUnavailable,
      agreementCount,
      partialCount,
      disagreementCount,
      passCount,
      reviewCount,
      rejectCount,
      highEconomicRiskCount,
      outcomeLinkedCount,
      outcomeUnmatchedCount,
      liveOutcomeCount,
      shadowOutcomeCount
    };
  }

  /**
   * Diagnostic pipeline health indicator
   * Exposes runtime metrics and operational health without leaking credentials.
   */
  public getHealthDiagnostic(): PipelineHealthDiagnostic {
    const list = Array.from(this.observations.values());
    const isEnabled = process.env.OPENAI_SECOND_OPINION_ENABLED === 'true';
    const mode = process.env.OPENAI_SECOND_OPINION_MODE || 'OBSERVATION';

    let latestObsAt: string | null = null;
    let latestObsSignalId: string | null = null;
    let openCount = 0;
    let lastCorrAt: string | null = null;
    let unavailCount = 0;

    for (const obs of list) {
      const obsTime = obs.secondOpinionAt || obs.createdAt;
      if (obsTime) {
        if (!latestObsAt || new Date(obsTime).getTime() > new Date(latestObsAt).getTime()) {
          latestObsAt = obsTime;
          latestObsSignalId = obs.signalId;
        }
      }
      if (obs.outcomeStatus === 'OPEN') {
        openCount++;
      }
      if (obs.outcomeRecordedAt) {
        if (!lastCorrAt || new Date(obs.outcomeRecordedAt).getTime() > new Date(lastCorrAt).getTime()) {
          lastCorrAt = obs.outcomeRecordedAt;
        }
      }
      if (obs.openAiReview === 'UNAVAILABLE') {
        unavailCount++;
      }
    }

    const dir = path.dirname(this.cacheFilePath);
    const persistenceHealthy = fs.existsSync(dir) || fs.existsSync(this.cacheFilePath);

    return {
      secondOpinionEnabled: isEnabled,
      secondOpinionMode: mode,
      observationPersistenceHealthy: persistenceHealthy,
      observationCount: list.length,
      latestObservationAt: latestObsAt,
      latestObservationSignalId: latestObsSignalId,
      unmatchedOutcomeCount: this.unmatchedCorrelationsCount,
      openObservationCount: openCount,
      lastCorrelationAt: lastCorrAt,
      openAiUnavailableCount: unavailCount
    };
  }

  /**
   * Format structured dashboard card payload
   */
  public formatDashboardCard(obs: SecondOpinionObservation): ObservationDashboardCard {
    return {
      signal: {
        id: obs.signalId,
        symbol: obs.symbol,
        timeframe: obs.timeframe,
        direction: obs.quantumAiDirection,
        confidence: obs.quantumAiConfidence,
        createdAt: obs.signalCreatedAt
      },
      secondOpinion: {
        bias: obs.openAiBias,
        confidence: obs.openAiConfidence,
        review: obs.openAiReview,
        agreement: obs.agreement,
        contradiction: obs.contradictionLevel,
        model: obs.model,
        latencyMs: obs.latencyMs,
        reviewedAt: obs.secondOpinionAt
      },
      economicContext: {
        economicRisk: obs.economicRisk,
        riskFlags: obs.riskFlags,
        keyConcerns: obs.keyConcerns
      },
      execution: {
        eligibilityAtReview: obs.executionEligibilityAtReview,
        entry: obs.entry,
        stopLoss: obs.stopLoss,
        takeProfit: obs.takeProfit,
        dataMode: obs.dataMode
      },
      outcome: {
        status: obs.outcomeStatus,
        pnl: obs.outcomePnl,
        pips: obs.outcomePips,
        recordedAt: obs.outcomeRecordedAt,
        correlationMethod: obs.correlationMethod
      }
    };
  }

  public clearObservations(): void {
    this.observations.clear();
    this.signalToObsMap.clear();
    this.brokerOrderToObsMap.clear();
    this.brokerPosToObsMap.clear();
    this.saveToDisk();
  }
}

export const secondOpinionObservationService = SecondOpinionObservationService.getInstance();
