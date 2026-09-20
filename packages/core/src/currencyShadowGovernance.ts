import {
  decomposeFxSymbol,
  aggregateCurrencyFactors,
  CurrencyLeg,
  CurrencyAggregatedFactor,
  NormalizedCurrencyRisk
} from './currencyExposureNormalizer';

/**
 * Candidate policy configuration for shadow-mode observation.
 * Note: Values remain optional/candidate only — production threshold selection is deferred.
 */
export interface ShadowCurrencyPolicy {
  mode: 'DISABLED' | 'SHADOW' | 'ENFORCED';
  policyVersion: string;
  maxCurrencyRiskFactor?: number;          // e.g. 2.5%
  maxGrossCurrencyParticipation?: number;  // e.g. 0.15 lots
  maxNetCurrencyParticipation?: number;    // e.g. 0.08 lots
  maxConcurrentCurrencyPairs?: number;     // e.g. 3 pairs involving same currency
}

/**
 * Second Opinion AI advisory assessment.
 * CRITICAL: Second Opinion AI has ZERO execution authority.
 */
export interface SecondOpinionAssessment {
  readonly executionAuthority: false;
  macroRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  thesisAlignment: 'SUPPORTIVE' | 'CONFLICTING' | 'MIXED' | 'UNKNOWN';
  eventRisk?: string[];
  explanation: string;
}

/**
 * Currency exposure snapshot decomposing all active legs.
 */
export interface CurrencyExposureSnapshot {
  currencies: Record<string, CurrencyAggregatedFactor>;
  totalGrossLots: number;
  totalActiveLegs: number;
  activeSymbols: string[];
  positionsCount: number;
  dataQuality: 'CANONICAL' | 'DERIVED' | 'INCOMPLETE' | 'UNAVAILABLE';
}

/**
 * Deterministic shadow evaluation record.
 */
export interface CurrencyShadowEvaluation {
  evaluationId: string;
  timestamp: string;
  eventType:
    | 'SIGNAL_CREATED'
    | 'PROPOSAL_CREATED'
    | 'RISK_RESERVATION_CREATED'
    | 'ORDER_SUBMITTED'
    | 'ORDER_FILLED'
    | 'POSITION_OPENED'
    | 'PARTIAL_CLOSE'
    | 'POSITION_CLOSED';

  signalId?: string;
  proposalId?: string;
  executionSequenceId?: string;
  brokerPositionId?: string;

  symbol?: string;
  direction?: 'BUY' | 'SELL';
  volumeLots?: number;
  riskPercent?: number;

  actualBrokerExposure: CurrencyExposureSnapshot;
  hypotheticalExposure?: CurrencyExposureSnapshot;

  decision:
    | 'SHADOW_ALLOW'
    | 'SHADOW_WOULD_BLOCK'
    | 'SHADOW_REVIEW'
    | 'SHADOW_UNKNOWN';

  reasons: string[];
  policyVersion?: string;

  dataAuthority: 'BROKER' | 'POSTGRES' | 'INTERNAL' | 'MIXED';
  secondOpinion?: SecondOpinionAssessment;
  readonly executionAuthority: false;
}

export interface PositionInput {
  positionId: number | string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volumeLots: number;
  riskPercent?: number;
}

export interface ProposalInput {
  proposalId: string;
  signalId?: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volumeLots: number;
  riskPercent?: number;
}

/**
 * Builds a deterministic CurrencyExposureSnapshot from a list of positions.
 */
export function buildCurrencyExposureSnapshot(
  positions: PositionInput[],
  dataQuality: 'CANONICAL' | 'DERIVED' | 'INCOMPLETE' | 'UNAVAILABLE' = 'CANONICAL'
): CurrencyExposureSnapshot {
  if (!positions || positions.length === 0) {
    return {
      currencies: {},
      totalGrossLots: 0,
      totalActiveLegs: 0,
      activeSymbols: [],
      positionsCount: 0,
      dataQuality: 'CANONICAL'
    };
  }

  const legs: CurrencyLeg[] = [];
  const activeSymbols = new Set<string>();
  let totalGrossLots = 0;

  for (const pos of positions) {
    activeSymbols.add(pos.symbol);
    totalGrossLots += pos.volumeLots;
    const dec = decomposeFxSymbol(pos.symbol, pos.direction, pos.volumeLots, pos.riskPercent);
    if (dec.success && dec.baseLeg && dec.quoteLeg) {
      legs.push(dec.baseLeg, dec.quoteLeg);
    }
  }

  const agg = aggregateCurrencyFactors(legs);

  return {
    currencies: agg.currencies,
    totalGrossLots: Number(totalGrossLots.toFixed(4)),
    totalActiveLegs: legs.length,
    activeSymbols: Array.from(activeSymbols),
    positionsCount: positions.length,
    dataQuality
  };
}

/**
 * Pure deterministic shadow governance evaluator.
 * NEVER alters production execution; returns observational hypothetical decision only.
 */
export function evaluateShadowCurrencyGovernance(params: {
  evaluationId: string;
  eventType: CurrencyShadowEvaluation['eventType'];
  actualPositions: PositionInput[] | null;
  hypotheticalProposal?: ProposalInput;
  candidatePolicy?: ShadowCurrencyPolicy;
  secondOpinion?: SecondOpinionAssessment;
  signalId?: string;
  proposalId?: string;
  executionSequenceId?: string;
  brokerPositionId?: string;
  dataAuthority?: 'BROKER' | 'POSTGRES' | 'INTERNAL' | 'MIXED';
}): CurrencyShadowEvaluation {
  const timestamp = new Date().toISOString();
  const reasons: string[] = [];
  const dataAuthority = params.dataAuthority || 'BROKER';

  // 1. Validate Broker Exposure availability
  if (params.actualPositions === null || params.actualPositions === undefined) {
    return {
      evaluationId: params.evaluationId,
      timestamp,
      eventType: params.eventType,
      signalId: params.signalId,
      proposalId: params.proposalId,
      executionSequenceId: params.executionSequenceId,
      brokerPositionId: params.brokerPositionId,
      symbol: params.hypotheticalProposal?.symbol,
      direction: params.hypotheticalProposal?.direction,
      volumeLots: params.hypotheticalProposal?.volumeLots,
      riskPercent: params.hypotheticalProposal?.riskPercent,
      actualBrokerExposure: {
        currencies: {},
        totalGrossLots: 0,
        totalActiveLegs: 0,
        activeSymbols: [],
        positionsCount: 0,
        dataQuality: 'UNAVAILABLE'
      },
      decision: 'SHADOW_UNKNOWN',
      reasons: ['MISSING_BROKER_EXPOSURE: Authoritative broker position state was not provided.'],
      policyVersion: params.candidatePolicy?.policyVersion || 'UNCONFIGURED',
      dataAuthority,
      secondOpinion: params.secondOpinion ? { ...params.secondOpinion, executionAuthority: false } : undefined,
      executionAuthority: false
    };
  }

  // 2. Build actual broker exposure snapshot
  const actualExposure = buildCurrencyExposureSnapshot(params.actualPositions, 'CANONICAL');

  // If no hypothetical proposal is evaluated (e.g. position closed event), return snapshot allow
  if (!params.hypotheticalProposal) {
    return {
      evaluationId: params.evaluationId,
      timestamp,
      eventType: params.eventType,
      signalId: params.signalId,
      proposalId: params.proposalId,
      executionSequenceId: params.executionSequenceId,
      brokerPositionId: params.brokerPositionId,
      actualBrokerExposure: actualExposure,
      decision: 'SHADOW_ALLOW',
      reasons: ['STATE_SNAPSHOT_OBSERVATION: Telemetry recorded without pending proposal.'],
      policyVersion: params.candidatePolicy?.policyVersion || 'UNCONFIGURED',
      dataAuthority,
      secondOpinion: params.secondOpinion ? { ...params.secondOpinion, executionAuthority: false } : undefined,
      executionAuthority: false
    };
  }

  const prop = params.hypotheticalProposal;

  // 3. Validate proposal inputs
  if (prop.volumeLots <= 0 || isNaN(prop.volumeLots)) {
    return {
      evaluationId: params.evaluationId,
      timestamp,
      eventType: params.eventType,
      signalId: prop.signalId || params.signalId,
      proposalId: prop.proposalId || params.proposalId,
      symbol: prop.symbol,
      direction: prop.direction,
      volumeLots: prop.volumeLots,
      riskPercent: prop.riskPercent,
      actualBrokerExposure: actualExposure,
      decision: 'SHADOW_UNKNOWN',
      reasons: [`INVALID_VOLUME: Proposed volume (${prop.volumeLots}) must be greater than zero.`],
      policyVersion: params.candidatePolicy?.policyVersion || 'UNCONFIGURED',
      dataAuthority,
      secondOpinion: params.secondOpinion ? { ...params.secondOpinion, executionAuthority: false } : undefined,
      executionAuthority: false
    };
  }

  const propDec = decomposeFxSymbol(prop.symbol, prop.direction, prop.volumeLots, prop.riskPercent);
  if (!propDec.success || !propDec.baseLeg || !propDec.quoteLeg) {
    return {
      evaluationId: params.evaluationId,
      timestamp,
      eventType: params.eventType,
      signalId: prop.signalId || params.signalId,
      proposalId: prop.proposalId || params.proposalId,
      symbol: prop.symbol,
      direction: prop.direction,
      volumeLots: prop.volumeLots,
      riskPercent: prop.riskPercent,
      actualBrokerExposure: actualExposure,
      decision: 'SHADOW_UNKNOWN',
      reasons: [`UNKNOWN_SYMBOL_OR_CURRENCY: Failed to decompose symbol ${prop.symbol}.`],
      policyVersion: params.candidatePolicy?.policyVersion || 'UNCONFIGURED',
      dataAuthority,
      secondOpinion: params.secondOpinion ? { ...params.secondOpinion, executionAuthority: false } : undefined,
      executionAuthority: false
    };
  }

  // 4. Build hypothetical combined portfolio snapshot
  const combinedPositions: PositionInput[] = [
    ...params.actualPositions,
    {
      positionId: `hypothetical-${prop.proposalId}`,
      symbol: prop.symbol,
      direction: prop.direction,
      volumeLots: prop.volumeLots,
      riskPercent: prop.riskPercent
    }
  ];

  const hypotheticalExposure = buildCurrencyExposureSnapshot(combinedPositions, 'DERIVED');

  // 5. Evaluate Candidate Policy (Observational only)
  let decision: CurrencyShadowEvaluation['decision'] = 'SHADOW_ALLOW';
  const policy = params.candidatePolicy;

  if (policy && policy.mode !== 'DISABLED') {
    // Check maxNetCurrencyParticipation
    if (policy.maxNetCurrencyParticipation !== undefined) {
      for (const [curr, factor] of Object.entries(hypotheticalExposure.currencies)) {
        if (Math.abs(factor.netUnits) > policy.maxNetCurrencyParticipation) {
          decision = 'SHADOW_WOULD_BLOCK';
          reasons.push(
            `CANDIDATE_POLICY_NET_LIMIT_EXCEEDED: Currency ${curr} hypothetical net participation (${factor.netUnits.toFixed(4)} lots) exceeds policy limit (${policy.maxNetCurrencyParticipation.toFixed(4)} lots).`
          );
        }
      }
    }

    // Check maxGrossCurrencyParticipation
    if (policy.maxGrossCurrencyParticipation !== undefined) {
      for (const [curr, factor] of Object.entries(hypotheticalExposure.currencies)) {
        const gross = factor.grossLongUnits + factor.grossShortUnits;
        if (gross > policy.maxGrossCurrencyParticipation) {
          decision = 'SHADOW_WOULD_BLOCK';
          reasons.push(
            `CANDIDATE_POLICY_GROSS_LIMIT_EXCEEDED: Currency ${curr} hypothetical gross participation (${gross.toFixed(4)} lots) exceeds policy limit (${policy.maxGrossCurrencyParticipation.toFixed(4)} lots).`
          );
        }
      }
    }

    // Check maxCurrencyRiskFactor
    if (policy.maxCurrencyRiskFactor !== undefined) {
      for (const [curr, factor] of Object.entries(hypotheticalExposure.currencies)) {
        if (factor.grossExposureRiskPercent > policy.maxCurrencyRiskFactor) {
          decision = 'SHADOW_WOULD_BLOCK';
          reasons.push(
            `CANDIDATE_POLICY_RISK_FACTOR_EXCEEDED: Currency ${curr} hypothetical risk factor (${factor.grossExposureRiskPercent.toFixed(2)}%) exceeds policy limit (${policy.maxCurrencyRiskFactor.toFixed(2)}%).`
          );
        }
      }
    }

    // Check maxConcurrentCurrencyPairs
    if (policy.maxConcurrentCurrencyPairs !== undefined) {
      for (const [curr, factor] of Object.entries(hypotheticalExposure.currencies)) {
        if (factor.contributingSymbols.length > policy.maxConcurrentCurrencyPairs) {
          decision = 'SHADOW_WOULD_BLOCK';
          reasons.push(
            `CANDIDATE_POLICY_PAIR_CONCURRENCY_EXCEEDED: Currency ${curr} would have ${factor.contributingSymbols.length} concurrent active pairs, exceeding policy limit (${policy.maxConcurrentCurrencyPairs}).`
          );
        }
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push('HYPOTHETICAL_COMPLIANT: Proposed trade satisfies all candidate currency governance constraints.');
  }

  // 6. Record Second Opinion AI advisory context (Non-authoritative)
  let recordedSecondOpinion: SecondOpinionAssessment | undefined = undefined;
  if (params.secondOpinion) {
    recordedSecondOpinion = {
      executionAuthority: false,
      macroRisk: params.secondOpinion.macroRisk,
      thesisAlignment: params.secondOpinion.thesisAlignment,
      eventRisk: params.secondOpinion.eventRisk,
      explanation: params.secondOpinion.explanation
    };
    if (params.secondOpinion.macroRisk === 'HIGH' || params.secondOpinion.thesisAlignment === 'CONFLICTING') {
      reasons.push(
        `SECOND_OPINION_ADVISORY_NOTE: AI indicated ${params.secondOpinion.macroRisk} macro risk and ${params.secondOpinion.thesisAlignment} thesis alignment. (Zero execution authority).`
      );
    }
  }

  return {
    evaluationId: params.evaluationId,
    timestamp,
    eventType: params.eventType,
    signalId: prop.signalId || params.signalId,
    proposalId: prop.proposalId || params.proposalId,
    symbol: prop.symbol,
    direction: prop.direction,
    volumeLots: prop.volumeLots,
    riskPercent: prop.riskPercent,
    actualBrokerExposure: actualExposure,
    hypotheticalExposure,
    decision,
    reasons,
    policyVersion: policy?.policyVersion || 'UNCONFIGURED',
    dataAuthority,
    secondOpinion: recordedSecondOpinion,
    executionAuthority: false
  };
}

/**
 * Dashboard summary representation for read-only observability.
 */
export interface ShadowTelemetryDashboardSummary {
  totalEvaluations: number;
  decisionsCount: {
    SHADOW_ALLOW: number;
    SHADOW_WOULD_BLOCK: number;
    SHADOW_REVIEW: number;
    SHADOW_UNKNOWN: number;
  };
  currentLivePortfolio: {
    openPositionsCount: number;
    totalGrossLots: number;
    netCurrencyDispositions: Record<string, number>;
  };
  counterfactualBlocks: Array<{
    evaluationId: string;
    timestamp: string;
    proposedSymbol: string;
    proposedDirection: 'BUY' | 'SELL';
    proposedVolumeLots: number;
    conflictingReasons: string[];
    actualExecutionStatus: 'EXECUTED_BY_PRODUCTION' | 'UNKNOWN';
  }>;
}

/**
 * In-memory / circular buffer telemetry service for recording shadow evaluations.
 */
export class CurrencyShadowTelemetryService {
  private evaluations: CurrencyShadowEvaluation[] = [];
  private readonly maxBufferSize = 5000;

  public recordEvaluation(evaluation: CurrencyShadowEvaluation): void {
    if (this.evaluations.length >= this.maxBufferSize) {
      this.evaluations.shift();
    }
    this.evaluations.push(evaluation);
  }

  public getEvaluations(): CurrencyShadowEvaluation[] {
    return [...this.evaluations];
  }

  public clear(): void {
    this.evaluations = [];
  }

  public getDashboardSummary(currentActualPositions: PositionInput[] = []): ShadowTelemetryDashboardSummary {
    const currentSnap = buildCurrencyExposureSnapshot(currentActualPositions);
    const netMap: Record<string, number> = {};
    for (const [c, f] of Object.entries(currentSnap.currencies)) {
      netMap[c] = Number(f.netUnits.toFixed(4));
    }

    const counts = {
      SHADOW_ALLOW: 0,
      SHADOW_WOULD_BLOCK: 0,
      SHADOW_REVIEW: 0,
      SHADOW_UNKNOWN: 0
    };

    const counterfactuals: ShadowTelemetryDashboardSummary['counterfactualBlocks'] = [];

    for (const ev of this.evaluations) {
      counts[ev.decision]++;
      if (ev.decision === 'SHADOW_WOULD_BLOCK') {
        counterfactuals.push({
          evaluationId: ev.evaluationId,
          timestamp: ev.timestamp,
          proposedSymbol: ev.symbol || 'UNKNOWN',
          proposedDirection: ev.direction || 'BUY',
          proposedVolumeLots: ev.volumeLots || 0,
          conflictingReasons: ev.reasons,
          actualExecutionStatus: 'EXECUTED_BY_PRODUCTION'
        });
      }
    }

    return {
      totalEvaluations: this.evaluations.length,
      decisionsCount: counts,
      currentLivePortfolio: {
        openPositionsCount: currentActualPositions.length,
        totalGrossLots: currentSnap.totalGrossLots,
        netCurrencyDispositions: netMap
      },
      counterfactualBlocks: counterfactuals
    };
  }
}
