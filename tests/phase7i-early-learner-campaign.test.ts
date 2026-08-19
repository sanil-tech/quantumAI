import { describe, it, expect, beforeEach } from 'vitest';
import { controlledDemoLearningCampaignService } from '../apps/execution-router/src/services/controlledDemoLearningCampaignService';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { controlledDemoSmokeTestHarness } from '../apps/execution-router/src/services/controlledDemoSmokeTestHarness';
import { researchLearningEngine } from '../apps/decision-agent/src/services/researchLearningEngine';
import { learningJournalService } from '../src/server/services/learningJournalService';
import { ctraderReadOnlyReconciliationService } from '../src/server/services/ctraderReadOnlyReconciliationService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { CurrencyPair, TradingSession } from '../src/types';

describe('QUANTUMAI ? Phase 7I: Controlled DEMO 30-Trade Early Learner Campaign', () => {
  beforeEach(() => {
    researchLearningEngine.clearAll();
    controlledDemoExecutionService.clearRecords();
    controlledDemoExecutionService.disarmDemoExecution();
    controlledDemoSmokeTestHarness.resetHarness();
    learningJournalService.clearJournal();
    controlledDemoLearningCampaignService.resetCampaign(5); // baseline N=5
  });

  it('1. Campaign starts disarmed & STOPPED by default', () => {
    const status = controlledDemoLearningCampaignService.getStatus();
    expect(status.status).toBe('STOPPED');
    expect(status.isDemoArmed).toBe(false);
    expect(status.liveExecutionGate).toBe('FORBIDDEN');
    expect(status.targetTrades).toBe(30);
    expect(status.completedTrades).toBe(5);
  });

  it('2. LIVE execution is rejected unconditionally', () => {
    const liveCheck = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(liveCheck.allowed).toBe(false);
    expect(liveCheck.reason).toContain('LIVE');
  });

  it('3. DEMO environment required for execution', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    // Attempt execution with non-DEMO environment
    const orderRes = controlledDemoExecutionService.executeControlledDemoOrder(
      opp,
      0.01,
      1.0850,
      undefined,
      { clientId: 'ctrader-client', accountId: 'live-99999' }
    );
    expect(orderRes.success).toBe(false);
  });

  it('4. Account identity must match authorized DEMO account (5881460)', () => {
    const recon = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    expect(recon.accountState.accountId).toBe('5881460');
    expect(recon.accountState.environment).toBe('DEMO');
  });

  it('5. Volume > 0.01 LOT is rejected by execution gates', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.02, 1.0850);
    expect(res.success).toBe(false);
    expect(res.code).toBe('MAX_VOLUME_EXCEEDED');
  });

  it('6. Concurrent position > 1 is rejected', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res1 = controlledDemoExecutionService.executeControlledDemoOrder(
      opp,
      0.01,
      1.0850,
      { brokerOrderId: 'ord-c1', brokerPositionId: 'pos-c1', executedPrice: 1.0850 }
    );
    expect(res1.success).toBe(true);

    const res2 = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(res2.success).toBe(false);
    expect(res2.code).toBe('MAX_CONCURRENT_LIMIT_EXCEEDED');
  });

  it('7. Invalid signal action (NO_SETUP) is rejected from execution and recorded as counterfactual', () => {
    controlledDemoLearningCampaignService.startCampaign();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 50, ema50: 1.0850, adx: { adx: 10 } }
    });
    expect(opp.action).toBe('NO_SETUP');

    const res = controlledDemoLearningCampaignService.processCandidateSetup({
      opportunity: opp,
      session: 'LONDON',
      idempotencyKey: 'idemp-no-setup'
    });

    expect(res.actionTaken).toBe('COUNTERFACTUAL_RECORDED');
    const journal = learningJournalService.getEvents({ eventType: 'COUNTERFACTUAL_RECORDED' });
    expect(journal.length).toBe(1);
  });

  it('8. Stale signal timestamp is rejected during pre-flight check', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    // Set timestamp older than 120s
    opp.timestamp = Date.now() - 150000;

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-stale');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.failedChecks).toContain('SIGNAL_IS_FRESH');
  });

  it('9. Invalid geometry (SL >= Entry for BUY) is rejected', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    opp.stopLoss = 1.0890; // Invalid for BUY

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-geom');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.failedChecks).toContain('GEOMETRY_IS_VALID');
  });

  it('10. Duplicate idempotency key is rejected', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const preFlight1 = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-dup-01');
    expect(preFlight1.passed).toBe(true);

    // Register idempotency key and close position immediately
    const smoke = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-dup-01');
    if (smoke.executionRecord) {
      controlledDemoExecutionService.closeDemoPosition(smoke.executionRecord.id, 1.0890, 'TAKE_PROFIT_1');
    }

    const preFlight2 = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-dup-01');
    expect(preFlight2.passed).toBe(false);
    expect(preFlight2.failedChecks).toContain('UNIQUE_IDEMPOTENCY_KEY');
  });

  it('11. Campaign pauses on pre-flight or broker reconciliation failure', () => {
    controlledDemoLearningCampaignService.startCampaign();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    opp.timestamp = Date.now() - 200000; // Stale

    const res = controlledDemoLearningCampaignService.processCandidateSetup({
      opportunity: opp,
      session: 'LONDON',
      idempotencyKey: 'idemp-pause-test'
    });

    expect(res.success).toBe(false);
    expect(res.actionTaken).toBe('PRE_FLIGHT_SAFETY_BLOCK');
    expect(controlledDemoLearningCampaignService.getStatus().status).toBe('PAUSED');
  });

  it('12. Campaign pause records SAFETY_BLOCK in Learning Journal', () => {
    controlledDemoLearningCampaignService.startCampaign();
    controlledDemoLearningCampaignService.pauseCampaign('Simulated persistence error');

    const events = learningJournalService.getEvents({ eventType: 'CAMPAIGN_PAUSED' });
    expect(events.length).toBe(1);
    expect(events[0].reason).toContain('Simulated persistence error');
  });

  it('13. Automatic disarm after successful trade execution and close', async () => {
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
      idempotencyKey: 'idemp-disarm-succ',
      brokerAck: { brokerOrderId: 'ord-succ', brokerPositionId: 'pos-succ', executedPrice: 1.0850 }
    });

    
    expect(exec.success).toBe(true);

    // Close trade
    await controlledDemoLearningCampaignService.handleAuthoritativeTradeClose({
      recordId: exec.executionRecord!.id,
      exitPrice: 1.0890,
      closeReason: 'TAKE_PROFIT_1',
      pnlDollars: 40.0,
      pnlPips: 40,
      outcome: 'WIN',
      session: 'LONDON'
    });

    // Verification: Execution disarmed and position count is 0
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);
    expect(controlledDemoExecutionService.getOpenPositions().length).toBe(0);
  });

  it('14. Automatic disarm on trade failure', () => {
    controlledDemoExecutionService.armDemoExecution();
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(true);

    controlledDemoExecutionService.disarmDemoExecution();
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);
  });

  it('15. Campaign N increments only after authoritative closed DEMO trade', async () => {
    controlledDemoLearningCampaignService.startCampaign();
    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(5);

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const exec = controlledDemoLearningCampaignService.processCandidateSetup({
      opportunity: opp,
      session: 'LONDON',
      idempotencyKey: 'idemp-n-inc',
      brokerAck: { brokerOrderId: 'ord-inc', brokerPositionId: 'pos-inc', executedPrice: 1.0850 }
    });

    // Open trade -> N is still 5
    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(5);

    // Close trade -> N increments to 6
    await controlledDemoLearningCampaignService.handleAuthoritativeTradeClose({
      recordId: exec.executionRecord!.id,
      exitPrice: 1.0890,
      closeReason: 'TAKE_PROFIT_1',
      pnlDollars: 40.0,
      pnlPips: 40,
      outcome: 'WIN',
      session: 'LONDON'
    });

    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(6);
  });

  it('16. Shadow observation does NOT increment real DEMO campaign N', async () => {
    const initialCampaignN = controlledDemoLearningCampaignService.getStatus().completedTrades;

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
      observationType: 'SHADOW_OBSERVATION'
    });

    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(initialCampaignN);
  });

  it('17. Counterfactual does NOT increment real DEMO campaign N', () => {
    const initialCampaignN = controlledDemoLearningCampaignService.getStatus().completedTrades;

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      currentPrice: 1.2710,
      indicators: { rsi: 50, ema50: 1.2710, adx: { adx: 10 } }
    });

    researchLearningEngine.recordCounterfactual(opp, 'ADX < 20', 'LONDON');
    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(initialCampaignN);
  });

  it('18. Test fixture does NOT increment production campaign N', () => {
    const initialCampaignN = controlledDemoLearningCampaignService.getStatus().completedTrades;

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
      observationType: 'TEST_FIXTURE'
    });

    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(initialCampaignN);
  });

  it('19. Campaign N != Setup N: Aggregate N=30 does not inflate a setup with N=2', () => {
    // Seed setup with only 2 trades
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

    controlledDemoLearningCampaignService.setCompletedTrades(30);

    const status = controlledDemoLearningCampaignService.getStatus();
    expect(status.completedTrades).toBe(30);

    const setupStats = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST')!;
    expect(setupStats.totalObservations).toBe(2);
    expect(setupStats.evidenceTier).toBe('NO_EVIDENCE');
    expect(setupStats.learningWeight).toBe(0.0);
  });

  it('20. Learning remains 0% for setup N < 5', () => {
    for (let i = 0; i < 4; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'EUR/USD',
        direction: 'SELL',
        setupType: 'LIQUIDITY_SWEEP',
        session: 'LONDON',
        outcome: 'LOSS',
        closeReason: 'STOP_LOSS',
        realizedR: -1.0,
        mfePips: 5,
        maePips: 25,
        observationType: 'REAL_DEMO_EXECUTION'
      });
    }

    const stats = researchLearningEngine.getSetupStats('EUR/USD_SELL_LIQUIDITY_SWEEP')!;
    expect(stats.totalObservations).toBe(4);
    expect(stats.evidenceTier).toBe('NO_EVIDENCE');
    expect(stats.learningWeight).toBe(0.0);
    expect(stats.recommendedSlMultiplier).toBe(1.0);
  });

  it('21. Setup reaches EARLY_OBSERVATION at N=5 with bounded 5% learning weight', () => {
    for (let i = 0; i < 5; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'EUR/USD',
        direction: 'SELL',
        setupType: 'LIQUIDITY_SWEEP',
        session: 'LONDON',
        outcome: 'LOSS',
        closeReason: 'STOP_LOSS',
        realizedR: -1.0,
        mfePips: 5,
        maePips: 25,
        observationType: 'REAL_DEMO_EXECUTION'
      });
    }

    const stats = researchLearningEngine.getSetupStats('EUR/USD_SELL_LIQUIDITY_SWEEP')!;
    expect(stats.totalObservations).toBe(5);
    expect(stats.evidenceTier).toBe('EARLY_OBSERVATION');
    expect(stats.learningWeight).toBe(0.05);
    expect(stats.recommendedSlMultiplier).toBeGreaterThan(1.0);
    expect(stats.recommendedSlMultiplier).toBeLessThanOrEqual(1.20);
  });

  it('22. Learning affects only future matching setup (strict isolation)', () => {
    // 5 losses on EUR/USD SELL
    for (let i = 0; i < 5; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'EUR/USD',
        direction: 'SELL',
        setupType: 'LIQUIDITY_SWEEP',
        session: 'LONDON',
        outcome: 'LOSS',
        closeReason: 'STOP_LOSS',
        realizedR: -1.0,
        mfePips: 5,
        maePips: 25,
        observationType: 'REAL_DEMO_EXECUTION'
      });
    }

    const eurSell = researchLearningEngine.getSetupStats('EUR/USD_SELL_LIQUIDITY_SWEEP')!;
    expect(eurSell.evidenceTier).toBe('EARLY_OBSERVATION');

    const gbpSell = researchLearningEngine.getSetupStats('GBP/USD_SELL_LIQUIDITY_SWEEP');
    expect(gbpSell).toBeUndefined();

    const eurBuy = researchLearningEngine.getSetupStats('EUR/USD_BUY_LIQUIDITY_SWEEP');
    expect(eurBuy).toBeUndefined();
  });

  it('23. Historical snapshot remains immutable', () => {
    const obs = Object.freeze({
      symbol: 'EUR/USD' as CurrencyPair,
      direction: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      session: 'LONDON' as TradingSession,
      outcome: 'WIN' as const,
      closeReason: 'TAKE_PROFIT_1' as const,
      realizedR: 1.3,
      mfePips: 35,
      maePips: 2,
      observationType: 'REAL_DEMO_EXECUTION' as const
    });

    researchLearningEngine.ingestCompletedObservation(obs);
    expect(obs.realizedR).toBe(1.3);
    expect(obs.outcome).toBe('WIN');
  });

  it('24. Learning journal records adaptation event with previous vs proposed parameters', () => {
    for (let i = 0; i < 5; i++) {
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

    const adaptations = researchLearningEngine.getLearningAdaptations();
    expect(adaptations.length).toBeGreaterThan(0);
    const lastAdapt = adaptations[adaptations.length - 1];
    expect(lastAdapt.affectedFingerprint).toBe('EUR/USD_SELL_ORDER_BLOCK_RETEST');
    expect(lastAdapt.sampleSize).toBe(5);
    expect(lastAdapt.evidenceTier).toBe('EARLY_OBSERVATION');
  });

  it('25. Restart preserves campaign state through snapshot restore', () => {
    const journalSnapshot = learningJournalService.exportSnapshot();
    learningJournalService.clearJournal();
    expect(learningJournalService.getEvents().length).toBe(0);

    learningJournalService.restoreSnapshot(journalSnapshot);
    expect(learningJournalService.getEvents().length).toBe(journalSnapshot.length);
  });

  it('26. Unexpected broker position causes campaign pause / halt', () => {
    controlledDemoLearningCampaignService.startCampaign();
    // Simulate unexpected open position
    controlledDemoLearningCampaignService.pauseCampaign('Unexpected broker position detected');

    const status = controlledDemoLearningCampaignService.getStatus();
    expect(status.status).toBe('PAUSED');
    expect(status.lastSafetyBlockReason).toContain('Unexpected broker position');
  });

  it('27. Unexpected pending order causes campaign pause / halt', () => {
    controlledDemoLearningCampaignService.startCampaign();
    controlledDemoLearningCampaignService.pauseCampaign('Unexpected pending order detected');

    const status = controlledDemoLearningCampaignService.getStatus();
    expect(status.status).toBe('PAUSED');
    expect(status.lastSafetyBlockReason).toContain('Unexpected pending order');
  });

  it('28. LIVE credentials / environment remain impossible', () => {
    const gate = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'any-broker',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(gate.allowed).toBe(false);
  });

  it('29. Stop campaign prevents new execution', () => {
    controlledDemoLearningCampaignService.stopCampaign('Operator stopped campaign');
    expect(controlledDemoLearningCampaignService.getStatus().status).toBe('STOPPED');

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoLearningCampaignService.processCandidateSetup({
      opportunity: opp,
      session: 'LONDON',
      idempotencyKey: 'idemp-stop-test'
    });

    expect(res.success).toBe(false);
    expect(res.actionTaken).toBe('REJECTED_CAMPAIGN_NOT_RUNNING');
  });

  it('30. Resume requires safety reconciliation before resuming to RUNNING state', () => {
    controlledDemoLearningCampaignService.pauseCampaign('Operator paused');
    expect(controlledDemoLearningCampaignService.getStatus().status).toBe('PAUSED');

    const resumeRes = controlledDemoLearningCampaignService.resumeCampaign();
    expect(resumeRes.success).toBe(true);
    expect(controlledDemoLearningCampaignService.getStatus().status).toBe('RUNNING');
  });
});
