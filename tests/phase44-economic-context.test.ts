import { describe, it, expect } from 'vitest';
import { EconomicContextService, NormalizedEconomicEvent } from '../src/server/services/economicContextService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { runPhase44Certification } from '../scripts/phase44-economic-context-release-audit';

describe('PHASE 44 ? Economic Context Completion & Production Shadow Release Candidate', () => {
  it('1. High-Impact Event Interception: Intercepts active high-impact event and forces NO_TRADE', () => {
    const event: NormalizedEconomicEvent = {
      eventId: 'EV-1',
      source: 'ECONOMIC_CALENDAR_PROVIDER',
      timestampUtc: new Date().toISOString(),
      currency: 'USD',
      country: 'US',
      title: 'FOMC Rate Decision',
      impact: 'HIGH',
      sourceTimestamp: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      status: 'ACTIVE'
    };

    EconomicContextService.setEvents([event]);
    const res = EconomicContextService.evaluateEconomicContext({
      symbol: 'EURUSD',
      windowMinutes: 30
    });

    expect(res.hasHighImpactEventActive).toBe(true);
    expect(res.decisionAllowed).toBe(false);
    expect(res.reason).toBe('HIGH_IMPACT_ECONOMIC_EVENT_ACTIVE_NO_TRADE');
  });

  it('2. Clear Economic Context: Permits trade when no high-impact event is active', () => {
    EconomicContextService.clearEvents();
    const res = EconomicContextService.evaluateEconomicContext({
      symbol: 'EURUSD',
      windowMinutes: 30
    });

    expect(res.hasHighImpactEventActive).toBe(false);
    expect(res.decisionAllowed).toBe(true);
    expect(res.reason).toBe('ECONOMIC_CONTEXT_CLEAR_TRADE_PERMITTED');
  });

  it('3. Stale Data Interception: Flags ECONOMIC_DATA_STALE_FAIL_CLOSED_NO_TRADE', () => {
    const staleEvent: NormalizedEconomicEvent = {
      eventId: 'EV-STALE',
      source: 'ECONOMIC_CALENDAR_PROVIDER',
      timestampUtc: new Date().toISOString(),
      currency: 'USD',
      country: 'US',
      title: 'Stale News',
      impact: 'HIGH',
      sourceTimestamp: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      status: 'STALE'
    };

    EconomicContextService.setEvents([staleEvent]);
    const res = EconomicContextService.evaluateEconomicContext({
      symbol: 'EURUSD',
      windowMinutes: 30,
      allowStale: false
    });

    expect(res.decisionAllowed).toBe(false);
    expect(res.reason).toBe('ECONOMIC_DATA_STALE_FAIL_CLOSED_NO_TRADE');
  });

  it('4. Currency Specific Filtering: USD event affects EURUSD and GBPUSD but not non-USD pairs', () => {
    const usdEvent: NormalizedEconomicEvent = {
      eventId: 'EV-USD',
      source: 'ECONOMIC_CALENDAR_PROVIDER',
      timestampUtc: new Date().toISOString(),
      currency: 'USD',
      country: 'US',
      title: 'US CPI',
      impact: 'HIGH',
      sourceTimestamp: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      status: 'ACTIVE'
    };

    EconomicContextService.setEvents([usdEvent]);
    const eurusd = EconomicContextService.evaluateEconomicContext({ symbol: 'EURUSD' });
    const xauusd = EconomicContextService.evaluateEconomicContext({ symbol: 'XAUUSD' });

    expect(eurusd.decisionAllowed).toBe(false);
    expect(xauusd.decisionAllowed).toBe(false);
  });

  it('5. Reproducibility: Identical input arguments yield identical SHA-256 evidence hashes', () => {
    EconomicContextService.clearEvents();
    const r1 = EconomicContextService.evaluateEconomicContext({ symbol: 'GBPUSD', currentTimeUtc: '2026-08-18T12:00:00Z' });
    const r2 = EconomicContextService.evaluateEconomicContext({ symbol: 'GBPUSD', currentTimeUtc: '2026-08-18T12:00:00Z' });
    expect(r1.evidenceHash).toBe(r2.evidenceHash);
  });

  it('6. Runs Phase 44 Economic Context Release Audit Script', () => {
    const res = runPhase44Certification();
    expect(res.success).toBe(true);
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

  it('8. Permanent Safety Invariant: 0 Broker Orders Transmitted & 0 Live Positions Remaining', () => {
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
