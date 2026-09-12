/**
 * Telegram & Webhook Live Trade Broadcast Service
 * Broadcasts formatted institutional trade execution, TP hits, SL hits, and news blackout alerts
 * to Telegram subscriber channels and Webhook listeners.
 */

export interface TradeBroadcastPayload {
  pair: string;
  direction: 'BUY' | 'SELL';
  timeframe: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  confidence: number;
  reasons: string[];
  brokerOrderId?: string;
  lotSize?: number;
  status: 'ENTRY_DISPATCHED' | 'TP_HIT' | 'SL_HIT' | 'NEWS_BLACKOUT_VETO' | 'PROFIT_LOCKED';
  pnlDollars?: number;
  pnlPips?: number;
}

export class TelegramNotificationService {
  private static instance: TelegramNotificationService;
  private botToken: string | null = process.env.TELEGRAM_BOT_TOKEN || null;
  private channelId: string | null = process.env.TELEGRAM_CHANNEL_ID || null;
  private isEnabled: boolean = true;
  private broadcastHistory: Array<{ timestamp: number; message: string; payload: TradeBroadcastPayload }> = [];

  private constructor() {}

  public static getInstance(): TelegramNotificationService {
    if (!TelegramNotificationService.instance) {
      TelegramNotificationService.instance = new TelegramNotificationService();
    }
    return TelegramNotificationService.instance;
  }

  public configure(config: { botToken?: string; channelId?: string; isEnabled?: boolean }): void {
    if (config.botToken !== undefined) this.botToken = config.botToken;
    if (config.channelId !== undefined) this.channelId = config.channelId;
    if (config.isEnabled !== undefined) this.isEnabled = config.isEnabled;
  }

  public getHistory(): Array<{ timestamp: number; message: string; payload: TradeBroadcastPayload }> {
    return [...this.broadcastHistory];
  }

  /**
   * Formats and broadcasts a trade event to Telegram and in-memory notification queue
   */
  public async broadcastTradeEvent(payload: TradeBroadcastPayload): Promise<boolean> {
    if (!this.isEnabled) return false;

    let emoji = '🚀';
    let title = 'ENTRI BAHARU DILAKSANAKAN';
    if (payload.status === 'TP_HIT') {
      emoji = '🎯';
      title = 'TAKE PROFIT DICAPAI (PROFIT)';
    } else if (payload.status === 'SL_HIT') {
      emoji = '🛡️';
      title = 'STOP LOSS DIKENAKAN (RISK MANAGED)';
    } else if (payload.status === 'NEWS_BLACKOUT_VETO') {
      emoji = '🔴';
      title = 'TRADE DIELAKKAN: BERITA MERAH';
    } else if (payload.status === 'PROFIT_LOCKED') {
      emoji = '🔒';
      title = 'BREAKEVEN / PROFIT DIKUNCI';
    }

    const reasonsFormatted = (payload.reasons || [])
      .slice(0, 3)
      .map(r => `  • ${r}`)
      .join('\n');

    const message = [
      `${emoji} *[QUANTUM AI - TRADING RADAR]* ${emoji}`,
      `📌 *${title}*`,
      ``,
      `💱 *Pasangan:* \`${payload.pair}\` (${payload.timeframe})`,
      `🧭 *Arah:* *${payload.direction}* | *Keyakinan:* \`${payload.confidence}%\``,
      `💵 *Harga Entri:* \`${payload.entryPrice}\``,
      `🛑 *Stop Loss:* \`${payload.stopLoss}\``,
      `🎯 *Take Profit:* \`${payload.takeProfit1}\``,
      payload.lotSize ? `📊 *Saiz Lot:* \`${payload.lotSize} Lots\`` : '',
      payload.pnlDollars !== undefined ? `💰 *Hasil PnL:* \`${payload.pnlDollars >= 0 ? '+' : ''}$${payload.pnlDollars.toFixed(2)}\` (\`${payload.pnlPips || 0} pips\`)` : '',
      payload.brokerOrderId ? `🔗 *ID Pesanan cTrader:* \`#${payload.brokerOrderId}\`` : '',
      ``,
      `🧠 *Konfluens SMC & Indikator:*`,
      reasonsFormatted || '  • SMC Order Block & Trend Confluence',
      ``,
      `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Copier_`
    ].filter(Boolean).join('\n');

    this.broadcastHistory.unshift({
      timestamp: Date.now(),
      message,
      payload
    });

    if (this.broadcastHistory.length > 100) {
      this.broadcastHistory.pop();
    }

    // If real Telegram credentials provided, send via Telegram Bot HTTP API
    if (this.botToken && this.channelId) {
      try {
        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.channelId,
            text: message,
            parse_mode: 'Markdown'
          })
        });
        console.log(`📡 [TelegramNotificationService] Live Telegram alert dispatched to ${this.channelId}.`);
        return true;
      } catch (err: any) {
        console.warn(`[TelegramNotificationService] Warning: could not dispatch Telegram message:`, err.message);
      }
    }

    return true;
  }
}

export const telegramNotificationService = TelegramNotificationService.getInstance();
