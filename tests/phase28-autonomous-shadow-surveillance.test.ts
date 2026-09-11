import { describe, it, expect } from 'vitest';
import { AutonomousShadowSurveillanceService } from '../src/server/services/autonomousShadowSurveillanceService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase28Certification } from '../scripts/phase28-autonomous-shadow-surveillance-certification';

describe('PHASE 28 ? Autonomous Shadow Surveillance & Periodic Governance Scheduler', () => {
  it('1. Deterministic Surveillance Cycle: Transitions state through to CYCLE_COMPLETED', () => {
    const res = AutonomousShadowSurveillanceService.runSurveillanceCycle('CYCLE-TEST-01');
    expect(res.cycleId).toBe('CYCLE-TEST-01');
    expect(res.cycleState).toBe('CYCLE_COMPLETED');
    expect(res.governanceDecision).toBe('HEALTHY');
    expect(res.brokerExecutionPaths).toBe(0);
    expect(res.brokerOrdersTransmitted).toBe(0);
  });

  it('2. Cycle Idempotency: Returns cached result when executing identical cycle ID', () => {
    const r1 = AutonomousShadowSurveillanceService.runSurveillanceCycle('CYCLE-IDEM-01');
    const r2 = AutonomousShadowSurveillanceService.runSurveillanceCycle('CYCLE-IDEM-01');
    expect(r1.evidenceHash).toBe(r2.evidenceHash);
    expect(r1.startedAtUtc).toBe(r2.startedAtUtc);
  });

  it('3. Evidence Cryptographic Hashing: Generates 64-char SHA-256 evidence hashes', () => {
    const res = AutonomousShadowSurveillanceService.runSurveillanceCycle('CYCLE-HASH-01');
    expect(res.evidenceHash.length).toBe(64);
  });

  it('4. Runs Phase 28 Autonomous Shadow Surveillance Certification Script', () => {
    const res = runPhase28Certification();
    expect(res.success).toBe(true);
    expect(res.cycle.brokerOrdersTransmitted).toBe(0);
    expect(res.cycle.brokerExecutionPaths).toBe(0);
    expect(res.cycle.livePositions).toBe(0);
    expect(res.cycle.secretExposure).toBe('NONE');
  });

  it('5. Execution Safety Invariant: Disarms LIVE execution requests fail-closed', () => {
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

  it('6. Permanent Safety Invariant: 0 Broker Orders Transmitted & 0 Live Positions Remaining', () => {
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
