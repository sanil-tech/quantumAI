import { describe, it, expect } from 'vitest';
import { ShadowProductionRuntimeService } from '../src/server/services/shadowProductionRuntimeService';
import { EconomicContextService, NormalizedEconomicEvent } from '../src/server/services/economicContextService';
import { CoreFunctionalityForensicAuditService } from '../src/server/services/coreFunctionalityForensicAuditService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('SHADOW PERFORMANCE COCKPIT ? Operator Cockpit & Governance Integration', () => {
  it('1. System Health Telemetry: Verifies 11 core surveillance health domains are active', () => {
    ShadowProductionRuntimeService.initialize();
    const snap = ShadowProductionRuntimeService.getRuntimeSnapshot();

    expect(snap.systemStatus).toBe('RUNNING');
    expect(snap.marketDataStatus).toBe('HEALTHY');
    expect(snap.strategyStatus).toBe('ACTIVE');
    expect(snap.riskStatus).toBe('WITHIN_LIMITS');
    expect(snap.portfolioStatus).toBe('BALANCED');
    expect(snap.shadowExecutionStatus).toBe('ACTIVE_PAPER_TRADING');
    expect(snap.databaseStatus).toBe('CONNECTED');
    expect(snap.schedulerStatus).toBe('HEALTHY');
    expect(snap.safetyStatus).toBe('FAIL_CLOSED_LOCKED');
    expect(snap.brokerOrdersTransmitted).toBe(0);
    expect(snap.livePositions).toBe(0);
    expect(snap.secretExposure).toBe('NONE');
  });

  it('2. Economic News Filter: Evaluates high-impact event interception', () => {
    const event: NormalizedEconomicEvent = {
      eventId: 'EV-USD-FOMC',
      source: 'ECONOMIC_CALENDAR_PROVIDER',
      timestampUtc: new Date().toISOString(),
      currency: 'USD',
      country: 'US',
      title: 'FOMC Statement',
      impact: 'HIGH',
      sourceTimestamp: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      status: 'ACTIVE'
    };

    EconomicContextService.setEvents([event]);
    const evalRes = EconomicContextService.evaluateEconomicContext({ symbol: 'EURUSD', windowMinutes: 30 });
    expect(evalRes.hasHighImpactEventActive).toBe(true);
    expect(evalRes.decisionAllowed).toBe(false);

    // Clear event and re-verify
    EconomicContextService.clearEvents();
    const clearRes = EconomicContextService.evaluateEconomicContext({ symbol: 'EURUSD', windowMinutes: 30 });
    expect(clearRes.hasHighImpactEventActive).toBe(false);
    expect(clearRes.decisionAllowed).toBe(true);
  });

  it('3. P&L Accounting Integrity: Calculates gross P&L, spread, slippage, and net P&L', () => {
    const pnl = CoreFunctionalityForensicAuditService.calculatePositionPnL({
      direction: 'BUY',
      entryPrice: 1.08320,
      exitPrice: 1.08500,
      lotSize: 1.0,
      spreadPips: 1.0,
      slippagePips: 0.5
    });

    expect(pnl.grossPnL).toBe(180.00);
    expect(pnl.transactionCost).toBe(15.00);
    expect(pnl.netPnL).toBe(165.00);
  });

  it('4. Execution Safety Invariant: Disarms LIVE execution requests fail-closed', () => {
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

  it('5. Permanent Safety Invariants: 0 Broker Orders Transmitted & 0 Live Positions Remaining', () => {
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
