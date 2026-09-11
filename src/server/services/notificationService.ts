import axios from 'axios';

export type TradeEventType = 
  | 'TRADE_OPENED'
  | 'TRADE_CLOSED'
  | 'TRADE_WIN'
  | 'TRADE_LOSS'
  | 'SIGNAL_GENERATED'
  | 'SIGNAL_REJECTED'
  | 'CIRCUIT_BREAKER_TRIPPED'
  | 'DAILY_REPORT'
  | 'ERROR';

export interface WebhookConfig {
  url: string;
  events: TradeEventType[];
  enabled: boolean;
  retryAttempts: number;
}

export interface TradeEventPayload {
  event: TradeEventType;
  timestamp: Date;
  data: any;
}

/**
 * Trade Event Notification Service
 * Sends webhooks and notifications on trading events
 */
export class NotificationService {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private emailConfig?: { apiKey: string; sender: string };
  private slackConfig?: { webhookUrl: string };
  private discordConfig?: { webhookUrl: string };

  /**
   * Register webhook
   */
  registerWebhook(id: string, config: WebhookConfig) {
    this.webhooks.set(id, config);
    console.log(`📞 [NOTIFICATION] Webhook registered: ${id} -> ${config.url}`);
  }

  /**
   * Remove webhook
   */
  removeWebhook(id: string) {
    this.webhooks.delete(id);
    console.log(`📞 [NOTIFICATION] Webhook removed: ${id}`);
  }

  /**
   * Configure email notifications
   */
  configureEmail(apiKey: string, sender: string) {
    this.emailConfig = { apiKey, sender };
    console.log(`📧 [NOTIFICATION] Email configured: ${sender}`);
  }

  /**
   * Configure Slack notifications
   */
  configureSlack(webhookUrl: string) {
    this.slackConfig = { webhookUrl };
    console.log(`📞 [NOTIFICATION] Slack configured`);
  }

  /**
   * Configure Discord notifications
   */
  configureDiscord(webhookUrl: string) {
    this.discordConfig = { webhookUrl };
    console.log(`🎮 [NOTIFICATION] Discord configured`);
  }

  /**
   * Send notification for event
   */
  async sendNotification(event: TradeEventType, data: any) {
    const payload: TradeEventPayload = {
      event,
      timestamp: new Date(),
      data
    };

    // Send via webhooks
    await this.sendWebhooks(payload);

    // Send via Slack
    if (this.slackConfig) {
      await this.sendSlack(payload);
    }

    // Send via Discord
    if (this.discordConfig) {
      await this.sendDiscord(payload);
    }
  }

  /**
   * Send webhooks
   */
  private async sendWebhooks(payload: TradeEventPayload) {
    for (const [id, config] of this.webhooks) {
      if (!config.enabled || !config.events.includes(payload.event)) continue;

      let attempts = 0;
      while (attempts < config.retryAttempts) {
        try {
          await axios.post(config.url, payload, { timeout: 5000 });
          console.log(`✅ [WEBHOOK] Sent to ${id}`);
          break;
        } catch (err: any) {
          attempts++;
          console.warn(`⚠️ [WEBHOOK] ${id} attempt ${attempts}/${config.retryAttempts} failed`);
          if (attempts < config.retryAttempts) {
            await this.delay(1000 * attempts);
          }
        }
      }
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlack(payload: TradeEventPayload) {
    if (!this.slackConfig) return;

    try {
      const color = this.getEventColor(payload.event);
      const message = {
        attachments: [
          {
            color,
            title: `🤖 Trading Event: ${payload.event}`,
            text: this.formatEventMessage(payload),
            ts: Math.floor(payload.timestamp.getTime() / 1000)
          }
        ]
      };

      await axios.post(this.slackConfig.webhookUrl, message);
      console.log(`✅ [SLACK] Notification sent`);
    } catch (err: any) {
      console.error(`❌ [SLACK] Failed:`, err.message);
    }
  }

  /**
   * Send Discord notification
   */
  private async sendDiscord(payload: TradeEventPayload) {
    if (!this.discordConfig) return;

    try {
      const color = this.getEventColorDiscord(payload.event);
      const embed = {
        title: `🤖 ${payload.event}`,
        description: this.formatEventMessage(payload),
        color: color,
        timestamp: payload.timestamp.toISOString()
      };

      const message = { embeds: [embed] };

      await axios.post(this.discordConfig.webhookUrl, message);
      console.log(`✅ [DISCORD] Notification sent`);
    } catch (err: any) {
      console.error(`❌ [DISCORD] Failed:`, err.message);
    }
  }

  /**
   * Format event message
   */
  private formatEventMessage(payload: TradeEventPayload): string {
    const { event, data } = payload;

    switch (event) {
      case 'TRADE_OPENED':
        return `BUY ${data.pair} @ ${data.entryPrice} | SL: ${data.stopLoss} | TP: ${data.takeProfit}`;
      case 'TRADE_CLOSED':
        return `CLOSED ${data.pair} | P&L: $${data.pnl.toFixed(2)} (${data.pips} pips)`;
      case 'TRADE_WIN':
        return `WIN 🎉 | ${data.pair} | +$${data.pnl.toFixed(2)}`;
      case 'TRADE_LOSS':
        return `LOSS | ${data.pair} | -$${Math.abs(data.pnl).toFixed(2)}`;
      case 'SIGNAL_GENERATED':
        return `${data.signal} signal for ${data.pair} | Confidence: ${data.confidence}%`;
      case 'SIGNAL_REJECTED':
        return `Signal rejected for ${data.pair} | Reason: ${data.reason}`;
      case 'CIRCUIT_BREAKER_TRIPPED':
        return `⚠️ CIRCUIT BREAKER TRIPPED\nReason: ${data.reason}`;
      case 'DAILY_REPORT':
        return `Daily Report\nTrades: ${data.trades} | Win Rate: ${data.winRate}% | P&L: $${data.pnl.toFixed(2)}`;
      default:
        return JSON.stringify(data);
    }
  }

  /**
   * Get event color for Slack
   */
  private getEventColor(event: TradeEventType): string {
    switch (event) {
      case 'TRADE_WIN':
        return '#36a64f'; // Green
      case 'TRADE_LOSS':
        return '#e01e5a'; // Red
      case 'CIRCUIT_BREAKER_TRIPPED':
        return '#e01e5a'; // Red
      case 'SIGNAL_GENERATED':
        return '#4a90e2'; // Blue
      default:
        return '#6f42c1'; // Purple
    }
  }

  /**
   * Get event color for Discord (decimal)
   */
  private getEventColorDiscord(event: TradeEventType): number {
    switch (event) {
      case 'TRADE_WIN':
        return 0x36a64f; // Green
      case 'TRADE_LOSS':
        return 0xe01e5a; // Red
      case 'CIRCUIT_BREAKER_TRIPPED':
        return 0xe01e5a; // Red
      case 'SIGNAL_GENERATED':
        return 0x4a90e2; // Blue
      default:
        return 0x6f42c1; // Purple
    }
  }

  /**
   * Helper: delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get registered webhooks
   */
  getWebhooks(): Record<string, WebhookConfig> {
    const result: Record<string, WebhookConfig> = {};
    for (const [id, config] of this.webhooks) {
      result[id] = config;
    }
    return result;
  }
}

// Export singleton
export const notificationService = new NotificationService();
