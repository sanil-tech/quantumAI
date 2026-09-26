import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { telegramNotificationService } from '../src/server/services/telegramNotificationService';
import { CTraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';
import { claimOrderFilledAlert } from '../src/server/services/tradeAlertDedup';

describe('Closed Trade Notification & Audit Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('formats TP_HIT notification in Bahasa Melayu with exact profit, pips, and dual timestamp', () => {
    const alertMsg = telegramNotificationService.formatTradeAlert({
      pair: 'USD/CAD',
      direction: 'BUY',
      timeframe: 'M5',
      entryPrice: 1.40884,
      stopLoss: 0,
      takeProfit1: 1.41484,
      confidence: 85,
      pnlDollars: 8.03,
      pnlPips: 60.0,
      status: 'TP_HIT',
      brokerOrderId: '335440644',
      timestamp: Date.now()
    }, 'ms');

    expect(alertMsg).toContain('TRADE SELESAI (UNTUNG)');
    expect(alertMsg).toContain('USD/CAD');
    expect(alertMsg).toContain('1.40884');
    expect(alertMsg).toContain('1.41484');
    expect(alertMsg).toContain('+$8.03');
    expect(alertMsg).toContain('60.0 pips');
    expect(alertMsg).toContain('#335440644');
    expect(alertMsg).toContain('MYT');
    expect(alertMsg).toContain('UTC');
  });

  it('formats SL_HIT notification in Bahasa Melayu with exact loss containment, pips, and dual timestamp', () => {
    const alertMsg = telegramNotificationService.formatTradeAlert({
      pair: 'CAD/CHF',
      direction: 'BUY',
      timeframe: 'M5',
      entryPrice: 0.58630,
      stopLoss: 0.58549,
      takeProfit1: 0,
      confidence: 85,
      pnlDollars: -2.08,
      pnlPips: -8.1,
      status: 'SL_HIT',
      brokerOrderId: '335403600',
      timestamp: Date.now()
    }, 'ms');

    expect(alertMsg).toContain('TRADE SELESAI (KERUGIAN DIKAWAL)');
    expect(alertMsg).toContain('CAD/CHF');
    expect(alertMsg).toContain('0.5863');
    expect(alertMsg).toContain('0.58549');
    expect(alertMsg).toContain('-$2.08');
    expect(alertMsg).toContain('-8.1 pips');
    expect(alertMsg).toContain('#335403600');
    expect(alertMsg).toContain('MYT');
    expect(alertMsg).toContain('UTC');
  });

  it('formats ORDER_FILLED notification with dual timestamp in MYT and UTC', () => {
    const alertMsg = telegramNotificationService.formatTradeAlert({
      pair: 'EUR/USD',
      direction: 'BUY',
      timeframe: 'M5',
      entryPrice: 1.08500,
      stopLoss: 1.08200,
      takeProfit1: 1.09000,
      confidence: 90,
      status: 'ORDER_FILLED',
      brokerOrderId: '292999888',
      timestamp: Date.now()
    }, 'ms');

    expect(alertMsg).toContain('TRADE TELAH DIBUKA');
    expect(alertMsg).toContain('HARGA SENTUH ENTRI');
    expect(alertMsg).toContain('EUR/USD');
    expect(alertMsg).toContain('1.085');
    expect(alertMsg).toContain('Waktu Pelaksanaan:');
    expect(alertMsg).toContain('MYT');
    expect(alertMsg).toContain('UTC');
    expect(alertMsg).toContain('#292999888');
  });

  it('strictly prevents duplicate ORDER_FILLED notifications using claimOrderFilledAlert ledger', () => {
    const testLedgerPath = path.resolve(process.cwd(), 'scratch', 'test_order_filled_alerts.json');
    if (fs.existsSync(testLedgerPath)) fs.unlinkSync(testLedgerPath);

    const payload = {
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.08500,
      brokerOrderId: '292999888'
    };

    // First emission: should succeed
    const firstClaim = claimOrderFilledAlert(payload, testLedgerPath);
    expect(firstClaim).toBe(true);

    // Second emission with same brokerOrderId: must be rejected as duplicate
    const duplicateClaim = claimOrderFilledAlert(payload, testLedgerPath);
    expect(duplicateClaim).toBe(false);

    // Different broker order ID: should succeed
    const newOrderClaim = claimOrderFilledAlert({ ...payload, brokerOrderId: '292999889' }, testLedgerPath);
    expect(newOrderClaim).toBe(true);

    if (fs.existsSync(testLedgerPath)) fs.unlinkSync(testLedgerPath);
  });

  it('correctly processes profitable deal in processClosedDeal', async () => {
    const feed = CTraderMarketDataFeedService.getInstance();
    const broadcastSpy = vi.spyOn(telegramNotificationService, 'broadcastTradeEvent').mockResolvedValue(true);

    const deal = {
      dealId: 999111222,
      symbolId: 8,
      tradeSide: 2, // Closing SELL = Original BUY
      executionPrice: 1.41484,
      closePositionDetail: {
        entryPrice: 1.40884,
        grossProfit: 848,
        commission: -18,
        swap: -27,
        moneyDigits: 2,
        profitInPips: 60
      }
    };

    const result = await feed.processClosedDeal(deal, true);
    expect(result).toBe(true);
    expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({
      pair: 'USD/CAD',
      direction: 'BUY',
      status: 'TP_HIT',
      entryPrice: 1.40884,
      pnlDollars: 8.03,
      brokerOrderId: '999111222'
    }));
  });

  it('correctly processes loss deal in processClosedDeal with price band symbol correction', async () => {
    const feed = CTraderMarketDataFeedService.getInstance();
    const broadcastSpy = vi.spyOn(telegramNotificationService, 'broadcastTradeEvent').mockResolvedValue(true);

    const deal = {
      dealId: 999333444,
      symbolId: 999, // Unknown broker symbol ID
      tradeSide: 2, // Closing SELL = Original BUY
      executionPrice: 0.58549,
      closePositionDetail: {
        entryPrice: 0.58630, // 0.58 -> CAD/CHF price band
        grossProfit: -196,
        commission: -12,
        swap: 0,
        moneyDigits: 2,
        profitInPips: -8.1
      }
    };

    const result = await feed.processClosedDeal(deal, true);
    expect(result).toBe(true);
    expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({
      pair: 'CAD/CHF',
      direction: 'BUY',
      status: 'SL_HIT',
      entryPrice: 0.58630,
      pnlDollars: -2.08,
      brokerOrderId: '999333444'
    }));
  });

  it('silently mutes historical closed deals older than 3 minutes to prevent Telegram spam', async () => {
    const feed = CTraderMarketDataFeedService.getInstance();
    const broadcastSpy = vi.spyOn(telegramNotificationService, 'broadcastTradeEvent').mockResolvedValue(true);

    const historicalDeal = {
      dealId: 999888777,
      symbolId: 8,
      tradeSide: 2,
      executionPrice: 1.41484,
      executionTimestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
      closePositionDetail: {
        entryPrice: 1.40884,
        grossProfit: 800,
        moneyDigits: 2
      }
    };

    const result = await feed.processClosedDeal(historicalDeal, false);
    expect(result).toBe(false);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it('ignores entry fill deals that do not have closePositionDetail', async () => {
    const feed = CTraderMarketDataFeedService.getInstance();
    const broadcastSpy = vi.spyOn(telegramNotificationService, 'broadcastTradeEvent').mockResolvedValue(true);

    const entryFillDeal = {
      dealId: 999777666,
      symbolId: 8,
      tradeSide: 1, // BUY
      executionPrice: 1.40884,
      executionTimestamp: Date.now(),
      // NO closePositionDetail
    };

    const result = await feed.processClosedDeal(entryFillDeal, false);
    expect(result).toBe(false);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it('successfully broadcasts fresh real-time closed deal under 3 minutes old', async () => {
    const feed = CTraderMarketDataFeedService.getInstance();
    const broadcastSpy = vi.spyOn(telegramNotificationService, 'broadcastTradeEvent').mockResolvedValue(true);

    const freshDealId = 999000000 + Math.floor(Math.random() * 800000);
    const freshDeal = {
      dealId: freshDealId,
      symbolId: 8,
      tradeSide: 2, // Closing SELL = BUY position
      executionPrice: 1.41484,
      executionTimestamp: Date.now() - 30 * 1000, // 30 seconds ago (FRESH)
      closePositionDetail: {
        entryPrice: 1.40884,
        grossProfit: 600,
        commission: -10,
        swap: 0,
        moneyDigits: 2,
        profitInPips: 60
      }
    };

    const result = await feed.processClosedDeal(freshDeal, false);
    expect(result).toBe(true);
    expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({
      pair: 'USD/CAD',
      status: 'TP_HIT',
      brokerOrderId: String(freshDealId)
    }));
  });
});
