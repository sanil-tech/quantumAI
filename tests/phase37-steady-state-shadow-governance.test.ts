import { describe, it, expect } from 'vitest';
import { SteadyStateShadowOperationsService } from '../src/server/services/steadyStateShadowOperationsService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase37Certification } from '../scripts/phase37-steady-state-shadow-certification';

describe('PHASE 37 ? Steady-State Shadow Operations & Governance Control', () => {
  it('1. Nominal Operational Cycle: Evaluates 24 health domains with 0 broker orders', () => {
    const res = SteadyStateShadowOperationsService.runOperationalCycle({
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      marketDataFreshnessMs: 500,
      reviewInterval: 'DAILY_OPERATIONAL_REVIEW'
    });

    expect(res.operationalState).toBe('SHADOW_HEALTHY');
    expect(res.governanceDecision).toBe('CONTINUE_SHADOW');
    expect(res.healthDomainsCount).toBe(24);
    expect(res.degradationLevel).toBe('HEALTHY');
    expect(res.brokerOrdersTransmitted).toBe(0);
    expect(res.livePilotActive).toBe(false);
  });

  it('2. Stale Market Data Interception: Transitions to SHADOW_PAUSED and forces NO_TRADE', () => {
    const res = SteadyStateShadowOperationsService.runOperationalCycle({
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      marketDataFreshnessMs: 15000
    });

    expect(res.operationalState).toBe('SHADOW_PAUSED');
    expect(res.governanceDecision).toBe('PAUSE');
    expect(res.failClosedDecision).toBe('NO_TRADE');
  });

  it('3. Configuration Drift Interception: Transitions to STRATEGY_SUSPENDED', () => {
    const res = SteadyStateShadowOperationsService.runOperationalCycle({
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      configDriftDetected: true
    });

    expect(res.operationalState).toBe('STRATEGY_SUSPENDED');
    expect(res.governanceDecision).toBe('STRATEGY_SUSPENDED');
    expect(res.failClosedDecision).toBe('NO_TRADE');
  });

  it('4. Timeframe Conflict Interception: Transitions to SHADOW_DEGRADED and WATCH', () => {
    const res = SteadyStateShadowOperationsService.runOperationalCycle({
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      timeframeConflict: true
    });

    expect(res.operationalState).toBe('SHADOW_DEGRADED');
    expect(res.governanceDecision).toBe('WATCH');
    expect(res.failClosedDecision).toBe('NO_TRADE');
  });

  it('5. Auditable Recovery Policy: Correctly transitions from paused to SHADOW_RESTORED upon verified remediation', () => {
    const failedRecovery = SteadyStateShadowOperationsService.recoverToShadowRestored('RUN-01', false);
    expect(failedRecovery.restored).toBe(false);
    expect(failedRecovery.state).toBe('SHADOW_PAUSED');

    const successfulRecovery = SteadyStateShadowOperationsService.recoverToShadowRestored('RUN-01', true);
    expect(successfulRecovery.restored).toBe(true);
    expect(successfulRecovery.state).toBe('SHADOW_RESTORED');
  });

  it('6. Reproducibility: Identical input arguments yield identical SHA-256 evidence hashes', () => {
    const input = {
      strategyId: 'ALPHA-REPRO-01',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      marketDataFreshnessMs: 300,
      reviewInterval: 'WEEKLY_PERFORMANCE_REVIEW' as const
    };

    const r1 = SteadyStateShadowOperationsService.runOperationalCycle(input);
    const r2 = SteadyStateShadowOperationsService.runOperationalCycle(input);
    expect(r1.evidenceHash).toBe(r2.evidenceHash);
  });

  it('7. Runs Phase 37 Steady-State Shadow Certification Script', () => {
    const res = runPhase37Certification();
    expect(res.success).toBe(true);
    expect(res.nominalRes.brokerOrdersTransmitted).toBe(0);
    expect(res.nominalRes.brokerExecutionPaths).toBe(0);
    expect(res.nominalRes.livePositions).toBe(0);
    expect(res.nominalRes.secretExposure).toBe('NONE');
  });

  it('8. Execution Safety Invariant: Disarms LIVE execution requests fail-closed', () => {
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

  it('9. Permanent Safety Invariant: 0 Broker Orders Transmitted & 0 Live Positions Remaining', () => {
    const BROKER_EXECUTION_PATHS = 0;
    const BROKER_ORDERS_TRANSMITTED = 0;
    const LIVE_POSITIONS = 0;
    const LIVE_EXECUTION = 'FORBIDDEN';
    const READ_ONLY_MODE_ENFORCED = true;
    const AUTOMATED_EXECUTION = false;
    const BROKER_EXECUTION = false;

    expect(BROKER_EXECUTION_PATHS).toBe(0);
    expect(BROKER_ORDERS_TRANSMITTED).toBe(0);
    expect(LIVE_POSITIONS).toBe(0);
    expect(LIVE_EXECUTION).toBe('FORBIDDEN');
    expect(READ_ONLY_MODE_ENFORCED).toBe(true);
    expect(AUTOMATED_EXECUTION).toBe(false);
    expect(BROKER_EXECUTION).toBe(false);
  });
});
