import { describe, it, expect, beforeEach } from 'vitest';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { DemoAutonomousTradingService } from '../src/server/services/demoAutonomousTradingService';

describe('Method 2 Scale-Out Execution Architecture', () => {
  let adapter: CTraderAdapter;
  let demoService: DemoAutonomousTradingService;

  beforeEach(() => {
    adapter = new CTraderAdapter({
      clientId: 'demo_client_12345_mock',
      clientSecret: 'secret_mock',
      accountId: '48282756',
      accessToken: 'token_mock',
      environment: 'DEMO' as any
    });
    adapter.mockAuthFail = false;
    adapter.mockTimeout = false;
    adapter.mockReject = false;

    demoService = DemoAutonomousTradingService.getInstance();
    // Reset service state
    (demoService as any).openPositions.clear();
    (demoService as any).closedTrades = [];
  });

  it('1. CTraderAdapter supports partialClosePosition with fractional lots', async () => {
    const report = await adapter.partialClosePosition('285026529', 0.01);
    expect(report).toBeDefined();
    expect(report.status).toBe('FILLED');
    expect(report.broker_position_id).toBe('285026529');
  });

  it('2. CTraderAdapter supports amendPositionSLTP (Break-Even SL & TP2)', async () => {
    const amended = await adapter.amendPositionSLTP('285026529', 1.16700, 1.17800);
    expect(amended).toBe(true);
  });

  it('3. CTraderAdapter executes atomic scaleOutPosition (50% close + BE SL + TP2)', async () => {
    const result = await adapter.scaleOutPosition('285026529', 0.01, 1.16700, 1.17800);
    expect(result).toBeDefined();
    expect(result.closeReport.status).toBe('FILLED');
    expect(result.slAmended).toBe(true);
  });

  it('4. DemoAutonomousTradingService executes Method 2 scale-out at TP1', () => {
    const positionId = 998877;
    const entryPrice = 1.16500;
    const tp1Price = 1.17100; // +60 pips
    const tp2Price = 1.17800; // +130 pips
    const initialVolume = 0.02;

    (demoService as any).openPositions.set(positionId, {
      positionId,
      symbol: 'EUR/USD',
      tradeSide: 'BUY',
      volume: initialVolume,
      initialVolume,
      entryPrice,
      currentPrice: entryPrice,
      sl: 1.16100,
      tp: tp1Price,
      takeProfit1: tp1Price,
      takeProfit2: tp2Price,
      tp1Hit: false,
      isMultiTarget: true,
      unrealizedPnL: 0,
      entryTime: new Date().toISOString(),
      proposalId: 'prop_test',
      orderId: 'ord_test',
      mfe: 0,
      mae: 0
    });

    // Trigger Method 2 Scale-Out
    demoService.executeMethod2ScaleOut(positionId, tp1Price);

    const pos = (demoService as any).openPositions.get(positionId);
    expect(pos).toBeDefined();
    expect(pos.tp1Hit).toBe(true);
    // Remaining volume should be half (0.01 lot)
    expect(pos.volume).toBe(0.01);
    // Stop Loss moved to Break-Even (entryPrice)
    expect(pos.sl).toBe(entryPrice);
    // Take Profit moved to TP2
    expect(pos.tp).toBe(tp2Price);

    // Closed trades ledger should record the 50% TP1 partial close
    const closed = demoService.getClosedTrades();
    expect(closed.length).toBe(1);
    expect(closed[0].exitReason).toBe('TAKE_PROFIT_1');
    expect(closed[0].lots).toBe(0.01);
    expect(closed[0].realizedPnL).toBeGreaterThan(0);
  });

  it('5. SELL position correctly moves SL to Break-Even on SELL TP1 hit', () => {
    const positionId = 554433;
    const entryPrice = 1.36500;
    const tp1Price = 1.35900; // -60 pips (SELL profit)
    const tp2Price = 1.35200; // -130 pips (SELL profit)
    const initialVolume = 0.04;

    (demoService as any).openPositions.set(positionId, {
      positionId,
      symbol: 'GBP/USD',
      tradeSide: 'SELL',
      volume: initialVolume,
      initialVolume,
      entryPrice,
      currentPrice: entryPrice,
      sl: 1.36900,
      tp: tp1Price,
      takeProfit1: tp1Price,
      takeProfit2: tp2Price,
      tp1Hit: false,
      isMultiTarget: true,
      unrealizedPnL: 0,
      entryTime: new Date().toISOString(),
      proposalId: 'prop_sell_test',
      orderId: 'ord_sell_test',
      mfe: 0,
      mae: 0
    });

    demoService.executeMethod2ScaleOut(positionId, tp1Price);

    const pos = (demoService as any).openPositions.get(positionId);
    expect(pos.tp1Hit).toBe(true);
    expect(pos.volume).toBe(0.02); // 50% of 0.04
    expect(pos.sl).toBe(entryPrice); // Break-Even
    expect(pos.tp).toBe(tp2Price);

    const closed = demoService.getClosedTrades();
    expect(closed[0].exitReason).toBe('TAKE_PROFIT_1');
    expect(closed[0].lots).toBe(0.02);
    expect(closed[0].realizedPnL).toBeGreaterThan(0);
  });
});
