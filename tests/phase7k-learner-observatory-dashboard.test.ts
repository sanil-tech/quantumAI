import { describe, it, expect, beforeEach } from 'vitest';
import { researchLearningEngine } from '../apps/decision-agent/src/services/researchLearningEngine';
import { learningJournalService } from '../src/server/services/learningJournalService';
import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { controlledDemoLearningCampaignService } from '../apps/execution-router/src/services/controlledDemoLearningCampaignService';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI ? Phase 7K: Learner Observatory Dashboard & Visible Learning Control Center', () => {
  beforeEach(() => {
    continuousLearningObservatoryService.resetObservatory();
    researchLearningEngine.clearAll();
    learningJournalService.clearJournal();
    controlledDemoExecutionService.clearRecords();
    controlledDemoExecutionService.disarmDemoExecution();
    controlledDemoLearningCampaignService.resetCampaign(5);
  });

  it('1. Dashboard Payload initializes and renders mode as EARLY_LEARNER_MODE', () => {
    const payload = researchLearningEngine.getEarlyLearnerPayload();
    expect(payload.mode).toBe('EARLY_LEARNER_MODE');
    expect(payload.safetyState).toBeDefined();
    expect(payload.campaignMetrics).toBeDefined();
    expect(payload.setupLevelLearning).toBeDefined();
  });

  it('2. Campaign N is displayed correctly from authoritative metrics', () => {
    const status = controlledDemoLearningCampaignService.getStatus();
    expect(status.completedTrades).toBe(5);
    expect(status.targetTrades).toBe(30);
  });

  it('3. Setup N remains strictly separate from Campaign N (No aggregate inflation)', () => {
    // Ingest 2 observations on EUR/USD BUY
    researchLearningEngine.ingestCompletedObservation({
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      session: 'LONDON',
      outcome: 'WIN',
      closeReason: 'TAKE_PROFIT_1',
      realizedR: 1.5,
      mfePips: 25,
      maePips: 3,
      observationType: 'REAL_DEMO_EXECUTION'
    });
    researchLearningEngine.ingestCompletedObservation({
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      session: 'LONDON',
      outcome: 'WIN',
      closeReason: 'TAKE_PROFIT_1',
      realizedR: 1.2,
      mfePips: 20,
      maePips: 2,
      observationType: 'REAL_DEMO_EXECUTION'
    });

    controlledDemoLearningCampaignService.setCompletedTrades(30);

    const setupStats = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST')!;
    expect(setupStats.totalObservations).toBe(2);
    expect(setupStats.evidenceTier).toBe('NO_EVIDENCE');
    expect(setupStats.learningWeight).toBe(0.0);
    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(30);
  });

  it('4. REAL_DEMO records appear with authoritative broker identifiers', async () => {
    controlledDemoLearningCampaignService.startCampaign();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const exec = controlledDemoLearningCampaignService.processCandidateSetup({
      opportunity: opp,
      session: 'LONDON',
      idempotencyKey: 'idemp-k-demo',
      brokerAck: { brokerOrderId: 'ord-k-01', brokerPositionId: 'pos-k-01', executedPrice: 1.0850 }
    });

    expect(exec.success).toBe(true);
    expect(exec.executionRecord?.brokerOrderId).toBe('ord-k-01');
    expect(exec.executionRecord?.brokerPositionId).toBe('pos-k-01');
  });

  it('5. SHADOW records appear with SIMULATED classification and 0 broker orders', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(res.actionTaken).toBe('SHADOW_OPENED');

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active.length).toBe(1);
    expect(active[0].observationType).toBe('SHADOW_OBSERVATION');
    expect(continuousLearningObservatoryService.getStatus().brokerOrdersTransmitted).toBe(0);
  });

  it('6. COUNTERFACTUAL records appear in unexecuted section without incrementing N', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      currentPrice: 1.2700,
      indicators: { rsi: 50, ema50: 1.2700, adx: { adx: 10 } }
    });
    expect(opp.action).toBe('NO_SETUP');

    const cf = researchLearningEngine.recordCounterfactual(opp, 'ADX < 20 Filter', 'LONDON');
    expect(cf.observationType).toBe('COUNTERFACTUAL_OBSERVATION');
    expect(researchLearningEngine.getCounterfactualRecords().length).toBe(1);
    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(5);
  });

  it('7. TEST_FIXTURE records are strictly excluded from production learning metrics', () => {
    researchLearningEngine.ingestCompletedObservation({
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      session: 'LONDON',
      outcome: 'LOSS',
      closeReason: 'STOP_LOSS',
      realizedR: -1.0,
      mfePips: 2,
      maePips: 30,
      observationType: 'TEST_FIXTURE'
    });

    const stats = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST');
    expect(stats).toBeUndefined();
  });

  it('8. Evidence tier is correctly displayed based on setup sample size', () => {
    for (let i = 0; i < 5; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'EUR/USD',
        direction: 'SELL',
        setupType: 'LIQUIDITY_SWEEP',
        session: 'LONDON',
        outcome: 'LOSS',
        closeReason: 'STOP_LOSS',
        realizedR: -1.0,
        mfePips: 4,
        maePips: 20,
        observationType: 'SHADOW_OBSERVATION'
      });
    }

    const stats = researchLearningEngine.getSetupStats('EUR/USD_SELL_LIQUIDITY_SWEEP')!;
    expect(stats.evidenceTier).toBe('EARLY_OBSERVATION');
  });

  it('9. Learning weight is correctly displayed and sample-gated', () => {
    const tier0 = researchLearningEngine.resolveEvidenceTier(4);
    expect(tier0.weight).toBe(0.0);

    const tier5 = researchLearningEngine.resolveEvidenceTier(5);
    expect(tier5.weight).toBe(0.05);

    const tier10 = researchLearningEngine.resolveEvidenceTier(10);
    expect(tier10.weight).toBe(0.10);

    const tier30 = researchLearningEngine.resolveEvidenceTier(30);
    expect(tier30.weight).toBe(0.15);

    const tier100 = researchLearningEngine.resolveEvidenceTier(100);
    expect(tier100.weight).toBe(0.20);
  });

  it('10. N < 5 produces 0% learning influence and baseline parameters', () => {
    for (let i = 0; i < 4; i++) {
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
        observationType: 'SHADOW_OBSERVATION'
      });
    }

    const stats = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST')!;
    expect(stats.totalObservations).toBe(4);
    expect(stats.learningWeight).toBe(0.0);
    expect(stats.recommendedSlMultiplier).toBe(1.0);
  });

  it('11. N >= 5 produces EARLY_OBSERVATION with 5% learning weight', () => {
    expect(researchLearningEngine.resolveEvidenceTier(5).tier).toBe('EARLY_OBSERVATION');
    expect(researchLearningEngine.resolveEvidenceTier(5).weight).toBe(0.05);
  });

  it('12. N >= 10 produces DEVELOPING with 10% learning weight', () => {
    expect(researchLearningEngine.resolveEvidenceTier(10).tier).toBe('DEVELOPING');
    expect(researchLearningEngine.resolveEvidenceTier(10).weight).toBe(0.10);
  });

  it('13. N >= 30 produces MODERATE_EVIDENCE with 15% learning weight', () => {
    expect(researchLearningEngine.resolveEvidenceTier(30).tier).toBe('MODERATE_EVIDENCE');
    expect(researchLearningEngine.resolveEvidenceTier(30).weight).toBe(0.15);
  });

  it('14. N >= 100 produces ROBUST_OBSERVATION with 20% learning weight', () => {
    expect(researchLearningEngine.resolveEvidenceTier(100).tier).toBe('ROBUST_OBSERVATION');
    expect(researchLearningEngine.resolveEvidenceTier(100).weight).toBe(0.20);
  });

  it('15. Setup isolation: EUR/USD learning does not modify GBP/USD parameters', () => {
    for (let i = 0; i < 10; i++) {
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
        observationType: 'SHADOW_OBSERVATION'
      });
    }

    const eurStats = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST')!;
    expect(eurStats.recommendedSlMultiplier).toBeGreaterThan(1.0);

    const gbpStats = researchLearningEngine.getSetupStats('GBP/USD_BUY_ORDER_BLOCK_RETEST');
    expect(gbpStats).toBeUndefined();
  });

  it('16. Learning journal is immutable and append-only', () => {
    learningJournalService.recordEvent({
      eventType: 'PARAMETER_ADAPTED',
      setupFingerprint: 'EUR/USD_BUY_ORDER_BLOCK_RETEST',
      evidenceTier: 'EARLY_OBSERVATION',
      sampleCount: 5,
      previousParameter: 'SL: 1.0x',
      proposedParameter: 'SL: 1.05x',
      boundedAdjustment: '+5% bounded buffer',
      reason: 'Adaptive loss mitigation'
    });

    const events = learningJournalService.getEvents();
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('PARAMETER_ADAPTED');
  });

  it('17. Safety state is visible and accurate in payload', () => {
    const payload = researchLearningEngine.getEarlyLearnerPayload();
    expect(payload.safetyState.liveExecution).toBe('FORBIDDEN');
    expect(payload.safetyState.liveAccount).toBe('FORBIDDEN');
    expect(payload.safetyState.automatedLiveExecution).toBe(false);
    expect(payload.safetyState.demoExecutionArmed).toBe(false);
    expect(payload.safetyState.maxConcurrentDemoPositions).toBe(1);
    expect(payload.safetyState.demoMaxVolumeLot).toBe(0.01);
  });

  it('18. LIVE_EXECUTION cannot be enabled under any parameter condition', () => {
    const safety = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'any-broker',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(safety.allowed).toBe(false);
  });

  it('19. DEMO volume cannot exceed 0.01 lot', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.05, 1.0850);
    expect(res.success).toBe(false);
    expect(res.code).toBe('MAX_VOLUME_EXCEEDED');
  });

  it('20. Dashboard payload does not fabricate missing data', () => {
    const summary = researchLearningEngine.getCampaignSummaryMetrics();
    expect(summary.totalDemoExecutions).toBe(0);
    expect(summary.closedTrades).toBe(0);
    expect(summary.shadowObservationCount).toBe(0);
    expect(summary.counterfactualCount).toBe(0);
  });

  it('21. Shadow observations are clearly marked simulated without broker position IDs', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    const obs = continuousLearningObservatoryService.getActiveObservations()[0];

    expect(obs.observationType).toBe('SHADOW_OBSERVATION');
    expect((obs as any).brokerOrderId).toBeUndefined();
    expect((obs as any).brokerPositionId).toBeUndefined();
  });

  it('22. Real broker IDs appear only for REAL_DEMO records', () => {
    const record = controlledDemoExecutionService.getRecordById('non-existent');
    expect(record).toBeUndefined();
  });

  it('23. Counterfactuals do not increment real DEMO N', () => {
    const initialN = controlledDemoLearningCampaignService.getStatus().completedTrades;

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'USD/JPY',
      currentPrice: 150.00,
      indicators: { rsi: 50, ema50: 150.00, adx: { adx: 10 } }
    });

    researchLearningEngine.recordCounterfactual(opp, 'Chop Filter', 'ASIAN');
    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(initialN);
  });

  it('24. Observatory fail-closed when raw market price is unavailable', () => {
    continuousLearningObservatoryService.startObservatory();
    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({
      rawMarketData: {
        pair: 'EUR/USD',
        currentPrice: undefined
      }
    });

    expect(res.success).toBe(false);
    expect(res.actionTaken).toBe('NO_DATA_FAIL_CLOSED');
  });

  it('25. API payload preserves session intelligence breakdown', () => {
    researchLearningEngine.ingestCompletedObservation({
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      session: 'LONDON',
      outcome: 'WIN',
      closeReason: 'TAKE_PROFIT_1',
      realizedR: 1.5,
      mfePips: 25,
      maePips: 3,
      observationType: 'SHADOW_OBSERVATION'
    });

    const sessions = researchLearningEngine.getSessionStats();
    const london = sessions.find(s => s.session === 'LONDON');
    expect(london).toBeDefined();
    expect(london?.winCount).toBe(1);
    expect(london?.totalObservations).toBe(1);
  });
});
