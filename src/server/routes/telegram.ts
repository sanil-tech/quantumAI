import { Router, Request, Response } from 'express';
import { telegramNotificationService } from '../services/telegramNotificationService';

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
telegramRouter.post('/telegram/configure', (req: Request, res: Response) => {
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
telegramRouter.post('/telegram/test', async (req: Request, res: Response) => {
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
