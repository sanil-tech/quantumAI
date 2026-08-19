import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { continuousLearningObservatoryService, MarketTickEvent } from '../src/server/services/continuousLearningObservatoryService';
import { researchLearningEngine } from '../apps/decision-agent/src/services/researchLearningEngine';
import { controlledDemoLearningCampaignService } from '../apps/execution-router/src/services/controlledDemoLearningCampaignService';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI — PHASE 7N: Final Market-Data -> Shadow-Runtime Integrity Audit', () => {
  let mockMarketBus: EventEmitter;

  beforeEach(() => {
    mockMarketBus = new EventEmitter();
    continuousLearningObservatoryService.resetObservatory();
    researchLearningEngine.clearAll();
    controlledDemoExecutionService.clearRecords();
    controlledDemoExecutionService.disarmDemoExecution();
    controlledDemoLearningCampaignService.resetCampaign(5);
  });

  afterEach(() => {
    continuousLearningObservatoryService.resetObservatory();
    mockMarketBus.removeAllListeners();
  });

  it('1. Cold boot Observatory = STOPPED with no active listeners or dispatchers', () => {
    const status = continuousLearningObservatoryService.getStatus();
    expect(status.state).toBe('STOPPED');
    expect(status.activeShadowCount).toBe(0);
    expect(status.totalShadowsObserved).toBe(0);
    expect(status.isDispatcherRunning).toBe(false);
    expect(status.isMarketListenerActive).toBe(false);
  });

  it('2. Explicit startObservatory() activates dispatcher and establishes OBSERVING state', () => {
    continuousLearningObservatoryService.bindMarketDataEmitter(mockMarketBus);
    const startRes = continuousLearningObservatoryService.startObservatory();

    expect(startRes.success).toBe(true);
    expect(startRes.state).toBe('OBSERVING');

    const status = continuousLearningObservatoryService.getStatus();
    expect(status.state).toBe('OBSERVING');
    expect(status.isDispatcherRunning).toBe(true);
    expect(status.isMarketListenerActive).toBe(true);
  });

  it('3. Market-data listener activates exactly once and rejects duplicate registrations', () => {
    continuousLearningObservatoryService.bindMarketDataEmitter(mockMarketBus);
    continuousLearningObservatoryService.bindMarketDataEmitter(mockMarketBus); // duplicate call

    expect(mockMarketBus.listenerCount('marketTick')).toBe(1);
    continuousLearningObservatoryService.startObservatory();
    expect(continuousLearningObservatoryService.getStatus().isMarketListenerActive).toBe(true);
  });

  it('4. Market tick event from emitter reaches active shadow observation and updates MFE/MAE', () => {
    continuousLearningObservatoryService.bindMarketDataEmitter(mockMarketBus);
    continuousLearningObservatoryService.startObservatory();

    // Open active shadow BUY position at 1.08500
    const opp = {
      id: 'opp-md-tick-001',
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      confidence: 88,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'Live Market Data SMC Retest',
      timeframe: 'M15',
      marketRegime: 'TRENDING' as const,
      timestamp: Date.now()
    };

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(1);

    // Emit market tick event via bound event bus (favorable tick to 1.08750)
    const tick1: MarketTickEvent = {
      symbol: 'EUR/USD',
      currentPrice: 1.08750,
      highPrice: 1.08780,
      lowPrice: 1.08490,
      session: 'LONDON',
      timestamp: Date.now()
    };
    mockMarketBus.emit('marketTick', tick1);

    const activeObs = continuousLearningObservatoryService.getActiveObservations()[0];
    expect(activeObs.mfePips).toBeGreaterThanOrEqual(25);
    expect(continuousLearningObservatoryService.getStatus().lastTickTimestamp).toBeDefined();
  });

  it('5. Market tick reaching TP1 triggers automated shadow exit without broker order', () => {
    continuousLearningObservatoryService.bindMarketDataEmitter(mockMarketBus);
    continuousLearningObservatoryService.startObservatory();

    const opp = {
      id: 'opp-md-tp-001',
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      confidence: 92,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'SMC TP Test',
      timeframe: 'M15',
      marketRegime: 'TRENDING' as const,
      timestamp: Date.now()
    };

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(1);

    // Emit market tick at TP1 (1.09000)
    mockMarketBus.emit('marketTick', {
      symbol: 'EUR/USD',
      currentPrice: 1.09000,
      highPrice: 1.09050,
      lowPrice: 1.08800,
      session: 'LONDON',
      timestamp: Date.now()
    });

    // Verify observation completed
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(0);
    const completed = continuousLearningObservatoryService.getCompletedObservations();
    expect(completed.length).toBe(1);
    expect(completed[0].status).toBe('CLOSED');
    expect(completed[0].closeReason).toBe('TAKE_PROFIT_1');
    expect(completed[0].realizedR).toBeGreaterThan(0);
  });

  it('6. Existing active shadow observations stay active on STOP but reject subsequent ticks', () => {
    continuousLearningObservatoryService.bindMarketDataEmitter(mockMarketBus);
    continuousLearningObservatoryService.startObservatory();

    const opp = {
      id: 'opp-md-stop-semantics-001',
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      confidence: 85,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'Stop Semantics Test',
      timeframe: 'M15',
      marketRegime: 'TRENDING' as const,
      timestamp: Date.now()
    };

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(1);

    // Stop Observatory
    continuousLearningObservatoryService.stopObservatory('Operator pause for review');
    const statusAfterStop = continuousLearningObservatoryService.getStatus();
    expect(statusAfterStop.state).toBe('STOPPED');
    // Active shadow count remains 1 (retained in memory)
    expect(statusAfterStop.activeShadowCount).toBe(1);
    expect(statusAfterStop.isMarketListenerActive).toBe(false);

    // Ticks arriving while STOPPED must be ignored
    mockMarketBus.emit('marketTick', {
      symbol: 'EUR/USD',
      currentPrice: 1.09000,
      highPrice: 1.09050,
      lowPrice: 1.08800,
      session: 'LONDON',
      timestamp: Date.now()
    });

    // Position was not closed by tick because observatory was STOPPED
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(1);
    expect(continuousLearningObservatoryService.getCompletedObservations().length).toBe(0);

    // Restart Observatory -> resumes tick processing
    continuousLearningObservatoryService.startObservatory();
    mockMarketBus.emit('marketTick', {
      symbol: 'EUR/USD',
      currentPrice: 1.09000,
      highPrice: 1.09050,
      lowPrice: 1.08800,
      session: 'LONDON',
      timestamp: Date.now()
    });

    // Now position closes cleanly upon resume
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(0);
    expect(continuousLearningObservatoryService.getCompletedObservations().length).toBe(1);
  });

  it('7. Duplication & Leak Stress Test: Multiple START/STOP cycles do not accumulate listeners', () => {
    continuousLearningObservatoryService.bindMarketDataEmitter(mockMarketBus);

    for (let i = 0; i < 5; i++) {
      continuousLearningObservatoryService.startObservatory();
      expect(continuousLearningObservatoryService.getStatus().state).toBe('OBSERVING');
      expect(mockMarketBus.listenerCount('marketTick')).toBe(1);

      continuousLearningObservatoryService.stopObservatory();
      expect(continuousLearningObservatoryService.getStatus().state).toBe('STOPPED');
      expect(mockMarketBus.listenerCount('marketTick')).toBe(1);
    }

    // Final unbind removes the single listener
    continuousLearningObservatoryService.unbindMarketDataEmitter();
    expect(mockMarketBus.listenerCount('marketTick')).toBe(0);
  });

  it('8. Safety Invariants: 0 broker orders, LIVE forbidden, DEMO automation forbidden', () => {
    continuousLearningObservatoryService.bindMarketDataEmitter(mockMarketBus);
    continuousLearningObservatoryService.startObservatory();

    const status = continuousLearningObservatoryService.getStatus();
    expect(status.brokerOrdersTransmitted).toBe(0);
    expect(status.isDemoArmed).toBe(false);
    expect(status.liveExecutionGate).toBe('FORBIDDEN');

    const gate = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('LIVE_EXECUTION_DISARMED');
  });
});
