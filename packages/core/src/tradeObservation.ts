/**
 * QuantumAI IATI OS — Phase 2C.6: Canonical Trade Observation Types & Models
 * 
 * INVARIANTS:
 * - Append-only and auditable.
 * - executionAuthority is strictly FALSE for advisory components (Second Opinion AI).
 * - Real broker Level 1 data is authoritative for position and deal outcome.
 * - Missing data is explicitly UNKNOWN / NOT_AVAILABLE (no data fabrication).
 * - Provenance separation (REAL_BROKER, REAL_QUANTUMAI, MANUAL_EXTERNAL, BACKTEST, SYNTHETIC, UNKNOWN).
 */

export type ObservationProvenance =
  | 'REAL_BROKER'
  | 'REAL_QUANTUMAI'
  | 'MANUAL_EXTERNAL'
  | 'BACKTEST'
  | 'SYNTHETIC'
  | 'UNKNOWN';

export type LinkageVerificationStatus =
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'UNLINKED'
  | 'UNKNOWN';

export type MacroRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type ThesisAlignment = 'SUPPORTIVE' | 'MIXED' | 'CONFLICTING' | 'UNKNOWN';

export type MacroCategory =
  | 'central_bank'
  | 'inflation'
  | 'employment'
  | 'GDP'
  | 'interest_rate'
  | 'geopolitical'
  | 'major_economic_event'
  | 'financial_news'
  | 'other';

export interface MacroContextRecord {
  contextId: string;
  dataAvailability: 'AVAILABLE' | 'UNAVAILABLE';
  macroRisk: MacroRiskLevel;
  thesisAlignment: ThesisAlignment;
  eventRisk: string[];
  economicCalendarContext?: {
    eventName?: string;
    eventCategory?: MacroCategory;
    impactLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    eventTimestamp?: string;
    currency?: string;
    actual?: string | number;
    forecast?: string | number;
    previous?: string | number;
  };
  relevantNewsContext?: {
    headline?: string;
    source?: string;
    publicationTimestamp?: string;
    sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNKNOWN';
  };
  assessmentTimestamp: string;
}

export interface SecondOpinionAdvisoryRecord {
  opinionId: string;
  executionAuthority: false; // STRICT INVARIANT: Always false
  macroRisk: MacroRiskLevel;
  thesisAlignment: ThesisAlignment;
  eventRisk: string[];
  explanation: string;
  modelProvider?: string;
  modelVersion?: string;
  assessmentTimestamp: string;
  sourceReferences?: string[];
  inputProvenance?: ObservationProvenance;
}

export interface ProposalObservationData {
  proposalId: string;
  signalId?: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  timeframe?: string;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  confidence?: number;
  strategy?: string;
  method?: string;
  timestamp: string;
  originalThesis?: string;
}

export interface BrokerPositionObservationData {
  brokerPositionId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volumeLots: number;
  openTimestamp: string;
  openPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  currencyExposureSummary?: {
    totalGrossLots: number;
    netUnitsByCurrency: Record<string, number>;
  };
}

export interface OutcomeObservationData {
  brokerPositionId: string;
  brokerDealId?: string;
  closeTimestamp: string;
  closeReason?: string;
  realizedPnL: number;
  commission?: number;
  swap?: number;
  grossPnL?: number;
  netPnL: number;
  mfePips?: number | 'UNKNOWN';
  maePips?: number | 'UNKNOWN';
  intratradeHistoryAvailable: boolean;
}

export interface TradeObservationRecord {
  observationId: string;
  createdAt: string;
  updatedAt: string;
  provenance: ObservationProvenance;
  linkageStatus: LinkageVerificationStatus;

  // Linkage Identifiers
  signalId?: string;
  proposalId?: string;
  executionSequenceId?: string;
  brokerPositionId?: string;
  brokerDealIds: string[];

  // Stage Data
  proposal?: ProposalObservationData;
  secondOpinion?: SecondOpinionAdvisoryRecord;
  macroContext?: MacroContextRecord;
  brokerPosition?: BrokerPositionObservationData;
  outcome?: OutcomeObservationData;

  // Shadow Governance Evaluation
  shadowEvaluationId?: string;
  shadowDecision?: 'SHADOW_ALLOW' | 'SHADOW_REVIEW' | 'SHADOW_WOULD_BLOCK' | 'SHADOW_UNKNOWN';
  shadowReasons?: string[];

  // Metadata
  tags?: string[];
  isCompleteLifecycle: boolean;
}

/**
 * Creates an empty, canonical observation record with strict safety defaults.
 */
export function createDefaultObservationRecord(params: {
  observationId: string;
  provenance?: ObservationProvenance;
  proposalId?: string;
  brokerPositionId?: string;
}): TradeObservationRecord {
  const now = new Date().toISOString();
  return {
    observationId: params.observationId,
    createdAt: now,
    updatedAt: now,
    provenance: params.provenance || 'UNKNOWN',
    linkageStatus: 'UNLINKED',
    brokerDealIds: [],
    proposalId: params.proposalId,
    brokerPositionId: params.brokerPositionId,
    isCompleteLifecycle: false
  };
}
