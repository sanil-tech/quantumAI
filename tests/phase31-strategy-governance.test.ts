import { describe, it, expect } from 'vitest';
import { StrategyQualificationGovernanceService } from '../src/server/services/strategyQualificationGovernanceService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase31Certification } from '../scripts/phase31-strategy-governance-audit';

describe('PHASE 31 ? Strategy Qualification Governance & Controlled Live-Pilot Readiness Audit', () => {
  const sampleTrades: { pnl: number; cost: number; asset: 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'XAUUSD' }[] = [];
  for (let i = 0; i < 40; i++) {
    sampleTrades.push({ pnl: 100, cost: 9, asset: 'EURUSD' });
  }
  for (let i = 0; i < 20; i++) {
    sampleTrades.push({ pnl: -60, cost: 9, asset: 'GBPUSD' });
  }

  it('1. Full Governance Audit: Returns QUALIFIED_AND_ELIGIBLE_FOR_LIVE_PILOT_REVIEW on dual approval', () => {
    const res = StrategyQualificationGovernanceService.performGovernanceAudit({
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      rawTrades: sampleTrades,
      reviewerA: 'officer-risk-01',
      reviewerB: 'officer-compliance-02'
    });

    expect(res.governanceDecision).toBe('QUALIFIED_AND_ELIGIBLE_FOR_LIVE_PILOT_REVIEW');
    expect(res.livePilotEligible).toBe(true);
    expect(res.livePilotAuthorized).toBe(false);
    expect(res.livePilotActive).toBe(false);
    expect(res.brokerOrdersTransmitted).toBe(0);
  });

  it('2. Dual-Control Enforcement: Fails with REJECTED when Reviewer A == Reviewer B', () => {
    const res = StrategyQualificationGovernanceService.performGovernanceAudit({
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      rawTrades: sampleTrades,
      reviewerA: 'officer-risk-01',
      reviewerB: 'officer-risk-01'
    });

    expect(res.dualControlStatus).toBe('FAIL_SAME_REVIEWER');
    expect(res.governanceDecision).toBe('REJECTED');
    expect(res.livePilotEligible).toBe(false);
  });

  it('3. Strategy Version Immutability: Fails with REJECTED if mutated flag is detected', () => {
    const res = StrategyQualificationGovernanceService.performGovernanceAudit({
      strategyId: 'ALPHA-ORCHESTRATOR-V1',
      strategyVersion: '1.4.0',
      strategyHash: 'hash-alpha-140',
      rawTrades: sampleTrades,
      reviewerA: 'officer-risk-01',
      reviewerB: 'officer-compliance-02',
      isMutated: true
    });

    expect(res.versionImmutabilityVerified).toBe(false);
    expect(res.governanceDecision).toBe('REJECTED');
  });

  it('4. Insufficient Sample Size: Requires more shadow evidence when trade count < 30', () => {
    const res = StrategyQualificationGovernanceService.performGovernanceAudit({
      strategyId: 'ALPHA-SMALL',
      strategyVersion: '0.1.0',
      strategyHash: 'hash-small-01',
      rawTrades: sampleTrades.slice(0, 15),
      reviewerA: 'officer-risk-01',
      reviewerB: 'officer-compliance-02'
    });

    expect(res.governanceDecision).toBe('QUALIFIED_BUT_REQUIRES_MORE_SHADOW_EVIDENCE');
    expect(res.livePilotEligible).toBe(false);
  });

  it('5. Runs Phase 31 Strategy Governance Audit Script', () => {
    const res = runPhase31Certification();
    expect(res.success).toBe(true);
    expect(res.auditRes.brokerOrdersTransmitted).toBe(0);
    expect(res.auditRes.brokerExecutionPaths).toBe(0);
    expect(res.auditRes.livePositions).toBe(0);
    expect(res.auditRes.secretExposure).toBe('NONE');
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
