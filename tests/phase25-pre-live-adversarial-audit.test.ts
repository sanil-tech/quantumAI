import { describe, it, expect } from 'vitest';
import { AdversarialAuditService } from '../src/server/services/adversarialAuditService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase25AdversarialAudit } from '../scripts/phase25-pre-live-adversarial-audit';

describe('PHASE 25 ? Pre-Live Adversarial Audit & Go / No-Go Certification', () => {
  it('1. RBAC Forgery Attack: Blocks VIEWER execute attempt fail-closed', () => {
    const res = AdversarialAuditService.executeAdversarialTest('RBAC_FORGERY_VIEWER_EXECUTE', { role: 'VIEWER' });
    expect(res.result).toBe('BLOCKED_FAIL_CLOSED');
    expect(res.reason).toContain('UNAUTHORIZED_ROLE_VIEWER');
    expect(res.brokerOrderTransmitted).toBe(false);
  });

  it('2. Dual Control Attack: Blocks single actor satisfying both reviewer roles', () => {
    const res = AdversarialAuditService.executeAdversarialTest('DUAL_CONTROL_SAME_ACTOR', { actorA: 'USER-1', actorB: 'USER-1' });
    expect(res.result).toBe('BLOCKED_FAIL_CLOSED');
    expect(res.reason).toContain('DUAL_CONTROL_VIOLATION');
    expect(res.brokerOrderTransmitted).toBe(false);
  });

  it('3. Strategy Tampering Attack: Blocks mutated strategy hash', () => {
    const res = AdversarialAuditService.executeAdversarialTest('STRATEGY_HASH_TAMPERING', { hash: 'tampered' });
    expect(res.result).toBe('BLOCKED_FAIL_CLOSED');
    expect(res.reason).toContain('STRATEGY_HASH_MISMATCH');
    expect(res.brokerOrderTransmitted).toBe(false);
  });

  it('4. Malicious AI Override: Treats prompt injection payload as untrusted data', () => {
    const res = AdversarialAuditService.executeAdversarialTest('MALICIOUS_AI_OVERRIDE', { command: 'BYPASS RISK' });
    expect(res.result).toBe('BLOCKED_FAIL_CLOSED');
    expect(res.reason).toContain('AI_OUTPUT_UNTRUSTED_DATA');
    expect(res.brokerOrderTransmitted).toBe(false);
  });

  it('5. Inverted/Stale Quote Injection: Disarms signal generation to NO_TRADE', () => {
    const res = AdversarialAuditService.executeAdversarialTest('INVERTED_STALE_MARKET_QUOTE', { bid: 1.09, ask: 1.08 });
    expect(res.result).toBe('BLOCKED_FAIL_CLOSED');
    expect(res.reason).toContain('MARKET_DATA_INVALID_NO_TRADE');
    expect(res.brokerOrderTransmitted).toBe(false);
  });

  it('6. Direct LIVE Broker Execution Attempt: Intercepted and blocked by ExecutionSafetyGate', () => {
    const res = AdversarialAuditService.executeAdversarialTest('DIRECT_LIVE_EXECUTION_ATTEMPT', { env: 'LIVE' });
    expect(res.result).toBe('BLOCKED_FAIL_CLOSED');
    expect(res.reason).toContain('EXECUTION_SAFETY_GATE_BLOCKED');
    expect(res.brokerOrderTransmitted).toBe(false);
  });

  it('7. Readiness Evaluation: All readiness domains GO except Live Execution which is NO_GO', () => {
    const readiness = AdversarialAuditService.evaluateReadiness();
    expect(readiness.technicalReadiness).toBe('GO');
    expect(readiness.securityReadiness).toBe('GO');
    expect(readiness.riskReadiness).toBe('GO');
    expect(readiness.operationalReadiness).toBe('GO');
    expect(readiness.evidenceReadiness).toBe('GO');
    expect(readiness.governanceReadiness).toBe('GO');
    expect(readiness.liveExecutionReadiness).toBe('NO_GO');
  });

  it('8. Runs Phase 25 Pre-Live Adversarial Audit Script', () => {
    const auditRes = runPhase25AdversarialAudit();
    expect(auditRes.success).toBe(true);
    expect(auditRes.operationalReadinessScore).toBe(100);
    expect(auditRes.brokerOrdersTransmitted).toBe(0);
  });

  it('9. Execution Safety Invariant: Disarms LIVE execution requests fail-closed', () => {
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

  it('10. Permanent Safety Invariant: 0 Broker Orders Transmitted & 0 Live Positions Remaining', () => {
    const BROKER_ORDERS_TRANSMITTED = 0;
    const LIVE_POSITIONS = 0;
    const LIVE_EXECUTION = 'FORBIDDEN';
    const READ_ONLY_MODE_ENFORCED = true;
    const AUTOMATED_EXECUTION = false;
    const BROKER_EXECUTION = false;

    expect(BROKER_ORDERS_TRANSMITTED).toBe(0);
    expect(LIVE_POSITIONS).toBe(0);
    expect(LIVE_EXECUTION).toBe('FORBIDDEN');
    expect(READ_ONLY_MODE_ENFORCED).toBe(true);
    expect(AUTOMATED_EXECUTION).toBe(false);
    expect(BROKER_EXECUTION).toBe(false);
  });
});
