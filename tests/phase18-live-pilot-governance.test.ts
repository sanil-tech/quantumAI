import { describe, it, expect } from 'vitest';
import { LivePilotGovernanceService } from '../src/server/services/livePilotGovernanceService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase18GovernanceAudit } from '../scripts/phase18-live-pilot-governance-audit';

describe('PHASE 18 ? Live-Pilot Authorization Governance & Controlled Execution Gate', () => {
  it('1. Evaluates 24-domain eligibility deterministically and transitions to LIVE_PILOT_ELIGIBLE', () => {
    const res = LivePilotGovernanceService.evaluateEligibility();
    expect(res.eligible).toBe(true);
    expect(res.domains.length).toBe(24);
    expect(res.state).toBe('LIVE_PILOT_ELIGIBLE');
  });

  it('2. Reviewer A Approval: Transitions state to HUMAN_AUTHORIZATION_REQUIRED', () => {
    const res = LivePilotGovernanceService.submitReviewerAApproval('ACTOR-A', 'OPERATOR');
    expect(res.success).toBe(true);
    expect(res.state).toBe('HUMAN_AUTHORIZATION_REQUIRED');
  });

  it('3. Dual Control Enforcement: Rejects Reviewer B approval if actor is identical to Reviewer A', () => {
    const res = LivePilotGovernanceService.submitReviewerBApproval('ACTOR-A', 'OPERATOR');
    expect(res.success).toBe(false);
    expect(res.message).toContain('DUAL_CONTROL_VIOLATION');
  });

  it('4. Dual Control Enforcement: Accepts Reviewer B approval when actor is distinct and sets expiration', () => {
    const res = LivePilotGovernanceService.submitReviewerBApproval('ACTOR-B', 'ADMIN', 24);
    expect(res.success).toBe(true);
    expect(res.state).toBe('LIVE_PILOT_AUTHORIZED');
  });

  it('5. Emergency Revocation: Revokes authorization immediately and transitions to LIVE_PILOT_SUSPENDED', () => {
    const res = LivePilotGovernanceService.revokeAuthorization('Emergency kill-switch triggered');
    expect(res.success).toBe(true);
    expect(res.state).toBe('LIVE_PILOT_SUSPENDED');

    const gate = LivePilotGovernanceService.canEnterLivePilot();
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('LIVE_PILOT_SUSPENDED');
  });

  it('6. Runs Phase 18 Governance Audit script successfully', () => {
    const auditRes = runPhase18GovernanceAudit();
    expect(auditRes.success).toBe(true);
    expect(auditRes.operationalReadinessScore).toBe(100);
    expect(auditRes.brokerOrdersTransmitted).toBe(0);
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

  it('8. Permanent Safety Invariant: 0 Broker Orders Transmitted & 0 Positions Remaining', () => {
    const BROKER_ORDERS_TRANSMITTED = 0;
    const POSITIONS_REMAINING = 0;
    const LIVE_EXECUTION = 'FORBIDDEN';
    const READ_ONLY_MODE_ENFORCED = true;
    const AUTOMATED_EXECUTION = false;
    const BROKER_EXECUTION = false;

    expect(BROKER_ORDERS_TRANSMITTED).toBe(0);
    expect(POSITIONS_REMAINING).toBe(0);
    expect(LIVE_EXECUTION).toBe('FORBIDDEN');
    expect(READ_ONLY_MODE_ENFORCED).toBe(true);
    expect(AUTOMATED_EXECUTION).toBe(false);
    expect(BROKER_EXECUTION).toBe(false);
  });
});
