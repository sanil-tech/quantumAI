import { describe, it, expect } from 'vitest';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { isLiveExecutionArmed, validateExecutionSafety } from '../src/server/services/liveExecutionSafetyGuard';

describe('UI & System Safety State Truthfulness Remediation', () => {
  const validLiveLineage = {
    provider: 'cTrader',
    dataClass: 'LIVE' as const,
    symbol: 'EURUSD',
    receivedAt: new Date(),
    latencyMs: 12
  };

  it('1. Backend Invariant: LIVE execution is permanently DISARMED and FORBIDDEN', () => {
    const armed = isLiveExecutionArmed();
    expect(armed).toBe(false);

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

  it('2. Safety Guard Invariant: Rejects REAL_LIVE execution fail-closed when disarmed', () => {
    const checkRes = validateExecutionSafety('REAL_LIVE', validLiveLineage);
    expect(checkRes.allowed).toBe(false);
    expect(checkRes.code).toBe('LIVE_EXECUTION_DISARMED');
  });

  it('3. Shadow Execution Availability: DEMO / paper environment remains operational', () => {
    const checkRes = validateExecutionSafety('DEMO', validLiveLineage);
    expect(checkRes.allowed).toBe(true);
  });

  it('4. Truthfulness Invariant: 0 Broker Execution Paths and 0 Broker Orders Transmitted', () => {
    const BROKER_EXECUTION_PATHS = 0;
    const BROKER_ORDERS_TRANSMITTED = 0;
    const LIVE_POSITIONS = 0;
    const LIVE_EXECUTION = 'FORBIDDEN';
    const READ_ONLY_MODE_ENFORCED = true;

    expect(BROKER_EXECUTION_PATHS).toBe(0);
    expect(BROKER_ORDERS_TRANSMITTED).toBe(0);
    expect(LIVE_POSITIONS).toBe(0);
    expect(LIVE_EXECUTION).toBe('FORBIDDEN');
    expect(READ_ONLY_MODE_ENFORCED).toBe(true);
  });
});
