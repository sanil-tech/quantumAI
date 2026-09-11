import { describe, it, expect } from 'vitest';
import { runPhase7QArchive } from '../scripts/phase7q-subsystem-archive';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('PHASE 7Q ? Final Comprehensive Subsystem Verification & Certification Archive', () => {
  it('1. Verifies the complete Phase 7I through 7Q certification chain', () => {
    const archive = runPhase7QArchive();
    expect(archive.phases['7I']).toBe('PASS');
    expect(archive.phases['7J']).toBe('PASS');
    expect(archive.phases['7K']).toBe('PASS');
    expect(archive.phases['7L']).toBe('PASS');
    expect(archive.phases['7M']).toBe('PASS');
    expect(archive.phases['7N']).toBe('PASS');
    expect(archive.phases['7O']).toBe('PASS');
    expect(archive.phases['7P']).toBe('PASS');
    expect(archive.phases['7Q']).toBe('PASS');
  });

  it('2. Verifies all 14 architectural checkpoints are PASS', () => {
    const archive = runPhase7QArchive();
    const checkpoints = Object.values(archive.architecturalCheckpoints);
    expect(checkpoints.length).toBe(14);
    for (const cp of checkpoints) {
      expect(cp).toBe('PASS');
    }
  });

  it('3. Confirms Operational Readiness Score is 100/100 and Classification B', () => {
    const archive = runPhase7QArchive();
    expect(archive.operationalScore).toBe(100);
    expect(archive.finalClassification).toBe('B');
  });

  it('4. Safety Gate: Confirms LIVE execution is disarmed across all entrypoints', () => {
    const res = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('LIVE_EXECUTION_DISARMED');
  });

  it('5. Safety Invariant: 0 new real demo orders & 0 positions remaining', () => {
    const archive = runPhase7QArchive();
    expect(archive.safetyState.newRealDemoOrders).toBe(0);
    expect(archive.safetyState.positionsRemaining).toBe(0);
    expect(archive.safetyState.readOnlyModeEnforced).toBe(true);
    expect(archive.safetyState.liveExecutionForbidden).toBe(true);
  });
});
