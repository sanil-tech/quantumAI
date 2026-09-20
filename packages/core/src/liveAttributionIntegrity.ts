/**
 * QuantumAI IATI OS — Phase 2C.12: Live Attribution Integrity Engine
 * 
 * INVARIANTS:
 * - Real-Time Evidence Preservation: Durable causal chain from Signal to Outcome/Post-Mortem.
 * - Non-negotiable: PROOF > COVERAGE, UNKNOWN > FALSE POSITIVE.
 * - Fail-closed deterministic state machine.
 * - Zero execution dependency: ATTRIBUTION_TO_EXECUTION_DEPENDENCY = NONE.
 * - Second Opinion AI is strictly advisory: SECOND_OPINION_EXECUTION_AUTHORITY = FALSE.
 * - Broker Level 1 Authority for financials: BROKER = LEVEL 1 AUTHORITY.
 * - Zero broker write operations.
 * - Supports split-tickets (1 proposal -> N executions) and scale-outs (1 position -> N deals).
 * - Full restart recovery and idempotency.
 * - Strict performance dataset boundary: Only VERIFIED_QUANTUMAI + BROKER_AUTHORITATIVE + CLOSED + OUTCOME_CONFIRMED.
 */

export type LiveAttributionStatus =
  | 'UNBOUND'
  | 'EXECUTION_DISPATCHED'
  | 'ORDER_SUBMITTED'
  | 'BROKER_ACKNOWLEDGED'
  | 'BROKER_POSITION_PENDING'
  | 'BROKER_POSITION_CONFIRMED'
  | 'POSITION_CLOSED'
  | 'OUTCOME_CONFIRMED'
  | 'NOT_FILLED'
  | 'EXECUTION_FAILED'
  | 'ATTRIBUTION_CONFLICT'
  | 'BROKER_ID_UNAVAILABLE'
  | 'UNKNOWN';

export type LiveAttributionProvenance =
  | 'REAL_QUANTUMAI'
  | 'REAL_BROKER'
  | 'VERIFIED_MANUAL_EXTERNAL'
  | 'UNKNOWN_ORIGIN'
  | 'BACKTEST'
  | 'SYNTHETIC';

export type DataAuthority =
  | 'BROKER_LEVEL_1'
  | 'QUANTUMAI_INTERNAL'
  | 'DERIVED';

export interface SecondOpinionAssessment {
  assessmentId: string;
  timestamp: string;
  macroRisk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | string;
  thesisAlignment?: 'ALIGNED' | 'NEUTRAL' | 'CONFLICT' | string;
  eventRisk?: string[];
  explanation?: string;
  executionAuthority: false; // Mandatory invariant
  isRetrospective: boolean;
}

export interface BrokerPnLRecord {
  grossPnL: number;
  commission: number;
  swap: number;
  netPnL: number;
  authority: 'BROKER_LEVEL_1';
}

export interface MfeMaeRecord {
  mfePips: number | 'UNKNOWN';
  maePips: number | 'UNKNOWN';
  intratradeHistoryAvailable: boolean;
}

export interface QuantumAIExecutionAttributionRecord {
  attributionId: string;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;

  // Causal Lifecycle Identifiers
  signalId?: string;
  thesisId?: string;
  proposalId?: string;
  riskReservationId?: string;
  executionSequenceId?: string;

  // Broker Authoritative Identifiers
  brokerOrderIds: string[];
  brokerDealIds: string[];
  brokerPositionId?: string;

  // Trade Specifications
  symbol: string;
  direction: 'BUY' | 'SELL' | string;
  requestedVolume: number;
  filledVolume?: number;

  // Status & Governance
  executionStatus: string;
  attributionStatus: LiveAttributionStatus;
  provenance: LiveAttributionProvenance;
  dataAuthority: DataAuthority;
  isVerifiedQuantumAI: boolean;
  isPerformanceEligible: boolean;

  // Lifecycle Timestamps
  orderSubmittedAt?: string;
  brokerAcknowledgedAt?: string;
  positionConfirmedAt?: string;
  positionClosedAt?: string;

  // Post-Execution Linkage
  outcomeId?: string;
  postMortemId?: string;

  // Payloads & Context
  secondOpinionAssessment?: SecondOpinionAssessment;
  brokerPnL?: BrokerPnLRecord;
  mfeMae?: MfeMaeRecord;
  conflictReason?: string;
  failureReason?: string;
}

export interface InitialAttributionInput {
  attributionId?: string;
  signalId?: string;
  thesisId?: string;
  proposalId?: string;
  riskReservationId?: string;
  executionSequenceId?: string;
  symbol: string;
  direction: 'BUY' | 'SELL' | string;
  requestedVolume: number;
  provenance?: LiveAttributionProvenance;
  secondOpinion?: Partial<SecondOpinionAssessment>;
  timestamp?: string | number;
}

/**
 * Creates an initial durable attribution record at proposal or execution dispatch time.
 */
export function createInitialAttributionRecord(
  input: InitialAttributionInput
): QuantumAIExecutionAttributionRecord {
  const nowStr = typeof input.timestamp === 'number'
    ? new Date(input.timestamp).toISOString()
    : (input.timestamp ? String(input.timestamp) : new Date().toISOString());

  const attrId = input.attributionId || `attr-${input.executionSequenceId || input.proposalId || Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  let secondOpinion: SecondOpinionAssessment | undefined = undefined;
  if (input.secondOpinion) {
    secondOpinion = {
      assessmentId: input.secondOpinion.assessmentId || `so-eval-${Date.now()}`,
      timestamp: input.secondOpinion.timestamp || nowStr,
      macroRisk: input.secondOpinion.macroRisk,
      thesisAlignment: input.secondOpinion.thesisAlignment,
      eventRisk: input.secondOpinion.eventRisk || [],
      explanation: input.secondOpinion.explanation,
      executionAuthority: false, // Invariant
      isRetrospective: input.secondOpinion.isRetrospective ?? false
    };
  }

  return {
    attributionId: attrId,
    schemaVersion: '1.0',
    createdAt: nowStr,
    updatedAt: nowStr,
    signalId: input.signalId,
    thesisId: input.thesisId,
    proposalId: input.proposalId,
    riskReservationId: input.riskReservationId,
    executionSequenceId: input.executionSequenceId,
    brokerOrderIds: [],
    brokerDealIds: [],
    symbol: input.symbol,
    direction: input.direction,
    requestedVolume: input.requestedVolume,
    executionStatus: input.executionSequenceId ? 'EXECUTION_DISPATCHED' : 'UNBOUND',
    attributionStatus: input.executionSequenceId ? 'EXECUTION_DISPATCHED' : 'UNBOUND',
    provenance: input.provenance || 'REAL_QUANTUMAI',
    dataAuthority: 'QUANTUMAI_INTERNAL',
    isVerifiedQuantumAI: false, // Requires broker confirmation
    isPerformanceEligible: false,
    secondOpinionAssessment: secondOpinion,
    mfeMae: {
      mfePips: 'UNKNOWN',
      maePips: 'UNKNOWN',
      intratradeHistoryAvailable: false
    }
  };
}

/**
 * Updates attribution record when order is submitted to broker.
 */
export function recordOrderSubmission(
  record: QuantumAIExecutionAttributionRecord,
  orderData: {
    brokerOrderId?: string | number;
    submittedAt?: string | number;
  }
): QuantumAIExecutionAttributionRecord {
  const timestamp = orderData.submittedAt
    ? (typeof orderData.submittedAt === 'number' ? new Date(orderData.submittedAt).toISOString() : String(orderData.submittedAt))
    : new Date().toISOString();

  const orderIds = [...record.brokerOrderIds];
  if (orderData.brokerOrderId !== undefined && orderData.brokerOrderId !== null) {
    const oIdStr = String(orderData.brokerOrderId).trim();
    if (oIdStr && !orderIds.includes(oIdStr)) {
      orderIds.push(oIdStr);
    }
  }

  return {
    ...record,
    updatedAt: timestamp,
    orderSubmittedAt: timestamp,
    brokerOrderIds: orderIds,
    executionStatus: 'ORDER_SUBMITTED',
    attributionStatus: 'ORDER_SUBMITTED'
  };
}

/**
 * Updates attribution record upon authoritative broker acknowledgement.
 */
export function recordBrokerAcknowledgement(
  record: QuantumAIExecutionAttributionRecord,
  ackData: {
    brokerOrderId?: string | number;
    brokerDealId?: string | number;
    acknowledgedAt?: string | number;
  }
): QuantumAIExecutionAttributionRecord {
  const timestamp = ackData.acknowledgedAt
    ? (typeof ackData.acknowledgedAt === 'number' ? new Date(ackData.acknowledgedAt).toISOString() : String(ackData.acknowledgedAt))
    : new Date().toISOString();

  const orderIds = [...record.brokerOrderIds];
  if (ackData.brokerOrderId !== undefined && ackData.brokerOrderId !== null) {
    const oIdStr = String(ackData.brokerOrderId).trim();
    if (oIdStr && !orderIds.includes(oIdStr)) {
      orderIds.push(oIdStr);
    }
  }

  const dealIds = [...record.brokerDealIds];
  if (ackData.brokerDealId !== undefined && ackData.brokerDealId !== null) {
    const dIdStr = String(ackData.brokerDealId).trim();
    if (dIdStr && !dealIds.includes(dIdStr)) {
      dealIds.push(dIdStr);
    }
  }

  return {
    ...record,
    updatedAt: timestamp,
    brokerAcknowledgedAt: timestamp,
    brokerOrderIds: orderIds,
    brokerDealIds: dealIds,
    executionStatus: 'BROKER_ACKNOWLEDGED',
    attributionStatus: 'BROKER_ACKNOWLEDGED',
    dataAuthority: 'BROKER_LEVEL_1'
  };
}

/**
 * Binds authoritative broker position ID to the attribution record.
 */
export function bindBrokerPosition(
  record: QuantumAIExecutionAttributionRecord,
  posData: {
    brokerPositionId: string | number;
    filledVolume?: number;
    confirmedAt?: string | number;
  }
): QuantumAIExecutionAttributionRecord {
  const posIdStr = String(posData.brokerPositionId).trim();
  if (!posIdStr) {
    return {
      ...record,
      updatedAt: new Date().toISOString(),
      attributionStatus: 'BROKER_ID_UNAVAILABLE',
      isVerifiedQuantumAI: false
    };
  }

  const timestamp = posData.confirmedAt
    ? (typeof posData.confirmedAt === 'number' ? new Date(posData.confirmedAt).toISOString() : String(posData.confirmedAt))
    : new Date().toISOString();

  return {
    ...record,
    updatedAt: timestamp,
    positionConfirmedAt: timestamp,
    brokerPositionId: posIdStr,
    filledVolume: posData.filledVolume ?? record.filledVolume ?? record.requestedVolume,
    executionStatus: 'POSITION_OPEN',
    attributionStatus: 'BROKER_POSITION_CONFIRMED',
    isVerifiedQuantumAI: true,
    dataAuthority: 'BROKER_LEVEL_1'
  };
}

/**
 * Appends broker deal IDs (supports partial fills, scale-outs, multiple close deals).
 */
export function recordBrokerDeals(
  record: QuantumAIExecutionAttributionRecord,
  dealIds: (string | number)[]
): QuantumAIExecutionAttributionRecord {
  const currentDeals = new Set(record.brokerDealIds);
  for (const id of dealIds) {
    if (id !== undefined && id !== null) {
      currentDeals.add(String(id).trim());
    }
  }

  return {
    ...record,
    updatedAt: new Date().toISOString(),
    brokerDealIds: Array.from(currentDeals),
    dataAuthority: 'BROKER_LEVEL_1'
  };
}

/**
 * Records position closure with Level 1 broker authoritative P/L.
 */
export function recordPositionClosed(
  record: QuantumAIExecutionAttributionRecord,
  closeData: {
    closedAt?: string | number;
    brokerPnL: {
      grossPnL: number;
      commission: number;
      swap: number;
      netPnL: number;
    };
    closeDealIds?: (string | number)[];
    mfeMae?: Partial<MfeMaeRecord>;
  }
): QuantumAIExecutionAttributionRecord {
  const timestamp = closeData.closedAt
    ? (typeof closeData.closedAt === 'number' ? new Date(closeData.closedAt).toISOString() : String(closeData.closedAt))
    : new Date().toISOString();

  const currentDeals = new Set(record.brokerDealIds);
  if (closeData.closeDealIds) {
    for (const id of closeData.closeDealIds) {
      currentDeals.add(String(id).trim());
    }
  }

  return {
    ...record,
    updatedAt: timestamp,
    positionClosedAt: timestamp,
    brokerDealIds: Array.from(currentDeals),
    brokerPnL: {
      grossPnL: closeData.brokerPnL.grossPnL,
      commission: closeData.brokerPnL.commission,
      swap: closeData.brokerPnL.swap,
      netPnL: closeData.brokerPnL.netPnL,
      authority: 'BROKER_LEVEL_1'
    },
    mfeMae: {
      mfePips: closeData.mfeMae?.mfePips ?? 'UNKNOWN',
      maePips: closeData.mfeMae?.maePips ?? 'UNKNOWN',
      intratradeHistoryAvailable: closeData.mfeMae?.intratradeHistoryAvailable ?? false
    },
    executionStatus: 'POSITION_CLOSED',
    attributionStatus: 'POSITION_CLOSED',
    dataAuthority: 'BROKER_LEVEL_1'
  };
}

/**
 * Records outcome confirmation and links post-mortem.
 */
export function recordOutcomeConfirmed(
  record: QuantumAIExecutionAttributionRecord,
  outcomeData: {
    outcomeId: string;
    postMortemId?: string;
  }
): QuantumAIExecutionAttributionRecord {
  const isEligible = record.isVerifiedQuantumAI &&
    record.provenance === 'REAL_QUANTUMAI' &&
    record.dataAuthority === 'BROKER_LEVEL_1';

  return {
    ...record,
    updatedAt: new Date().toISOString(),
    outcomeId: outcomeData.outcomeId,
    postMortemId: outcomeData.postMortemId,
    attributionStatus: 'OUTCOME_CONFIRMED',
    isPerformanceEligible: isEligible
  };
}

/**
 * Records attribution conflict when multiple executions or contradictory records claim same broker ID.
 */
export function recordAttributionConflict(
  record: QuantumAIExecutionAttributionRecord,
  conflictReason: string
): QuantumAIExecutionAttributionRecord {
  return {
    ...record,
    updatedAt: new Date().toISOString(),
    attributionStatus: 'ATTRIBUTION_CONFLICT',
    conflictReason,
    isVerifiedQuantumAI: false,
    isPerformanceEligible: false
  };
}

/**
 * Records execution failure when broker rejects or fails order.
 */
export function recordExecutionFailure(
  record: QuantumAIExecutionAttributionRecord,
  failureReason: string
): QuantumAIExecutionAttributionRecord {
  return {
    ...record,
    updatedAt: new Date().toISOString(),
    executionStatus: 'EXECUTION_FAILED',
    attributionStatus: 'EXECUTION_FAILED',
    failureReason,
    isVerifiedQuantumAI: false,
    isPerformanceEligible: false
  };
}

/**
 * Filters and validates the strictly eligible performance dataset.
 * INVARIANT: Only BROKER_AUTHORITATIVE + VERIFIED_QUANTUMAI + CLOSED + OUTCOME_CONFIRMED records.
 */
export function filterPerformanceEligibleDataset(
  records: QuantumAIExecutionAttributionRecord[]
): QuantumAIExecutionAttributionRecord[] {
  return records.filter(r => (
    r.isVerifiedQuantumAI === true &&
    r.provenance === 'REAL_QUANTUMAI' &&
    r.dataAuthority === 'BROKER_LEVEL_1' &&
    r.attributionStatus === 'OUTCOME_CONFIRMED' &&
    r.isPerformanceEligible === true &&
    r.brokerPositionId !== undefined &&
    r.brokerPnL !== undefined
  ));
}

export interface AttributionQualityMetrics {
  totalRecords: number;
  verifiedQuantumAICount: number;
  verifiedManualExternalCount: number;
  unknownOriginCount: number;
  attributionCoverageRate: number;
  identifierCompletenessRate: number;
  brokerLinkageRate: number;
  executionToPositionLinkageRate: number;
  positionToOutcomeLinkageRate: number;
  duplicateEventRate: number;
  conflictRate: number;
  unknownRate: number;
}

/**
 * Computes deterministic data quality and attribution integrity metrics.
 */
export function computeAttributionQualityMetrics(
  records: QuantumAIExecutionAttributionRecord[],
  totalEventsProcessed: number = 0,
  duplicateEventsCount: number = 0
): AttributionQualityMetrics {
  const total = records.length;
  if (total === 0) {
    return {
      totalRecords: 0,
      verifiedQuantumAICount: 0,
      verifiedManualExternalCount: 0,
      unknownOriginCount: 0,
      attributionCoverageRate: 1.0,
      identifierCompletenessRate: 1.0,
      brokerLinkageRate: 1.0,
      executionToPositionLinkageRate: 1.0,
      positionToOutcomeLinkageRate: 1.0,
      duplicateEventRate: 0,
      conflictRate: 0,
      unknownRate: 0
    };
  }

  let verifiedQ = 0;
  let manualExt = 0;
  let unknown = 0;
  let completeIds = 0;
  let brokerLinked = 0;
  let execToPosLinked = 0;
  let posToOutcomeLinked = 0;
  let conflicts = 0;

  for (const r of records) {
    if (r.isVerifiedQuantumAI) verifiedQ++;
    if (r.provenance === 'VERIFIED_MANUAL_EXTERNAL') manualExt++;
    if (r.provenance === 'UNKNOWN_ORIGIN' || r.attributionStatus === 'UNKNOWN') unknown++;
    if (r.attributionStatus === 'ATTRIBUTION_CONFLICT') conflicts++;

    const hasIds = r.signalId && r.proposalId && r.executionSequenceId && r.brokerPositionId;
    if (hasIds) completeIds++;

    if (r.brokerPositionId || r.brokerOrderIds.length > 0 || r.brokerDealIds.length > 0) {
      brokerLinked++;
    }

    if (r.executionSequenceId && r.brokerPositionId) {
      execToPosLinked++;
    }

    if (r.brokerPositionId && r.outcomeId) {
      posToOutcomeLinked++;
    }
  }

  const dupRate = totalEventsProcessed > 0
    ? Number((duplicateEventsCount / totalEventsProcessed).toFixed(4))
    : 0;

  return {
    totalRecords: total,
    verifiedQuantumAICount: verifiedQ,
    verifiedManualExternalCount: manualExt,
    unknownOriginCount: unknown,
    attributionCoverageRate: Number((verifiedQ / total).toFixed(4)),
    identifierCompletenessRate: Number((completeIds / total).toFixed(4)),
    brokerLinkageRate: Number((brokerLinked / total).toFixed(4)),
    executionToPositionLinkageRate: Number((execToPosLinked / total).toFixed(4)),
    positionToOutcomeLinkageRate: Number((posToOutcomeLinked / total).toFixed(4)),
    duplicateEventRate: dupRate,
    conflictRate: Number((conflicts / total).toFixed(4)),
    unknownRate: Number((unknown / total).toFixed(4))
  };
}
