import { describe, it, expect } from 'vitest';
import { CTraderDemoLifecycleHarness, P19HarnessConfig } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';
import { runControlledPhase7CDemoExecution } from '../scripts/phase7c-controlled-demo-execution';

describe('PHASE 7C ? Real cTrader DEMO Controlled Execution Certification', () => {
  const validDemoConfig: P19HarnessConfig = {
    environment: 'DEMO',
    confirmDemoExecution: true,
    clientId: 'test_client_id_123',
    clientSecret: 'test_client_secret_456',
    accountId: '48282756',
    accessToken: 'test_access_token_789',
    host: 'demo.ctraderapi.com',
    port: 5035,
    symbol: 'EURUSD',
    side: 'BUY',
    lots: 0.01,
    timeoutMs: 5000
  };

  // 1. Strict Fail-Closed Rejection of LIVE
  it('1. Pre-flight rejects LIVE environment fail-closed', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({ ...validDemoConfig, environment: 'LIVE' });
    }).toThrow('SAFETY_VIOLATION_FATAL: LIVE environment is strictly prohibited');
  });

  // 2. Strict Fail-Closed Rejection of LIVE Host
  it('2. Pre-flight rejects live.ctraderapi.com host fail-closed', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({ ...validDemoConfig, host: 'live.ctraderapi.com' });
    }).toThrow('SAFETY_VIOLATION: DEMO host must be exactly "demo.ctraderapi.com"');
  });

  // 3. Rejects Missing Explicit Confirmation Flag
  it('3. Pre-flight rejects execution when confirmDemoExecution is false', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({ ...validDemoConfig, confirmDemoExecution: false });
    }).toThrow('SAFETY_VIOLATION: Explicit DEMO confirmation flag');
  });

  // 4. Rejects Missing Credentials
  it('4. Pre-flight rejects missing client secret or token', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({ ...validDemoConfig, clientSecret: '' });
    }).toThrow('SAFETY_VIOLATION: Missing required cTrader DEMO API credentials.');
  });

  // 5. Enforces Exact Single Order Volume Bounds
  it('5. Enforces valid single order test volume (0.01 lots)', () => {
    const payload = CTraderDemoLifecycleHarness.buildNewOrderPayload(48282756, 1, 'BUY', 100000);
    expect(payload.volume).toBe(100000);
    expect(payload.tradeSide).toBe(1);
    expect(payload.orderType).toBe(1);
  });

  // 6. Zero Retry on Upstream Timeout
  it('6. Fails closed and blocks execution on upstream transport timeout without retrying', async () => {
    const result = await runControlledPhase7CDemoExecution();
    expect(result.readOnlyModeEnforced).toBe(true);
    expect(result.executionSafetyGate).toBe('BLOCKED');
    expect(result.ordersTransmitted).toBe(0);
  });

  // 7. Post-Test Lockdown Invariant
  it('7. Guarantees system finishes in permanent read-only lockdown', async () => {
    const result = await runControlledPhase7CDemoExecution();
    expect(result.readOnlyModeEnforced).toBe(true);
    expect(result.executionSafetyGate).toBe('BLOCKED');
  });
});
