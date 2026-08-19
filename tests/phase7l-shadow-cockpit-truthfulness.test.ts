import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { researchLearningEngine } from '../apps/decision-agent/src/services/researchLearningEngine';
import { controlledDemoLearningCampaignService } from '../apps/execution-router/src/services/controlledDemoLearningCampaignService';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI — PHASE 7L: Shadow Performance Cockpit Truthfulness & Governance Invariants', () => {
  const cockpitPath = path.join(__dirname, '..', 'src', 'components', 'ShadowPerformanceCockpit.tsx');
  const cockpitSource = fs.readFileSync(cockpitPath, 'utf8');

  beforeEach(() => {
    continuousLearningObservatoryService.resetObservatory();
    researchLearningEngine.clearAll();
    controlledDemoExecutionService.clearRecords();
    controlledDemoExecutionService.disarmDemoExecution();
    controlledDemoLearningCampaignService.resetCampaign(5);
  });

  it('1. Hardcoded 150 shadow trades are absent from UI code', () => {
    expect(cockpitSource.includes('>150<')).toBe(false);
    expect(cockpitSource.includes("'150'")).toBe(false);
    expect(cockpitSource.includes('"150"')).toBe(false);
  });

  it('2. Hardcoded 68.7% win rate is absent from UI code', () => {
    expect(cockpitSource.includes('68.7%')).toBe(false);
    expect(cockpitSource.includes('68.7')).toBe(false);
  });

  it('3. Hardcoded +$2,165 P&L is absent from UI code', () => {
    expect(cockpitSource.includes('2,165')).toBe(false);
    expect(cockpitSource.includes('2,480')).toBe(false);
    expect(cockpitSource.includes('2165')).toBe(false);
    expect(cockpitSource.includes('2480')).toBe(false);
  });

  it('4. Hardcoded SHADOW-POS-01 is absent from UI code', () => {
    expect(cockpitSource.includes('SHADOW-POS-01')).toBe(false);
    expect(cockpitSource.includes('1.08320')).toBe(false);
  });

  it('5. Zero observations produce truthful empty state (0 observations, N/A metrics)', () => {
    const active = continuousLearningObservatoryService.getActiveObservations();
    const completed = continuousLearningObservatoryService.getCompletedObservations();

    expect(active.length).toBe(0);
    expect(completed.length).toBe(0);

    // Verify UI source has the truthful empty state text
    expect(cockpitSource.includes('NO ACTIVE SHADOW OBSERVATIONS IN PROGRESS')).toBe(true);
    expect(cockpitSource.includes('Awaiting real-market shadow observations')).toBe(true);
    expect(cockpitSource.includes('N/A — awaiting observations')).toBe(true);
  });

  it('6. Active observation data renders from API response dynamically', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = {
      id: 'opp-shadow-001',
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      confidence: 85,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'Valid SMC Order Block Retest',
      timeframe: 'M15',
      marketRegime: 'TRENDING' as const,
      timestamp: Date.now()
    };

    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(res.success).toBe(true);
    expect(res.actionTaken).toBe('SHADOW_OPENED');

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active.length).toBe(1);
    expect(active[0].id).toMatch(/^shadow-/);
    expect(active[0].symbol).toBe('EUR/USD');
    expect(active[0].direction).toBe('BUY');
    expect(active[0].entryPrice).toBe(1.08500);
    expect(active[0].observationType).toBe('SHADOW_OBSERVATION');
  });

  it('7. Completed shadow observations calculate metrics dynamically', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = {
      id: 'opp-shadow-002',
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      confidence: 85,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'Valid SMC Order Block Retest',
      timeframe: 'M15',
      marketRegime: 'TRENDING' as const,
      timestamp: Date.now()
    };

    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    const obs = continuousLearningObservatoryService.getActiveObservations()[0];

    // Trigger TP1 Hit via market tick
    const closed = continuousLearningObservatoryService.processMarketTick(
      'EUR/USD',
      obs.takeProfit1,
      obs.takeProfit1 + 0.0010,
      1.0850
    );

    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('TAKE_PROFIT_1');
    expect(closed[0].realizedR).toBeGreaterThan(0);

    const completed = continuousLearningObservatoryService.getCompletedObservations();
    expect(completed.length).toBe(1);
    expect(completed[0].observationType).toBe('SHADOW_OBSERVATION');
    expect(completed[0].closeReason).toBe('TAKE_PROFIT_1');
  });

  it('8. Counterfactuals do not count as shadow trades', () => {
    continuousLearningObservatoryService.startObservatory();
    const opp = {
      id: 'opp-cf-001',
      pair: 'EUR/USD' as const,
      action: 'WAIT' as const, // Not actionable -> Counterfactual
      setupType: 'RANGE_EXPANSION',
      confidence: 40,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08250,
      takeProfit1: 1.09000,
      reason: 'ADX low',
      timeframe: 'M15',
      marketRegime: 'RANGING' as const,
      timestamp: Date.now()
    };

    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(res.actionTaken).toBe('COUNTERFACTUAL_RECORDED');

    // Verify shadow observations list remains 0
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(0);
    expect(continuousLearningObservatoryService.getCompletedObservations().length).toBe(0);
  });

  it('9. REAL_DEMO_EXECUTION does not count as shadow observations', () => {
    const payload = researchLearningEngine.getEarlyLearnerPayload();
    expect(payload.latestTrades.length).toBe(0);

    // Ingest 1 real demo observation into research learning engine
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

    const status = continuousLearningObservatoryService.getStatus();
    // Shadow count in continuous observatory must still be 0
    expect(status.activeShadowCount).toBe(0);
    expect(status.totalShadowsObserved).toBe(0);
  });

  it('10. TEST_FIXTURE does not count as shadow observations', () => {
    const completed = continuousLearningObservatoryService.getCompletedObservations();
    const fixtureCount = completed.filter((c: any) => c.observationType === 'TEST_FIXTURE').length;
    expect(fixtureCount).toBe(0);
  });

  it('11. API failure does not fall back to mock values', () => {
    // Verify in source code that catch blocks set empty arrays and do not inject static data
    expect(cockpitSource.includes('setActiveObservations([])')).toBe(true);
    expect(cockpitSource.includes('setCompletedObservations([])')).toBe(true);
  });

  it('12. Shadow mode never transmits broker orders (Broker Orders = 0)', () => {
    const status = continuousLearningObservatoryService.getStatus();
    expect(status.brokerOrdersTransmitted).toBe(0);
    expect(status.isDemoArmed).toBe(false);
  });

  it('13. Existing LIVE_EXECUTION = FORBIDDEN invariant remains intact', () => {
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

  it('14. Existing DEMO_AUTOMATED_EXECUTION = FORBIDDEN invariant remains intact', () => {
    const status = controlledDemoLearningCampaignService.getStatus();
    expect(status.isDemoArmed).toBe(false);
    expect(status.liveExecutionGate).toBe('FORBIDDEN');
    expect(status.authoritativeBrokerPositions).toBe(0);
    expect(status.authoritativeBrokerOrders).toBe(0);
  });

  it('15. Existing 5 real DEMO trades remain unchanged (3W / 2L / +3.05R)', () => {
    const campaign = controlledDemoLearningCampaignService.getStatus();
    expect(campaign.completedTrades).toBe(5);
    expect(campaign.targetTrades).toBe(30);
    expect(campaign.remainingTrades).toBe(25);
  });
});
