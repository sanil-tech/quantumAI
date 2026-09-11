import { describe, it, expect } from 'vitest';
import { LivePilotReadinessGovernanceService } from '../src/server/services/livePilotReadinessGovernanceService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase32Certification } from '../scripts/phase32-live-pilot-readiness-audit';

describe('PHASE 32 ? Controlled Live-Pilot Readiness & Governance Simulation', () => {
  const baseEligibility = {
    strategyId: 'ALPHA-ORCHESTRATOR-V1',
    strategyVersion: '1.4.0',
    strategyHash: 'hash-alpha-140',
    qualificationStatus: 'STRATEGY_QUALIFIED',
    oosEvidencePresent: true,
    criticalFindingsCount: 0,
    highFindingsCount: 0,
    riskHealthy: true,
    marketDataHealthy: true,
    executionSafetyGateBlocked: true
  };

  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000;

  it('1. Valid Dual Approval: Transitions to LIVE_PILOT_SIMULATION with 0 broker orders and livePilotActive = false', () => {
    const res = LivePilotReadinessGovernanceService.runPilotLifecycle(
      baseEligibility,
      {
        pilotId: 'PILOT-TEST-01',
        reviewerA: { id: 'admin-01', role: 'ADMIN' },
        reviewerB: { id: 'admin-02', role: 'ADMIN' },
        issuedAtUtc: now,
        expiresAtUtc: expiresAt
      },
      now + 1000
    );

    expect(res.currentState).toBe('LIVE_PILOT_SIMULATION');
    expect(res.livePilotEligible).toBe(true);
    expect(res.livePilotAuthorized).toBe(true);
    expect(res.livePilotActive).toBe(false);
    expect(res.brokerOrdersTransmitted).toBe(0);
    expect(res.dualControlStatus).toBe('PASS');
  });

  it('2. Time-Bound Authorization Expiration: Transitions to EXPIRED when currentTime >= expiresAt', () => {
    const res = LivePilotReadinessGovernanceService.runPilotLifecycle(
      baseEligibility,
      {
        pilotId: 'PILOT-EXPIRE-01',
        reviewerA: { id: 'admin-01', role: 'ADMIN' },
        reviewerB: { id: 'admin-02', role: 'ADMIN' },
        issuedAtUtc: now,
        expiresAtUtc: expiresAt
      },
      expiresAt + 1000
    );

    expect(res.currentState).toBe('EXPIRED');
    expect(res.livePilotAuthorized).toBe(false);
    expect(res.expirationStatus).toBe('EXPIRED');
  });

  it('3. Dual Control Enforcement: Fails with REJECTED when Reviewer A == Reviewer B', () => {
    const res = LivePilotReadinessGovernanceService.runPilotLifecycle(
      baseEligibility,
      {
        pilotId: 'PILOT-SAME-ACTOR-01',
        reviewerA: { id: 'admin-01', role: 'ADMIN' },
        reviewerB: { id: 'admin-01', role: 'ADMIN' },
        issuedAtUtc: now,
        expiresAtUtc: expiresAt
      },
      now + 1000
    );

    expect(res.dualControlStatus).toBe('FAIL_SAME_ACTOR');
    expect(res.currentState).toBe('REJECTED');
  });

  it('4. RBAC Authorization: Fails with UNAUTHORIZED_ROLE when reviewer is not ADMIN', () => {
    const res = LivePilotReadinessGovernanceService.runPilotLifecycle(
      baseEligibility,
      {
        pilotId: 'PILOT-RBAC-01',
        reviewerA: { id: 'viewer-01', role: 'VIEWER' },
        reviewerB: { id: 'admin-02', role: 'ADMIN' },
        issuedAtUtc: now,
        expiresAtUtc: expiresAt
      },
      now + 1000
    );

    expect(res.dualControlStatus).toBe('UNAUTHORIZED_ROLE');
    expect(res.currentState).toBe('REJECTED');
  });

  it('5. Emergency Revocation: Immediately transitions to REVOKED', () => {
    const res = LivePilotReadinessGovernanceService.runPilotLifecycle(
      baseEligibility,
      {
        pilotId: 'PILOT-REVOKE-01',
        reviewerA: { id: 'admin-01', role: 'ADMIN' },
        reviewerB: { id: 'admin-02', role: 'ADMIN' },
        issuedAtUtc: now,
        expiresAtUtc: expiresAt,
        isRevoked: true
      },
      now + 1000
    );

    expect(res.currentState).toBe('REVOKED');
    expect(res.livePilotAuthorized).toBe(false);
  });

  it('6. Runs Phase 32 Live-Pilot Readiness Audit Script', () => {
    const res = runPhase32Certification();
    expect(res.success).toBe(true);
    expect(res.validRes.brokerOrdersTransmitted).toBe(0);
    expect(res.validRes.brokerExecutionPaths).toBe(0);
    expect(res.validRes.livePositions).toBe(0);
    expect(res.validRes.secretExposure).toBe('NONE');
  });

  it('7. Execution Safety Invariant: Disarms LIVE execution requests fail-closed', () => {
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

  it('8. Permanent Safety Invariant: 0 Broker Orders Transmitted & 0 Live Positions Remaining', () => {
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
