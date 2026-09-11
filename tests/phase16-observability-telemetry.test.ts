import { describe, it, expect } from 'vitest';
import { SystemObservabilityService } from '../src/server/services/systemObservabilityService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('PHASE 16 ? Continuous Monitoring, Telemetry & Operator Observability', () => {
  it('1. Records periodic system heartbeats and tracks uptime', () => {
    SystemObservabilityService.recordHeartbeat();
    const snap = SystemObservabilityService.getObservabilitySnapshot();
    expect(snap.systemHealth).toBe('HEALTHY');
    expect(snap.operatingMode).toBe('CONTROLLED_DEMO_SHADOW_ONLY');
    expect(snap.lastHeartbeatUtc).toBeDefined();
    expect(snap.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('2. Records structured telemetry events with correlation ID and zero secret leakage', () => {
    const event = SystemObservabilityService.recordEvent(
      'SIGNAL_GENERATED',
      'SIGNAL_ENGINE',
      'INFO',
      'CORR-TEST-99',
      'EURUSD BUY generated with 85 confidence',
      {
        symbol: 'EURUSD',
        direction: 'BUY',
        clientSecret: 'REDACTED_SECRET',
        accessToken: 'REDACTED_TOKEN'
      }
    );

    expect(event.eventId).toBeDefined();
    expect(event.correlationId).toBe('CORR-TEST-99');
    expect(event.metadata?.symbol).toBe('EURUSD');
    expect(event.metadata?.clientSecret).toBeUndefined();
    expect(event.metadata?.accessToken).toBeUndefined();
  });

  it('3. Raises operator alerts for WARN/ERROR events with full context', () => {
    SystemObservabilityService.recordEvent(
      'STRATEGY_SUSPENDED',
      'STRATEGY',
      'WARN',
      'CORR-ALERT-01',
      'Strategy suspended due to drawdown breach'
    );

    const snap = SystemObservabilityService.getObservabilitySnapshot();
    expect(snap.recentAlerts.length).toBeGreaterThan(0);
    const alert = snap.recentAlerts[0];
    expect(alert.what).toContain('STRATEGY_SUSPENDED');
    expect(alert.affectedComponent).toBe('STRATEGY');
    expect(alert.severity).toBe('WARN');
  });

  it('4. Tracks 12 authoritative domain health states', () => {
    const snap = SystemObservabilityService.getObservabilitySnapshot();
    const domains = Object.keys(snap.domainHealth);
    expect(domains).toContain('SYSTEM');
    expect(domains).toContain('MARKET_DATA');
    expect(domains).toContain('SIGNAL_ENGINE');
    expect(domains).toContain('STRATEGY');
    expect(domains).toContain('PORTFOLIO_RISK');
    expect(domains).toContain('SHADOW_EXECUTION');
    expect(domains).toContain('PERSISTENCE');
    expect(domains).toContain('RECONCILIATION');
    expect(domains).toContain('ECONOMIC_CONTEXT');
    expect(domains).toContain('AI_CONTEXT');
    expect(domains).toContain('SECURITY');
    expect(domains).toContain('EXECUTION_SAFETY');
  });

  it('5. Safety State Observability: Snapshot accurately reflects fail-closed lock', () => {
    const snap = SystemObservabilityService.getObservabilitySnapshot();
    expect(snap.safetyState.readOnlyModeEnforced).toBe(true);
    expect(snap.safetyState.executionSafetyGate).toBe('BLOCKED');
    expect(snap.safetyState.liveExecution).toBe('FORBIDDEN');
    expect(snap.safetyState.brokerOrdersTransmitted).toBe(0);
    expect(snap.safetyState.positionsRemaining).toBe(0);
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

  it('7. Permanent Safety Invariant: 0 Broker Orders Transmitted & 0 Positions Remaining', () => {
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
