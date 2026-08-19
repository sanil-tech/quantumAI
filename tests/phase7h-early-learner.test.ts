import { describe, it, expect, beforeEach } from 'vitest';
import { researchLearningEngine } from '../apps/decision-agent/src/services/researchLearningEngine';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { CurrencyPair, TradingSession } from '../src/types';

describe('QUANTUMAI ? Phase 7H: Early Learner Mode & Visible Learning Observability', () => {
  beforeEach(() => {
    researchLearningEngine.clearAll();
    controlledDemoExecutionService.clearRecords();
  });

  it('1. Campaign N != Setup N: Aggregate campaign count does NOT inflate setup-level evidence tier', () => {
    // Setup A has 2 observations
    researchLearningEngine.ingestCompletedObservation({
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      session: 'LONDON',
      outcome: 'WIN',
      closeReason: 'TAKE_PROFIT_1',
      realizedR: 1.5,
      mfePips: 30,
      maePips: 2,
      observationType: 'REAL_DEMO_EXECUTION'
    });
    researchLearningEngine.ingestCompletedObservation({
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      session: 'LONDON',
      outcome: 'WIN',
      closeReason: 'TAKE_PROFIT_2',
      realizedR: 2.5,
      mfePips: 50,
      maePips: 3,
      observationType: 'REAL_DEMO_EXECUTION'
    });

    // Setup B has 3 observations
    for (let i = 0; i < 3; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'GBP/USD',
        direction: 'SELL',
        setupType: 'LIQUIDITY_SWEEP',
        session: 'NEW_YORK',
        outcome: 'WIN',
        closeReason: 'TAKE_PROFIT_1',
        realizedR: 1.2,
        mfePips: 25,
        maePips: 4,
        observationType: 'REAL_DEMO_EXECUTION'
      });
    }

    const campaignMetrics = researchLearningEngine.getCampaignSummaryMetrics();
    // Campaign aggregate total = 5 -> EARLY_OBSERVATION
    expect(campaignMetrics.closedTrades).toBe(5);
    expect(campaignMetrics.currentCampaignEvidenceTier).toBe('EARLY_OBSERVATION');

    // BUT Setup A has only N=2 -> MUST REMAIN NO_EVIDENCE
    const setupA = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST')!;
    expect(setupA.totalObservations).toBe(2);
    expect(setupA.evidenceTier).toBe('NO_EVIDENCE');
    expect(setupA.learningWeight).toBe(0.0);

    // Setup B has only N=3 -> MUST REMAIN NO_EVIDENCE
    const setupB = researchLearningEngine.getSetupStats('GBP/USD_SELL_LIQUIDITY_SWEEP')!;
    expect(setupB.totalObservations).toBe(3);
    expect(setupB.evidenceTier).toBe('NO_EVIDENCE');
    expect(setupB.learningWeight).toBe(0.0);
  });

  it('2. Insufficient samples (N < 5) produce zero learning weight and zero unearned adaptation', () => {
    // 2 losses on EUR/USD_SELL_ORDER_BLOCK_RETEST
    for (let i = 0; i < 2; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'EUR/USD',
        direction: 'SELL',
        setupType: 'ORDER_BLOCK_RETEST',
        session: 'NEW_YORK',
        outcome: 'LOSS',
        closeReason: 'STOP_LOSS',
        realizedR: -1.0,
        mfePips: 5,
        maePips: 25,
        observationType: 'REAL_DEMO_EXECUTION'
      });
    }

    const stats = researchLearningEngine.getSetupStats('EUR/USD_SELL_ORDER_BLOCK_RETEST')!;
    expect(stats.totalObservations).toBe(2);
    expect(stats.evidenceTier).toBe('NO_EVIDENCE');
    expect(stats.learningWeight).toBe(0.0);
    expect(stats.recommendedSlMultiplier).toBe(1.0); // Baseline preserved
  });

  it('3. Crossing sample threshold (N >= 5) unlocks bounded adaptation (5% weight)', () => {
    // 5 observations on EUR/USD_SELL_ORDER_BLOCK_RETEST (2 Wins, 3 Losses)
    for (let i = 0; i < 2; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'EUR/USD',
        direction: 'SELL',
        setupType: 'ORDER_BLOCK_RETEST',
        session: 'NEW_YORK',
        outcome: 'WIN',
        closeReason: 'TAKE_PROFIT_1',
        realizedR: 1.2,
        mfePips: 30,
        maePips: 5,
        observationType: 'REAL_DEMO_EXECUTION'
      });
    }
    for (let i = 0; i < 3; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'EUR/USD',
        direction: 'SELL',
        setupType: 'ORDER_BLOCK_RETEST',
        session: 'NEW_YORK',
        outcome: 'LOSS',
        closeReason: 'STOP_LOSS',
        realizedR: -1.0,
        mfePips: 5,
        maePips: 25,
        observationType: 'REAL_DEMO_EXECUTION'
      });
    }

    const stats = researchLearningEngine.getSetupStats('EUR/USD_SELL_ORDER_BLOCK_RETEST')!;
    expect(stats.totalObservations).toBe(5);
    expect(stats.evidenceTier).toBe('EARLY_OBSERVATION');
    expect(stats.learningWeight).toBe(0.05); // 5% weight
    expect(stats.recommendedSlMultiplier).toBeGreaterThan(1.0);
    expect(stats.recommendedSlMultiplier).toBeLessThanOrEqual(1.20); // Bounded <= 1.20
  });

  it('4. Strict setup/pair/direction isolation: EUR/USD learning does not affect GBP/USD or BUY setups', () => {
    // Seed 5 losses on EUR/USD SELL
    for (let i = 0; i < 5; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'EUR/USD',
        direction: 'SELL',
        setupType: 'ORDER_BLOCK_RETEST',
        session: 'NEW_YORK',
        outcome: 'LOSS',
        closeReason: 'STOP_LOSS',
        realizedR: -1.0,
        mfePips: 2,
        maePips: 28,
        observationType: 'REAL_DEMO_EXECUTION'
      });
    }

    const eurSell = researchLearningEngine.getSetupStats('EUR/USD_SELL_ORDER_BLOCK_RETEST')!;
    expect(eurSell.totalObservations).toBe(5);
    expect(eurSell.evidenceTier).toBe('EARLY_OBSERVATION');

    // GBP/USD BUY must have zero stats
    const gbpBuy = researchLearningEngine.getSetupStats('GBP/USD_BUY_ORDER_BLOCK_RETEST');
    expect(gbpBuy).toBeUndefined();

    // EUR/USD BUY must have zero stats
    const eurBuy = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST');
    expect(eurBuy).toBeUndefined();
  });

  it('5. Historical snapshots and closed trades remain immutable', () => {
    const origObservation = {
      symbol: 'EUR/USD' as CurrencyPair,
      direction: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      session: 'LONDON' as TradingSession,
      outcome: 'WIN' as const,
      closeReason: 'TAKE_PROFIT_1' as const,
      realizedR: 1.5,
      mfePips: 30,
      maePips: 2,
      observationType: 'REAL_DEMO_EXECUTION' as const
    };

    const frozenSnapshot = Object.freeze({ ...origObservation });
    researchLearningEngine.ingestCompletedObservation(frozenSnapshot);

    const stats1 = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST')!;
    expect(stats1.totalObservations).toBe(1);
    expect(stats1.winCount).toBe(1);

    // Ingest another trade ? verify frozenSnapshot is unmodified
    researchLearningEngine.ingestCompletedObservation({
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      session: 'LONDON',
      outcome: 'LOSS',
      closeReason: 'STOP_LOSS',
      realizedR: -1.0,
      mfePips: 2,
      maePips: 25,
      observationType: 'REAL_DEMO_EXECUTION'
    });

    expect(frozenSnapshot.outcome).toBe('WIN');
    expect(frozenSnapshot.realizedR).toBe(1.5);
  });

  it('6. Counterfactual observations are segregated and NEVER counted as real DEMO trades', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      currentPrice: 1.2710,
      indicators: { rsi: 50, ema50: 1.2710, adx: { adx: 12 } }
    });

    const cf = researchLearningEngine.recordCounterfactual(opp, 'ADX < 20 Filtered', 'LONDON');
    expect(cf.observationType).toBe('COUNTERFACTUAL_OBSERVATION');
    expect(cf.hypotheticalOutcome).toBe('IN_PROGRESS');

    const metrics = researchLearningEngine.getCampaignSummaryMetrics();
    expect(metrics.totalDemoExecutions).toBe(0);
    expect(metrics.closedTrades).toBe(0);
    expect(metrics.counterfactualCount).toBe(1);

    // Resolve counterfactual
    const resolved = researchLearningEngine.resolveCounterfactualOutcome(cf.id, 1.2770, 1.2700);
    expect(resolved?.hypotheticalOutcome).toBe('WOULD_HAVE_WON_TP1');

    // Still must not increment real DEMO executions
    const metricsAfter = researchLearningEngine.getCampaignSummaryMetrics();
    expect(metricsAfter.totalDemoExecutions).toBe(0);
    expect(metricsAfter.closedTrades).toBe(0);
  });

  it('7. LIVE execution remains fail-closed FORBIDDEN under all circumstances', () => {
    const liveSafety = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });

    expect(liveSafety.allowed).toBe(false);
    expect(liveSafety.reason).toContain('LIVE');
  });

  it('8. DEMO execution remains disarmed by default', () => {
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const orderRes = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(orderRes.success).toBe(false);
    expect(orderRes.code).toBe('DEMO_DISARMED');
  });

  it('9. 0.01 LOT volume cap and single concurrent position limit are strictly enforced', () => {
    controlledDemoExecutionService.armDemoExecution();

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    // Attempt 0.02 LOT
    const rejectedLot = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.02, 1.0850);
    expect(rejectedLot.success).toBe(false);
    expect(rejectedLot.code).toBe('MAX_VOLUME_EXCEEDED');

    // Allow 0.01 LOT
    const validOrder = controlledDemoExecutionService.executeControlledDemoOrder(
      opp,
      0.01,
      1.0850,
      { brokerOrderId: 'ord-test-01', brokerPositionId: 'pos-test-01', executedPrice: 1.0850 }
    );
    expect(validOrder.success).toBe(true);

    // Attempt 2nd concurrent position -> must reject
    const secondOrder = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(secondOrder.success).toBe(false);
    expect(secondOrder.code).toBe('MAX_CONCURRENT_LIMIT_EXCEEDED');
  });

  it('10. Execution latencies and campaign-level metrics calculate truthfully', () => {
    researchLearningEngine.recordExecutionLatency(42);
    researchLearningEngine.recordExecutionLatency(58);

    const metrics = researchLearningEngine.getCampaignSummaryMetrics();
    expect(metrics.avgExecutionLatencyMs).toBe(49); // avg of [45, 52, 48, 50, 47, 42, 58]
  });

  it('11. Early Learner API payload returns complete visible audit trail', () => {
    researchLearningEngine.ingestCompletedObservation({
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      session: 'LONDON',
      outcome: 'WIN',
      closeReason: 'TAKE_PROFIT_1',
      realizedR: 1.5,
      mfePips: 30,
      maePips: 2,
      observationType: 'REAL_DEMO_EXECUTION'
    });

    const payload = researchLearningEngine.getEarlyLearnerPayload();
    expect(payload.mode).toBe('EARLY_LEARNER_MODE');
    expect(payload.safetyState.liveExecution).toBe('FORBIDDEN');
    expect(payload.safetyState.liveAccount).toBe('FORBIDDEN');
    expect(payload.safetyState.maxConcurrentDemoPositions).toBe(1);
    expect(payload.safetyState.demoMaxVolumeLot).toBe(0.01);
    expect(payload.campaignMetrics.totalDemoExecutions).toBe(1);
    expect(payload.setupLevelLearning.length).toBe(1);
    expect(payload.sessionLevelLearning.length).toBe(1);
    expect(payload.counterfactualObservations).toBeDefined();
    expect(payload.learningAdaptations).toBeDefined();
  });
});
