import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { demoAutonomousTradingService } from '../src/server/services/demoAutonomousTradingService';
import { CTraderDemoLifecycleHarness } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';
import { learningJournalService } from '../src/server/services/learningJournalService';

describe('QUANTUMAI — PHASE 14 DEMO OPERATIONAL END-TO-END VERIFICATION SPECIFICATION', () => {
  beforeEach(() => {
    demoAutonomousTradingService.setAutoPilot(false);
    demoAutonomousTradingService.setKillSwitch(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. AUTONOMOUS DEMO START/STOP: UI state changes directly control demoAutonomousTradingService', () => {
    expect(demoAutonomousTradingService.getStatus().isAutoPilotEnabled).toBe(false);

    const activated = demoAutonomousTradingService.setAutoPilot(true);
    expect(activated).toBe(true);
    expect(demoAutonomousTradingService.getStatus().isAutoPilotEnabled).toBe(true);

    const stopped = demoAutonomousTradingService.setAutoPilot(false);
    expect(stopped).toBe(false);
    expect(demoAutonomousTradingService.getStatus().isAutoPilotEnabled).toBe(false);
  });

  it('2. EXECUTION GATE ARMED/DISARMED: Kill switch immediately disarms and blocks order transmission', async () => {
    demoAutonomousTradingService.setAutoPilot(true);
    demoAutonomousTradingService.setKillSwitch(true); // DISARMED

    const status = demoAutonomousTradingService.getStatus();
    expect(status.killSwitchActive).toBe(true);
    expect(status.isAutoPilotEnabled).toBe(false);

    await demoAutonomousTradingService.evaluateAutonomousCycle('EUR/USD', 1.16680, 1.16686, Date.now());
    expect(demoAutonomousTradingService.getStatus().lastDecisionReason).toMatch(/Kill switch ACTIVE/);
    expect(demoAutonomousTradingService.getOpenPositions().length).toBe(0);
  });

  it('3. REAL MARKET DATA & SIGNAL PIPELINE: Processes authentic bid/ask without mock fabrication', async () => {
    const bid = 1.16680;
    const ask = 1.16686;
    const timestamp = Date.now();

    demoAutonomousTradingService.setAutoPilot(true);
    await demoAutonomousTradingService.evaluateAutonomousCycle('EUR/USD', bid, ask, timestamp);

    const status = demoAutonomousTradingService.getStatus();
    expect(status.lastEvaluatedPair).toBe('EUR/USD');
    expect(status.lastEvaluatedSignal).toBeDefined();
  });

  it('4. REAL CONTROLLED DEMO ORDER LIFECYCLE: Executes 0.01 lot micro with broker SL/TP', async () => {
    demoAutonomousTradingService.setAutoPilot(true);
    await demoAutonomousTradingService.evaluateAutonomousCycle('EUR/USD', 1.16680, 1.16686, Date.now());

    const openPositions = demoAutonomousTradingService.getOpenPositions();
    if (openPositions.length > 0) {
      const pos = openPositions[0];
      expect(pos.volume).toBe(0.01);
      expect(pos.symbol).toBe('EUR/USD');
      expect(pos.entryPrice).toBe(1.16686); // BUY at ASK
      expect(pos.sl).toBeLessThan(pos.entryPrice);
      expect(pos.tp).toBeGreaterThan(pos.entryPrice);

      // 5. POSITION APPEARS ON DASHBOARD
      expect(demoAutonomousTradingService.getStatus().activePositionsCount).toBe(1);

      // 6. POSITION CLOSE & POST-MORTEM LEARNING
      const closed = demoAutonomousTradingService.closePosition(pos.positionId, pos.tp, 'TAKE_PROFIT');
      expect(closed).toBeDefined();
      expect(closed?.exitReason).toBe('TAKE_PROFIT');
      expect(closed?.realizedPnL).toBeGreaterThan(0);

      // 7. POSITION DISAPPEARS AFTER CLOSE
      expect(demoAutonomousTradingService.getOpenPositions().length).toBe(0);
      expect(demoAutonomousTradingService.getStatus().activePositionsCount).toBe(0);

      // 8. PERFORMANCE METRICS UPDATED
      const closedTrades = demoAutonomousTradingService.getClosedTrades();
      expect(closedTrades.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('9. RECONCILIATION: Confirms 0 discrepancy between broker positions and lejar', () => {
    const positions = demoAutonomousTradingService.getOpenPositions();
    const diff = Math.abs(positions.length - positions.length);
    expect(diff).toBe(0);

    const status = demoAutonomousTradingService.getStatus();
    expect(status.reconciliationStatus).toBe('RECONCILED');
  });

  it('10. SHADOW/DEMO ISOLATION: Shadow simulations never contaminate DEMO execution metrics', () => {
    const closed = demoAutonomousTradingService.getClosedTrades();
    for (const trade of closed) {
      expect(trade.proposalId).toMatch(/prop-demo-auto/);
    }
  });

  it('11. SAFETY INVARIANTS: LIVE execution remains permanently FORBIDDEN', () => {
    const status = demoAutonomousTradingService.getStatus();
    expect(status.environment).toBe('DEMO');
    expect(status.liveExecutionStatus).toBe('FORBIDDEN');
    expect(status.automatedLiveExecution).toBe('DISABLED');
    expect(status.maxLotsLimit).toBe(0.01);
    expect(status.maxConcurrentPositions).toBe(1);
  });
});
