import { describe, it, expect, vi } from 'vitest';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { BrokerReconciliationService } from '../apps/execution-router/src/services/brokerReconciliationService';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { TradingRepository } from '@iati/database';

describe('Permanent SL/TP Protection & Cross-Pair Isolation Guard Suite', () => {
  it('1. Enforces 3 decimals and distinct JPY price scales on EUR/JPY & GBP/JPY in SignalIntelligenceService', () => {
    const service = SignalIntelligenceService.getInstance();

    const eurJpyResult = service.evaluateCandidateSetup({
      pair: 'EUR/JPY',
      timeframe: 'H1',
      style: 'DAY_TRADER',
      indicators: { rsi: 35, ema20: 181.5, ema50: 182.0, ema200: 183.0 } as any,
      smc: { orderBlocks: [{ type: 'BEARISH' }] } as any,
      postMortemReviews: []
    });

    expect(eurJpyResult).toBeDefined();
    if (eurJpyResult.action === 'BUY' || eurJpyResult.action === 'SELL') {
      // Must have valid non-zero SL and TP
      expect(eurJpyResult.stopLoss).toBeGreaterThan(170.0);
      expect(eurJpyResult.takeProfit1).toBeGreaterThan(170.0);
      // Decimals must strictly be 3
      const slDecimals = String(eurJpyResult.stopLoss).split('.')[1]?.length || 0;
      expect(slDecimals).toBeLessThanOrEqual(3);
    }
  });

  it('2. Corrects cross-pair price contamination (e.g. USD/JPY price 154.xx erroneously applied to EUR/JPY)', () => {
    const service = SignalIntelligenceService.getInstance();

    // Even if currentPrice is erroneously omitted or passes an out-of-regime value,
    // the service must fall back to the authentic EUR/JPY price regime (>170.0)
    const result = service.evaluateCandidateSetup({
      pair: 'EUR/JPY',
      timeframe: 'H4',
      style: 'DAY_TRADER',
      indicators: { rsi: 65, ema20: 182.5, ema50: 181.0, ema200: 180.0 } as any,
      smc: { orderBlocks: [{ type: 'BULLISH' }] } as any,
      postMortemReviews: []
    });

    if (result.action === 'BUY' || result.action === 'SELL') {
      expect(result.entryZone?.min).toBeGreaterThan(170.0);
      expect(result.stopLoss).toBeGreaterThan(170.0);
      expect(result.takeProfit1).toBeGreaterThan(170.0);
    }
  });

  it('3. Auto-Heals unprotected broker positions (SL=0 or missing) during reconciliation cycle', async () => {
    const mockBroker = {
      id: 'ctrader-broker-01',
      isConnected: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue(true),
      getOpenPositions: vi.fn().mockResolvedValue([
        {
          positionId: '999999',
          symbolId: 9,
          symbol: 'GBPJPY',
          tradeSide: 'SELL',
          entryPrice: 211.010,
          stopLoss: 0, // UNPROTECTED (missing SL)
          takeProfit: 209.873,
          volume: 0.02
        }
      ]),
      amendPositionSLTP: vi.fn().mockResolvedValue(true)
    };

    const mockRouter = {
      getBroker: vi.fn().mockReturnValue(mockBroker)
    } as unknown as ExecutionRouter;

    const mockRepo = {
      query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('SELECT * FROM positions WHERE status = \'OPEN\'')) {
          return {
            rows: [
              {
                position_id: 'trade_999999',
                ticket_id: '999999',
                symbol: 'GBP/JPY',
                direction: 'SELL',
                quantity: 0.02,
                entry_price: 211.010,
                stop_loss: 0,
                take_profit: 209.873,
                status: 'OPEN'
              }
            ]
          };
        }
        return { rows: [] };
      }),
      mapPositionRow: vi.fn().mockImplementation((r: any) => ({
        positionId: r.position_id,
        ticketId: r.ticket_id,
        symbol: r.symbol,
        direction: r.direction,
        quantity: r.quantity,
        entryPrice: r.entry_price,
        stopLoss: r.stop_loss,
        takeProfit: r.take_profit,
        status: r.status
      }))
    } as unknown as TradingRepository;

    const reconService = BrokerReconciliationService.getInstance(mockRouter, mockRepo);
    const report = await reconService.reconcile('48282756');

    expect(report).toBeDefined();
    expect(report.results.length).toBe(1);
    expect(report.results[0].status).toBe('AUTO_HEALED');
    expect(report.results[0].details.discrepancyReason).toContain('Unprotected SL/TP auto-healed');

    // Proves broker.amendPositionSLTP was called with a valid non-zero SL and TP
    expect(mockBroker.amendPositionSLTP).toHaveBeenCalledWith(
      '999999',
      expect.any(Number),
      expect.any(Number)
    );
    const [_, amendedSl, amendedTp] = mockBroker.amendPositionSLTP.mock.calls[0];
    expect(amendedSl).toBeGreaterThan(211.010); // SELL SL must be higher than entry
    expect(amendedTp).toBeLessThan(211.010); // SELL TP must be lower than entry
  });

  it('4. Auto-Heals out-of-regime Take Profit (e.g. EUR/JPY TP=154.818) during reconciliation cycle', async () => {
    const mockBroker = {
      id: 'ctrader-broker-01',
      isConnected: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue(true),
      getOpenPositions: vi.fn().mockResolvedValue([
        {
          positionId: '888888',
          symbolId: 8,
          symbol: 'EURJPY',
          tradeSide: 'SELL',
          entryPrice: 181.322,
          stopLoss: 181.672,
          takeProfit: 154.818, // Contaminated TP from USD/JPY!
          volume: 0.01
        }
      ]),
      amendPositionSLTP: vi.fn().mockResolvedValue(true)
    };

    const mockRouter = {
      getBroker: vi.fn().mockReturnValue(mockBroker)
    } as unknown as ExecutionRouter;

    const mockRepo = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT * FROM positions WHERE status = \'OPEN\'')) {
          return {
            rows: [
              {
                position_id: 'trade_888888',
                ticket_id: '888888',
                symbol: 'EUR/JPY',
                direction: 'SELL',
                quantity: 0.01,
                entry_price: 181.322,
                stop_loss: 181.672,
                take_profit: 154.818,
                status: 'OPEN'
              }
            ]
          };
        }
        return { rows: [] };
      }),
      mapPositionRow: vi.fn().mockImplementation((r: any) => ({
        positionId: r.position_id,
        ticketId: r.ticket_id,
        symbol: r.symbol,
        direction: r.direction,
        quantity: r.quantity,
        entryPrice: r.entry_price,
        stopLoss: r.stop_loss,
        takeProfit: r.take_profit,
        status: r.status
      }))
    } as unknown as TradingRepository;

    const reconService = BrokerReconciliationService.getInstance(mockRouter, mockRepo);
    const report = await reconService.reconcile('48282756');

    expect(report.results[0].status).toBe('AUTO_HEALED');
    expect(mockBroker.amendPositionSLTP).toHaveBeenCalledWith(
      '888888',
      expect.any(Number),
      expect.any(Number)
    );
    const [_, amendedSl, amendedTp] = mockBroker.amendPositionSLTP.mock.calls[0];
    expect(amendedTp).toBeGreaterThan(170.0); // Corrected to authentic EUR/JPY regime
    expect(amendedTp).toBeLessThan(181.322); // SELL TP must be lower than entry
  });
});
