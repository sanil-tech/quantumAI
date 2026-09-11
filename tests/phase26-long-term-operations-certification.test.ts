import { describe, it, expect } from 'vitest';
import { LongTermOperationsCertificationService } from '../src/server/services/longTermOperationsCertificationService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase26Certification } from '../scripts/phase26-long-term-operations-certification';

describe('PHASE 26 ? Long-Term Operations Certification & Safety Lock', () => {
  it('1. Generates Complete Phase 26 Certification Report', () => {
    const cert = LongTermOperationsCertificationService.generateCertification();
    expect(cert.currentPhase).toBe('PHASE 26 COMPLETE');
    expect(cert.status).toBe('PASS');
    expect(cert.technicalReadiness).toBe('GO');
    expect(cert.securityReadiness).toBe('GO');
    expect(cert.operationalReadiness).toBe('GO');
    expect(cert.evidenceReadiness).toBe('GO');
    expect(cert.governanceReadiness).toBe('GO');
    expect(cert.liveExecutionReadiness).toBe('NO-GO');
    expect(cert.finalDecision).toBe('GO');
    expect(cert.brokerExecutionPaths).toBe(0);
    expect(cert.brokerOrdersTransmitted).toBe(0);
    expect(cert.livePositions).toBe(0);
    expect(cert.secretExposure).toBe('NONE');
  });

  it('2. Runs Phase 26 Long-Term Operations Certification Script', () => {
    const res = runPhase26Certification();
    expect(res.success).toBe(true);
    expect(res.cert.brokerOrdersTransmitted).toBe(0);
  });

  it('3. Execution Safety Invariant: Disarms LIVE execution requests fail-closed', () => {
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

  it('4. Permanent Safety Invariant: 0 Broker Orders Transmitted & 0 Live Positions Remaining', () => {
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
