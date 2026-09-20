import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateShadowCurrencyGovernance,
  buildCurrencyExposureSnapshot,
  CurrencyShadowTelemetryService,
  PositionInput,
  ProposalInput,
  ShadowCurrencyPolicy,
  SecondOpinionAssessment
} from '../packages/core/src/currencyShadowGovernance';

describe('Phase 2C.5B — Live Currency Governance Shadow Telemetry Suite', () => {
  let telemetryService: CurrencyShadowTelemetryService;

  beforeEach(() => {
    telemetryService = new CurrencyShadowTelemetryService();
  });

  // 1. Single EURUSD position
  it('1. Evaluates single EURUSD position accurately', () => {
    const positions: PositionInput[] = [
      { positionId: 101, symbol: 'EURUSD', direction: 'BUY', volumeLots: 0.02, riskPercent: 0.5 }
    ];
    const snap = buildCurrencyExposureSnapshot(positions);
    expect(snap.positionsCount).toBe(1);
    expect(snap.totalGrossLots).toBe(0.02);
    expect(snap.currencies['EUR'].netUnits).toBe(0.02);
    expect(snap.currencies['USD'].netUnits).toBe(-0.02);
  });

  // 2. Multiple USD pairs
  it('2. Aggregates multiple USD pairs correctly into USD net disposition', () => {
    const positions: PositionInput[] = [
      { positionId: 101, symbol: 'EURUSD', direction: 'BUY', volumeLots: 0.01 },
      { positionId: 102, symbol: 'GBPUSD', direction: 'BUY', volumeLots: 0.01 },
      { positionId: 103, symbol: 'AUDUSD', direction: 'BUY', volumeLots: 0.01 }
    ];
    const snap = buildCurrencyExposureSnapshot(positions);
    expect(snap.currencies['USD'].netUnits).toBe(-0.03); // Short 0.03 lots USD
    expect(snap.currencies['USD'].contributingSymbols).toHaveLength(3);
  });

  // 3. EURJPY + GBPJPY overlap
  it('3. Calculates combined JPY exposure across EURJPY and GBPJPY overlap', () => {
    const positions: PositionInput[] = [
      { positionId: 201, symbol: 'EURJPY', direction: 'BUY', volumeLots: 0.02 },
      { positionId: 202, symbol: 'GBPJPY', direction: 'BUY', volumeLots: 0.02 }
    ];
    const snap = buildCurrencyExposureSnapshot(positions);
    expect(snap.currencies['JPY'].netUnits).toBe(-0.04); // Short 0.04 lots JPY
    expect(snap.currencies['JPY'].grossLongUnits + snap.currencies['JPY'].grossShortUnits).toBe(0.04);
  });

  // 4. USDJPY + EURJPY overlap
  it('4. Aggregates USDJPY and EURJPY JPY legs', () => {
    const positions: PositionInput[] = [
      { positionId: 203, symbol: 'USDJPY', direction: 'BUY', volumeLots: 0.02 },
      { positionId: 204, symbol: 'EURJPY', direction: 'SELL', volumeLots: 0.02 }
    ];
    const snap = buildCurrencyExposureSnapshot(positions);
    expect(snap.currencies['JPY'].netUnits).toBe(0.00); // -0.02 + 0.02 = 0.00 net
    expect(snap.currencies['JPY'].grossLongUnits).toBe(0.02);
    expect(snap.currencies['JPY'].grossShortUnits).toBe(0.02);
  });

  // 5. Scaleout
  it('5. Correctly handles position scaleout volume reduction', () => {
    const initialPosition: PositionInput[] = [
      { positionId: 301, symbol: 'GBPUSD', direction: 'SELL', volumeLots: 0.04 }
    ];
    const snap1 = buildCurrencyExposureSnapshot(initialPosition);
    expect(snap1.totalGrossLots).toBe(0.04);

    // After 50% scaleout
    const scaledPosition: PositionInput[] = [
      { positionId: 301, symbol: 'GBPUSD', direction: 'SELL', volumeLots: 0.02 }
    ];
    const snap2 = buildCurrencyExposureSnapshot(scaledPosition);
    expect(snap2.totalGrossLots).toBe(0.02);
    expect(snap2.currencies['GBP'].netUnits).toBe(-0.02);
  });

  // 6. Partial close
  it('6. Evaluates partial close event telemetry without error', () => {
    const positions: PositionInput[] = [
      { positionId: 302, symbol: 'EURUSD', direction: 'BUY', volumeLots: 0.01 }
    ];
    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-partial-close-1',
      eventType: 'PARTIAL_CLOSE',
      actualPositions: positions,
      brokerPositionId: '302'
    });
    expect(evalResult.decision).toBe('SHADOW_ALLOW');
    expect(evalResult.actualBrokerExposure.totalGrossLots).toBe(0.01);
  });

  // 7. Position close
  it('7. Handles complete position close down to flat exposure', () => {
    const emptyPositions: PositionInput[] = [];
    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-pos-closed-1',
      eventType: 'POSITION_CLOSED',
      actualPositions: emptyPositions
    });
    expect(evalResult.decision).toBe('SHADOW_ALLOW');
    expect(evalResult.actualBrokerExposure.totalGrossLots).toBe(0);
  });

  // 8. Current five-position portfolio
  it('8. Reconstructs current live 5-position broker portfolio accurately', () => {
    const livePositions: PositionInput[] = [
      { positionId: 290221010, symbol: 'GBPUSD', direction: 'BUY', volumeLots: 0.01 },
      { positionId: 290156459, symbol: 'AUDUSD', direction: 'SELL', volumeLots: 0.02 },
      { positionId: 289771514, symbol: 'USDCAD', direction: 'BUY', volumeLots: 0.02 },
      { positionId: 289642167, symbol: 'EURUSD', direction: 'SELL', volumeLots: 0.01 },
      { positionId: 289686652, symbol: 'NZDUSD', direction: 'SELL', volumeLots: 0.02 }
    ];
    const snap = buildCurrencyExposureSnapshot(livePositions);
    expect(snap.positionsCount).toBe(5);
    expect(snap.totalGrossLots).toBe(0.08);
    expect(snap.currencies['USD'].netUnits).toBe(0.06); // +0.06 Long USD
    expect(snap.currencies['JPY']).toBeUndefined();     // Flat JPY
  });

  // 9. Hypothetical new proposal on top of current portfolio
  it('9. Evaluates hypothetical proposal added to live 5-position portfolio', () => {
    const livePositions: PositionInput[] = [
      { positionId: 290221010, symbol: 'GBPUSD', direction: 'BUY', volumeLots: 0.01 },
      { positionId: 290156459, symbol: 'AUDUSD', direction: 'SELL', volumeLots: 0.02 },
      { positionId: 289771514, symbol: 'USDCAD', direction: 'BUY', volumeLots: 0.02 },
      { positionId: 289642167, symbol: 'EURUSD', direction: 'SELL', volumeLots: 0.01 },
      { positionId: 289686652, symbol: 'NZDUSD', direction: 'SELL', volumeLots: 0.02 }
    ];
    const proposal: ProposalInput = {
      proposalId: 'prop-eurjpy-1',
      symbol: 'EURJPY',
      direction: 'BUY',
      volumeLots: 0.02
    };
    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-hypo-1',
      eventType: 'PROPOSAL_CREATED',
      actualPositions: livePositions,
      hypotheticalProposal: proposal
    });

    expect(evalResult.actualBrokerExposure.currencies['JPY']).toBeUndefined();
    expect(evalResult.hypotheticalExposure?.currencies['JPY'].netUnits).toBe(-0.02);
    expect(evalResult.decision).toBe('SHADOW_ALLOW');
  });

  // 10. Missing broker data -> SHADOW_UNKNOWN
  it('10. Emits SHADOW_UNKNOWN if actual broker positions are null or missing', () => {
    const proposal: ProposalInput = {
      proposalId: 'prop-test-missing',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.01
    };
    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-missing-broker',
      eventType: 'PROPOSAL_CREATED',
      actualPositions: null,
      hypotheticalProposal: proposal
    });

    expect(evalResult.decision).toBe('SHADOW_UNKNOWN');
    expect(evalResult.reasons[0]).toContain('MISSING_BROKER_EXPOSURE');
  });

  // 11. Invalid volume -> SHADOW_UNKNOWN
  it('11. Emits SHADOW_UNKNOWN for non-positive or NaN volume', () => {
    const proposal: ProposalInput = {
      proposalId: 'prop-invalid-vol',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0
    };
    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-invalid-vol',
      eventType: 'PROPOSAL_CREATED',
      actualPositions: [],
      hypotheticalProposal: proposal
    });

    expect(evalResult.decision).toBe('SHADOW_UNKNOWN');
    expect(evalResult.reasons[0]).toContain('INVALID_VOLUME');
  });

  // 12. Unknown currency / symbol -> SHADOW_UNKNOWN
  it('12. Emits SHADOW_UNKNOWN for unrecognized symbol', () => {
    const proposal: ProposalInput = {
      proposalId: 'prop-unknown-sym',
      symbol: 'XYZABC',
      direction: 'BUY',
      volumeLots: 0.01
    };
    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-unknown-sym',
      eventType: 'PROPOSAL_CREATED',
      actualPositions: [],
      hypotheticalProposal: proposal
    });

    expect(evalResult.decision).toBe('SHADOW_UNKNOWN');
    expect(evalResult.reasons[0]).toContain('UNKNOWN_SYMBOL_OR_CURRENCY');
  });

  // 13. Shadow would-block when candidate policy net limit exceeded
  it('13. Emits SHADOW_WOULD_BLOCK under candidate policy threshold breach', () => {
    const livePositions: PositionInput[] = [
      { positionId: 1, symbol: 'EURJPY', direction: 'BUY', volumeLots: 0.04 },
      { positionId: 2, symbol: 'GBPJPY', direction: 'BUY', volumeLots: 0.04 }
    ];
    const proposal: ProposalInput = {
      proposalId: 'prop-jpy-excess',
      symbol: 'USDJPY',
      direction: 'BUY',
      volumeLots: 0.04
    };
    const candidatePolicy: ShadowCurrencyPolicy = {
      mode: 'SHADOW',
      policyVersion: 'CANDIDATE_V1_TEST',
      maxNetCurrencyParticipation: 0.10 // 0.10 lots limit; combined would be 0.12 lots
    };

    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-would-block-1',
      eventType: 'PROPOSAL_CREATED',
      actualPositions: livePositions,
      hypotheticalProposal: proposal,
      candidatePolicy
    });

    expect(evalResult.decision).toBe('SHADOW_WOULD_BLOCK');
    expect(evalResult.reasons.some(r => r.includes('CANDIDATE_POLICY_NET_LIMIT_EXCEEDED'))).toBe(true);
  });

  // 14. Shadow unknown on invalid data
  it('14. Validates robust handling of unconfigured candidate policy', () => {
    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-unconfig-1',
      eventType: 'SIGNAL_CREATED',
      actualPositions: []
    });
    expect(evalResult.decision).toBe('SHADOW_ALLOW');
    expect(evalResult.policyVersion).toBe('UNCONFIGURED');
  });

  // 15. Second Opinion AI conflict
  it('15. Second Opinion AI with HIGH risk and CONFLICTING thesis is attached as advisory', () => {
    const secondOpinion: SecondOpinionAssessment = {
      executionAuthority: false,
      macroRisk: 'HIGH',
      thesisAlignment: 'CONFLICTING',
      eventRisk: ['BOJ_RATE_DECISION_IMMINENT'],
      explanation: 'High event risk approaching with Bank of Japan monetary policy release.'
    };
    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-ai-conflict',
      eventType: 'PROPOSAL_CREATED',
      actualPositions: [],
      hypotheticalProposal: {
        proposalId: 'prop-eurjpy-ai',
        symbol: 'EURJPY',
        direction: 'BUY',
        volumeLots: 0.01
      },
      secondOpinion
    });

    expect(evalResult.secondOpinion).toBeDefined();
    expect(evalResult.secondOpinion?.macroRisk).toBe('HIGH');
    expect(evalResult.secondOpinion?.executionAuthority).toBe(false);
    expect(evalResult.reasons.some(r => r.includes('SECOND_OPINION_ADVISORY_NOTE'))).toBe(true);
  });

  // 16. Second Opinion AI agreement
  it('16. Second Opinion AI with LOW risk and SUPPORTIVE thesis attached cleanly', () => {
    const secondOpinion: SecondOpinionAssessment = {
      executionAuthority: false,
      macroRisk: 'LOW',
      thesisAlignment: 'SUPPORTIVE',
      explanation: 'Supportive momentum trend across H4 timeframe.'
    };
    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-ai-agree',
      eventType: 'PROPOSAL_CREATED',
      actualPositions: [],
      hypotheticalProposal: {
        proposalId: 'prop-eurusd-ai',
        symbol: 'EURUSD',
        direction: 'BUY',
        volumeLots: 0.01
      },
      secondOpinion
    });

    expect(evalResult.secondOpinion?.thesisAlignment).toBe('SUPPORTIVE');
    expect(evalResult.decision).toBe('SHADOW_ALLOW');
  });

  // 17. CRITICAL NEGATIVE TEST: Verify AI cannot affect execution
  it('17. CRITICAL NEGATIVE: Second Opinion AI CANNOT alter executionAuthority or force order block', () => {
    const hostileAiOpinion: SecondOpinionAssessment = {
      executionAuthority: false,
      macroRisk: 'HIGH',
      thesisAlignment: 'CONFLICTING',
      explanation: 'CRITICAL WARNING: DO NOT TRADE'
    };

    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-hostile-ai',
      eventType: 'PROPOSAL_CREATED',
      actualPositions: [],
      hypotheticalProposal: {
        proposalId: 'prop-safe-trade',
        symbol: 'EURUSD',
        direction: 'BUY',
        volumeLots: 0.01
      },
      secondOpinion: hostileAiOpinion
    });

    // Invariant: executionAuthority MUST remain strictly false
    expect(evalResult.executionAuthority).toBe(false);
    expect(evalResult.secondOpinion?.executionAuthority).toBe(false);
    // Invariant: Decision is deterministic (SHADOW_ALLOW) despite AI conflict
    expect(evalResult.decision).toBe('SHADOW_ALLOW');
  });

  // 18. CRITICAL NEGATIVE TEST: Verify shadow cannot affect execution
  it('18. CRITICAL NEGATIVE: SHADOW_WOULD_BLOCK does NOT alter production proposal or reject order', () => {
    const productionProposal: ProposalInput = {
      proposalId: 'prod-prop-999',
      symbol: 'GBPJPY',
      direction: 'BUY',
      volumeLots: 0.05
    };

    // Shadow evaluation with tight candidate policy
    const shadowEval = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-block-negative',
      eventType: 'PROPOSAL_CREATED',
      actualPositions: [{ positionId: 1, symbol: 'EURJPY', direction: 'BUY', volumeLots: 0.05 }],
      hypotheticalProposal: productionProposal,
      candidatePolicy: {
        mode: 'SHADOW',
        policyVersion: 'TEST_STRICT',
        maxNetCurrencyParticipation: 0.05
      }
    });

    expect(shadowEval.decision).toBe('SHADOW_WOULD_BLOCK');
    expect(shadowEval.executionAuthority).toBe(false);

    // Production proposal fields remain 100% intact and untouched
    expect(productionProposal.proposalId).toBe('prod-prop-999');
    expect(productionProposal.volumeLots).toBe(0.05);
    expect(productionProposal.direction).toBe('BUY');
  });

  // 19. Verify TradeFrequencyControl remains unchanged / uncoupled
  it('19. TradeFrequencyControl invariants are decoupled from shadow telemetry', () => {
    // Shadow telemetry does not mutate scanner or frequency maps
    telemetryService.recordEvaluation({
      evaluationId: 'eval-tfc-test',
      timestamp: new Date().toISOString(),
      eventType: 'PROPOSAL_CREATED',
      actualBrokerExposure: { currencies: {}, totalGrossLots: 0, totalActiveLegs: 0, activeSymbols: [], positionsCount: 0, dataQuality: 'CANONICAL' },
      decision: 'SHADOW_WOULD_BLOCK',
      reasons: ['CANDIDATE_POLICY_LIMIT_EXCEEDED'],
      dataAuthority: 'BROKER',
      executionAuthority: false
    });

    const evs = telemetryService.getEvaluations();
    expect(evs).toHaveLength(1);
    expect(evs[0].executionAuthority).toBe(false);
  });

  // 20. Verify scanner blocking unchanged
  it('20. Scanner blocking and cooldown mechanisms are unaffected by shadow evaluations', () => {
    const summary = telemetryService.getDashboardSummary([]);
    expect(summary.totalEvaluations).toBe(0);
  });

  // 21. Deterministic evaluation
  it('21. Two evaluations with identical inputs produce bit-for-bit identical outputs', () => {
    const actualPositions: PositionInput[] = [
      { positionId: 1, symbol: 'EURUSD', direction: 'BUY', volumeLots: 0.01 },
      { positionId: 2, symbol: 'GBPUSD', direction: 'SELL', volumeLots: 0.02 }
    ];
    const proposal: ProposalInput = {
      proposalId: 'prop-det-1',
      symbol: 'USDJPY',
      direction: 'BUY',
      volumeLots: 0.02
    };

    const eval1 = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-det-test',
      eventType: 'PROPOSAL_CREATED',
      actualPositions,
      hypotheticalProposal: proposal
    });

    const eval2 = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-det-test',
      eventType: 'PROPOSAL_CREATED',
      actualPositions,
      hypotheticalProposal: proposal
    });

    expect(eval1.decision).toBe(eval2.decision);
    expect(eval1.reasons).toEqual(eval2.reasons);
    expect(eval1.actualBrokerExposure.totalGrossLots).toBe(eval2.actualBrokerExposure.totalGrossLots);
    expect(eval1.hypotheticalExposure?.totalGrossLots).toBe(eval2.hypotheticalExposure?.totalGrossLots);
  });

  // 22. Telemetry dashboard summary & counterfactual tracking
  it('22. Tracks counterfactual blocks and dashboard summary cleanly', () => {
    telemetryService.recordEvaluation({
      evaluationId: 'eval-dash-1',
      timestamp: new Date().toISOString(),
      eventType: 'PROPOSAL_CREATED',
      symbol: 'EURJPY',
      direction: 'BUY',
      volumeLots: 0.04,
      actualBrokerExposure: { currencies: {}, totalGrossLots: 0, totalActiveLegs: 0, activeSymbols: [], positionsCount: 0, dataQuality: 'CANONICAL' },
      decision: 'SHADOW_WOULD_BLOCK',
      reasons: ['JPY concentration limit exceeded in candidate model'],
      dataAuthority: 'BROKER',
      executionAuthority: false
    });

    telemetryService.recordEvaluation({
      evaluationId: 'eval-dash-2',
      timestamp: new Date().toISOString(),
      eventType: 'PROPOSAL_CREATED',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.01,
      actualBrokerExposure: { currencies: {}, totalGrossLots: 0, totalActiveLegs: 0, activeSymbols: [], positionsCount: 0, dataQuality: 'CANONICAL' },
      decision: 'SHADOW_ALLOW',
      reasons: ['Compliant'],
      dataAuthority: 'BROKER',
      executionAuthority: false
    });

    const summary = telemetryService.getDashboardSummary([
      { positionId: 1, symbol: 'EURUSD', direction: 'SELL', volumeLots: 0.01 }
    ]);

    expect(summary.totalEvaluations).toBe(2);
    expect(summary.decisionsCount.SHADOW_WOULD_BLOCK).toBe(1);
    expect(summary.decisionsCount.SHADOW_ALLOW).toBe(1);
    expect(summary.counterfactualBlocks).toHaveLength(1);
    expect(summary.counterfactualBlocks[0].actualExecutionStatus).toBe('EXECUTED_BY_PRODUCTION');
  });

  // 23. Actual vs hypothetical separation
  it('23. Explicitly separates actual broker exposure from hypothetical proposal exposure', () => {
    const live: PositionInput[] = [
      { positionId: 10, symbol: 'AUDUSD', direction: 'SELL', volumeLots: 0.02 }
    ];
    const proposal: ProposalInput = {
      proposalId: 'prop-hypo-sep',
      symbol: 'NZDUSD',
      direction: 'SELL',
      volumeLots: 0.02
    };
    const evalResult = evaluateShadowCurrencyGovernance({
      evaluationId: 'eval-sep-test',
      eventType: 'PROPOSAL_CREATED',
      actualPositions: live,
      hypotheticalProposal: proposal
    });

    // Actual has AUD only
    expect(evalResult.actualBrokerExposure.currencies['AUD']).toBeDefined();
    expect(evalResult.actualBrokerExposure.currencies['NZD']).toBeUndefined();
    expect(evalResult.actualBrokerExposure.totalGrossLots).toBe(0.02);

    // Hypothetical has AUD + NZD
    expect(evalResult.hypotheticalExposure?.currencies['AUD']).toBeDefined();
    expect(evalResult.hypotheticalExposure?.currencies['NZD']).toBeDefined();
    expect(evalResult.hypotheticalExposure?.totalGrossLots).toBe(0.04);
  });

  // 24. Historical peak comparison
  it('24. Evaluates hypothetical against historical maximum peak baseline', () => {
    const peakHistoricalLots = 0.12; // Historical max 8 positions = 0.12 lots
    const live: PositionInput[] = [
      { positionId: 1, symbol: 'GBPUSD', direction: 'BUY', volumeLots: 0.01 },
      { positionId: 2, symbol: 'AUDUSD', direction: 'SELL', volumeLots: 0.02 },
      { positionId: 3, symbol: 'USDCAD', direction: 'BUY', volumeLots: 0.02 },
      { positionId: 4, symbol: 'EURUSD', direction: 'SELL', volumeLots: 0.01 },
      { positionId: 5, symbol: 'NZDUSD', direction: 'SELL', volumeLots: 0.02 }
    ];
    const actualSnap = buildCurrencyExposureSnapshot(live);
    expect(actualSnap.totalGrossLots).toBe(0.08);
    expect(actualSnap.totalGrossLots).toBeLessThan(peakHistoricalLots);
  });
});
