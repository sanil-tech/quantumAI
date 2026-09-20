import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { telegramNotificationService } from '../src/server/services/telegramNotificationService';
import { getMarketStatus, isCryptoPair } from '../src/lib/marketHours';

describe('Telegram Weekend Notifications & Content Intelligence', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Weekend Market Closure Trade Suppression', () => {
    it('suppresses trade execution, TP, SL, and cancellation broadcasts on closed Forex assets during weekend', async () => {
      // Mock system time to Saturday 14:00 UTC (Market Closed)
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 8, 19, 14, 0, 0)));

      // Verify market status returns WEEKEND_CLOSED for GBP/USD and USD/CAD
      expect(getMarketStatus('GBP/USD').status).toBe('WEEKEND_CLOSED');
      expect(getMarketStatus('USD/CAD').status).toBe('WEEKEND_CLOSED');

      // Attempt trade broadcast for GBP/USD (Target Hit)
      const gbpResult = await telegramNotificationService.broadcastTradeEvent({
        pair: 'GBP/USD',
        direction: 'SELL',
        timeframe: 'M1',
        entryPrice: 1.365,
        stopLoss: 1.370,
        takeProfit1: 1.352,
        confidence: 85,
        reasons: ['Price expanded into liquidity target'],
        status: 'TP_HIT',
        pnlDollars: 13.0,
        pnlPips: 130
      });

      expect(gbpResult).toBe(false);

      // Attempt trade broadcast for USD/CAD (Signal Cancelled / Expired)
      const usdcadResult = await telegramNotificationService.broadcastTradeEvent({
        pair: 'USD/CAD',
        direction: 'BUY',
        timeframe: 'H4',
        entryPrice: 1.39794,
        stopLoss: 1.39494,
        takeProfit1: 1.40500,
        confidence: 82,
        reasons: ['Setup expired'],
        status: 'SIGNAL_CANCELLED',
        cancellationReason: 'Setup expired (> 24h without fill)'
      });

      expect(usdcadResult).toBe(false);
    });

    it('allows 24/7 crypto pairs (BTC/USD) to broadcast trade events even on Saturday/Sunday', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 8, 19, 14, 0, 0)));

      expect(isCryptoPair('BTC/USD')).toBe(true);
      expect(getMarketStatus('BTC/USD').status).toBe('OPEN');

      // Mock sendRawMessage to avoid external HTTP call
      vi.spyOn(telegramNotificationService as any, 'sendRawMessage').mockResolvedValue({ success: true, message: 'OK' });

      const btcResult = await telegramNotificationService.broadcastTradeEvent({
        pair: 'BTC/USD',
        direction: 'BUY',
        timeframe: 'M15',
        entryPrice: 62000,
        stopLoss: 61000,
        takeProfit1: 63500,
        confidence: 88,
        reasons: ['Weekend Crypto Momentum'],
        status: 'ENTRY_DISPATCHED'
      });

      expect(btcResult).toBe(true);
    });
  });

  describe('Logical Weekend Content: Weekly Performance Recap', () => {
    it('generates a detailed weekly performance summary report in English', () => {
      const reportEn = telegramNotificationService.generateWeeklyStatsReport('en');
      expect(reportEn).toContain('OFFICIAL WEEKLY PERFORMANCE LEDGER');
      expect(reportEn).toContain('Total Setups Executed');
      expect(reportEn).toContain('Win Rate');
      expect(reportEn).toContain('Net Pips Harvested');
      expect(reportEn).toContain('Top Performing Asset');
      expect(reportEn).toContain('Profit Factor');
    });

    it('generates a detailed weekly performance summary report in Bahasa Melayu', () => {
      const reportMs = telegramNotificationService.generateWeeklyStatsReport('ms');
      expect(reportMs).toContain('LAPORAN PRESTASI & STATISTIK MINGGUAN');
      expect(reportMs).toContain('Jumlah Signal Dilaksanakan');
      expect(reportMs).toContain('Kadar Kemenangan (Win Rate)');
      expect(reportMs).toContain('Jumlah Pips Bersih');
      expect(reportMs).toContain('Pasangan Terbaik Minggu Ini');
    });
  });

  describe('Logical Weekend Content: Market Outlook for the Week Ahead', () => {
    it('generates an institutional market outlook with high impact events and SMC bias in English', () => {
      const outlookEn = telegramNotificationService.generateMarketOutlookReport('en');
      expect(outlookEn).toContain('WEEKLY MARKET OUTLOOK & HIGH-IMPACT RADAR');
      expect(outlookEn).toContain('Key High-Impact Macro Economic Events');
      expect(outlookEn).toContain('Institutional AI News Defense Rule');
      expect(outlookEn).toContain('EUR/USD');
      expect(outlookEn).toContain('GBP/USD');
      expect(outlookEn).toContain('USD/JPY');
      expect(outlookEn).toContain('XAU/USD');
      expect(outlookEn).toContain('Method 2 Split-Ticket');
    });

    it('generates an institutional market outlook with high impact events and SMC bias in Bahasa Melayu', () => {
      const outlookMs = telegramNotificationService.generateMarketOutlookReport('ms');
      expect(outlookMs).toContain('TINJAUAN PASARAN MINGGU HADAPAN & RADAR BERITA');
      expect(outlookMs).toContain('Kalendar Berita Berimpak Tinggi');
      expect(outlookMs).toContain('Protokol Pertahanan AI Quantum');
      expect(outlookMs).toContain('EUR/USD');
      expect(outlookMs).toContain('GBP/USD');
      expect(outlookMs).toContain('USD/JPY');
      expect(outlookMs).toContain('XAU/USD');
      expect(outlookMs).toContain('Method 2 Split-Ticket');
    });
  });

  describe('Weekend Trading Mindset Tips', () => {
    it('provides specialized weekend psychology tips', () => {
      const weekendTip = telegramNotificationService.getRandomTradingTip('WEEKEND');
      expect(weekendTip).toBeDefined();
      expect(weekendTip.contentEn).toBeDefined();
      expect(weekendTip.contentMs).toBeDefined();
      expect(weekendTip.keyRule).toBeDefined();
    });
  });
});
