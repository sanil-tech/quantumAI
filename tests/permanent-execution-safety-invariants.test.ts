import { describe, it, expect, vi } from 'vitest';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { AutonomousMarketScannerService } from '../src/server/services/autonomousMarketScannerService';

describe('Permanent Execution Safety Invariants & Self-Healing Watchdog', () => {

  describe('Invariant 1: Cross-Symbol Price Mismatch & Extreme Distance Gate', () => {
    it('should reject EUR/JPY order if submitted with USD/JPY price (e.g. 159.637)', async () => {
      const adapter = new CTraderAdapter({ accountId: '48282756' });
      // Mock transport to avoid live network
      adapter.transport = {
        isConnected: vi.fn().mockReturnValue(true),
        sendRequest: vi.fn().mockResolvedValue({ payloadType: 2107, payload: { order: { orderId: '101' } } })
      } as any;

      const buggyOrder: any = {
        order_id: 'test-buggy-eurjpy',
        symbol: 'EUR/JPY',
        direction: 'BUY',
        quantity: 0.01,
        order_type: 'LIMIT',
        price: 159.637, // Buggy USD/JPY price on EUR/JPY
        stop_loss: 159.20,
        take_profit: 160.50
      };

      await expect(adapter.placeOrder(buggyOrder)).rejects.toThrow(
        /PRICE_OUT_OF_REGIME_REJECTED.*EUR\/JPY/
      );
    });

    it('should reject USD/JPY order if submitted with EUR/JPY price (e.g. 185.20)', async () => {
      const adapter = new CTraderAdapter({ accountId: '48282756' });
      adapter.transport = {
        isConnected: vi.fn().mockReturnValue(true),
        sendRequest: vi.fn().mockResolvedValue({ payloadType: 2107, payload: { order: { orderId: '102' } } })
      } as any;

      const buggyOrder: any = {
        order_id: 'test-buggy-usdjpy',
        symbol: 'USD/JPY',
        direction: 'BUY',
        quantity: 0.01,
        order_type: 'LIMIT',
        price: 185.20, // Buggy EUR/JPY price on USD/JPY
        stop_loss: 184.80,
        take_profit: 186.00
      };

      await expect(adapter.placeOrder(buggyOrder)).rejects.toThrow(
        /PRICE_OUT_OF_REGIME_REJECTED.*USD\/JPY/
      );
    });
  });

  describe('Invariant 2: Mandatory Auto-StopLoss Fallback', () => {
    it('should automatically compute and attach safe SL and TP if order has no stop_loss', async () => {
      const adapter = new CTraderAdapter({ accountId: '48282756' });
      let sentPayload: any = null;

      adapter.transport = {
        isConnected: vi.fn().mockReturnValue(true),
        sendRequest: vi.fn().mockImplementation((msgType: number, payload: any) => {
          if (msgType === 2106) {
            sentPayload = payload;
            return Promise.resolve({
              payloadType: 2126,
              order: { orderId: 3001, positionId: 4001, symbolId: 3 }
            });
          }
          return Promise.resolve({ payloadType: 2126 });
        })
      } as any;

      const unhedgedOrder: any = {
        order_id: 'test-unhedged-eurjpy',
        symbol: 'EUR/JPY',
        direction: 'BUY',
        quantity: 0.01,
        order_type: 'LIMIT',
        price: 185.20,
        stop_loss: undefined, // Missing SL!
        take_profit: undefined // Missing TP!
      };

      await adapter.placeOrder(unhedgedOrder);

      expect(sentPayload).not.toBeNull();
      // Should have auto-calculated SL (185.20 - 0.35 = 184.85)
      expect(sentPayload.stopLoss).toBeCloseTo(184.85, 2);
      // Should have auto-calculated TP (185.20 + 0.70 = 185.90)
      expect(sentPayload.takeProfit).toBeCloseTo(185.90, 2);
    });

    it('should automatically compute safe SL and TP for Gold (XAU/USD) if missing', async () => {
      const adapter = new CTraderAdapter({ accountId: '48282756' });
      let sentPayload: any = null;

      adapter.transport = {
        isConnected: vi.fn().mockReturnValue(true),
        sendRequest: vi.fn().mockImplementation((msgType: number, payload: any) => {
          if (msgType === 2106) {
            sentPayload = payload;
            return Promise.resolve({
              payloadType: 2126,
              order: { orderId: 3002, positionId: 4002, symbolId: 41 }
            });
          }
          return Promise.resolve({ payloadType: 2126 });
        })
      } as any;

      const goldOrder: any = {
        order_id: 'test-gold',
        symbol: 'XAU/USD',
        direction: 'BUY',
        quantity: 0.01,
        order_type: 'LIMIT',
        price: 4450.0,
        stop_loss: undefined,
        take_profit: undefined
      };

      await adapter.placeOrder(goldOrder);

      expect(sentPayload).not.toBeNull();
      // Gold auto-SL: 4450 - 20 = 4430
      expect(sentPayload.stopLoss).toBe(4430.0);
      // Gold auto-TP: 4450 + 40 = 4490
      expect(sentPayload.takeProfit).toBe(4490.0);
    });
  });

  describe('Invariant 3: Continuous Self-Healing Watchdog', () => {
    it('should auto-cancel duplicate pending orders and unhedged orders on broker', async () => {
      const scanner = new AutonomousMarketScannerService();
      const mockAdapter = new CTraderAdapter({ accountId: '48282756' });
      const cancelledIds: string[] = [];

      mockAdapter.cancelOrder = vi.fn().mockImplementation(async (orderId: string) => {
        cancelledIds.push(String(orderId));
        return true;
      });

      const rawBrokerOrders = [
        // Duplicate EURUSD orders: 101 and 102 (102 is newer)
        { orderId: '101', symbol: 'EUR/USD', tradeSide: 'BUY', limitPrice: 1.1590, stopLoss: 1.1560, takeProfit: 1.1650 },
        { orderId: '102', symbol: 'EUR/USD', tradeSide: 'BUY', limitPrice: 1.1591, stopLoss: 1.1561, takeProfit: 1.1651 },
        // Unhedged USDCHF order (missing stopLoss)
        { orderId: '201', symbol: 'USD/CHF', tradeSide: 'BUY', limitPrice: 0.8080, stopLoss: undefined, takeProfit: 0.8140 }
      ];

      const surviving = await scanner.reconcileAndHealBrokerOrders(rawBrokerOrders, mockAdapter);

      // Order #101 (duplicate) should be cancelled
      expect(cancelledIds).toContain('101');
      // Order #201 (unhedged) should be cancelled
      expect(cancelledIds).toContain('201');
      // Only valid newest order #102 should survive
      expect(surviving.map(o => o.orderId)).toEqual(['102']);
    });
  });

  describe('Invariant 4: Max 1 Position Per Symbol Protection', () => {
    it('should reject placing a new order if an active open position already exists on the same symbol', async () => {
      const adapter = new CTraderAdapter({ accountId: '48282756' });
      adapter.transport = {
        isConnected: vi.fn().mockReturnValue(true),
        sendRequest: vi.fn().mockResolvedValue({ payloadType: 2107 })
      } as any;

      // Simulate an active EUR/JPY position (symbolId = 3) on broker
      adapter.lastPositions = [
        { positionId: 9901, tradeData: { symbolId: 3, volume: 100000, tradeSide: 1 } }
      ] as any;

      const duplicateEurJpyOrder: any = {
        order_id: 'live_eurjpy_second_trade',
        proposal_id: 'prop_eurjpy_2',
        symbol: 'EUR/JPY',
        direction: 'BUY',
        quantity: 0.01,
        order_type: 'LIMIT',
        price: 185.50,
        stop_loss: 185.10,
        take_profit: 186.20
      };

      await expect(adapter.placeOrder(duplicateEurJpyOrder)).rejects.toThrow(
        /MAX_POSITIONS_PER_SYMBOL_EXCEEDED.*EUR\/JPY/
      );
    });
  });

  describe('Invariant 5: Guaranteed Relative SL for Market Orders on EUR/JPY', () => {
    it('should attach relativeStopLoss and relativeTakeProfit to ProtoOANewOrderReq for market orders', async () => {
      const adapter = new CTraderAdapter({ accountId: '48282756' });
      let sentPayload: any = null;

      adapter.transport = {
        isConnected: vi.fn().mockReturnValue(true),
        sendRequest: vi.fn().mockImplementation((msgType: number, payload: any) => {
          if (msgType === 2106) {
            sentPayload = payload;
            return Promise.resolve({
              payloadType: 2126,
              order: { orderId: 8801, positionId: 8802, symbolId: 3, executionPrice: 185.50 }
            });
          }
          return Promise.resolve({ payloadType: 2126 });
        })
      } as any;

      const marketOrder: any = {
        order_id: 'test-market-eurjpy',
        symbol: 'EUR/JPY',
        direction: 'BUY',
        quantity: 0.01,
        order_type: 'MARKET',
        stop_loss: 185.15,
        take_profit: 186.20
      };

      await adapter.placeOrder(marketOrder);

      expect(sentPayload).not.toBeNull();
      expect(sentPayload.orderType).toBe(1); // MARKET
      expect(sentPayload.relativeStopLoss).toBeGreaterThan(0);
      expect(sentPayload.relativeTakeProfit).toBeGreaterThan(0);
    });
  });

});

