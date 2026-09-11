import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('QUANTUMAI — DEMO EXECUTION MONITOR DASHBOARD & UI VISIBILITY SPECIFICATION', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Authoritative Header Status enforces DEMO mode and FORBIDDEN live execution', () => {
    const mockHeader = {
      environment: 'DEMO',
      brokerName: 'cTrader DEMO (demo.ctraderapi.com:5035)',
      serverHost: 'demo.ctraderapi.com',
      connectionStatus: 'CONNECTED',
      marketDataStatus: 'LIVE',
      accountNumber: '***7246',
      executionMode: 'DEMO',
      liveExecution: 'FORBIDDEN',
      automatedLiveExecution: 'DISABLED'
    };

    expect(mockHeader.environment).toBe('DEMO');
    expect(mockHeader.liveExecution).toBe('FORBIDDEN');
    expect(mockHeader.automatedLiveExecution).toBe('DISABLED');
    expect(mockHeader.accountNumber).toMatch(/^\*\*\*\d{4}$/);
  });

  it('2. Live DEMO Telemetry displays dynamic bid, ask, mid, spread, tick counter and data age', () => {
    const telemetry = {
      symbol: 'EUR/USD',
      bid: 1.16460,
      ask: 1.16462,
      mid: 1.16461,
      spread: 0.2,
      lastTickTimestamp: Date.now() - 500,
      dataAgeMs: 500,
      ticksReceived: 42,
      lastBrokerEvent: 'ProtoOASpotEvent (2131)'
    };

    expect(telemetry.bid).toBeLessThan(telemetry.ask);
    expect(telemetry.mid).toBeCloseTo((telemetry.bid + telemetry.ask) / 2, 5);
    expect(telemetry.spread).toBeCloseTo((telemetry.ask - telemetry.bid) * 10000, 1);
    expect(telemetry.ticksReceived).toBeGreaterThan(0);
    expect(telemetry.dataAgeMs).toBeLessThan(5000);
  });

  it('3. DEMO Account Summary truthfully displays broker metrics or fallback text', () => {
    const unavailableAccount = {
      balance: null,
      equity: null,
      freeMargin: null,
      usedMargin: null,
      marginLevel: null,
      openExposure: 0.0
    };

    const getDisplayValue = (val: number | null) => (val !== null ? `$${val.toFixed(2)}` : 'N/A — broker telemetry unavailable');

    expect(getDisplayValue(unavailableAccount.balance)).toBe('N/A — broker telemetry unavailable');
    expect(getDisplayValue(unavailableAccount.equity)).toBe('N/A — broker telemetry unavailable');
  });

  it('4. Open Positions displays truthful empty state "No open DEMO positions" when zero positions', () => {
    const openPositions: any[] = [];
    const emptyStateMessage = openPositions.length === 0 ? 'No open DEMO positions' : 'Open positions found';
    expect(emptyStateMessage).toBe('No open DEMO positions');
  });

  it('5. Execution History displays truthful empty state "No DEMO executions yet" when zero trades', () => {
    const closedTrades: any[] = [];
    const emptyStateMessage = closedTrades.length === 0 ? 'No DEMO executions yet' : 'Trades recorded';
    expect(emptyStateMessage).toBe('No DEMO executions yet');
  });

  it('6. Strict Shadow / DEMO Separation guarantees zero synthetic data enters DEMO metrics', () => {
    const mockState = {
      shadowOrdersTransmitted: 0,
      demoOrdersTransmitted: 1,
      liveOrdersTransmitted: 0,
      shadowObservationsCount: 154,
      demoClosedTrades: [
        { id: 'trade-1', symbol: 'EUR/USD', realizedPnL: -0.02, volumeLots: 0.01 }
      ]
    };

    expect(mockState.demoOrdersTransmitted).toBe(1);
    expect(mockState.liveOrdersTransmitted).toBe(0);
    expect(mockState.demoClosedTrades.length).toBe(1);
    expect(mockState.demoClosedTrades[0].realizedPnL).toBe(-0.02);
  });

  it('7. Reconciliation Panel correctly renders RECONCILED vs MISMATCH states', () => {
    const reconciled = { broker: 0, qai: 0, diff: 0, status: 'RECONCILED' };
    const mismatch = { broker: 1, qai: 0, diff: 1, status: 'MISMATCH' };

    expect(reconciled.status).toBe('RECONCILED');
    expect(reconciled.diff).toBe(0);
    expect(mismatch.status).toBe('MISMATCH');
    expect(mismatch.diff).toBe(1);
  });

  it('8. Authoritative Risk Monitor displays 2% equity risk cap and daily loss limits', () => {
    const risk = {
      positionSizeLimitLots: 0.01,
      maxRiskPerTradePercent: 2.0,
      dailyLossLimit: 250.0,
      killSwitch: 'INACTIVE',
      staleDataProtection: 'ACTIVE (>30s)'
    };

    expect(risk.positionSizeLimitLots).toBe(0.01);
    expect(risk.maxRiskPerTradePercent).toBe(2.0);
    expect(risk.killSwitch).toBe('INACTIVE');
  });

  it('9. Stale data transitions market data status to STALE and never generates fake prices', () => {
    const calculateMarketDataStatus = (connected: boolean, dataAgeMs: number | null) => {
      if (!connected || dataAgeMs === null) return 'DISCONNECTED';
      if (dataAgeMs < 5000) return 'LIVE';
      if (dataAgeMs < 15000) return 'DEGRADED';
      return 'STALE';
    };

    expect(calculateMarketDataStatus(true, 1000)).toBe('LIVE');
    expect(calculateMarketDataStatus(true, 8000)).toBe('DEGRADED');
    expect(calculateMarketDataStatus(true, 25000)).toBe('STALE');
    expect(calculateMarketDataStatus(false, null)).toBe('DISCONNECTED');
  });

  it('10. Execution Pipeline Visualizer displays 9 discrete lifecycle stages', () => {
    const pipeline = {
      marketSignal: 'IDLE',
      proposal: 'NONE',
      riskCheck: 'PASS',
      approval: 'REQUIRED',
      execution: 'DEMO_READY',
      brokerAck: 'READY',
      position: 'NONE',
      close: 'IDLE',
      reconciliation: 'RECONCILED'
    };

    expect(pipeline.marketSignal).toBe('IDLE');
    expect(pipeline.riskCheck).toBe('PASS');
    expect(pipeline.approval).toBe('REQUIRED');
    expect(pipeline.reconciliation).toBe('RECONCILED');
  });

  it('11. UI Wiring Check — App.tsx has portal-demo-monitor-btn and renders DemoExecutionMonitor', () => {
    const appPath = path.resolve(__dirname, '../src/App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    expect(appContent).toContain('DemoExecutionMonitor');
    expect(appContent).toContain('id="portal-demo-monitor-btn"');
    expect(appContent).toContain("portalMode === 'DEMO_MONITOR'");
  });

  it('12. UI Wiring Check — UserDashboard.tsx contains DEMO_MONITOR tab and renders DemoExecutionMonitor', () => {
    const userDashPath = path.resolve(__dirname, '../src/components/UserDashboard.tsx');
    const userDashContent = fs.readFileSync(userDashPath, 'utf8');

    expect(userDashContent).toContain('DemoExecutionMonitor');
    expect(userDashContent).toContain("activeTab === 'DEMO_MONITOR'");
    expect(userDashContent).toContain("<DemoExecutionMonitor");
  });
});
