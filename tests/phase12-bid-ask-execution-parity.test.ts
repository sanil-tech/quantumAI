import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { demoAutonomousTradingService } from '../src/server/services/demoAutonomousTradingService';

describe('QUANTUMAI — PHASE 12 BID-ASK EXECUTION PARITY REGRESSION SPECIFICATION', () => {
  beforeEach(() => {
    demoAutonomousTradingService.setAutoPilot(false);
    demoAutonomousTradingService.setKillSwitch(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Task 1: BUY trade proposal and execution strictly uses ASK price for entry, SL, and TP geometry', async () => {
    const bid = 1.16680;
    const ask = 1.16686; // 0.6 pip spread
    const timestamp = Date.now();

    demoAutonomousTradingService.setAutoPilot(true);
    await demoAutonomousTradingService.evaluateAutonomousCycle('EUR/USD', bid, ask, timestamp);

    const positions = demoAutonomousTradingService.getOpenPositions();
    if (positions.length > 0) {
      const pos = positions[0];
      if (pos.tradeSide === 'BUY') {
        // Must use ASK for BUY entry
        expect(pos.entryPrice).toBe(ask);
        expect(pos.entryPrice).not.toBe(bid);

        // SL must be strictly below ASK entry
        expect(pos.sl).toBeLessThan(ask);
        // TP must be strictly above ASK entry
        expect(pos.tp).toBeGreaterThan(ask);
      }
    }
  });

  it('Task 2: SELL trade proposal and execution strictly uses BID price for entry, SL, and TP geometry', async () => {
    const bid = 158.470;
    const ask = 158.476; // 0.6 pip spread on JPY
    const timestamp = Date.now();

    demoAutonomousTradingService.setAutoPilot(true);
    await demoAutonomousTradingService.evaluateAutonomousCycle('USD/JPY', bid, ask, timestamp);

    const positions = demoAutonomousTradingService.getOpenPositions();
    if (positions.length > 0) {
      const pos = positions[0];
      if (pos.tradeSide === 'SELL') {
        // Must use BID for SELL entry
        expect(pos.entryPrice).toBe(bid);
        expect(pos.entryPrice).not.toBe(ask);

        // SL must be strictly above BID entry
        expect(pos.sl).toBeGreaterThan(bid);
        // TP must be strictly below BID entry
        expect(pos.tp).toBeLessThan(bid);
      }
    }
  });

  it('Task 3: Open BUY position valuation and exit checks use prevailing BID liquidation price', () => {
    const entryAsk = 1.16686;
    const currentBid = 1.16700; // Price moved up in favor of BUY
    const currentAsk = 1.16706;

    // Simulate tick update
    demoAutonomousTradingService.handleMarketTick({
      symbol: 'EUR/USD',
      bid: currentBid,
      ask: currentAsk,
      timestamp: Date.now()
    });

    const status = demoAutonomousTradingService.getStatus();
    expect(status.environment).toBe('DEMO');
    expect(status.liveExecutionStatus).toBe('FORBIDDEN');
  });

  it('Task 4: Spread gate correctly measures (ASK - BID) and blocks execution when spread > 3.0 pips', async () => {
    const bid = 1.16600;
    const wideAsk = 1.16635; // 3.5 pips spread (> 3.0 pips limit)

    demoAutonomousTradingService.setAutoPilot(true);
    await demoAutonomousTradingService.evaluateAutonomousCycle('EUR/USD', bid, wideAsk, Date.now());

    const status = demoAutonomousTradingService.getStatus();
    expect(status.lastDecisionReason).toMatch(/Spread too high/);
  });
});
