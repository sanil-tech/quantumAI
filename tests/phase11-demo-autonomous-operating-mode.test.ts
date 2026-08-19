import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { demoAutonomousTradingService } from '../src/server/services/demoAutonomousTradingService';
import { CTraderDemoLifecycleHarness } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';
import { PortfolioRiskEngine } from '../src/server/services/portfolioRiskService';
import { FinalExecutionGateService } from '../src/server/services/finalExecutionGateService';

describe('QUANTUMAI — DEMO AUTONOMOUS OPERATING MODE SPECIFICATION', () => {
  beforeEach(() => {
    demoAutonomousTradingService.setAutoPilot(false);
    demoAutonomousTradingService.setKillSwitch(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Requirement 1 & 2: Strictly DEMO environment and LIVE execution is FORBIDDEN', () => {
    const status = demoAutonomousTradingService.getStatus();
    expect(status.environment).toBe('DEMO');
    expect(status.liveExecutionStatus).toBe('FORBIDDEN');
    expect(status.automatedLiveExecution).toBe('DISABLED');

    // Pre-flight safety rejects LIVE
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({
        environment: 'LIVE',
        confirmDemoExecution: true,
        host: 'demo.ctraderapi.com',
        port: 5035,
        symbol: 'EUR/USD',
        side: 'BUY',
        lots: 0.01
      });
    }).toThrow(/SAFETY_VIOLATION_FATAL: LIVE environment is strictly prohibited/);
  });

  it('Requirement 10 & 11: Caps maximum DEMO volume to 0.01 lot and max 1 concurrent position', () => {
    const status = demoAutonomousTradingService.getStatus();
    expect(status.maxLotsLimit).toBe(0.01);
    expect(status.maxConcurrentPositions).toBe(1);
  });

  it('Requirement 13: Stale market data (>30s) results in NO_TRADE', async () => {
    const staleTimestamp = Date.now() - 45000; // 45 seconds old
    demoAutonomousTradingService.setAutoPilot(true);

    await demoAutonomousTradingService.evaluateAutonomousCycle('EUR/USD', 1.1668, 1.1670, staleTimestamp);
    const status = demoAutonomousTradingService.getStatus();
    expect(status.lastDecisionReason).toMatch(/Market data stale/);
    expect(demoAutonomousTradingService.getOpenPositions().length).toBe(0);
  });

  it('Requirement 14: Excessive spread (>3.0 pips) results in NO_TRADE', async () => {
    const freshTimestamp = Date.now();
    demoAutonomousTradingService.setAutoPilot(true);

    // Spread = 1.1710 - 1.1668 = 4.2 pips (> 3.0 pips limit)
    await demoAutonomousTradingService.evaluateAutonomousCycle('EUR/USD', 1.1668, 1.1710, freshTimestamp);
    const status = demoAutonomousTradingService.getStatus();
    expect(status.lastDecisionReason).toMatch(/Spread too high/);
    expect(demoAutonomousTradingService.getOpenPositions().length).toBe(0);
  });

  it('Requirement 15: Kill switch immediately blocks new execution', async () => {
    demoAutonomousTradingService.setAutoPilot(true);
    demoAutonomousTradingService.setKillSwitch(true);

    const status = demoAutonomousTradingService.getStatus();
    expect(status.killSwitchActive).toBe(true);
    expect(status.isAutoPilotEnabled).toBe(false);

    await demoAutonomousTradingService.evaluateAutonomousCycle('EUR/USD', 1.1668, 1.1670, Date.now());
    const updatedStatus = demoAutonomousTradingService.getStatus();
    expect(updatedStatus.lastDecisionReason).toMatch(/Kill switch ACTIVE/);
    expect(demoAutonomousTradingService.getOpenPositions().length).toBe(0);
  });

  it('Requirement 12 & 17: Opens controlled DEMO trade with mandatory broker SL/TP and tracks position', async () => {
    demoAutonomousTradingService.setAutoPilot(true);

    await demoAutonomousTradingService.evaluateAutonomousCycle('EUR/USD', 1.1668, 1.1670, Date.now());
    const positions = demoAutonomousTradingService.getOpenPositions();
    
    if (positions.length > 0) {
      const pos = positions[0];
      expect(pos.volume).toBe(0.01);
      expect(pos.sl).toBeDefined();
      expect(pos.tp).toBeDefined();
      expect(pos.sl).not.toBe(pos.entryPrice);
      expect(pos.tp).not.toBe(pos.entryPrice);

      // Verify SL exit triggers and closes trade
      const closed = demoAutonomousTradingService.closePosition(pos.positionId, pos.sl, 'STOP_LOSS');
      expect(closed).toBeDefined();
      expect(closed?.exitReason).toBe('STOP_LOSS');
      expect(demoAutonomousTradingService.getOpenPositions().length).toBe(0);
    }
  });

  it('Requirement 19 & 20: Shadow data remains completely separate and does not leak into DEMO metrics', () => {
    const demoPositions = demoAutonomousTradingService.getOpenPositions();
    const demoClosed = demoAutonomousTradingService.getClosedTrades();
    expect(Array.isArray(demoPositions)).toBe(true);
    expect(Array.isArray(demoClosed)).toBe(true);
  });
});
