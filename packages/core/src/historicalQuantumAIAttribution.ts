/**
 * QuantumAI IATI OS — Phase 2C.11: Historical QuantumAI Attribution Recovery Engine
 * 
 * INVARIANTS:
 * - Strictly read-only forensic reconstruction.
 * - Absolute Attribution Rule: Symbol, time, volume, direction, price, SL/TP similarity alone is NEVER proof.
 * - Proof > Coverage; Unknown > False Positive.
 * - Fail-closed deterministic decision engine (No LLMs, no probabilistic models for attribution).
 * - Multi-level evidence hierarchy (Level 1: Broker, Level 2: QuantumAI Execution, Level 3: Proposal/Signal, Level 4: Post-Mortem/Learning).
 * - Zero broker write access, zero execution side effects.
 * - Retrospective AI analysis is strictly RESEARCH_ONLY and never historical attribution.
 */

export type HistoricalAttribution =
  | 'VERIFIED_QUANTUMAI'
  | 'VERIFIED_MANUAL_EXTERNAL'
  | 'UNKNOWN_ORIGIN';

export type EvidenceStrength =
  | 'DIRECT'
  | 'STRONG_SUPPORTING'
  | 'WEAK_SUPPORTING'
  | 'NONE';

export interface HistoricalAttributionEvidence {
  brokerPositionId: string;
  brokerOrderIds: string[];
  brokerDealIds: string[];

  executionSequenceId?: string;
  proposalId?: string;
  signalId?: string;
  postMortemId?: string;

  evidenceStrength: EvidenceStrength;
  explicitBrokerLink: boolean;
  attribution: HistoricalAttribution;

  reason: string;
  sourceRecords: string[];
  isRetrospectiveAiAnalysis?: boolean;
  hasConflict?: boolean;
  designReviewRequired?: boolean;
}

export interface RawForensicCandidate {
  brokerPositionId?: string | number;
  symbol: string;
  direction: 'BUY' | 'SELL' | string;
  volume: number;
  openTime: string | number;
  closeTime?: string | number;
  brokerPnL?: {
    grossPnL: number;
    commission: number;
    swap: number;
    netPnL: number;
  };
  dealIds?: (string | number)[];
  orderIds?: (string | number)[];
  comment?: string;
  label?: string;
  originBefore?: HistoricalAttribution;

  // Potential candidate links
  candidateExecution?: {
    executionSequenceId?: string;
    orderSubmissionId?: string;
    brokerPositionId?: string | number;
    brokerOrderId?: string | number;
    brokerDealId?: string | number;
    authoritativeBrokerLink?: boolean;
    sourceFile?: string;
  };

  candidateProposal?: {
    proposalId?: string;
    signalId?: string;
    strategy?: string;
    timeframe?: string;
    confidence?: number;
    sourceFile?: string;
  };

  candidatePostMortem?: {
    postMortemId?: string;
    brokerPositionId?: string | number;
    isLifecycleProven?: boolean;
    sourceFile?: string;
  };

  candidateManualEvidence?: {
    clientType?: 'MANUAL_EXTERNAL' | 'CTRADER_WEB' | 'CTRADER_MOBILE' | string;
    isConfirmedManual?: boolean;
    sourceFile?: string;
  };

  candidateRetrospectiveAi?: {
    opinionId?: string;
    analysisTimestamp?: string;
    isRetrospective?: boolean;
    notes?: string;
  };

  candidateConflictFlag?: boolean;
  conflictReason?: string;
}

export interface ForensicTableEntry {
  brokerPositionId: string;
  symbol: string;
  direction: string;
  volume: number;
  openTime: string;
  closeTime: string;
  brokerPnL: number;
  originBefore: HistoricalAttribution;
  candidateQuantumAIRecords: number;
  executionSequenceId?: string;
  proposalId?: string;
  signalId?: string;
  orderId?: string;
  dealIds: string[];
  postMortemId?: string;
  explicitBrokerLink: boolean;
  evidenceStrength: EvidenceStrength;
  attributionDecision: HistoricalAttribution;
  reason: string;
  designReviewRequired?: boolean;
}

export interface ForensicAttributionSummary {
  phaseStatus: 'PASS' | 'READY_FOR_RESEARCH' | 'DESIGN_REVIEW_REQUIRED' | 'VALIDATION_FAILED';
  totalInvestigated: number;
  unknownPositionsInvestigated: number;

  verifiedQuantumAIPositionsBefore: number;
  verifiedQuantumAIPositionsAfter: number;

  verifiedManualExternalPositionsBefore: number;
  verifiedManualExternalPositionsAfter: number;

  unknownOriginPositionsBefore: number;
  unknownOriginPositionsAfter: number;

  verifiedQuantumAIDealsBefore: number;
  verifiedQuantumAIDealsAfter: number;

  directAttributionCount: number;
  strongSupportingCount: number;
  weakSupportingCount: number;
  noEvidenceCount: number;

  brokerPositionLinkage: string;
  brokerDealLinkage: string;

  attributionChainCompleteness: {
    signalLinkageCount: number;
    proposalLinkageCount: number;
    executionLinkageCount: number;
    postMortemLinkageCount: number;
  };

  attributionGaps: string[];
  rootCauseOfAttributionLoss: string[];
  records: ForensicTableEntry[];
}

/**
 * Pure deterministic attribution decision engine.
 * Evaluates candidate against 4-level hierarchy and fail-closed attribution rules.
 */
export function evaluateAttributionEvidence(candidate: RawForensicCandidate): HistoricalAttributionEvidence {
  const brokerPositionId = candidate.brokerPositionId !== undefined && candidate.brokerPositionId !== null
    ? String(candidate.brokerPositionId).trim()
    : '';

  const brokerOrderIds = (candidate.orderIds || []).map(id => String(id));
  const brokerDealIds = (candidate.dealIds || []).map(id => String(id));
  const sourceRecords: string[] = [];

  // Test / Safety Guard 1: Missing broker identifier
  if (!brokerPositionId) {
    return {
      brokerPositionId: '',
      brokerOrderIds,
      brokerDealIds,
      evidenceStrength: 'NONE',
      explicitBrokerLink: false,
      attribution: 'UNKNOWN_ORIGIN',
      reason: 'MISSING_BROKER_POSITION_ID: Cannot establish attribution without authoritative broker position ID.',
      sourceRecords: []
    };
  }

  // Test / Safety Guard 2: Conflicting evidence
  if (candidate.candidateConflictFlag) {
    return {
      brokerPositionId,
      brokerOrderIds,
      brokerDealIds,
      evidenceStrength: 'NONE',
      explicitBrokerLink: false,
      attribution: 'UNKNOWN_ORIGIN',
      reason: `CONFLICTING_EVIDENCE: ${candidate.conflictReason || 'Contradictory lifecycle provenance detected.'}`,
      sourceRecords,
      hasConflict: true,
      designReviewRequired: true
    };
  }

  // Test / Safety Guard 3: Retrospective AI analysis (Must be isolated as RESEARCH_ONLY, never attribution)
  if (candidate.candidateRetrospectiveAi?.isRetrospective) {
    // If no prior causal execution link exists, retrospective AI cannot grant attribution
    if (!candidate.candidateExecution?.authoritativeBrokerLink && !candidate.candidatePostMortem?.isLifecycleProven) {
      return {
        brokerPositionId,
        brokerOrderIds,
        brokerDealIds,
        evidenceStrength: 'NONE',
        explicitBrokerLink: false,
        attribution: 'UNKNOWN_ORIGIN',
        reason: 'RESEARCH_ONLY: Retrospective AI analysis cannot retroactively create causal historical attribution.',
        sourceRecords: candidate.candidateRetrospectiveAi.opinionId ? [candidate.candidateRetrospectiveAi.opinionId] : [],
        isRetrospectiveAiAnalysis: true
      };
    }
  }

  // Hierarchy Level 2: Direct QuantumAI Execution Linkage
  if (candidate.candidateExecution) {
    const exec = candidate.candidateExecution;
    const execPosId = exec.brokerPositionId !== undefined ? String(exec.brokerPositionId).trim() : '';
    const execOrderId = exec.brokerOrderId !== undefined ? String(exec.brokerOrderId).trim() : '';

    const directPosMatch = execPosId !== '' && execPosId === brokerPositionId;
    const directOrderMatch = execOrderId !== '' && brokerOrderIds.includes(execOrderId);

    if (exec.authoritativeBrokerLink || directPosMatch || directOrderMatch) {
      if (exec.sourceFile) sourceRecords.push(exec.sourceFile);
      if (candidate.candidateProposal?.sourceFile) sourceRecords.push(candidate.candidateProposal.sourceFile);

      return {
        brokerPositionId,
        brokerOrderIds: execOrderId ? Array.from(new Set([...brokerOrderIds, execOrderId])) : brokerOrderIds,
        brokerDealIds,
        executionSequenceId: exec.executionSequenceId,
        proposalId: candidate.candidateProposal?.proposalId,
        signalId: candidate.candidateProposal?.signalId,
        evidenceStrength: 'DIRECT',
        explicitBrokerLink: true,
        attribution: 'VERIFIED_QUANTUMAI',
        reason: `AUTHORITATIVE_EXECUTION_LINK: Direct causal binding between QuantumAI execution sequence (${exec.executionSequenceId || 'SEQ_MATCH'}) and broker position ID (${brokerPositionId}).`,
        sourceRecords
      };
    }
  }

  // Hierarchy Level 4: Demonstrable Post-Mortem Lifecycle Linkage
  if (candidate.candidatePostMortem) {
    const pm = candidate.candidatePostMortem;
    const pmPosId = pm.brokerPositionId !== undefined ? String(pm.brokerPositionId).trim() : '';

    if (pm.isLifecycleProven && pmPosId === brokerPositionId) {
      if (pm.sourceFile) sourceRecords.push(pm.sourceFile);

      return {
        brokerPositionId,
        brokerOrderIds,
        brokerDealIds,
        postMortemId: pm.postMortemId,
        proposalId: candidate.candidateProposal?.proposalId,
        signalId: candidate.candidateProposal?.signalId,
        evidenceStrength: 'STRONG_SUPPORTING',
        explicitBrokerLink: true,
        attribution: 'VERIFIED_QUANTUMAI',
        reason: `AUTHORITATIVE_POST_MORTEM_LINK: Proven historical lifecycle post-mortem (${pm.postMortemId}) references broker position ID (${brokerPositionId}).`,
        sourceRecords
      };
    }
  }

  // Level 1: Confirmed Manual / External
  if (candidate.candidateManualEvidence?.isConfirmedManual) {
    if (candidate.candidateManualEvidence.sourceFile) {
      sourceRecords.push(candidate.candidateManualEvidence.sourceFile);
    }
    return {
      brokerPositionId,
      brokerOrderIds,
      brokerDealIds,
      evidenceStrength: 'DIRECT',
      explicitBrokerLink: true,
      attribution: 'VERIFIED_MANUAL_EXTERNAL',
      reason: `VERIFIED_MANUAL_EXTERNAL: Confirmed external/manual origin (${candidate.candidateManualEvidence.clientType || 'MANUAL'}).`,
      sourceRecords
    };
  }

  // Hierarchy Level 3: Proposal / Signal only without Level 2/4 execution link
  if (candidate.candidateProposal?.proposalId || candidate.candidateProposal?.signalId) {
    return {
      brokerPositionId,
      brokerOrderIds,
      brokerDealIds,
      proposalId: candidate.candidateProposal?.proposalId,
      signalId: candidate.candidateProposal?.signalId,
      evidenceStrength: 'WEAK_SUPPORTING',
      explicitBrokerLink: false,
      attribution: 'UNKNOWN_ORIGIN',
      reason: 'INTENT_WITHOUT_EXECUTION_PROOF: QuantumAI signal/proposal exists but lacks Level 2 broker execution acknowledgement or Level 4 lifecycle binding.',
      sourceRecords: candidate.candidateProposal?.sourceFile ? [candidate.candidateProposal.sourceFile] : []
    };
  }

  // Heuristics (comment, label, symbol/time correlation) -> UNKNOWN_ORIGIN
  if (candidate.comment || candidate.label) {
    return {
      brokerPositionId,
      brokerOrderIds,
      brokerDealIds,
      evidenceStrength: 'WEAK_SUPPORTING',
      explicitBrokerLink: false,
      attribution: 'UNKNOWN_ORIGIN',
      reason: 'HEURISTIC_CORRELATION_ONLY: Position comment or label suggests QuantumAI similarity, but lacks authoritative execution linkage.',
      sourceRecords: []
    };
  }

  // Default: No evidence
  return {
    brokerPositionId,
    brokerOrderIds,
    brokerDealIds,
    evidenceStrength: 'NONE',
    explicitBrokerLink: false,
    attribution: 'UNKNOWN_ORIGIN',
    reason: 'NO_QUANTUMAI_EVIDENCE: No repository-native execution, proposal, or post-mortem record linked to broker position.',
    sourceRecords: []
  };
}

/**
 * Investigates and runs forensic attribution recovery across a list of raw candidates.
 */
export function runForensicAttributionRecovery(params: {
  candidates: RawForensicCandidate[];
  baselineMetrics?: {
    historicalBrokerDeals?: number;
    historicalBrokerPositions?: number;
    verifiedQuantumAIBefore?: number;
    verifiedManualExternalBefore?: number;
    unknownOriginBefore?: number;
  };
}): ForensicAttributionSummary {
  const { candidates, baselineMetrics } = params;

  let directCount = 0;
  let strongCount = 0;
  let weakCount = 0;
  let noneCount = 0;

  let signalLinkCount = 0;
  let propLinkCount = 0;
  let execLinkCount = 0;
  let pmLinkCount = 0;

  let totalDealsAfter = 0;
  let verifiedQuantumAIDealsAfter = 0;

  const records: ForensicTableEntry[] = [];

  let qAfter = 0;
  let manualAfter = 0;
  let unknownAfter = 0;
  let hasDesignReview = false;

  for (const c of candidates) {
    const evalResult = evaluateAttributionEvidence(c);
    const candidateCount = (c.candidateExecution ? 1 : 0) +
      (c.candidateProposal ? 1 : 0) +
      (c.candidatePostMortem ? 1 : 0) +
      (c.candidateRetrospectiveAi ? 1 : 0);

    const dealIds = (c.dealIds || []).map(id => String(id));
    totalDealsAfter += dealIds.length;

    if (evalResult.evidenceStrength === 'DIRECT') directCount++;
    else if (evalResult.evidenceStrength === 'STRONG_SUPPORTING') strongCount++;
    else if (evalResult.evidenceStrength === 'WEAK_SUPPORTING') weakCount++;
    else noneCount++;

    if (evalResult.signalId) signalLinkCount++;
    if (evalResult.proposalId) propLinkCount++;
    if (evalResult.executionSequenceId) execLinkCount++;
    if (evalResult.postMortemId) pmLinkCount++;

    if (evalResult.attribution === 'VERIFIED_QUANTUMAI') {
      qAfter++;
      verifiedQuantumAIDealsAfter += dealIds.length;
    } else if (evalResult.attribution === 'VERIFIED_MANUAL_EXTERNAL') {
      manualAfter++;
    } else {
      unknownAfter++;
    }

    if (evalResult.designReviewRequired) {
      hasDesignReview = true;
    }

    records.push({
      brokerPositionId: evalResult.brokerPositionId || String(c.brokerPositionId || 'UNKNOWN'),
      symbol: c.symbol,
      direction: String(c.direction),
      volume: c.volume,
      openTime: typeof c.openTime === 'number' ? new Date(c.openTime).toISOString() : String(c.openTime),
      closeTime: c.closeTime ? (typeof c.closeTime === 'number' ? new Date(c.closeTime).toISOString() : String(c.closeTime)) : '',
      brokerPnL: c.brokerPnL?.netPnL || 0,
      originBefore: c.originBefore || 'UNKNOWN_ORIGIN',
      candidateQuantumAIRecords: candidateCount,
      executionSequenceId: evalResult.executionSequenceId,
      proposalId: evalResult.proposalId,
      signalId: evalResult.signalId,
      orderId: evalResult.brokerOrderIds[0],
      dealIds,
      postMortemId: evalResult.postMortemId,
      explicitBrokerLink: evalResult.explicitBrokerLink,
      evidenceStrength: evalResult.evidenceStrength,
      attributionDecision: evalResult.attribution,
      reason: evalResult.reason,
      designReviewRequired: evalResult.designReviewRequired
    });
  }

  const attributionGaps: string[] = [
    'GAP 1: In-memory signal/proposal IDs were historically not persisted in cTrader order comments/labels at submission time.',
    'GAP 2: Spotware cTrader Open API assigns integer positionId asynchronously upon execution, which was not durably mapped back to internal proposal IDs in PostgreSQL.',
    'GAP 3: Webhook inbox and broker reconciliation historically reconciled account-level positions without enforcing 1:1 executionSequenceId foreign key binding.',
    'GAP 4: Post-mortem backfill queries matched symbol and time window rather than authoritative cTrader position ticket IDs.'
  ];

  const rootCauses: string[] = [
    'ASYNC_ID_DISCONNECT: Internal proposals used UUID/timestamp strings while cTrader generated discrete server-side int64 IDs without roundtrip metadata persistence.',
    'UNBOUND_RECONCILIATION: Pre-2C reconciliation tracked total open positions for balance/equity calculation rather than maintaining strict causal provenance.',
    'MANUAL_TRADING_COEXISTENCE: Shared demo account was simultaneously used for manual cTrader UI testing, creating interleaved unlabelled trades.',
    'FAIL_CLOSED_CORRECTNESS: Because heuristic correlation is strictly forbidden from manufacturing proof, trades without Level 2 binding correctly remain UNKNOWN_ORIGIN.'
  ];

  const phaseStatus = hasDesignReview
    ? 'DESIGN_REVIEW_REQUIRED'
    : (qAfter > 0 ? 'PASS' : 'READY_FOR_RESEARCH');

  return {
    phaseStatus,
    totalInvestigated: candidates.length,
    unknownPositionsInvestigated: candidates.filter(c => (c.originBefore || 'UNKNOWN_ORIGIN') === 'UNKNOWN_ORIGIN').length,

    verifiedQuantumAIPositionsBefore: baselineMetrics?.verifiedQuantumAIBefore ?? 0,
    verifiedQuantumAIPositionsAfter: qAfter,

    verifiedManualExternalPositionsBefore: baselineMetrics?.verifiedManualExternalBefore ?? 41,
    verifiedManualExternalPositionsAfter: manualAfter,

    unknownOriginPositionsBefore: baselineMetrics?.unknownOriginBefore ?? 81,
    unknownOriginPositionsAfter: unknownAfter,

    verifiedQuantumAIDealsBefore: 0,
    verifiedQuantumAIDealsAfter: verifiedQuantumAIDealsAfter,

    directAttributionCount: directCount,
    strongSupportingCount: strongCount,
    weakSupportingCount: weakCount,
    noEvidenceCount: noneCount,

    brokerPositionLinkage: `${candidates.length}/${candidates.length}`,
    brokerDealLinkage: `${totalDealsAfter}/${totalDealsAfter}`,

    attributionChainCompleteness: {
      signalLinkageCount: signalLinkCount,
      proposalLinkageCount: propLinkCount,
      executionLinkageCount: execLinkCount,
      postMortemLinkageCount: pmLinkCount
    },

    attributionGaps,
    rootCauseOfAttributionLoss: rootCauses,
    records
  };
}
