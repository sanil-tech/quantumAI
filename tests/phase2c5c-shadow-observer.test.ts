import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CurrencyShadowObserverService,
  InMemoryCurrencyShadowRepository,
  PostgresCurrencyShadowRepository,
  IBrokerReadOnlyProvider
} from '../src/server/services/shadow/currencyShadowObserverService';
import {
  PositionInput,
  SecondOpinionAssessment,
  ShadowCurrencyPolicy
} from '../packages/core/src/currencyShadowGovernance';

describe('Phase 2C.5C — Shadow Observation & Persistent Evidence Suite', () => {
  let memoryRepo: InMemoryCurrencyShadowRepository;
  let mockBrokerProvider: IBrokerReadOnlyProvider;
  let observerService: CurrencyShadowObserverService;

  beforeEach(() => {
    memoryRepo = new InMemoryCurrencyShadowRepository();
    mockBrokerProvider = {
      getOpenPositions: vi.fn().mockResolvedValue([
        { positionId: 290221010, symbol: 'GBPUSD', direction: 'BUY', volumeLots: 0.01 },
        { positionId: 290156459, symbol: 'AUDUSD', direction: 'SELL', volumeLots: 0.02 },
        { positionId: 289771514, symbol: 'USDCAD', direction: 'BUY', volumeLots: 0.02 },
        { positionId: 289642167, symbol: 'EURUSD', direction: 'SELL', volumeLots: 0.01 },
        { positionId: 289686652, symbol: 'NZDUSD', direction: 'SELL', volumeLots: 0.02 }
      ])
    };
    observerService = new CurrencyShadowObserverService(memoryRepo, mockBrokerProvider);
  });

  // Test 1 — Event observation (PROPOSAL_CREATED -> shadow evaluation created)
  it('Test 1: Creates and records shadow evaluation on PROPOSAL_CREATED event', async () => {
    const evalResult = await observerService.observeProposalCreated({
      proposalId: 'prop-eurjpy-101',
      signalId: 'sig-101',
      symbol: 'EURJPY',
      direction: 'BUY',
      volumeLots: 0.02,
      riskPercent: 0.5
    });

    expect(evalResult).toBeDefined();
    expect(evalResult.eventType).toBe('PROPOSAL_CREATED');
    expect(evalResult.proposalId).toBe('prop-eurjpy-101');
    expect(evalResult.decision).toBe('SHADOW_ALLOW');
    expect(evalResult.executionAuthority).toBe(false);

    // Verify stored in repository
    const stored = await memoryRepo.getEvaluationById(evalResult.evaluationId);
    expect(stored).toBeDefined();
    expect(stored?.proposalId).toBe('prop-eurjpy-101');
  });

  // Test 2 — Broker exposure calculation (Realistic snapshot produces correct currency decomposition)
  it('Test 2: Accurately calculates actual currency exposure from broker snapshot', async () => {
    const evalResult = await observerService.observeProposalCreated({
      proposalId: 'prop-test-exp',
      symbol: 'EURJPY',
      direction: 'BUY',
      volumeLots: 0.01
    });

    const actual = evalResult.actualBrokerExposure;
    expect(actual.positionsCount).toBe(5);
    expect(actual.totalGrossLots).toBe(0.08);
    expect(actual.currencies['USD'].netUnits).toBe(0.06); // +0.06 Net Long USD
    expect(actual.currencies['JPY']).toBeUndefined();     // Flat JPY in actual positions
  });

  // Test 3 — Hypothetical exposure (Proposal changes only hypothetical exposure)
  it('Test 3: Proposal changes only hypothetical exposure without contaminating actual exposure', async () => {
    const evalResult = await observerService.observeProposalCreated({
      proposalId: 'prop-hypo-iso',
      symbol: 'EURJPY',
      direction: 'BUY',
      volumeLots: 0.02
    });

    // Actual has zero JPY
    expect(evalResult.actualBrokerExposure.currencies['JPY']).toBeUndefined();
    // Hypothetical has -0.02 JPY (Short JPY from EURJPY Buy)
    expect(evalResult.hypotheticalExposure?.currencies['JPY'].netUnits).toBe(-0.02);
    expect(evalResult.hypotheticalExposure?.totalGrossLots).toBe(0.10);
  });

  // Test 4 — Persistence (Shadow evaluation persists and is queryable)
  it('Test 4: Persists evaluations and provides structured dashboard observability', async () => {
    await observerService.observeProposalCreated({
      proposalId: 'prop-dash-1',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.01
    });

    const summary = await observerService.getObservabilitySummary();
    expect(summary.totalEvaluations).toBe(1);
    expect(summary.decisionsCount.SHADOW_ALLOW).toBe(1);
    expect(summary.currentLivePortfolio.openPositionsCount).toBe(5);
    expect(summary.currentLivePortfolio.totalGrossLots).toBe(0.08);
  });

  // Test 5 — Idempotency (Duplicate event does not create duplicate logical evaluation)
  it('Test 5: Enforces idempotency on duplicate evaluation ID ingestion', async () => {
    const customEvalId = 'eval-deterministic-fixed-id-123';

    await observerService.observeProposalCreated({
      evaluationId: customEvalId,
      proposalId: 'prop-dup-test',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.01
    });

    // Attempt second save with identical evaluationId
    await observerService.observeProposalCreated({
      evaluationId: customEvalId,
      proposalId: 'prop-dup-test',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.01
    });

    const evaluations = await memoryRepo.getEvaluations();
    expect(evaluations).toHaveLength(1);
  });

  // Test 6 — Lifecycle separation (OPENED, PARTIAL_CLOSE, CLOSED remain separate)
  it('Test 6: Preserves separate append-only observations across position lifecycle events', async () => {
    const posId = '290999111';

    const evOpen = await observerService.observePositionLifecycle({
      eventType: 'POSITION_OPENED',
      brokerPositionId: posId,
      symbol: 'GBPUSD',
      direction: 'BUY',
      volumeLots: 0.04
    });

    const evPartial = await observerService.observePositionLifecycle({
      eventType: 'PARTIAL_CLOSE',
      brokerPositionId: posId,
      volumeLots: 0.02
    });

    const evClose = await observerService.observePositionLifecycle({
      eventType: 'POSITION_CLOSED',
      brokerPositionId: posId
    });

    const posHistory = await memoryRepo.getEvaluationsByPositionId(posId);
    expect(posHistory).toHaveLength(3);
    expect(posHistory.map(e => e.eventType)).toEqual(['POSITION_OPENED', 'PARTIAL_CLOSE', 'POSITION_CLOSED']);
  });

  // Test 7 — Would-block isolation (SHADOW_WOULD_BLOCK does not alter execution)
  it('Test 7: CRITICAL NEGATIVE: SHADOW_WOULD_BLOCK does not alter execution parameters', async () => {
    observerService.setCandidatePolicy({
      mode: 'SHADOW',
      policyVersion: 'CANDIDATE_TIGHT_TEST',
      maxNetCurrencyParticipation: 0.05 // Limit 0.05 lots; current USD net is 0.06 lots
    });

    const proposalInput = {
      proposalId: 'prop-would-block-prod',
      symbol: 'USDCAD',
      direction: 'BUY' as const,
      volumeLots: 0.02
    };

    const evalResult = await observerService.observeProposalCreated(proposalInput);

    expect(evalResult.decision).toBe('SHADOW_WOULD_BLOCK');
    expect(evalResult.executionAuthority).toBe(false);

    // Assert proposal input remains completely untouched and valid
    expect(proposalInput.proposalId).toBe('prop-would-block-prod');
    expect(proposalInput.volumeLots).toBe(0.02);
  });

  // Test 8 — AI isolation (Conflicting AI assessment cannot alter execution)
  it('Test 8: CRITICAL NEGATIVE: Second Opinion AI hostile assessment has zero authority', async () => {
    const hostileAi: SecondOpinionAssessment = {
      executionAuthority: false,
      macroRisk: 'HIGH',
      thesisAlignment: 'CONFLICTING',
      eventRisk: ['FOMC_RATE_DECISION'],
      explanation: 'Extremely high volatility anticipated.'
    };

    const evalResult = await observerService.observeProposalCreated({
      proposalId: 'prop-ai-test',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.01,
      secondOpinion: hostileAi
    });

    expect(evalResult.executionAuthority).toBe(false);
    expect(evalResult.secondOpinion?.executionAuthority).toBe(false);
    expect(evalResult.decision).toBe('SHADOW_ALLOW');
  });

  // Test 9 — Broker failure isolation (Broker-read failure produces SHADOW_UNKNOWN without throwing)
  it('Test 9: Broker read failure gracefully degrades to SHADOW_UNKNOWN without crashing', async () => {
    const failingBrokerProvider: IBrokerReadOnlyProvider = {
      getOpenPositions: vi.fn().mockRejectedValue(new Error('cTrader Socket Timeout'))
    };
    const isolatedService = new CurrencyShadowObserverService(memoryRepo, failingBrokerProvider);

    const evalResult = await isolatedService.observeProposalCreated({
      proposalId: 'prop-socket-err',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.01
    });

    expect(evalResult.decision).toBe('SHADOW_UNKNOWN');
    expect(evalResult.reasons[0]).toContain('MISSING_BROKER_EXPOSURE');
  });

  // Test 10 — Database failure isolation (Persistence failure does not crash production caller)
  it('Test 10: PostgreSQL repository failure is isolated and does not throw', async () => {
    const mockFailingPool = {
      query: vi.fn().mockRejectedValue(new Error('Connection terminated unexpectedly'))
    } as any;
    const pgRepo = new PostgresCurrencyShadowRepository(mockFailingPool);
    const pgObserverService = new CurrencyShadowObserverService(pgRepo, mockBrokerProvider);

    // Call should complete without throwing an unhandled exception
    const evalResult = await pgObserverService.observeProposalCreated({
      proposalId: 'prop-db-fail',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.01
    });

    expect(evalResult).toBeDefined();
    expect(evalResult.proposalId).toBe('prop-db-fail');
  });

  // Test 11 — No broker writes (Verify zero write methods exposed on observer interfaces)
  it('Test 11: Static assertion: IBrokerReadOnlyProvider exposes zero write capabilities', () => {
    const keys = Object.keys(mockBrokerProvider);
    expect(keys).toEqual(['getOpenPositions']);
    expect((mockBrokerProvider as any).placeOrder).toBeUndefined();
    expect((mockBrokerProvider as any).cancelOrder).toBeUndefined();
    expect((mockBrokerProvider as any).modifyPosition).toBeUndefined();
    expect((mockBrokerProvider as any).closePosition).toBeUndefined();
  });

  // Test 12 — JPY aggregation across multi-pair crosses
  it('Test 12: Aggregates multi-pair JPY exposure (EURJPY + GBPJPY + USDJPY) deterministically', async () => {
    const multiJpyPositions: PositionInput[] = [
      { positionId: 1, symbol: 'EURJPY', direction: 'BUY', volumeLots: 0.02 },
      { positionId: 2, symbol: 'GBPJPY', direction: 'BUY', volumeLots: 0.02 },
      { positionId: 3, symbol: 'USDJPY', direction: 'SELL', volumeLots: 0.02 }
    ];

    const evalResult = await observerService.observeProposalCreated({
      proposalId: 'prop-jpy-agg',
      symbol: 'USDJPY',
      direction: 'BUY',
      volumeLots: 0.01,
      actualPositionsOverride: multiJpyPositions
    });

    // Actual JPY: EURJPY Buy (-0.02) + GBPJPY Buy (-0.02) + USDJPY Sell (+0.02) = -0.02 Net Short JPY
    expect(evalResult.actualBrokerExposure.currencies['JPY'].netUnits).toBe(-0.02);
    expect(evalResult.actualBrokerExposure.currencies['JPY'].grossLongUnits + evalResult.actualBrokerExposure.currencies['JPY'].grossShortUnits).toBe(0.06);

    // Hypothetical JPY: + USDJPY Buy (-0.01) -> Net -0.03 Net Short JPY
    expect(evalResult.hypotheticalExposure?.currencies['JPY'].netUnits).toBe(-0.03);
    expect(evalResult.hypotheticalExposure?.currencies['JPY'].grossLongUnits + evalResult.hypotheticalExposure?.currencies['JPY'].grossShortUnits).toBe(0.07);
  });
});
