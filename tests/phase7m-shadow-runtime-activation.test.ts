import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { researchLearningEngine } from '../apps/decision-agent/src/services/researchLearningEngine';
import { controlledDemoLearningCampaignService } from '../apps/execution-router/src/services/controlledDemoLearningCampaignService';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI — PHASE 7M/7N: Shadow Observatory Runtime Activation & Explicit Operator Lifecycle', () => {
  beforeEach(() => {
    continuousLearningObservatoryService.resetObservatory();
    researchLearningEngine.clearAll();
    controlledDemoExecutionService.clearRecords();
    controlledDemoExecutionService.disarmDemoExecution();
    controlledDemoLearningCampaignService.resetCampaign(5);
  });

  afterEach(() => {
    continuousLearningObservatoryService.resetObservatory();
  });

  it('1. Default initial state on cold boot is STOPPED', () => {
    const status = continuousLearningObservatoryService.getStatus();
    expect(status.state).toBe('STOPPED');
    expect(status.activeShadowCount).toBe(0);
    expect(status.totalShadowsObserved).toBe(0);
    expect(status.isDispatcherRunning).toBe(false);
  });

  it('2. Explicit startObservatory() transitions state to OBSERVING and starts dispatcher', () => {
    const result = continuousLearningObservatoryService.startObservatory();
    expect(result.success).toBe(true);
    expect(result.state).toBe('OBSERVING');

    const status = continuousLearningObservatoryService.getStatus();
    expect(status.state).toBe('OBSERVING');
    expect(status.isDispatcherRunning).toBe(true);
    expect(status.lastError).toBeNull();
  });

  it('3. startObservatory() is strictly idempotent', () => {
    continuousLearningObservatoryService.startObservatory();
    const res2 = continuousLearningObservatoryService.startObservatory();
    expect(res2.success).toBe(true);
    expect(res2.state).toBe('OBSERVING');

    const status = continuousLearningObservatoryService.getStatus();
    expect(status.state).toBe('OBSERVING');
    expect(status.isDispatcherRunning).toBe(true);
  });

  it('4. Explicit stopObservatory() transitions state to STOPPED and terminates dispatcher', () => {
    continuousLearningObservatoryService.startObservatory();
    expect(continuousLearningObservatoryService.getStatus().state).toBe('OBSERVING');

    const stopRes = continuousLearningObservatoryService.stopObservatory('Operator manual stop');
    expect(stopRes.success).toBe(true);
    expect(stopRes.state).toBe('STOPPED');

    const status = continuousLearningObservatoryService.getStatus();
    expect(status.state).toBe('STOPPED');
    expect(status.isDispatcherRunning).toBe(false);
  });

  it('5. stopObservatory() is strictly idempotent', () => {
    continuousLearningObservatoryService.stopObservatory();
    const res2 = continuousLearningObservatoryService.stopObservatory();
    expect(res2.success).toBe(true);
    expect(res2.state).toBe('STOPPED');

    const status = continuousLearningObservatoryService.getStatus();
    expect(status.state).toBe('STOPPED');
    expect(status.isDispatcherRunning).toBe(false);
  });

  it('6. pauseObservatory() and resumeObservatory() manage lifecycle cleanly', () => {
    continuousLearningObservatoryService.startObservatory();
    expect(continuousLearningObservatoryService.getStatus().state).toBe('OBSERVING');

    // Pause
    const pauseRes = continuousLearningObservatoryService.pauseObservatory('Scheduled market news block');
    expect(pauseRes.success).toBe(true);
    expect(pauseRes.state).toBe('PAUSED');
    expect(continuousLearningObservatoryService.getStatus().isDispatcherRunning).toBe(false);
    expect(continuousLearningObservatoryService.getStatus().lastError).toBe('Scheduled market news block');

    // Resume
    const resumeRes = continuousLearningObservatoryService.resumeObservatory();
    expect(resumeRes.success).toBe(true);
    expect(resumeRes.state).toBe('OBSERVING');
    expect(continuousLearningObservatoryService.getStatus().isDispatcherRunning).toBe(true);
    expect(continuousLearningObservatoryService.getStatus().lastError).toBeNull();
  });

  it('7. Synthetic market opportunity rejected while STOPPED', () => {
    const opp = {
      id: 'opp-rejected-001',
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      confidence: 85,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'Valid SMC Signal',
      timeframe: 'M15',
      marketRegime: 'TRENDING' as const,
      timestamp: Date.now()
    };

    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(res.success).toBe(false);
    expect(res.actionTaken).toBe('REJECTED_OBSERVATORY_NOT_ACTIVE');
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(0);
  });

  it('8. Synthetic market opportunity accepted while OBSERVING -> creates SHADOW_OBSERVATION', () => {
    continuousLearningObservatoryService.startObservatory();

    const opp = {
      id: 'opp-active-001',
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      confidence: 88,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'High Probability Order Block',
      timeframe: 'M15',
      marketRegime: 'TRENDING' as const,
      timestamp: Date.now()
    };

    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(res.success).toBe(true);
    expect(res.actionTaken).toBe('SHADOW_OPENED');
    expect(res.observationId).toBeDefined();

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(res.observationId);
    expect(active[0].symbol).toBe('EUR/USD');
    expect(active[0].direction).toBe('BUY');
    expect(active[0].entryPrice).toBe(1.08500);
    expect(active[0].observationType).toBe('SHADOW_OBSERVATION');
  });

  it('9. Counterfactual opportunity recorded without creating active shadow position', () => {
    continuousLearningObservatoryService.startObservatory();

    const cfOpp = {
      id: 'opp-cf-002',
      pair: 'EUR/USD' as const,
      action: 'WAIT' as const,
      setupType: 'RANGE_BREAKOUT',
      confidence: 45,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'Low momentum filter',
      timeframe: 'M15',
      marketRegime: 'RANGING' as const,
      timestamp: Date.now()
    };

    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: cfOpp });
    expect(res.success).toBe(true);
    expect(res.actionTaken).toBe('COUNTERFACTUAL_RECORDED');
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(0);

    const status = continuousLearningObservatoryService.getStatus();
    expect(status.totalCounterfactualsObserved).toBe(1);
  });

  it('10. Synthetic tick processing updates active observations (MFE/MAE) and triggers TP1 exit', () => {
    continuousLearningObservatoryService.startObservatory();

    const opp = {
      id: 'opp-tick-001',
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      confidence: 90,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'SMC Golden Vector',
      timeframe: 'M15',
      marketRegime: 'TRENDING' as const,
      timestamp: Date.now()
    };

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    const obs = continuousLearningObservatoryService.getActiveObservations()[0];

    // Favorable tick toward TP1 (1.08800) -> MFE increases to +30 pips
    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.08800, 1.08850, 1.08480);
    expect(obs.mfePips).toBeGreaterThanOrEqual(30);

    // Final tick hits TP1 (1.09000) -> Position closes
    const closed = continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.09000, 1.09050, 1.08800);
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('TAKE_PROFIT_1');
    expect(closed[0].realizedR).toBeGreaterThan(0);

    // Verify active is now 0 and completed is 1
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(0);
    const completed = continuousLearningObservatoryService.getCompletedObservations();
    expect(completed.length).toBe(1);
    expect(completed[0].closeReason).toBe('TAKE_PROFIT_1');
    expect(completed[0].realizedR).toBeGreaterThan(0);
  });

  it('11. Telemetry accuracy reflects actual runtime counters', () => {
    continuousLearningObservatoryService.startObservatory();

    const opp = {
      id: 'opp-telemetry-001',
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      confidence: 85,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'Telemetry Test',
      timeframe: 'M15',
      marketRegime: 'TRENDING' as const,
      timestamp: Date.now()
    };

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    let status = continuousLearningObservatoryService.getStatus();
    expect(status.activeShadowCount).toBe(1);
    expect(status.totalShadowsObserved).toBe(0);

    // Close position
    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.09000, 1.09050, 1.08500);
    status = continuousLearningObservatoryService.getStatus();
    expect(status.activeShadowCount).toBe(0);
    expect(status.totalShadowsObserved).toBe(1);
  });

  it('12. Invariant: brokerOrdersTransmitted remains 0', () => {
    continuousLearningObservatoryService.startObservatory();
    const status = continuousLearningObservatoryService.getStatus();
    expect(status.brokerOrdersTransmitted).toBe(0);
  });

  it('13. Invariant: liveExecutionGate remains FORBIDDEN', () => {
    const gateRes = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(gateRes.allowed).toBe(false);
    expect(gateRes.code).toBe('LIVE_EXECUTION_DISARMED');
  });

  it('14. Invariant: isDemoArmed remains false', () => {
    continuousLearningObservatoryService.startObservatory();
    const status = continuousLearningObservatoryService.getStatus();
    expect(status.isDemoArmed).toBe(false);
  });

  it('15. Invariant: DEMO_AUTOMATED_EXECUTION remains FORBIDDEN', () => {
    const status = controlledDemoLearningCampaignService.getStatus();
    expect(status.isDemoArmed).toBe(false);
    expect(status.liveExecutionGate).toBe('FORBIDDEN');
    expect(status.authoritativeBrokerPositions).toBe(0);
    expect(status.authoritativeBrokerOrders).toBe(0);
  });
});
