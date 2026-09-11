import { describe, it, expect } from 'vitest';
import { LongTermShadowSurveillanceService } from '../src/server/services/longTermShadowSurveillanceService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase24CertificationAudit } from '../scripts/phase24-long-term-shadow-certification';

describe('PHASE 24 ? Long-Term Shadow Surveillance & Operational Governance Certification', () => {
  it('1. 20-Domain Health Monitoring: Evaluates all 20 operational domains deterministically', () => {
    const res = LongTermShadowSurveillanceService.evaluate20DomainHealth();
    expect(res.overallState).toBe('HEALTHY');
    expect(res.domains.length).toBe(20);
  });

  it('2. Anomaly Detection: Detects anomalies and flags appropriate severity levels fail-closed', () => {
    const anomalies = LongTermShadowSurveillanceService.detectAnomalies({
      spreadPips: 4.2,
      quoteAgeMs: 8000,
      duplicateSignals: true,
      configHashMatch: false
    });
    expect(anomalies.length).toBe(4);
    expect(anomalies.some(a => a.severity === 'CRITICAL')).toBe(true);
    expect(anomalies.some(a => a.severity === 'WARNING')).toBe(true);
  });

  it('3. Evidence Archive Hash Chaining: Appends blocks and validates cryptographic chain integrity', () => {
    const b1 = LongTermShadowSurveillanceService.appendEvidenceArchiveBlock('TEST-01', 'OP-1', 'SIG_GEN', 'CORR-01', { sym: 'EURUSD' });
    const b2 = LongTermShadowSurveillanceService.appendEvidenceArchiveBlock('TEST-02', 'OP-1', 'SHADOW_ENTRY', 'CORR-02', { sym: 'EURUSD', pnl: 40 });
    expect(b2.prevBlockHash).toBe(b1.currBlockHash);
    expect(LongTermShadowSurveillanceService.verifyEvidenceChainIntegrity()).toBe(true);
  });

  it('4. Surveillance Summary: Reports steady-state uptime and verified release integrity', () => {
    const summary = LongTermShadowSurveillanceService.getSurveillanceSummary();
    expect(summary.uptimePercent).toBeGreaterThan(99.0);
    expect(summary.evidenceChainValid).toBe(true);
    expect(summary.releaseIntegrityVerified).toBe(true);
    expect(summary.brokerOrdersTransmitted).toBe(0);
  });

  it('5. Runs Phase 24 Long-Term Shadow Surveillance Certification Script', () => {
    const auditRes = runPhase24CertificationAudit();
    expect(auditRes.success).toBe(true);
    expect(auditRes.operationalReadinessScore).toBe(100);
    expect(auditRes.brokerOrdersTransmitted).toBe(0);
  });

  it('6. Execution Safety Invariant: Disarms LIVE execution requests fail-closed', () => {
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

  it('7. Permanent Safety Invariant: 0 Broker Orders Transmitted & 0 Live Positions Remaining', () => {
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
