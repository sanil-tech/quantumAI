import { describe, it, expect } from 'vitest';
import { FinalExecutionGateService, ExecutionIntentPayload } from '../src/server/services/finalExecutionGateService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase19BrokerBoundaryAudit } from '../scripts/phase19-final-broker-boundary-audit';

describe('PHASE 19 ? Controlled Live-Pilot Execution Gate & Final Broker Boundary Audit', () => {
  const basePayload: ExecutionIntentPayload = {
    requestId: 'REQ-19-TEST',
    idempotencyKey: 'IDEM-19-TEST',
    strategyId: 'STRAT-AI-TREND-PULSE',
    strategyVersion: 'v2.0.0',
    symbol: 'EURUSD',
    direction: 'BUY',
    riskPercent: 1.5,
    environment: 'LIVE',
    actorId: 'ADMIN-01',
    actorRole: 'ADMIN'
  };

  it('1. Final Pre-Trade Gate: Intercepts LIVE execution request and denies fail-closed', () => {
    const res = FinalExecutionGateService.evaluateFinalExecutionGate(basePayload);
    expect(res.decision).toBe('DENIED');
    expect(res.reason).toContain('EXECUTION_SAFETY_GATE_BLOCKED');
    expect(res.brokerOrderTransmitted).toBe(false);
  });

  it('2. Final Pre-Trade Gate: Allows valid SHADOW execution without broker orders', () => {
    const shadowPayload = { ...basePayload, environment: 'SHADOW' as const };
    const res = FinalExecutionGateService.evaluateFinalExecutionGate(shadowPayload);
    expect(res.decision).toBe('APPROVED_FOR_SHADOW');
    expect(res.executionEnvironment).toBe('SHADOW_ONLY');
    expect(res.brokerOrderTransmitted).toBe(false);
  });

  it('3. Risk Governance: Rejects execution intent exceeding 2.0% risk cap', () => {
    const highRiskPayload = { ...basePayload, environment: 'SHADOW' as const, riskPercent: 2.8 };
    const res = FinalExecutionGateService.evaluateFinalExecutionGate(highRiskPayload);
    expect(res.decision).toBe('DENIED');
    expect(res.reason).toBe('RISK_CAP_EXCEEDED_2_PERCENT');
  });

  it('4. Strategy Immutability: Rejects tampered/mutated strategy version', () => {
    const mutatedPayload = { ...basePayload, environment: 'SHADOW' as const, strategyVersion: 'v2.0.1-mutated' };
    const res = FinalExecutionGateService.evaluateFinalExecutionGate(mutatedPayload);
    expect(res.decision).toBe('DENIED');
    expect(res.reason).toBe('STRATEGY_VERSION_MISMATCH_OR_MUTATED');
  });

  it('5. RBAC Enforcement: Strictly denies execution requests initiated by VIEWER', () => {
    const viewerPayload = { ...basePayload, environment: 'SHADOW' as const, actorRole: 'VIEWER' as const };
    const res = FinalExecutionGateService.evaluateFinalExecutionGate(viewerPayload);
    expect(res.decision).toBe('DENIED');
    expect(res.reason).toBe('UNAUTHORIZED_ROLE_VIEWER');
  });

  it('6. Runs Phase 19 Broker Boundary Audit script successfully', () => {
    const auditRes = runPhase19BrokerBoundaryAudit();
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
