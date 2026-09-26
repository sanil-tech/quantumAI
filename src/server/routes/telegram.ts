import { Router, Request, Response } from 'express';
import { telegramNotificationService } from '../services/telegramNotificationService';
import { adminAuthMiddleware } from './admin';

export const telegramRouter = Router();

/**
 * GET /api/telegram/status
 */
telegramRouter.get('/telegram/status', (req: Request, res: Response) => {
  try {
    const status = telegramNotificationService.getStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/telegram/configure
 */
telegramRouter.post('/telegram/configure', adminAuthMiddleware, (req: Request, res: Response) => {
  try {
    const { botToken, channelId, freeChannelId, defaultLanguage, isEnabled } = req.body;
    telegramNotificationService.configure({
      botToken,
      channelId,
      freeChannelId,
      defaultLanguage,
      isEnabled: typeof isEnabled === 'boolean' ? isEnabled : undefined
    });

    const status = telegramNotificationService.getStatus();
    res.json({
      success: true,
      message: 'Konfigurasi Telegram berjaya dikemas kini.',
      status
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/telegram/test
 */
telegramRouter.post('/telegram/test', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { chatId } = req.body || {};
    const result = await telegramNotificationService.sendTestMessage(chatId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.message });
    }
    res.json({ success: true, message: result.message });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/telegram/history
 */
telegramRouter.get('/telegram/history', (req: Request, res: Response) => {
  try {
    const history = telegramNotificationService.getHistory();
    res.json({ success: true, history });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/telegram/daily-report
 * Returns calculated daily performance summary
 */
telegramRouter.get('/telegram/daily-report', async (req: Request, res: Response) => {
  try {
    const targetDate = req.query.date as string | undefined;
    const { fetchDailyPerformance } = await import('../../../scripts/daily-performance-report');
    const summary = await fetchDailyPerformance(targetDate);
    res.json({ success: true, summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/telegram/daily-report/broadcast
 * Broadcasts daily profit/loss transparent report to Telegram VIP & Free channels
 */
const handleDailyBroadcast = async (req: Request, res: Response) => {
  try {
    const { targetDate } = req.body || {};
    const { sendDailyTelegramReport } = await import('../../../scripts/daily-performance-report');
    await sendDailyTelegramReport(targetDate);
    res.json({ success: true, message: 'Daily performance report broadcasted to Telegram channels.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
telegramRouter.post('/telegram/daily-report/broadcast', adminAuthMiddleware, handleDailyBroadcast);
telegramRouter.post('/api/telegram/daily-report/broadcast', adminAuthMiddleware, handleDailyBroadcast);

/**
 * GET /api/telegram/weekly-report
 * Returns authoritative weekly performance summary from Master Account Open API (SSOT)
 */
telegramRouter.get('/telegram/weekly-report', async (req: Request, res: Response) => {
  try {
    const daysBack = req.query.days ? parseInt(req.query.days as string, 10) : 7;
    const { fetchBrokerWeeklyPerformance } = await import('../../../scripts/weekly-performance-report');
    const summary = await fetchBrokerWeeklyPerformance(isNaN(daysBack) ? 7 : daysBack);
    res.json({ success: true, summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/telegram/weekly-report/broadcast
 * Broadcasts weekly profit/loss ledger directly from Master Account Open API to Telegram channels
 */
const handleWeeklyBroadcast = async (req: Request, res: Response) => {
  try {
    const daysBack = req.body?.days ? parseInt(req.body.days, 10) : 7;
    const { broadcastWeeklyPerformanceReport } = await import('../../../scripts/weekly-performance-report');
    const result = await broadcastWeeklyPerformanceReport(isNaN(daysBack) ? 7 : daysBack);
    res.json({ success: true, message: 'Weekly performance report broadcasted to Telegram channels.', data: result.data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
telegramRouter.post('/telegram/weekly-report/broadcast', adminAuthMiddleware, handleWeeklyBroadcast);
telegramRouter.post('/api/telegram/weekly-report/broadcast', adminAuthMiddleware, handleWeeklyBroadcast);

/**
 * GET /api/telegram/kickoff/preview
 * Previews the Weekly Kickoff Report in English or Malay
 */
const handleKickoffPreview = (req: Request, res: Response) => {
  try {
    const lang = (req.query.lang as 'en' | 'ms') || 'en';
    const preview = telegramNotificationService.generateWeeklyKickoffReport(lang);
    res.json({ success: true, lang, preview });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
telegramRouter.get('/telegram/kickoff/preview', handleKickoffPreview);
telegramRouter.get('/api/telegram/kickoff/preview', handleKickoffPreview);

/**
 * POST /api/telegram/kickoff/broadcast
 * Broadcasts the Weekly Kickoff Report to Telegram subscribers
 */
const handleKickoffBroadcast = async (req: Request, res: Response) => {
  try {
    const success = await telegramNotificationService.broadcastWeeklyKickoff();
    res.json({ success, message: success ? 'Weekly Kickoff report dispatched.' : 'Kickoff dispatch skipped or failed.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
telegramRouter.post('/telegram/kickoff/broadcast', adminAuthMiddleware, handleKickoffBroadcast);
telegramRouter.post('/api/telegram/kickoff/broadcast', adminAuthMiddleware, handleKickoffBroadcast);

/**
 * GET /api/telegram/briefing/preview
 * Previews the Session Open Micro-Analysis Briefing
 */
const handleBriefingPreview = (req: Request, res: Response) => {
  try {
    const session = req.query.session as ('TOKYO' | 'LONDON' | 'NEW_YORK' | undefined);
    const lang = (req.query.lang as 'en' | 'ms') || 'en';
    const preview = telegramNotificationService.generateSessionBriefingReport(session, lang);
    res.json({ success: true, session: session || 'AUTO_DETECTED', lang, preview });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
telegramRouter.get('/telegram/briefing/preview', handleBriefingPreview);
telegramRouter.get('/api/telegram/briefing/preview', handleBriefingPreview);

/**
 * POST /api/telegram/briefing/broadcast
 * Broadcasts the Session Open Micro-Analysis Briefing to Telegram subscribers
 */
const handleBriefingBroadcast = async (req: Request, res: Response) => {
  try {
    const session = req.body?.session as ('TOKYO' | 'LONDON' | 'NEW_YORK' | undefined);
    const success = await telegramNotificationService.broadcastSessionBriefing(session);
    res.json({ success, message: success ? `Session Briefing dispatched for ${session || 'current session'}.` : 'Briefing dispatch skipped or failed.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
telegramRouter.post('/telegram/briefing/broadcast', adminAuthMiddleware, handleBriefingBroadcast);
telegramRouter.post('/api/telegram/briefing/broadcast', adminAuthMiddleware, handleBriefingBroadcast);

/**
 * POST /api/telegram/news-outcome/broadcast
 * Broadcasts the outcome and market price impact of high-impact economic news to Telegram channels
 */
const handleNewsOutcomeBroadcast = async (req: Request, res: Response) => {
  try {
    const eventId = req.body?.eventId as (string | undefined);
    const result = await telegramNotificationService.broadcastLatestEconomicOutcome(eventId);
    res.json({
      success: result.success,
      count: result.count,
      events: result.events,
      message: result.count > 0 
        ? `Keputusan berita ekonomi berjaya disiarkan ke Telegram (${result.count} acara).`
        : 'Tiada keputusan berita baharu untuk disiarkan.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
telegramRouter.post('/telegram/news-outcome/broadcast', handleNewsOutcomeBroadcast);
telegramRouter.post('/api/telegram/news-outcome/broadcast', handleNewsOutcomeBroadcast);

/**
 * POST /api/telegram/sync-closed-trades
 * Forces synchronization and broadcasting of recent cTrader closed trades (TP/SL) to Telegram
 */
const handleSyncClosedTradesBroadcast = async (req: Request, res: Response) => {
  try {
    const hours = Number(req.body?.hours || 24);
    const { ctraderMarketDataFeedService } = await import('../services/ctraderMarketDataFeedService');
    const result = await ctraderMarketDataFeedService.broadcastRecentClosedDeals(hours);
    res.json({
      success: true,
      processed: result.processed,
      broadcasted: result.broadcasted,
      deals: result.deals,
      message: result.broadcasted > 0
        ? `${result.broadcasted} notifikasi trade ditutup berjaya disiarkan ke Telegram.`
        : 'Semua trade ditutup telah disiarkan sebelumnya atau tiada trade baharu.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
telegramRouter.post('/telegram/sync-closed-trades', handleSyncClosedTradesBroadcast);
telegramRouter.post('/api/telegram/sync-closed-trades', handleSyncClosedTradesBroadcast);



