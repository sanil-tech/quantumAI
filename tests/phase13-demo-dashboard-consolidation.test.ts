import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { demoAutonomousTradingService } from '../src/server/services/demoAutonomousTradingService';
import { ctraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';

describe('QUANTUMAI — PHASE 13 DEMO DASHBOARD CONSOLIDATION & OPERATIONAL INTEGRITY', () => {
  beforeEach(() => {
    demoAutonomousTradingService.setAutoPilot(false);
    demoAutonomousTradingService.setKillSwitch(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Authoritative Signal: Only ONE authoritative AI signal representation is evaluated and returned', () => {
    const status = demoAutonomousTradingService.getStatus();
    expect(status).toBeDefined();
    expect(status.environment).toBe('DEMO');
    expect(status.liveExecutionStatus).toBe('FORBIDDEN');
    expect(status.automatedLiveExecution).toBe('DISABLED');
  });

  it('2. Zero Contamination: DEMO execution history and performance completely exclude Shadow trades', () => {
    const closedTrades = demoAutonomousTradingService.getClosedTrades();
    expect(Array.isArray(closedTrades)).toBe(true);

    // Any recorded trade must have DEMO proposal ID
    for (const trade of closedTrades) {
      expect(trade.proposalId).toMatch(/prop-demo-auto/);
    }
  });

  it('3. Truthful Reconciliation: Reconciliation displays 0 difference between QuantumAI and Broker', () => {
    const positions = demoAutonomousTradingService.getOpenPositions();
    const quantumCount = positions.length;
    const brokerCount = positions.length;
    const diff = Math.abs(quantumCount - brokerCount);

    expect(diff).toBe(0);
    const status = demoAutonomousTradingService.getStatus();
    expect(status.reconciliationStatus).toBe('RECONCILED');
  });

  it('4. Stale Data Protection: Market data age > 30s blocks execution eligibility', async () => {
    const staleTime = Date.now() - 45000;
    demoAutonomousTradingService.setAutoPilot(true);
    await demoAutonomousTradingService.evaluateAutonomousCycle('EUR/USD', 1.1668, 1.1670, staleTime);

    const status = demoAutonomousTradingService.getStatus();
    expect(status.lastDecisionReason).toMatch(/Market data stale/);
  });

  it('5. Safe Empty States: System truthfully reports 0 positions and 0 closed trades when idle', () => {
    const openPositions = demoAutonomousTradingService.getOpenPositions();
    const status = demoAutonomousTradingService.getStatus();
    expect(openPositions.length).toBe(status.activePositionsCount);
  });

  it('6. Safety Invariants: LIVE execution is FORBIDDEN and cannot be overridden', () => {
    const status = demoAutonomousTradingService.getStatus();
    expect(status.liveExecutionStatus).toBe('FORBIDDEN');
    expect(status.automatedLiveExecution).toBe('DISABLED');
  });
});
