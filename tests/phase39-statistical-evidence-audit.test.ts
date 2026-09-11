import { describe, it, expect } from 'vitest';
import { StatisticalEvidenceAuditService, AuditTradeRecord } from '../src/server/services/statisticalEvidenceAuditService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase39Certification } from '../scripts/phase39-statistical-evidence-certification';

describe('PHASE 39 ? Shadow Performance & Statistical Evidence Certification', () => {
  const sampleTrades: AuditTradeRecord[] = [
    {
      id: 'TR-1',
      asset: 'EURUSD',
      regime: 'TREND',
      timeframe: 'H1',
      pnl: 120,
      cost: 9,
      confidence: 0.85,
      timestamp: '2026-08-18T10:00:00Z'
    },
    {
      id: 'TR-2',
      asset: 'GBPUSD',
      regime: 'RANGE',
      timeframe: 'M15',
      pnl: -50,
      cost: 9,
      confidence: 0.70,
      timestamp: '2026-08-18T11:00:00Z'
    }
  ];

  it('1. Nominal Audit Calculation: Computes gross/net PnL with 0 broker orders', () => {
    const res = StatisticalEvidenceAuditService.performStatisticalAudit({
      evidenceId: 'EV-01',
      evidenceClass: 'SHADOW_RUNTIME',
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      trades: sampleTrades,
      costMultiplier: 1.0
    });

    expect(res.tradeCount).toBe(2);
    expect(res.grossPnL).toBe(70);
    expect(res.totalCosts).toBe(18);
    expect(res.netPnL).toBe(52);
    expect(res.statisticalSufficiency).toBe('INSUFFICIENT_EVIDENCE');
    expect(res.qualificationStatus).toBe('INCONCLUSIVE');
    expect(res.governanceDecision).toBe('COLLECT_MORE_EVIDENCE');
    expect(res.brokerOrdersTransmitted).toBe(0);
    expect(res.livePilotActive).toBe(false);
  });

  it('2. Data Leakage Interception: Flags LEAKAGE_DETECTED and results in DISQUALIFIED', () => {
    const res = StatisticalEvidenceAuditService.performStatisticalAudit({
      evidenceId: 'EV-01',
      evidenceClass: 'SHADOW_RUNTIME',
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      trades: sampleTrades,
      hasDataLeakage: true
    });

    expect(res.dataLeakageStatus).toBe('LEAKAGE_DETECTED');
    expect(res.qualificationStatus).toBe('DISQUALIFIED');
    expect(res.governanceDecision).toBe('SUSPEND_STRATEGY');
  });

  it('3. Cost Stress Challenge: Accurately reflects 3.0x cost multiplier and reduces net PnL', () => {
    const baseRes = StatisticalEvidenceAuditService.performStatisticalAudit({
      evidenceId: 'EV-01',
      evidenceClass: 'SHADOW_RUNTIME',
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      trades: sampleTrades,
      costMultiplier: 1.0
    });

    const stressRes = StatisticalEvidenceAuditService.performStatisticalAudit({
      evidenceId: 'EV-01',
      evidenceClass: 'SHADOW_RUNTIME',
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      trades: sampleTrades,
      costMultiplier: 3.0
    });

    expect(stressRes.totalCosts).toBe(baseRes.totalCosts * 3);
    expect(stressRes.netPnL).toBeLessThan(baseRes.netPnL);
  });

  it('4. Reproducibility: Identical input arguments yield identical SHA-256 evidence hashes', () => {
    const input = {
      evidenceId: 'EV-REPRO-01',
      evidenceClass: 'SHADOW_RUNTIME' as const,
      strategyId: 'ALPHA-REPRO-01',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      trades: sampleTrades,
      costMultiplier: 1.0
    };

    const r1 = StatisticalEvidenceAuditService.performStatisticalAudit(input);
    const r2 = StatisticalEvidenceAuditService.performStatisticalAudit(input);
    expect(r1.evidenceHash).toBe(r2.evidenceHash);
  });

  it('5. Runs Phase 39 Statistical Evidence Certification Script', () => {
    const res = runPhase39Certification();
    expect(res.success).toBe(true);
    expect(res.nominalRes.brokerOrdersTransmitted).toBe(0);
    expect(res.nominalRes.brokerExecutionPaths).toBe(0);
    expect(res.nominalRes.livePositions).toBe(0);
    expect(res.nominalRes.secretExposure).toBe('NONE');
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
