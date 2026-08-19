import { describe, it, expect, beforeEach } from 'vitest';
import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { researchLearningEngine } from '../apps/decision-agent/src/services/researchLearningEngine';
import { learningJournalService } from '../src/server/services/learningJournalService';
import { controlledDemoLearningCampaignService } from '../apps/execution-router/src/services/controlledDemoLearningCampaignService';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { CurrencyPair, TradingSession } from '../src/types';

describe('QUANTUMAI ? Phase 7J: Continuous Learning Observatory', () => {
  beforeEach(() => {
    continuousLearningObservatoryService.resetObservatory();
    researchLearningEngine.clearAll();
    learningJournalService.clearJournal();
    controlledDemoExecutionService.clearRecords();
    controlledDemoExecutionService.disarmDemoExecution();
    controlledDemoLearningCampaignService.resetCampaign(5);
  });

  it('1. Observatory starts in STOPPED state and starts with 0 broker orders', () => {
    const status = continuousLearningObservatoryService.getStatus();
    expect(status.state).toBe('STOPPED');
    expect(status.isDemoArmed).toBe(false);
    expect(status.brokerOrdersTransmitted).toBe(0);
    expect(status.liveExecutionGate).toBe('FORBIDDEN');

    const startRes = continuousLearningObservatoryService.startObservatory();
    expect(startRes.success).toBe(true);
    expect(startRes.state).toBe('OBSERVING');
  });

  it('2. LIVE execution is unconditionally forbidden during observatory operations', () => {
    const check = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(check.allowed).toBe(false);
  });

  it('3. DEMO execution remains disarmed by default in Observatory mode', () => {
    continuousLearningObservatoryService.startObservatory();
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);
    expect(controlledDemoExecutionService.getOpenPositions().length).toBe(0);
  });

  it('4. Fails closed with NO_DATA if market data is invalid or missing', () => {
    continuousLearningObservatoryService.startObservatory();
    const evalRes = continuousLearningObservatoryService.evaluateMarketOpportunity({
      rawMarketData: {
        pair: 'EUR/USD',
        currentPrice: undefined // missing
      }
    });

    expect(evalRes.success).toBe(false);
    expect(evalRes.actionTaken).toBe('NO_DATA_FAIL_CLOSED');
  });

  it('5. NO_SETUP action is recorded as COUNTERFACTUAL_OBSERVATION', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 50, ema50: 1.0850, adx: { adx: 10 } }
    });
    expect(opp.action).toBe('NO_SETUP');

    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(res.success).toBe(true);
    expect(res.actionTaken).toBe('COUNTERFACTUAL_RECORDED');

    const summary = researchLearningEngine.getCampaignSummaryMetrics();
    expect(summary.counterfactualCount).toBe(1);
    expect(summary.shadowObservationCount).toBe(0);
  });

  it('6. Valid signal opens SHADOW_OBSERVATION without broker transmission', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(res.success).toBe(true);
    expect(res.actionTaken).toBe('SHADOW_OPENED');

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active.length).toBe(1);
    expect(active[0].symbol).toBe('EUR/USD');
    expect(active[0].direction).toBe('BUY');
    expect(active[0].status).toBe('ACTIVE');

    // Broker state remains untouched
    expect(controlledDemoExecutionService.getOpenPositions().length).toBe(0);
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);
  });

  it('7. Duplicate signal ID is ignored idempotently', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res1 = continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(res1.actionTaken).toBe('SHADOW_OPENED');

    const res2 = continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(res2.actionTaken).toBe('DUPLICATE_IGNORED');
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(1);
  });

  it('8. Single-Target Setup: Reaching TP1 results in complete simulated exit', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    // Explicit single-target
    opp.takeProfit2 = undefined;

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    const active = continuousLearningObservatoryService.getActiveObservations()[0];

    // Price reaches TP1
    const closed = continuousLearningObservatoryService.processMarketTick('EUR/USD', active.takeProfit1, active.takeProfit1 + 0.0010, 1.0850);
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('TAKE_PROFIT_1');
    expect(closed[0].realizedR).toBeGreaterThan(0);
  });

  it('9. Multi-Target Setup: Reaching TP1 marks tp1Hit and moves SL to Breakeven', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    // Explicit multi-target
    opp.takeProfit1 = 1.0890;
    opp.takeProfit2 = 1.0930;

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    const initialObs = continuousLearningObservatoryService.getActiveObservations()[0];
    expect(initialObs.isMultiTarget).toBe(true);

    // Price hits TP1
    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.0895, 1.0900, 1.0855);

    const activeObsAfter = continuousLearningObservatoryService.getActiveObservations()[0];
    expect(activeObsAfter.status).toBe('ACTIVE');
    expect(activeObsAfter.tp1Hit).toBe(true);
    expect(activeObsAfter.stopLoss).toBe(activeObsAfter.entryPrice); // Moved to Breakeven
  });

  it('10. Multi-Target Setup: Price reverses after TP1 and exits at Breakeven SL', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    opp.takeProfit1 = 1.0890;
    opp.takeProfit2 = 1.0930;

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    // Hit TP1 -> Moves SL to BE (1.0850)
    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.0895, 1.0900, 1.0855);

    // Reverses to Breakeven SL
    const closed = continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.0850, 1.0860, 1.0845);
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('BREAKEVEN');
    expect(closed[0].realizedR).toBe(0);
  });

  it('11. Multi-Target Setup: Price continues after TP1 and exits at TP2', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    opp.takeProfit1 = 1.0890;
    opp.takeProfit2 = 1.0930;

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    // Hit TP1
    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.0895, 1.0900, 1.0855);
    // Hit TP2
    const closed = continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.0935, 1.0940, 1.0890);

    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('TAKE_PROFIT_2');
    expect(closed[0].realizedR).toBeGreaterThan(1.5);
  });

  it('12. Price hitting Stop Loss closes observation with STOP_LOSS reason', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    const obs = continuousLearningObservatoryService.getActiveObservations()[0];

    const closed = continuousLearningObservatoryService.processMarketTick('EUR/USD', obs.stopLoss - 0.0010, 1.0850, obs.stopLoss - 0.0010);
    expect(closed.length).toBe(1);
    expect(closed[0].closeReason).toBe('STOP_LOSS');
    expect(closed[0].realizedR).toBe(-1.0);
  });

  it('13. Shadow observations do NOT increment REAL_DEMO_EXECUTION campaign N', () => {
    const initialRealDemo = controlledDemoLearningCampaignService.getStatus().completedTrades;

    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    opp.takeProfit2 = undefined;

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    const obs = continuousLearningObservatoryService.getActiveObservations()[0];

    continuousLearningObservatoryService.processMarketTick('EUR/USD', obs.takeProfit1, obs.takeProfit1 + 0.0010, 1.0850);

    // Real DEMO Campaign N remains strictly unchanged
    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(initialRealDemo);
  });

  it('14. Counterfactuals do NOT increment REAL_DEMO_EXECUTION campaign N', () => {
    const initialRealDemo = controlledDemoLearningCampaignService.getStatus().completedTrades;

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      currentPrice: 1.2700,
      indicators: { rsi: 50, ema50: 1.2700, adx: { adx: 10 } }
    });

    researchLearningEngine.recordCounterfactual(opp, 'ADX Filter', 'LONDON');
    expect(controlledDemoLearningCampaignService.getStatus().completedTrades).toBe(initialRealDemo);
  });

  it('15. TEST_FIXTURE observations do NOT affect production learning statistics', () => {
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
    expect(stats).toBeUndefined(); // Filtered out from production stats
  });

  it('16. Setup Isolation: EUR/USD learning does not affect GBP/USD setup', () => {
    for (let i = 0; i < 5; i++) {
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
        observationType: 'SHADOW_OBSERVATION'
      });
    }

    const eurStats = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST')!;
    expect(eurStats.totalObservations).toBe(5);
    expect(eurStats.evidenceTier).toBe('EARLY_OBSERVATION');

    const gbpStats = researchLearningEngine.getSetupStats('GBP/USD_BUY_ORDER_BLOCK_RETEST');
    expect(gbpStats).toBeUndefined();
  });

  it('17. Evidence tier progression: N<5=0%, 5<=N<10=5%, 10<=N<30=10%, 30<=N<100=15%, N>=100=20%', () => {
    expect(researchLearningEngine.resolveEvidenceTier(4)).toEqual({ tier: 'NO_EVIDENCE', weight: 0.0 });
    expect(researchLearningEngine.resolveEvidenceTier(5)).toEqual({ tier: 'EARLY_OBSERVATION', weight: 0.05 });
    expect(researchLearningEngine.resolveEvidenceTier(10)).toEqual({ tier: 'DEVELOPING', weight: 0.10 });
    expect(researchLearningEngine.resolveEvidenceTier(30)).toEqual({ tier: 'MODERATE_EVIDENCE', weight: 0.15 });
    expect(researchLearningEngine.resolveEvidenceTier(100)).toEqual({ tier: 'ROBUST_OBSERVATION', weight: 0.20 });
  });

  it('18. Bounded parameter adjustment never exceeds 1.20 multiplier (+20%)', () => {
    for (let i = 0; i < 50; i++) {
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
        observationType: 'SHADOW_OBSERVATION'
      });
    }

    const stats = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST')!;
    expect(stats.recommendedSlMultiplier).toBeLessThanOrEqual(1.20);
    expect(stats.recommendedSlMultiplier).toBeGreaterThan(1.0);
  });

  it('19. Immutable signal snapshots are preserved without retroactive modification', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    const obs = continuousLearningObservatoryService.getActiveObservations()[0];
    expect(Object.isFrozen(obs.immutableSignalSnapshot)).toBe(true);
  });

  it('20. Learning Journal records immutable audit event on shadow trade close', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 30 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    opp.takeProfit2 = undefined;

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    const obs = continuousLearningObservatoryService.getActiveObservations()[0];
    continuousLearningObservatoryService.processMarketTick('EUR/USD', obs.takeProfit1, obs.takeProfit1 + 0.0010, 1.0850);

    const events = learningJournalService.getEvents({ eventType: 'TRADE_CLOSED' });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].setupFingerprint).toBe(obs.setupFingerprint);
  });
});
