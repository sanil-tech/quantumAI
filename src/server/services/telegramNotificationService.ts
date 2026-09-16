import fs from 'fs';
import path from 'path';

/**
 * Telegram & Webhook Live Trade Broadcast Service
 * Broadcasts formatted institutional trade execution, TP hits, SL hits, and news blackout alerts
 * to Telegram subscriber channels and Webhook listeners.
 * 
 * Supports:
 *  - 100% Standard Institutional English (Default)
 *  - Bahasa Melayu (Nusantara Community)
 *  - Interactive subscriber language selection via Telegram bot commands (/en, /ms, /language)
 */

export interface TradeBroadcastPayload {
  pair: string;
  direction: 'BUY' | 'SELL';
  timeframe: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  confidence: number;
  reasons: string[];
  brokerOrderId?: string;
  lotSize?: number;
  status: 'ENTRY_DISPATCHED' | 'TP_HIT' | 'SL_HIT' | 'NEWS_BLACKOUT_VETO' | 'PROFIT_LOCKED' | 'SIGNAL_CANCELLED';
  tier?: 'FREE' | 'VIP' | 'ALL';
  cancellationReason?: string;
  pnlDollars?: number;
  pnlPips?: number;
}

export interface MacroNewsAlertPayload {
  eventId: string;
  title: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  flag?: string;
  country?: string;
  timeStr: string;
  timestamp: number;
  forecast?: string;
  previous?: string;
  actual?: string;
  betterIfHigher?: boolean;
  affectedPairs: string[];
  type: 'UPCOMING_30M' | 'NEWS_OUTCOME' | 'MARKET_NORMALIZED' | 'TRADE_VETO';
  reason?: string;
  directionalBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  biasLabel?: string;
  marketReactionSummary?: string;
  tacticalAdvice?: string;
}

export interface TelegramConfigData {
  botToken: string | null;
  channelId: string | null;
  freeChannelId?: string | null;
  defaultLanguage?: 'en' | 'ms';
  userLanguagePreferences?: Record<string, 'en' | 'ms'>;
  isEnabled: boolean;
  lastUpdated?: string;
}

export class TelegramNotificationService {
  private static instance: TelegramNotificationService;
  private botToken: string | null = process.env.TELEGRAM_BOT_TOKEN || null;
  private channelId: string | null = process.env.TELEGRAM_CHANNEL_ID || null;
  private freeChannelId: string | null = process.env.TELEGRAM_FREE_CHANNEL_ID || null;
  private defaultLanguage: 'en' | 'ms' = (process.env.TELEGRAM_DEFAULT_LANG as 'en' | 'ms') || 'en';
  private userLanguagePreferences: Record<string, 'en' | 'ms'> = {};
  private isEnabled: boolean = true;
  private broadcastHistory: Array<{ timestamp: number; message: string; payload: any }> = [];
  private configFilePath: string = path.resolve(process.cwd(), 'data', 'telegram_config.json');
  private newsAlertsLedgerPath: string = path.resolve(process.cwd(), 'data', 'telegram_news_alerts.json');

  private alertedUpcomingNews = new Set<string>();
  private alertedOutcomeNews = new Set<string>();
  private alertedNormalizedNews = new Set<string>();
  private newsMonitorInterval: NodeJS.Timeout | null = null;
  private commandListenerTimeout: NodeJS.Timeout | null = null;
  private lastUpdateId: number = 0;
  private isPollingCommands: boolean = false;

  private constructor() {
    this.loadConfigFromDisk();
    this.registerBotMenuCommands().catch(() => {});
    this.startMacroNewsMonitor();
    this.startBotCommandListener();
  }

  public static getInstance(): TelegramNotificationService {
    if (!TelegramNotificationService.instance) {
      TelegramNotificationService.instance = new TelegramNotificationService();
    }
    return TelegramNotificationService.instance;
  }

  private loadConfigFromDisk(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        const parsed: TelegramConfigData = JSON.parse(raw);
        if (parsed.botToken) this.botToken = parsed.botToken;
        if (parsed.channelId) this.channelId = parsed.channelId;
        if (parsed.freeChannelId) this.freeChannelId = parsed.freeChannelId;
        if (parsed.defaultLanguage) this.defaultLanguage = parsed.defaultLanguage;
        if (parsed.userLanguagePreferences) this.userLanguagePreferences = parsed.userLanguagePreferences;
        if (typeof parsed.isEnabled === 'boolean') this.isEnabled = parsed.isEnabled;
      }
    } catch (e: any) {
      console.warn('[TelegramNotificationService] Could not load persisted telegram config:', e.message);
    }

    try {
      if (fs.existsSync(this.newsAlertsLedgerPath)) {
        const raw = fs.readFileSync(this.newsAlertsLedgerPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.upcoming)) {
          this.alertedUpcomingNews = new Set(parsed.upcoming);
        }
        if (Array.isArray(parsed.outcome)) {
          this.alertedOutcomeNews = new Set(parsed.outcome);
        }
        if (Array.isArray(parsed.normalized)) {
          this.alertedNormalizedNews = new Set(parsed.normalized);
        }
      }
    } catch (e: any) {
      console.warn('[TelegramNotificationService] Could not load news alerts ledger:', e.message);
    }
  }

  private saveNewsAlertsLedger(): void {
    try {
      const dir = path.dirname(this.newsAlertsLedgerPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        upcoming: Array.from(this.alertedUpcomingNews),
        outcome: Array.from(this.alertedOutcomeNews),
        normalized: Array.from(this.alertedNormalizedNews),
        lastUpdated: Date.now()
      };
      fs.writeFileSync(this.newsAlertsLedgerPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[TelegramNotificationService] Could not save news alerts ledger:', e.message);
    }
  }

  private saveConfigToDisk(): void {
    try {
      const dir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data: TelegramConfigData = {
        botToken: this.botToken,
        channelId: this.channelId,
        freeChannelId: this.freeChannelId,
        defaultLanguage: this.defaultLanguage,
        userLanguagePreferences: this.userLanguagePreferences,
        isEnabled: this.isEnabled,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.configFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[TelegramNotificationService] Could not save telegram config:', e.message);
    }
  }

  public configure(config: {
    botToken?: string;
    channelId?: string;
    freeChannelId?: string;
    defaultLanguage?: 'en' | 'ms';
    isEnabled?: boolean;
  }): void {
    if (config.botToken !== undefined) this.botToken = config.botToken.trim();
    if (config.channelId !== undefined) this.channelId = config.channelId.trim();
    if (config.freeChannelId !== undefined) this.freeChannelId = config.freeChannelId.trim();
    if (config.defaultLanguage !== undefined) this.defaultLanguage = config.defaultLanguage;
    if (config.isEnabled !== undefined) this.isEnabled = config.isEnabled;
    this.saveConfigToDisk();
  }

  public setUserLanguage(chatId: string, lang: 'en' | 'ms'): void {
    this.userLanguagePreferences[chatId] = lang;
    this.saveConfigToDisk();
  }

  public getUserLanguage(chatId?: string): 'en' | 'ms' {
    if (chatId && this.userLanguagePreferences[chatId]) {
      return this.userLanguagePreferences[chatId];
    }
    return this.defaultLanguage;
  }

  public getStatus() {
    return {
      isConfigured: Boolean(this.botToken && this.channelId),
      isEnabled: this.isEnabled,
      defaultLanguage: this.defaultLanguage,
      channelId: this.channelId ? (this.channelId.startsWith('-') ? `${this.channelId.slice(0, 4)}...${this.channelId.slice(-3)}` : `***${this.channelId.slice(-4)}`) : null,
      freeChannelId: this.freeChannelId ? (this.freeChannelId.startsWith('-') ? `${this.freeChannelId.slice(0, 4)}...${this.freeChannelId.slice(-3)}` : `***${this.freeChannelId.slice(-4)}`) : null,
      rawChannelId: this.channelId,
      botTokenMasked: this.botToken ? `${this.botToken.slice(0, 6)}...${this.botToken.slice(-4)}` : null,
      newsMonitorActive: this.newsMonitorInterval !== null,
      userPreferencesCount: Object.keys(this.userLanguagePreferences).length,
      recentAlertsCount: this.broadcastHistory.length,
      recentAlerts: this.broadcastHistory.slice(0, 10)
    };
  }

  public getHistory(): Array<{ timestamp: number; message: string; payload: any }> {
    return [...this.broadcastHistory];
  }

  /**
   * Send a direct message via Telegram Bot API with optional reply_markup
   */
  public async sendRawMessage(text: string, customChatId?: string, replyMarkup?: any): Promise<{ success: boolean; message: string; data?: any }> {
    const targetChat = customChatId || this.channelId;
    if (!this.botToken) {
      return { success: false, message: 'TELEGRAM_BOT_TOKEN_MISSING: Sila masukkan Bot Token Telegram anda.' };
    }
    if (!targetChat) {
      return { success: false, message: 'TELEGRAM_CHAT_ID_MISSING: Sila masukkan Chat ID / Channel ID penerima.' };
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const payload: any = {
        chat_id: targetChat,
        text,
        parse_mode: 'Markdown'
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { success: false, message: data.description || `Telegram API Error: ${res.statusText}`, data };
      }

      return { success: true, message: 'Message successfully dispatched!', data };
    } catch (err: any) {
      return { success: false, message: `Telegram connection error: ${err.message}` };
    }
  }

  /**
   * Diagnostic test alert in the specified or user language
   */
  public async sendTestMessage(customChatId?: string): Promise<{ success: boolean; message: string }> {
    const lang = this.getUserLanguage(customChatId);

    const testMsg = lang === 'en' ? [
      `🤖 *[QUANTUM AI - SYSTEM NOTIFICATION]* 📡`,
      `✅ *Telegram Institutional Alert Channel Active*`,
      ``,
      `Your Quantum AI Institutional Copier is connected and ready to broadcast:`,
      `• 🚀 *Live Trade Alerts* (VIP Execution & Free Community Picks)`,
      `• ⚠️ *Macro News Alerts* (High-Impact Economic Defense ±30m)`,
      `• 🛡️ *Market Normalization Alerts* (Volatility Resumption Notices)`,
      ``,
      `• *Execution Engine:* cTrader Open API (Demo/Live)`,
      `• *Order Protocol:* Method 2 Split-Ticket (TP1 & TP2 Runner)`,
      `• *Engine State:* Operational 24/5 & Standing By`,
      ``,
      `🌐 *Language:* English 🇬🇧 (Switch via \`/ms\` or \`/en\`)`,
      `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Intelligence_`
    ].join('\n') : [
      `🤖 *[QUANTUM AI - PEMBERITAHUAN SISTEM]* 📡`,
      `✅ *Saluran Alert Telegram Berjaya Disahkan!*`,
      ``,
      `Sistem Quantum AI Institutional Copier anda kini sedia menghantar:`,
      `• 🚀 *Live Trade Alerts* (VIP & Komuniti Percuma)`,
      `• ⚠️ *Macro News Alerts* (Peringatan Berita Berimpak Tinggi ±30m)`,
      `• 🛡️ *Market Normalized Alerts* (Pengumuman Pasaran Stabil)`,
      ``,
      `• *Mod Dagangan:* cTrader Open API (Demo/Live)`,
      `• *Format Eksekusi:* Method 2 Split-Ticket (TP1 & TP2)`,
      `• *Status Enjin:* Aktif 24/5 & Siap Siaga`,
      ``,
      `🌐 *Bahasa:* Bahasa Melayu 🇲🇾 (Tukar melalui \`/en\` atau \`/ms\`)`,
      `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Copier_`
    ].join('\n');

    return this.sendRawMessage(testMsg, customChatId);
  }

  /**
   * Evaluates macro news release vs forecast to derive directional bias,
   * currency market dynamics, and SMC institutional price action advice.
   */
  public evaluateNewsOutcomeBias(payload: MacroNewsAlertPayload, lang: 'en' | 'ms' = 'en'): {
    directionalBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    biasLabel: string;
    marketReactionSummary: string;
    tacticalAdvice: string;
  } {
    const actual = payload.actual || payload.forecast || '';
    const forecast = payload.forecast || '';
    const curr = payload.currency;
    const pairs = payload.affectedPairs || [];

    let isBetter: boolean | null = null;
    let isNeutral: boolean = false;

    if (forecast && actual) {
      const fNum = parseFloat(String(forecast).replace(/[^0-9.-]/g, ''));
      const aNum = parseFloat(String(actual).replace(/[^0-9.-]/g, ''));
      if (!isNaN(fNum) && !isNaN(aNum)) {
        if (Math.abs(aNum - fNum) < 0.0001) {
          isNeutral = true;
        } else {
          isBetter = payload.betterIfHigher !== false ? (aNum > fNum) : (aNum < fNum);
        }
      }
    }

    const counterPairs = pairs.filter(p => p.endsWith(curr) || p.startsWith('EUR/') || p.startsWith('GBP/'));
    const directPairs = pairs.filter(p => p.startsWith(curr));

    if (isNeutral || isBetter === null) {
      if (lang === 'en') {
        return {
          directionalBias: 'NEUTRAL',
          biasLabel: '🟡 NEUTRAL / PRICED-IN (AS EXPECTED)',
          marketReactionSummary: [
            `  • *Currency Sentiment (${curr}):* In line with consensus expectations. No unexpected macro shock.`,
            `  • *Pair Impact:* Pairs like \`${pairs.slice(0, 3).join(', ')}\` expected to trade within established ranges rather than sustaining aggressive directional breakouts.`
          ].join('\n'),
          tacticalAdvice: [
            `  • *SMC Liquidity Behavior:* Minimal expansion; range-bound fakeouts possible around short-term liquidity pools.`,
            `  • *Tactical Rule:* Safe to resume standard SMC framework once 15-minute spread stabilizes.`
          ].join('\n')
        };
      } else {
        return {
          directionalBias: 'NEUTRAL',
          biasLabel: '🟡 NEUTRAL / SEJAJAR JANGKAAN (PRICED-IN)',
          marketReactionSummary: [
            `  • *Sentimen Mata Wang (${curr}):* Keputusan rasmi sejajar jangkaan konsensus. Tiada kejutan dasar makro yang drastik.`,
            `  • *Impak Pasangan:* Pasangan seperti \`${pairs.slice(0, 3).join(', ')}\` dijangka berlegar dalam julat sokongan & rintangan harian tanpa breakout agresif.`
          ].join('\n'),
          tacticalAdvice: [
            `  • *Tingkah Laku Likuiditi SMC:* Berhati-hati dengan false breakout kecil di sempadan liquidity pool.`,
            `  • *Nasihat Taktikal:* Pasaran kembali selamat untuk dagangan teknikal SMC sebaik spread kembali stabil dalam tempoh 15 minit.`
          ].join('\n')
        };
      }
    }

    if (isBetter) {
      if (lang === 'en') {
        return {
          directionalBias: 'BULLISH',
          biasLabel: `🟢 BULLISH / HAWKISH (${curr} STRENGTH)`,
          marketReactionSummary: [
            `  • *Currency Sentiment (${curr}):* Stronger than forecasted. Bullish macro impulse for ${curr}.`,
            directPairs.length ? `  • *Bullish Expansion Pairs:* \`${directPairs.join(', ')}\` likely to experience upward momentum.` : '',
            counterPairs.length ? `  • *Bearish Downward Pressure Pairs:* \`${counterPairs.join(', ')}\` likely to face downward selling pressure due to ${curr} strength.` : ''
          ].filter(Boolean).join('\n'),
          tacticalAdvice: [
            `  • *Liquidity Trap Warning:* Do NOT enter on the initial 1-minute candle spike. High frequency algorithms routinely sweep Buy/Sell stops before genuine expansion.`,
            `  • *Tactical Rule:* Allow M15 candle closure. Look for high-probability mitigation into discount/premium Order Blocks or Fair Value Gaps (FVG).`
          ].join('\n')
        };
      } else {
        return {
          directionalBias: 'BULLISH',
          biasLabel: `🟢 KUKUH / BULLISH / HAWKISH (KEKUATAN ${curr})`,
          marketReactionSummary: [
            `  • *Sentimen Mata Wang (${curr}):* Keputusan lebih kukuh daripada jangkaan. Impak makro Bullish kepada ${curr}.`,
            directPairs.length ? `  • *Pasangan Berpotensi Bullish:* \`${directPairs.join(', ')}\` berpotensi membuat lonjakan kenaikan harga yang pantas.` : '',
            counterPairs.length ? `  • *Pasangan Tertekan (Bearish):* \`${counterPairs.join(', ')}\` berisiko mengalami tekanan jualan akibat kekuatan ${curr}.` : ''
          ].filter(Boolean).join('\n'),
          tacticalAdvice: [
            `  • *Amaran Perangkap Likuiditi:* JANGAN masuk posisi pada lilin 1 minit pertama (Elakkan FOMO). Robot institusi kerap memburu stop loss (whipsaw) sebelum arah sebenar bersambung.`,
            `  • *Nasihat Taktikal:* Tunggu penutupan lilin M15. Cari entri berasaskan tindak balas pantulan di zon Order Block (OB) atau Fair Value Gap (FVG) yang sah.`
          ].join('\n')
        };
      }
    } else {
      if (lang === 'en') {
        return {
          directionalBias: 'BEARISH',
          biasLabel: `🔴 BEARISH / DOVISH (${curr} WEAKNESS)`,
          marketReactionSummary: [
            `  • *Currency Sentiment (${curr}):* Weaker than forecasted. Dovish downward pressure for ${curr}.`,
            directPairs.length ? `  • *Bearish Downward Pairs:* \`${directPairs.join(', ')}\` likely to experience downward selling pressure.` : '',
            counterPairs.length ? `  • *Bullish Rebound Pairs:* \`${counterPairs.join(', ')}\` poised for upward breakout due to ${curr} weakness.` : ''
          ].filter(Boolean).join('\n'),
          tacticalAdvice: [
            `  • *Liquidity Trap Warning:* Sharp sell-off may trigger violent short-covering bounces. Avoid impulsive chasing.`,
            `  • *Tactical Rule:* Wait for market structure break (BOS/CHoCH) on M15 before taking continuation entries.`
          ].join('\n')
        };
      } else {
        return {
          directionalBias: 'BEARISH',
          biasLabel: `🔴 LEMAH / BEARISH / DOVISH (PELEMAHAN ${curr})`,
          marketReactionSummary: [
            `  • *Sentimen Mata Wang (${curr}):* Keputusan lebih lemah daripada jangkaan. Tekanan makro Bearish kepada ${curr}.`,
            directPairs.length ? `  • *Pasangan Berpotensi Bearish:* \`${directPairs.join(', ')}\` berkemungkinan mengalami kejatuhan harga pantas.` : '',
            counterPairs.length ? `  • *Pasangan Berpotensi Bullish:* \`${counterPairs.join(', ')}\` berpotensi membuat lonjakan kenaikan berikutan kelemahan ${curr}.` : ''
          ].filter(Boolean).join('\n'),
          tacticalAdvice: [
            `  • *Amaran Perangkap Likuiditi:* Penurunan tajam boleh mencetuskan lantunan pembalikan pantas (short squeeze). Jangan kejar lilin merah yang sedang laju.`,
            `  • *Nasihat Taktikal:* Tunggu pembentukan Market Structure Break (BOS / CHoCH) pada M15 sebelum menyertai aliran pasaran.`
          ].join('\n')
        };
      }
    }
  }

  /**
   * Format Macroeconomic News Alerts by Language
   */
  public formatNewsAlert(payload: MacroNewsAlertPayload, lang: 'en' | 'ms' = 'en'): string {
    const flag = payload.flag || (payload.currency === 'USD' ? '🇺🇸' : payload.currency === 'EUR' ? '🇪🇺' : payload.currency === 'GBP' ? '🇬🇧' : payload.currency === 'JPY' ? '🇯🇵' : '🌍');

    if (lang === 'en') {
      if (payload.type === 'UPCOMING_30M') {
        const remainingMinutes = Math.max(1, Math.round((payload.timestamp - Date.now()) / (60 * 1000)));
        return [
          `⚠️ *[QUANTUM AI - MACRO NEWS ALERT]* ⚠️`,
          `🔴 *HIGH-IMPACT ECONOMIC RELEASE IMMINENT*`,
          ``,
          `📌 *Event:* ${flag} *${payload.title}* (${payload.currency})`,
          `🕒 *Scheduled Time:* \`${payload.timeStr}\` (~${remainingMinutes} mins remaining)`,
          payload.forecast ? `📊 *Consensus Forecast:* \`${payload.forecast}\`` : '',
          payload.previous ? `📜 *Previous Reading:* \`${payload.previous}\`` : '',
          `⛔ *Affected Symbols:* \`${payload.affectedPairs.join(', ')}\``,
          ``,
          `🛡️ *Institutional Risk Protocol:*`,
          `  • *News Blackout Defense (±30m) Active*`,
          `  • All autonomous new entries for ${payload.currency} frozen immediately`,
          `  • Protecting client capital against wild slippage and spread widening`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Risk Governance_`
        ].filter(Boolean).join('\n');
      } else if (payload.type === 'NEWS_OUTCOME') {
        const outcome = this.evaluateNewsOutcomeBias(payload, 'en');
        const actualStr = payload.actual || 'Released';
        const forecastStr = payload.forecast || 'N/A';
        const previousStr = payload.previous || 'N/A';
        return [
          `⚡ *[QUANTUM AI - BREAKING NEWS OUTCOME]* ⚡`,
          `📢 *HIGH-IMPACT ECONOMIC RELEASE RECORDED*`,
          ``,
          `📌 *Event:* ${flag} *${payload.title}* (${payload.currency})`,
          `🕒 *Release Time:* \`${payload.timeStr}\``,
          `📊 *Actual:* \`${actualStr}\``,
          `🔮 *Forecast:* \`${forecastStr}\` | 📜 *Previous:* \`${previousStr}\``,
          `🎯 *Directional Bias:* *${outcome.biasLabel}*`,
          `⛔ *Affected Symbols:* \`${payload.affectedPairs.join(', ')}\``,
          ``,
          `📈 *Anticipated Market & Price Movement:*`,
          outcome.marketReactionSummary,
          ``,
          `🧠 *SMC Liquidity & Tactical Guidance:*`,
          outcome.tacticalAdvice,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Macro Intelligence_`
        ].filter(Boolean).join('\n');
      } else if (payload.type === 'MARKET_NORMALIZED') {
        return [
          `✅ *[QUANTUM AI - MARKET NORMALIZED]* 🛡️`,
          `🟢 *VOLATILITY BUFFER PERIOD CONCLUDED*`,
          ``,
          `📌 *Event:* ${flag} *${payload.title}* (${payload.currency})`,
          `🕒 *Status:* 30-minute post-release volatility window has expired.`,
          `📊 *Resumed Symbols:* \`${payload.affectedPairs.join(', ')}\``,
          ``,
          `🧠 *Algorithmic State:*`,
          `  • Spreads and liquidity have returned to normalized levels`,
          `  • Quantum AI SMC pattern scanner re-opened for high-confidence setups`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Scanner Ready_`
        ].join('\n');
      } else if (payload.type === 'TRADE_VETO') {
        return [
          `🛡️ *[QUANTUM AI - TRADE SHIELD TRIGGERED]* ⛔`,
          `📌 *Order Entry Vetoed for Capital Protection*`,
          ``,
          `💱 *Pair:* \`${payload.affectedPairs[0] || 'FX'}\``,
          `🔴 *Veto Rationale:* High-impact economic event (${payload.reason || payload.title}) active within ±30m window.`,
          `💡 *Institutional Discipline:* Preserving equity takes precedence over high-risk market speculation.`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Capital Defense_`
        ].join('\n');
      }
    } else {
      // Bahasa Melayu template
      if (payload.type === 'UPCOMING_30M') {
        const remainingMinutes = Math.max(1, Math.round((payload.timestamp - Date.now()) / (60 * 1000)));
        return [
          `⚠️ *[QUANTUM AI - MACRO NEWS ALERT]* ⚠️`,
          `🔴 *PERISTIWA BERIMPAK TINGGI AKAN DIRILIS*`,
          ``,
          `📌 *Tajuk:* ${flag} *${payload.title}* (${payload.currency})`,
          `🕒 *Masa Rilis:* \`${payload.timeStr}\` (~${remainingMinutes} minit lagi)`,
          payload.forecast ? `📊 *Jangkaan (Forecast):* \`${payload.forecast}\`` : '',
          payload.previous ? `📜 *Sebelum (Previous):* \`${payload.previous}\`` : '',
          `⛔ *Mata Wang / Pasangan Terjejas:* \`${payload.affectedPairs.join(', ')}\``,
          ``,
          `🛡️ *Tindakan Sistem Keselamatan:*`,
          `  • *News Blackout Defense (±30m) Diaktifkan*`,
          `  • Semua entri baharu untuk ${payload.currency} dibekukan serta-merta`,
          `  • Perlindungan modal daripada lonjakan spread liar & slippage`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Risk Governance_`
        ].filter(Boolean).join('\n');
      } else if (payload.type === 'NEWS_OUTCOME') {
        const outcome = this.evaluateNewsOutcomeBias(payload, 'ms');
        const actualStr = payload.actual || 'Dirilis';
        const forecastStr = payload.forecast || 'N/A';
        const previousStr = payload.previous || 'N/A';
        return [
          `⚡ *[QUANTUM AI - KEPUTUSAN RASMI BERITA]* ⚡`,
          `📢 *DATA EKONOMI BERIMPAK TINGGI TELAH DIRILIS*`,
          ``,
          `📌 *Peristiwa:* ${flag} *${payload.title}* (${payload.currency})`,
          `🕒 *Waktu Siaran:* \`${payload.timeStr}\``,
          `📊 *Keputusan Sebenar (Actual):* \`${actualStr}\``,
          `🔮 *Jangkaan (Forecast):* \`${forecastStr}\` | 📜 *Sebelum (Previous):* \`${previousStr}\``,
          `🧭 *Hala Tuju / Bias:* *${outcome.biasLabel}*`,
          `⛔ *Mata Wang / Pasangan Terjejas:* \`${payload.affectedPairs.join(', ')}\``,
          ``,
          `📈 *Kemungkinan Impak Kepada Pergerakan Harga:*`,
          outcome.marketReactionSummary,
          ``,
          `🧠 *Analisis Likuiditi SMC & Nasihat Taktikal:*`,
          outcome.tacticalAdvice,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Macro Intelligence_`
        ].filter(Boolean).join('\n');
      } else if (payload.type === 'MARKET_NORMALIZED') {
        return [
          `✅ *[QUANTUM AI - MARKET NORMALIZED]* 🛡️`,
          `🟢 *ZON VOLATILITI BERITA TELAH SELESAI*`,
          ``,
          `📌 *Peristiwa:* ${flag} *${payload.title}* (${payload.currency})`,
          `🕒 *Status:* Tempoh penimbal 30 minit pasca-berita telah tamat.`,
          `📊 *Pasangan Kembali Aktif:* \`${payload.affectedPairs.join(', ')}\``,
          ``,
          `🧠 *Tindakan Algoritma:*`,
          `  • Volatiliti dan spread pasaran kembali ke paras normal`,
          `  • Pengimbas SMC Quantum AI dibuka semula untuk entri berkeyakinan tinggi`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Scanner Ready_`
        ].join('\n');
      } else if (payload.type === 'TRADE_VETO') {
        return [
          `🛡️ *[QUANTUM AI - TRADE SHIELD TRIGGERED]* ⛔`,
          `📌 *Entri Dibatalkan Demi Keselamatan Modal*`,
          ``,
          `💱 *Pasangan:* \`${payload.affectedPairs[0] || 'FX'}\``,
          `🔴 *Sebab:* Berita berimpak tinggi (${payload.reason || payload.title}) sedang aktif dalam zon ±30 minit.`,
          `💡 *Prinsip Institusi:* Kami mengutamakan pemuliharaan modal daripada mengejar untung berisiko tinggi.`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Capital Defense_`
        ].join('\n');
      }
    }
    return '';
  }

  /**
   * Format Trade Broadcast Alerts by Language
   */
  public formatTradeAlert(payload: TradeBroadcastPayload, lang: 'en' | 'ms' = 'en'): string {
    const isFreeSignal = payload.tier === 'FREE' || (payload.confidence >= 85 && payload.status === 'ENTRY_DISPATCHED');
    const tp2Formatted = payload.takeProfit2 ? `\n🎯 *Take Profit 2 (Runner):* \`${payload.takeProfit2}\`` : '';
    const reasonsFormatted = (payload.reasons || [])
      .slice(0, 3)
      .map(r => `  • ${r}`)
      .join('\n');

    if (lang === 'en') {
      if (payload.status === 'SIGNAL_CANCELLED') {
        return [
          `🚫 *[QUANTUM AI - SIGNAL CANCELLED]* 🚫`,
          `📌 *SETUP INVALIDATED - CANCEL PENDING ORDERS*`,
          ``,
          `💱 *Pair:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Direction:* *${payload.direction}* | *AI Confidence:* \`${payload.confidence}%\``,
          `💵 *Planned Entry:* \`${payload.entryPrice}\``,
          `🛑 *Original SL:* \`${payload.stopLoss}\``,
          ``,
          `🔴 *Cancellation Rationale:*`,
          `  • *${payload.cancellationReason || 'Market structure or price invalidated setup before entry fill.'}*`,
          ``,
          `⚠️ *Mandatory Subscriber Action:*`,
          `  • Delete / Cancel any pending limit or stop orders for this pair.`,
          `  • Do NOT chase current market price (No FOMO). Preserving capital is paramount.`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Risk Governance_`
        ].join('\n');
      }

      let emoji = isFreeSignal ? '🌟' : '🚀';
      let title = isFreeSignal ? 'HIGH-CONFIDENCE TRADE PROPOSAL' : 'AUTONOMOUS ENTRY DISPATCHED';

      if (payload.status === 'TP_HIT') {
        emoji = '🎯';
        title = 'TAKE PROFIT TARGET HIT (PROFIT SECURED)';
      } else if (payload.status === 'SL_HIT') {
        emoji = '🛡️';
        title = 'STOP LOSS TRIGGERED (RISK CONTAINED)';
      } else if (payload.status === 'NEWS_BLACKOUT_VETO') {
        emoji = '🔴';
        title = 'TRADE VETOED: HIGH-IMPACT NEWS BLACKOUT';
      } else if (payload.status === 'PROFIT_LOCKED') {
        emoji = '🔒';
        title = 'TP1 SECURED / STOP LOSS MOVED TO BREAKEVEN';
      }

      if (isFreeSignal && payload.status === 'ENTRY_DISPATCHED') {
        return [
          `🌟 *[QUANTUM AI - FREE COMMUNITY SIGNAL]* 🌟`,
          `📌 *${title}*`,
          ``,
          `💱 *Pair:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Direction:* *${payload.direction}* | *AI Confidence:* \`${payload.confidence}%\``,
          `💵 *Entry Price:* \`${payload.entryPrice}\``,
          `🛑 *Stop Loss:* \`${payload.stopLoss}\``,
          `🎯 *Take Profit 1:* \`${payload.takeProfit1}\`${tp2Formatted}`,
          ``,
          `🧠 *SMC & Technical Confluences:*`,
          reasonsFormatted || '  • SMC Order Block & Candlestick Confirmation',
          ``,
          `💡 *Risk Advisory:*`,
          `  • Strictly cap capital exposure to max 1.0% - 1.5% of equity.`,
          `  • Move Stop Loss to Breakeven (Risk-Free) once TP1 target is achieved.`,
          ``,
          `👑 _Want 100% automated hands-free trade copying? Join the Quantum AI VIP Copier._`,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Intelligence_`
        ].join('\n');
      } else {
        return [
          `${emoji} *[QUANTUM AI - ${payload.tier === 'VIP' ? 'VIP INSTITUTIONAL' : 'TRADING RADAR'}]* ${emoji}`,
          `📌 *${title}*`,
          ``,
          `💱 *Pair:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Direction:* *${payload.direction}* | *Confidence:* \`${payload.confidence}%\``,
          `💵 *Entry Price:* \`${payload.entryPrice}\``,
          `🛑 *Stop Loss:* \`${payload.stopLoss}\``,
          `🎯 *Take Profit 1:* \`${payload.takeProfit1}\``,
          payload.takeProfit2 ? `🎯 *Take Profit 2:* \`${payload.takeProfit2}\`` : '',
          payload.lotSize ? `📊 *Volume Sizing:* \`${payload.lotSize} Lots\`` : '',
          payload.pnlDollars !== undefined ? `💰 *Net PnL:* \`${payload.pnlDollars >= 0 ? '+' : ''}$${payload.pnlDollars.toFixed(2)}\` (\`${payload.pnlPips ? payload.pnlPips.toFixed(1) : 0} pips\`)` : '',
          payload.brokerOrderId ? `🔗 *Broker Order ID:* \`#${payload.brokerOrderId}\`` : '',
          ``,
          `🧠 *SMC Confluences:*`,
          reasonsFormatted || '  • SMC Order Block & Candlestick Close Confluence',
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Copier_`
        ].filter(Boolean).join('\n');
      }
    } else {
      // Bahasa Melayu template
      if (payload.status === 'SIGNAL_CANCELLED') {
        return [
          `🚫 *[QUANTUM AI - SIGNAL DIBATALKAN]* 🚫`,
          `📌 *SETUP TIDAK LAGI SAH - BATALKAN PENDING ORDER*`,
          ``,
          `💱 *Pasangan:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Arah Asal:* *${payload.direction}* | *AI Score:* \`${payload.confidence}%\``,
          `💵 *Harga Rancang Entri:* \`${payload.entryPrice}\``,
          `🛑 *Stop Loss Asal:* \`${payload.stopLoss}\``,
          ``,
          `🔴 *Sebab Pembatalan:*`,
          `  • *${payload.cancellationReason || 'Struktur pasaran atau harga terbatal sebelum sempat disambar.'}*`,
          ``,
          `⚠️ *Tindakan Wajib Subscriber:*`,
          `  • Sila batalkan / padam sebarang pending limit/stop order pada platform anda.`,
          `  • Jangan kejar harga pasaran (No FOMO). Disiplin pemuliharaan modal adalah kunci.`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Risk Governance_`
        ].join('\n');
      }

      let emoji = isFreeSignal ? '🌟' : '🚀';
      let title = isFreeSignal ? 'SETUP PILIHAN PERCUMA (HIGH CONFIDENCE)' : 'ENTRI BAHARU DILAKSANAKAN';

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
        title = 'BREAKEVEN / 50% PROFIT DIKUNCI';
      }

      if (isFreeSignal && payload.status === 'ENTRY_DISPATCHED') {
        return [
          `🌟 *[QUANTUM AI - FREE COMMUNITY SIGNAL]* 🌟`,
          `📌 *${title}*`,
          ``,
          `💱 *Pasangan:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Arah:* *${payload.direction}* | *AI Score:* \`${payload.confidence}%\``,
          `💵 *Harga Entri:* \`${payload.entryPrice}\``,
          `🛑 *Stop Loss:* \`${payload.stopLoss}\``,
          `🎯 *Take Profit 1:* \`${payload.takeProfit1}\`${tp2Formatted}`,
          ``,
          `🧠 *Konfluens SMC & Indikator:*`,
          reasonsFormatted || '  • SMC Order Block & Candlestick Confirmation',
          ``,
          `💡 *Panduan Risiko:*`,
          `  • Disiplinkan risiko maks 1.0% - 1.5% daripada modal anda.`,
          `  • Selepas TP1 dicapai, alihkan SL ke harga Breakeven (Risk-Free).`,
          ``,
          `👑 _Ingin trade automatik 100% tanpa perlu entri manual? Sertai VIP Auto-Copier Quantum AI._`,
          `⏰ _${new Date().toUTCString()}_`
        ].join('\n');
      } else {
        return [
          `${emoji} *[QUANTUM AI - ${payload.tier === 'VIP' ? 'VIP INSTITUTIONAL' : 'TRADING RADAR'}]* ${emoji}`,
          `📌 *${title}*`,
          ``,
          `💱 *Pasangan:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Arah:* *${payload.direction}* | *Keyakinan:* \`${payload.confidence}%\``,
          `💵 *Harga Entri:* \`${payload.entryPrice}\``,
          `🛑 *Stop Loss:* \`${payload.stopLoss}\``,
          `🎯 *Take Profit 1:* \`${payload.takeProfit1}\``,
          payload.takeProfit2 ? `🎯 *Take Profit 2 (Runner):* \`${payload.takeProfit2}\`` : '',
          payload.lotSize ? `📊 *Saiz Volum:* \`${payload.lotSize} Lots\`` : '',
          payload.pnlDollars !== undefined ? `💰 *Hasil PnL:* \`${payload.pnlDollars >= 0 ? '+' : ''}$${payload.pnlDollars.toFixed(2)}\` (\`${payload.pnlPips ? payload.pnlPips.toFixed(1) : 0} pips\`)` : '',
          payload.brokerOrderId ? `🔗 *ID Pesanan cTrader:* \`#${payload.brokerOrderId}\`` : '',
          ``,
          `🧠 *Konfluens SMC & Indikator:*`,
          reasonsFormatted || '  • SMC Order Block & Candlestick Close Confluence',
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Copier_`
        ].filter(Boolean).join('\n');
      }
    }
  }

  /**
   * Broadcast Macroeconomic High-Impact News Alerts
   */
  public async broadcastNewsAlert(payload: MacroNewsAlertPayload): Promise<boolean> {
    if (!this.isEnabled) return false;

    const mainLang = this.getUserLanguage(this.channelId || undefined);
    const message = this.formatNewsAlert(payload, mainLang);

    if (!message) return false;

    this.broadcastHistory.unshift({
      timestamp: Date.now(),
      message,
      payload
    });
    if (this.broadcastHistory.length > 100) this.broadcastHistory.pop();

    if (this.botToken && this.channelId) {
      const res = await this.sendRawMessage(message, this.channelId);
      if (this.freeChannelId && this.freeChannelId !== this.channelId) {
        const freeLang = this.getUserLanguage(this.freeChannelId);
        const freeMsg = this.formatNewsAlert(payload, freeLang);
        await this.sendRawMessage(freeMsg, this.freeChannelId).catch(() => {});
      }
      return res.success;
    }
    return true;
  }

  /**
   * Broadcast Trade Execution Events
   */
  public async broadcastTradeEvent(payload: TradeBroadcastPayload): Promise<boolean> {
    if (!this.isEnabled) return false;

    const isFreeSignal = payload.tier === 'FREE' || (payload.confidence >= 85 && (payload.status === 'ENTRY_DISPATCHED' || payload.status === 'SIGNAL_CANCELLED'));
    const mainLang = this.getUserLanguage(this.channelId || undefined);
    const message = this.formatTradeAlert(payload, mainLang);

    this.broadcastHistory.unshift({
      timestamp: Date.now(),
      message,
      payload
    });
    if (this.broadcastHistory.length > 100) this.broadcastHistory.pop();

    // High-speed copier signal bridge for cTrader cBots (zero latency, zero Telegram conflict)
    if (payload.status === 'ENTRY_DISPATCHED') {
      import('../routes/copier').then(({ publishCopierSignal }) => {
        publishCopierSignal({
          action: 'NEW_ORDER',
          pair: payload.pair,
          direction: payload.direction,
          entryPrice: payload.entryPrice,
          stopLoss: payload.stopLoss,
          takeProfit1: payload.takeProfit1,
          takeProfit2: payload.takeProfit2 || payload.takeProfit1,
          lotSize: payload.lotSize || 0.02,
          reasons: payload.reasons
        });
      }).catch(() => {});
    } else if (payload.status === 'SIGNAL_CANCELLED') {
      import('../routes/copier').then(({ publishCopierSignal }) => {
        publishCopierSignal({
          action: 'CANCEL_ORDER',
          pair: payload.pair,
          direction: payload.direction,
          entryPrice: payload.entryPrice,
          stopLoss: payload.stopLoss,
          takeProfit1: 0,
          takeProfit2: 0,
          lotSize: 0,
          reasons: [payload.cancellationReason || 'Setup Invalidated']
        });
      }).catch(() => {});
    }

    if (this.botToken && this.channelId) {
      const res = await this.sendRawMessage(message, this.channelId);
      if (res.success) {
        console.log(`📡 [TelegramNotificationService] Live alert dispatched to ${this.channelId} (${mainLang.toUpperCase()}).`);
      } else {
        console.warn(`[TelegramNotificationService] Notice: could not dispatch Telegram message:`, res.message);
      }

      if (this.freeChannelId && this.freeChannelId !== this.channelId && (isFreeSignal || payload.status === 'TP_HIT' || payload.status === 'SIGNAL_CANCELLED')) {
        const freeLang = this.getUserLanguage(this.freeChannelId);
        const freeMsg = this.formatTradeAlert(payload, freeLang);
        await this.sendRawMessage(freeMsg, this.freeChannelId).catch(() => {});
      }
      return res.success;
    }

    return true;
  }

  /**
   * Continuous background monitor for global macroeconomic news events
   */
  public startMacroNewsMonitor(): void {
    if (this.newsMonitorInterval) return;

    this.newsMonitorInterval = setInterval(async () => {
      try {
        const { economicCalendarProvider } = await import('./economicCalendarProvider');
        const events = economicCalendarProvider.getWeeklyEvents();
        const now = Date.now();
        const THIRTY_MINUTES = 30 * 60 * 1000;
        const FIFTEEN_MINUTES = 15 * 60 * 1000;
        const FORTY_FIVE_MINUTES = 45 * 60 * 1000;

        for (const event of events) {
          if (event.impact !== 'HIGH') continue;

          // 1. Upcoming News Check (Within 30m before release)
          const timeUntilRelease = event.timestamp - now;
          if (timeUntilRelease > 0 && timeUntilRelease <= THIRTY_MINUTES) {
            if (!this.alertedUpcomingNews.has(event.id)) {
              this.alertedUpcomingNews.add(event.id);
              this.saveNewsAlertsLedger();
              await this.broadcastNewsAlert({
                eventId: event.id,
                title: event.title,
                currency: event.currency,
                impact: event.impact,
                flag: event.flag,
                country: event.country,
                timeStr: event.time,
                timestamp: event.timestamp,
                forecast: event.forecast,
                previous: event.previous,
                affectedPairs: event.affectedPairs,
                type: 'UPCOMING_30M'
              });
            }
          }

          // 2. Instant News Outcome & Market Impact Check (0 to 15m post-release)
          const timeSinceRelease = now - event.timestamp;
          if (timeSinceRelease >= 0 && timeSinceRelease <= FIFTEEN_MINUTES) {
            if (!this.alertedOutcomeNews.has(event.id)) {
              this.alertedOutcomeNews.add(event.id);
              this.saveNewsAlertsLedger();
              const actualVal = event.actual || (event as any).actualIfReleased || event.forecast;
              await this.broadcastNewsAlert({
                eventId: event.id,
                title: event.title,
                currency: event.currency,
                impact: event.impact,
                flag: event.flag,
                country: event.country,
                timeStr: event.time,
                timestamp: event.timestamp,
                forecast: event.forecast,
                previous: event.previous,
                actual: actualVal,
                betterIfHigher: (event as any).betterIfHigher,
                affectedPairs: event.affectedPairs,
                type: 'NEWS_OUTCOME'
              });
            }
          }

          // 3. Post-News Market Normalization Check (30m to 45m after release)
          if (timeSinceRelease >= THIRTY_MINUTES && timeSinceRelease <= FORTY_FIVE_MINUTES) {
            if (!this.alertedNormalizedNews.has(event.id)) {
              this.alertedNormalizedNews.add(event.id);
              this.saveNewsAlertsLedger();
              await this.broadcastNewsAlert({
                eventId: event.id,
                title: event.title,
                currency: event.currency,
                impact: event.impact,
                flag: event.flag,
                country: event.country,
                timeStr: event.time,
                timestamp: event.timestamp,
                affectedPairs: event.affectedPairs,
                type: 'MARKET_NORMALIZED'
              });
            }
          }
        }
      } catch (err: any) {
        // background news monitor catch
      }
    }, 60 * 1000);

    if (this.newsMonitorInterval && (this.newsMonitorInterval as any).unref) {
      (this.newsMonitorInterval as any).unref();
    }
  }

  /**
   * Register official Bot Menu commands with Telegram API
   */
  public async registerBotMenuCommands(): Promise<void> {
    if (!this.botToken) return;
    try {
      await fetch(`https://api.telegram.org/bot${this.botToken}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [
            { command: 'start', description: 'Institutional Welcome & Hub' },
            { command: 'register', description: 'Register cTrader VIP Account /register <account>' },
            { command: 'status', description: 'VIP Subscription & Account Status' },
            { command: 'stats', description: 'Subscribers Analytics & Telemetry 📊' },
            { command: 'strategy', description: 'Smart Money Concepts & Analysis Rules' },
            { command: 'risk', description: 'Method 2 Split-Ticket, TP1/TP2 & BE' },
            { command: 'services', description: 'Free Community Signals vs VIP Copier' },
            { command: 'en', description: 'Switch Alert Language to English 🇬🇧' },
            { command: 'ms', description: 'Tukar Bahasa ke Bahasa Melayu 🇲🇾' }
          ]
        })
      });
      console.log('📱 [TelegramNotificationService] Official Bot Menu commands registered successfully with Telegram API.');
    } catch (err: any) {
      console.warn('[TelegramNotificationService] Notice: could not register bot menu commands:', err.message);
    }
  }

  public getOnboardingKeyboard(lang: 'en' | 'ms') {
    const isEn = lang === 'en';
    return {
      inline_keyboard: [
        [
          { text: isEn ? '🧠 Strategy & Analysis' : '🧠 Strategi Analisis', callback_data: 'cmd_strategy' },
          { text: isEn ? '🛡️ Risk & Execution' : '🛡️ Risiko & Eksekusi', callback_data: 'cmd_risk' }
        ],
        [
          { text: isEn ? '🚀 Free vs VIP Copier' : '🚀 Servis Percuma vs VIP', callback_data: 'cmd_services' },
          { text: isEn ? '📊 System Status' : '📊 Status Sistem', callback_data: 'cmd_status' }
        ],
        [
          { text: '🇬🇧 English', callback_data: 'cmd_lang_en' },
          { text: '🇲🇾 Bahasa Melayu', callback_data: 'cmd_lang_ms' }
        ]
      ]
    };
  }

  public getWelcomeMessage(lang: 'en' | 'ms'): string {
    if (lang === 'en') {
      return [
        `🏛️ *[QUANTUM AI - INSTITUTIONAL INTELLIGENCE]* 📡`,
        `*Welcome to Quantum AI Quantitative Copier & Trading Signals.*`,
        ``,
        `Quantum AI is an autonomous, institutional-grade algorithmic trading ecosystem combining Smart Money Concepts (SMC), statistical pattern recognition, and Gemini AI risk validation.`,
        ``,
        `📚 *Subscriber Onboarding & Quick Navigation:*`,
        `• /strategy — *Our Smart Money (SMC) & Multi-TF Strategy*`,
        `• /risk — *Method 2 Split-Ticket, TP1/TP2 & Auto-BE Rules*`,
        `• /services — *Free Community Channel vs VIP Auto-Copier*`,
        `• /status — *Live System & Broker Connection Status*`,
        `• /en or /ms — *Switch Language Anytime (English / Malay)*`,
        ``,
        `Tap any button below or type a command to explore our framework:`,
        `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Intelligence_`
      ].join('\n');
    } else {
      return [
        `🏛️ *[QUANTUM AI - INSTITUTIONAL INTELLIGENCE]* 📡`,
        `*Selamat Datang ke Sistem Isyarat & Auto-Copier Quantum AI.*`,
        ``,
        `Quantum AI ialah ekosistem dagangan algoritma berprestasi tinggi yang menggabungkan Smart Money Concepts (SMC), pengesahan candlestick tertutup, dan tapisan risiko Gemini AI.`,
        ``,
        `📚 *Panduan Pantas & Navigasi Subscriber:*`,
        `• /strategy — *Strategi Analisis SMC & Multi-Timeframe*`,
        `• /risk — *Pengurusan Risiko Method 2 (TP1, TP2 & Auto-BE)*`,
        `• /services — *Perbezaan Servis Percuma vs VIP Auto-Copier*`,
        `• /status — *Status Sambungan Broker & Kesihatan Enjin*`,
        `• /en atau /ms — *Tukar Pilihan Bahasa Pada Bila-Bila Masa*`,
        ``,
        `Tekan mana-mana butang di bawah atau taip arahan untuk maklumat lanjut:`,
        `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Intelligence_`
      ].join('\n');
    }
  }

  public getStrategyMessage(lang: 'en' | 'ms'): string {
    if (lang === 'en') {
      return [
        `🧠 *[QUANTUM AI - ANALYSIS & TRADING STRATEGY]* 📈`,
        ``,
        `Our algorithmic engine is engineered around pure institutional order flow and market microstructure:`,
        ``,
        `1. *Smart Money Concepts (SMC) Engine:*`,
        `   • Detects institutional Order Blocks (OB), Liquidity Sweeps, and Fair Value Gaps (FVG).`,
        `   • Maps structural shifts: Break of Structure (BOS) and Change of Character (CHoCH).`,
        ``,
        `2. *Candlestick Rejection Trigger (Anti-Falling-Knife):*`,
        `   • *BUY Orders:* Strictly requires closed Bullish Pin Bar, Hammer, or Bullish Engulfing.`,
        `   • *SELL Orders:* Strictly requires closed Bearish Shooting Star or Bearish Engulfing.`,
        `   • Rejects any entry during fast uncontrolled drops or spikes.`,
        ``,
        `3. *Multi-Timeframe Trend Confluence:*`,
        `   • Macro trend identified on H4 (200 EMA & Higher Highs/Lows).`,
        `   • Structural refinement on H1, precision retracement entries on M15.`,
        ``,
        `4. *Gemini AI Second Opinion Risk Gate:*`,
        `   • Every Grade-A candidate is cross-examined by Gemini AI to detect hidden macro traps or volatility imbalances before any signal is dispatched.`,
        ``,
        `5. *Strict Asset Specialization:*`,
        `   • Focuses exclusively on 8 high-performing liquid Forex pairs (EUR/USD, GBP/USD, EUR/JPY, GBP/JPY, USD/CHF, NZD/USD, USD/CAD, AUD/USD).`,
        `   • Gold (XAU/USD) is strictly quarantined for capital preservation.`,
        ``,
        `💡 _Type /risk to see how we protect and grow capital._`
      ].join('\n');
    } else {
      return [
        `🧠 *[QUANTUM AI - STRATEGI ANALISIS & DAGANGAN]* 📈`,
        ``,
        `Enjin algoritma kami dibangunkan berasaskan aliran pesanan institusi (institutional order flow):`,
        ``,
        `1. *Enjin Smart Money Concepts (SMC):*`,
        `   • Mengesan zon Order Block (OB), sapuan kecairan (Liquidity Sweeps), dan jurang nilai saksama (Fair Value Gaps / FVG).`,
        `   • Mengenal pasti peralihan struktur: Break of Structure (BOS) & Change of Character (CHoCH).`,
        ``,
        `2. *Candlestick Rejection Trigger (Anti-Falling-Knife):*`,
        `   • *Order BUY:* Wajib menunggu candle Hammer / Bullish Pin Bar atau Engulfing siap tertutup.`,
        `   • *Order SELL:* Wajib menunggu Shooting Star atau Bearish Engulfing siap tertutup.`,
        `   • Menolak entri secara melulu ketika pasaran terjunam laju tanpa penolakan harga.`,
        ``,
        `3. *Penyelarasan Multi-Timeframe:*`,
        `   • Trend makro H4 (200 EMA) -> Zon struktur H1 -> Entri persis pada M15.`,
        ``,
        `4. *Pintu Semakan Gemini AI Second Opinion:*`,
        `   • Setiap calon persediaan disemak silang oleh model Gemini AI untuk memastikan tiada perangkap pasaran sebelum isyarat dipancarkan.`,
        ``,
        `5. *Pengkhususan Pasangan Terpilih:*`,
        `   • Berfokus pada 8 pasangan Forex berprestasi tinggi. Komoditi Emas (XAU/USD) dikuarantin ketat bagi menjaga keselamatan modal.`,
        ``,
        `💡 _Taip /risk untuk melihat cara kami menguruskan risiko & Break-Even._`
      ].join('\n');
    }
  }

  public getRiskMessage(lang: 'en' | 'ms'): string {
    if (lang === 'en') {
      return [
        `🛡️ *[QUANTUM AI - RISK MANAGEMENT & EXECUTION RULES]* 🔒`,
        ``,
        `We practice institutional-grade risk governance to safeguard capital at all costs:`,
        ``,
        `1. *Method 2 Split-Ticket Architecture:*`,
        `   • *Ticket A (50% Volume):* Targets Take Profit 1 (+25 to +35 pips) to secure guaranteed profit.`,
        `   • *Ticket B (50% Volume):* Left as a Runner to capture major trend moves at Take Profit 2 (2x R:R).`,
        ``,
        `2. *Automatic Break-Even (Risk-Free Trade):*`,
        `   • As soon as TP1 is achieved, the Stop Loss on Ticket B is automatically moved to the exact entry price (\`Auto @ Entry\`).`,
        `   • From that moment onwards, the trade has ZERO risk of capital loss.`,
        ``,
        `3. *Macroeconomic News Blackout (±30m):*`,
        `   • All autonomous entries are frozen 30 minutes before and 30 minutes after High-Impact News releases (NFP, CPI, FOMC, Interest Rates).`,
        `   • Eliminates slippage, wild spread widening, and whipsaw fakeouts.`,
        ``,
        `4. *Signal Invalidation & Cancellation Alerts:*`,
        `   • If market price breaches Stop Loss before entry fill, or if TP1 is hit early without retracement, our system immediately dispatches a \`🚫 SIGNAL CANCELLED\` alert.`,
        `   • Subscribers are instructed to cancel pending orders and never chase price.`,
        ``,
        `5. *Exposure Caps:*`,
        `   • Risk is strictly capped at 1.0% - 1.5% per trade. Maximum 2 concurrent open positions across the entire portfolio.`,
        ``,
        `👑 _Type /services to explore our Free Community & VIP Copier options._`
      ].join('\n');
    } else {
      return [
        `🛡️ *[QUANTUM AI - PENGURUSAN RISIKO & METHOD 2]* 🔒`,
        ``,
        `Kami mengamalkan disiplin risiko institusi untuk melindungi modal pelanggan setiap masa:`,
        ``,
        `1. *Format Pelaksanaan Method 2 (Split-Ticket):*`,
        `   • *Tiket 1 (50% Saiz Lot):* Ditutup pada Take Profit 1 (+25 hingga +35 pips) untuk mengunci untung pasti.`,
        `   • *Tiket 2 (50% Saiz Lot):* Dibiarkan bergerak (*runner*) memburu gelombang trend pada Take Profit 2 (2x R:R).`,
        ``,
        `2. *Automatik Break-Even (Dagangan Tanpa Risiko):*`,
        `   • Sebaik sahaja TP1 dicapai, Stop Loss untuk baki tiket kedua dialihkan secara automatik ke harga entri (\`Auto @ Entry\`).`,
        `   • Bermula saat itu, dagangan berada dalam status 100% BEBAS RISIKO (*Risk-Free*).`,
        ``,
        `3. *Pertahanan Berita Makro (News Blackout ±30m):*`,
        `   • Pembukaan entri dibekukan 30 minit sebelum dan 30 minit selepas berita merah berimpak tinggi (NFP, CPI, FOMC, dll).`,
        `   • Mengelakkan lonjakan spread liar dan *slippage* broker.`,
        ``,
        `4. *Amaran Pembatalan Isyarat Pantas:*`,
        `   • Jika pasaran melanggar paras SL sebelum pesanan limit sempat aktif, amaran \`🚫 SIGNAL CANCELLED\` dipancarkan serta-merta agar subscriber membatalkan pending order.`,
        ``,
        `5. *Had Pendedahan Portfolio:*`,
        `   • Had risiko maksimum 1.0% - 1.5% per trade. Maksimum 2 posisi serentak pada satu-satu masa.`,
        ``,
        `👑 _Taip /services untuk mengetahui servis Komuniti Percuma & VIP Auto-Copier._`
      ].join('\n');
    }
  }

  public getServicesMessage(lang: 'en' | 'ms'): string {
    if (lang === 'en') {
      return [
        `🚀 *[QUANTUM AI - SUBSCRIBER SERVICES & TIERS]* 🌐`,
        ``,
        `We provide two flexible ways to participate in our quantitative intelligence:`,
        ``,
        `🌟 *1. Free Community Channel (Manual Execution):*`,
        `   • Receive selected Grade-A trade proposals (AI Confidence ≥ 85%).`,
        `   • High-impact macroeconomic news warnings (±30m blackout alerts).`,
        `   • Immediate signal cancellation updates if market structure invalidates.`,
        `   • *Execution:* You manually place pending limit orders on your own trading platform.`,
        ``,
        `👑 *2. VIP Institutional Auto-Copier (100% Hands-Free):*`,
        `   • Direct sub-50ms broker bridge via cTrader Open API / MetaTrader Bridge.`,
        `   • Every trade executed by the master algorithm is automatically copied into your private account in real-time.`,
        `   • Automated Method 2 Split-Ticket management: 50% TP1 partial close & automatic Stop Loss migration to Break-Even.`,
        `   • Zero emotional interference, zero missed entries while you sleep or work.`,
        `   • Dynamic lot-sizing calibrated directly to your account equity.`,
        ``,
        `💬 *Interested in VIP Auto-Copier access?* Contact our team or visit the Quantum AI Dashboard to link your account.`,
        `⏰ _${new Date().toUTCString()}_ | _Quantum AI VIP Desk_`
      ].join('\n');
    } else {
      return [
        `🚀 *[QUANTUM AI - SERVIS & PELAN LANGGANAN]* 🌐`,
        ``,
        `Kami menawarkan dua pilihan untuk menikmati kelebihan algoritma kami:`,
        ``,
        `🌟 *1. Saluran Komuniti Percuma (Entri Manual):*`,
        `   • Menerima isyarat persediaan Gred A terpilih (Keyakinan AI ≥ 85%).`,
        `   • Peringatan berita ekonomi berimpak tinggi (Zon Blackout ±30 minit).`,
        `   • Makluman pembatalan isyarat pantas sekiranya struktur pasaran terbatal.`,
        `   • *Cara Guna:* Anda memasang pending limit order sendiri pada MetaTrader/cTrader anda.`,
        ``,
        `👑 *2. VIP Institutional Auto-Copier (100% Automatik Tanpa Tangan):*`,
        `   • Sambungan terus ke broker via cTrader Open API / MetaTrader Bridge (< 50ms).`,
        `   • Setiap trade yang dibuka oleh master enjin di-copy secara automatik ke akaun peribadi anda.`,
        `   • Pengurusan automatik Method 2: Tutup 50% lot di TP1 dan alih SL baki ke Break-Even tanpa perlu anda pantau carta.`,
        `   • Tiada emosi, tiada terlepas trade semasa anda tidur atau bekerja.`,
        `   • Saiz lot disesuaikan secara automatik mengikut baki modal akaun anda.`,
        ``,
        `💬 *Berminat menyertai VIP Auto-Copier?* Hubungi admin atau layari Dashboard Quantum AI untuk memautkan akaun anda.`,
        `⏰ _${new Date().toUTCString()}_ | _Quantum AI VIP Desk_`
      ].join('\n');
    }
  }

  public getStatusMessage(chatId: string, lang: 'en' | 'ms'): string {
    const isEn = lang === 'en';
    return [
      `📊 *[QUANTUM AI - LIVE RADAR STATUS]*`,
      isEn ? `• Engine State: *Operational 24/5*` : `• Status Enjin: *Beroperasi 24/5*`,
      isEn ? `• Broker Adapter: *cTrader Open API (Demo/Live Active)*` : `• Sambungan Broker: *cTrader Open API (Aktif)*`,
      isEn ? `• Execution Protocol: *Method 2 Split-Ticket (TP1/TP2 & BE)*` : `• Format Eksekusi: *Method 2 Split-Ticket (TP1/TP2 & BE)*`,
      isEn ? `• Capital Defense: *Macro News Blackout Active (±30m)*` : `• Kawalan Modal: *Zon Blackout Berita Aktif (±30m)*`,
      isEn ? `• Quarantined Assets: *XAU/USD (Gold) Strictly Isolated*` : `• Aset Dikuarantin: *XAU/USD (Emas) Dikecualikan*`,
      isEn ? `• Your Language Preference: *${lang.toUpperCase()}*` : `• Pilihan Bahasa Anda: *${lang.toUpperCase()}*`,
      ``,
      isEn ? `_Switch language anytime with /en or /ms._` : `_Tukar bahasa bila-bila masa dengan /en atau /ms._`
    ].join('\n');
  }

  /**
   * Interactive Telegram Bot Polling Listener
   * Handles commands (/start, /strategy, /risk, /services, /status, /en, /ms) and inline keyboard buttons
   */
  public startBotCommandListener(): void {
    console.log('🤖 [TelegramNotificationService] Bot Command Listener active: Listening for /start, /register, /status, etc.');

    const poll = async () => {
      if (!this.botToken || !this.isEnabled) {
        this.commandListenerTimeout = setTimeout(poll, 10000);
        if (this.commandListenerTimeout.unref) this.commandListenerTimeout.unref();
        return;
      }

      try {
        const url = `https://api.telegram.org/bot${this.botToken}/getUpdates`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offset: this.lastUpdateId ? this.lastUpdateId + 1 : 0,
            timeout: 10,
            allowed_updates: ['message', 'channel_post', 'edited_channel_post', 'my_chat_member', 'chat_member', 'callback_query']
          })
        });
        const data = await res.json();

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            console.log('📬 [RAW TELEGRAM UPDATE]:', JSON.stringify(update));
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);

            // Handle inline button callback queries
            if (update.callback_query) {
              const cq = update.callback_query;
              const chatId = String(cq.message?.chat?.id || cq.from?.id);
              const action = String(cq.data || '');

              // Acknowledge callback query
              fetch(`https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: cq.id })
              }).catch(() => {});

              if (action === 'cmd_lang_en') {
                this.setUserLanguage(chatId, 'en');
                await this.sendRawMessage(
                  `🇬🇧 *Language Preference Updated: English*\n\nYou will now receive all trade alerts, strategy guides, and macro news defense in Standard Institutional English.`,
                  chatId,
                  this.getOnboardingKeyboard('en')
                );
              } else if (action === 'cmd_lang_ms') {
                this.setUserLanguage(chatId, 'ms');
                await this.sendRawMessage(
                  `🇲🇾 *Pilihan Bahasa Dikemaskini: Bahasa Melayu*\n\nAnda kini akan menerima semua isyarat dagangan, panduan strategi, dan amaran berita makro dalam Bahasa Melayu.`,
                  chatId,
                  this.getOnboardingKeyboard('ms')
                );
              } else {
                const currentLang = this.getUserLanguage(chatId);
                if (action === 'cmd_strategy') {
                  await this.sendRawMessage(this.getStrategyMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_risk') {
                  await this.sendRawMessage(this.getRiskMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_services') {
                  await this.sendRawMessage(this.getServicesMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_status') {
                  await this.sendRawMessage(this.getStatusMessage(chatId, currentLang), chatId, this.getOnboardingKeyboard(currentLang));
                }
              }
              continue;
            }

            // Handle channel posts (Auto-detect newly created VIP channels)
            if (update.channel_post) {
              const cp = update.channel_post;
              const channelId = String(cp.chat.id);
              const channelTitle = cp.chat.title || 'Telegram Channel';
              console.log(`📡 [TelegramNotificationService] Detected message in channel: "${channelTitle}" (ID: ${channelId})!`);

              if (channelId.startsWith('-') && channelId !== this.channelId && channelId !== this.freeChannelId) {
                const lowerTitle = channelTitle.toLowerCase();
                const isFree = lowerTitle.includes('free') || lowerTitle.includes('percuma') || lowerTitle.includes('community') || lowerTitle.includes('komuniti');

                if (isFree) {
                  console.log(`🌟 [TelegramNotificationService] Auto-registering Free Community Channel: ${channelId} ("${channelTitle}")!`);
                  this.configure({ freeChannelId: channelId });
                  await this.sendRawMessage(
                    `🌟 *[QUANTUM AI - FREE COMMUNITY CHANNEL CONNECTED]* 🌟\n\n✅ *Sambungan Berjaya!*\n• Saluran: *${channelTitle}*\n• ID: \`${channelId}\`\n• Status Bot: *Aktif & Sedia Bersiaran*\n\nIsyarat pilihan percuma harian, analisis Smart Money Concepts (SMC), dan amaran berita makro akan disiarkan di sini secara berkala!`,
                    channelId
                  ).catch(() => {});
                } else {
                  console.log(`👑 [TelegramNotificationService] Auto-registering VIP Channel: ${channelId} ("${channelTitle}")!`);
                  this.configure({ channelId });
                  await this.sendRawMessage(
                    `🏛️ *[QUANTUM AI - VIP INSTITUTIONAL CHANNEL CONNECTED]* 🔒\n\n✅ *Connection Verified Successfully!*\n• Channel: *${channelTitle}*\n• ID: \`${channelId}\`\n• Bot Status: *Administrator Active*\n\nAll institutional trade executions, Method 2 split-tickets, and live broker reports will now broadcast directly to this VIP channel.`,
                    channelId
                  ).catch(() => {});
                }
              }
              continue;
            }

            // Handle bot membership changes (Bot added as Admin to channel/group)
            if (update.my_chat_member) {
              const mcm = update.my_chat_member;
              const chat = mcm.chat;
              const chatId = String(chat.id);
              const title = chat.title || chat.username || 'Telegram Channel';
              console.log(`🤖 [TelegramNotificationService] Bot membership updated in ${chat.type}: "${title}" (ID: ${chatId})! Status: ${mcm.new_chat_member?.status}`);

              if ((chat.type === 'channel' || chat.type === 'group' || chat.type === 'supergroup') && chatId.startsWith('-') && chatId !== this.channelId && chatId !== this.freeChannelId) {
                const lowerTitle = title.toLowerCase();
                const isFree = lowerTitle.includes('free') || lowerTitle.includes('percuma') || lowerTitle.includes('community') || lowerTitle.includes('komuniti');

                if (isFree) {
                  console.log(`🌟 [TelegramNotificationService] Auto-registering Free Community Channel from membership: ${chatId} ("${title}")!`);
                  this.configure({ freeChannelId: chatId });
                  await this.sendRawMessage(
                    `🌟 *[QUANTUM AI - FREE COMMUNITY CHANNEL CONNECTED]* 🌟\n\n✅ *Sambungan Berjaya!*\n• Saluran: *${title}*\n• ID: \`${chatId}\`\n• Status Bot: *Aktif & Sedia Bersiaran*\n\nIsyarat pilihan percuma harian, analisis Smart Money Concepts (SMC), dan amaran berita makro akan disiarkan di sini secara berkala!`,
                    chatId
                  ).catch(() => {});
                } else {
                  console.log(`👑 [TelegramNotificationService] Auto-registering VIP Channel from membership: ${chatId} ("${title}")!`);
                  this.configure({ channelId: chatId });
                  await this.sendRawMessage(
                    `🏛️ *[QUANTUM AI - VIP INSTITUTIONAL CHANNEL CONNECTED]* 🔒\n\n✅ *Connection Verified Successfully!*\n• Channel: *${title}*\n• ID: \`${chatId}\`\n• Bot Status: *Administrator Active*\n\nAll institutional trade executions, Method 2 split-tickets, and live broker reports will now broadcast directly to this VIP channel.`,
                    chatId
                  ).catch(() => {});
                }
              }
              continue;
            }

            // Handle standard text messages
            const msg = update.message;
            if (!msg) continue;

            const chatId = String(msg.chat.id);
            const chatType = msg.chat.type;

            // Check if user forwarded a message from their VIP channel to the bot in private chat!
            // Supports both legacy forward_from_chat and Telegram Bot API 7.0+ forward_origin
            const forwardedChat = (msg as any).forward_from_chat || ((msg as any).forward_origin && (msg as any).forward_origin.chat);
            if (forwardedChat) {
              const fChannelId = String(forwardedChat.id);
              const fTitle = forwardedChat.title || 'VIP Channel';
              console.log(`📤 [TelegramNotificationService] Detected forwarded post from channel: "${fTitle}" (ID: ${fChannelId})`);

              if (fChannelId.startsWith('-')) {
                this.configure({ channelId: fChannelId });
                await this.sendRawMessage(
                  `🏛️ *[QUANTUM AI - VIP CHANNEL LINKED]* 🔒\n\n✅ *Channel Identified via Forward:*\n• Channel: *${fTitle}*\n• ID: \`${fChannelId}\`\n\nVIP Channel has been saved as primary execution broadcast destination!`,
                  chatId
                ).catch(() => {});

                await this.sendRawMessage(
                  `🏛️ *[QUANTUM AI - VIP INSTITUTIONAL CHANNEL CONNECTED]* 🔒\n\n✅ *Connection Verified Successfully!*\n• Channel: *${fTitle}*\n• ID: \`${fChannelId}\`\n• Bot Status: *Administrator Active*\n\nAll institutional trade executions, Method 2 split-tickets, and live broker reports will now broadcast directly to this VIP channel.`,
                  fChannelId
                ).catch(() => {});
                continue;
              }
            }

            // If message arrived from a group or supergroup, auto-capture it
            if ((chatType === 'group' || chatType === 'supergroup') && chatId.startsWith('-') && chatId !== this.channelId && chatId !== this.freeChannelId) {
              const groupTitle = msg.chat.title || 'VIP Group';
              console.log(`👥 [TelegramNotificationService] Detected group message in "${groupTitle}" (ID: ${chatId})`);
              this.configure({ channelId: chatId });
              await this.sendRawMessage(
                `🏛️ *[QUANTUM AI - VIP INSTITUTIONAL CHANNEL CONNECTED]* 🔒\n\n✅ *Connection Verified Successfully!*\n• Group/Channel: *${groupTitle}*\n• ID: \`${chatId}\`\n• Status: *Active*\n\nAll institutional trade executions, Method 2 split-tickets, and live broker reports will now broadcast directly here.`,
                chatId
              ).catch(() => {});
            }

            if (!msg.text) continue;
            console.log(`💬 [TELEGRAM MESSAGE] From ${chatId} (${chatType}): "${msg.text}"`);
            const text = msg.text.trim().toLowerCase();

            if (text === '/en' || text === '/english' || text.startsWith('/language en')) {
              this.setUserLanguage(chatId, 'en');
              await this.sendRawMessage(
                `🇬🇧 *Language Preference Updated: English*\n\nYou will now receive all trade executions, macro news defense alerts, and performance summaries in Standard Institutional English.`,
                chatId,
                this.getOnboardingKeyboard('en')
              );
            } else if (text === '/ms' || text === '/malay' || text.startsWith('/language ms') || text.startsWith('/language bm')) {
              this.setUserLanguage(chatId, 'ms');
              await this.sendRawMessage(
                `🇲🇾 *Pilihan Bahasa Dikemaskini: Bahasa Melayu*\n\nAnda kini akan menerima semua isyarat dagangan, amaran berita makro, dan rumusan prestasi dalam Bahasa Melayu.`,
                chatId,
                this.getOnboardingKeyboard('ms')
              );
            } else {
              const currentLang = this.getUserLanguage(chatId);

              // VIP Account Registration (/register <account> or /akaun <account>)
              if (text.startsWith('/register') || text.startsWith('/akaun') || text.startsWith('/daftar')) {
                const parts = text.split(/\s+/);
                const rawAcc = parts[1];
                const cleanAcc = rawAcc ? rawAcc.replace(/[^0-9]/g, '') : '';

                if (!cleanAcc) {
                  await this.sendRawMessage(
                    currentLang === 'en'
                      ? `⚠️ *Please provide your cTrader account number.*\n\n*Format:* \`/register <cTrader_Account_Number>\`\n*Example:* \`/register 5881460\``
                      : `⚠️ *Sila sertakan nombor akaun cTrader anda.*\n\n*Format:* \`/register <Nombor_Akaun_cTrader>\`\n*Contoh:* \`/register 5881460\``,
                    chatId
                  );
                } else {
                  const { vipSubscriptionService } = await import('./vipSubscriptionService');
                  const username = (msg.from as any)?.username || (msg.chat as any)?.username || '';
                  const firstName = (msg.from as any)?.first_name || '';
                  const record = vipSubscriptionService.registerAccount({
                    accountNumber: cleanAcc,
                    telegramId: chatId,
                    telegramUsername: username,
                    name: firstName || undefined,
                    durationDays: 30
                  });
                  const expDate = new Date(record.expiresAt).toLocaleDateString();

                  await this.sendRawMessage(
                    currentLang === 'en'
                      ? `🏛️ *[VIP CTRADER ACCOUNT ACTIVATED]* ✅\n\n` +
                        `• *cTrader Account:* \`${record.accountNumber}\`\n` +
                        `• *Status:* *Active (VIP Institutional)*\n` +
                        `• *Valid Until:* \`${expDate}\` (30 Days)\n\n` +
                        `📥 *Quick Start Instructions:*\n` +
                        `1. Download the \`QuantumAI_VIP_Copier.algo\` file pinned in the VIP Channel.\n` +
                        `2. Double-click it to install into your cTrader Desktop.\n` +
                        `3. Press *Play* on EURUSD chart.\n` +
                        `4. The cBot will automatically verify your account (\`${record.accountNumber}\`) and start 100% automated trade execution!`
                      : `🏛️ *[PENGESAHAN AKAUN VIP BERJAYA]* ✅\n\n` +
                        `• *Akaun cTrader:* \`${record.accountNumber}\`\n` +
                        `• *Status:* *Aktif (VIP Institutional)*\n` +
                        `• *Tempoh Sah:* \`${expDate}\` (30 Hari)\n\n` +
                        `📥 *Panduan Pemasangan cTrader:*\n` +
                        `1. Muat turun fail \`QuantumAI_VIP_Copier.algo\` yang telah dipin di Channel VIP.\n` +
                        `2. Klik 2 kali fail tersebut untuk pasang ke cTrader Desktop anda.\n` +
                        `3. Tekan *Play* pada carta EURUSD.\n` +
                        `4. cBot akan secara automatik mengesahkan akaun (\`${record.accountNumber}\`) anda dan mula trade secara 100% automatik!`,
                    chatId,
                    this.getOnboardingKeyboard(currentLang)
                  );
                }
              } else if (text === '/status' || text === '/akaun_saya' || text === '/myaccount') {
                const { vipSubscriptionService } = await import('./vipSubscriptionService');
                const sub = vipSubscriptionService.getSubscriberByTelegramId(chatId);
                let vipInfo = '';
                if (sub) {
                  const check = vipSubscriptionService.verifyLicense(sub.accountNumber);
                  const expDate = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : 'N/A';
                  vipInfo = currentLang === 'en'
                    ? `\n\n👑 *[Your Registered VIP Account]*\n• cTrader Account: \`${sub.accountNumber}\`\n• Status: *${check.status}*\n• Remaining Days: *${check.remainingDays || 0} days* (Expires: ${expDate})`
                    : `\n\n👑 *[Akaun VIP Berdaftar Anda]*\n• Akaun cTrader: \`${sub.accountNumber}\`\n• Status: *${check.status}*\n• Baki Langganan: *${check.remainingDays || 0} hari* (Luput: ${expDate})`;
                } else {
                  vipInfo = currentLang === 'en'
                    ? `\n\n👑 *[VIP Copier Status]*\n• No cTrader account linked yet.\n• Register now with: \`/register <cTrader_Account_Number>\``
                    : `\n\n👑 *[Status VIP Copier]*\n• Belum ada akaun cTrader didaftarkan.\n• Daftarkan akaun anda sekarang dengan: \`/register <Nombor_Akaun_cTrader>\``;
                }
                await this.sendRawMessage(this.getStatusMessage(chatId, currentLang) + vipInfo, chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/stats' || text === '/admin' || text === '/admin stats' || text === '/analytics') {
                const { vipSubscriptionService } = await import('./vipSubscriptionService');
                const analytics = vipSubscriptionService.getSubscriberAnalytics();
                const totalSubs = analytics.totalSubscribers;
                const activeSubs = analytics.activeCount;
                const expiredSubs = analytics.expiredCount;
                const expiringSoon = analytics.expiringSoonCount;
                const onlineRecent = analytics.onlineRecentlyCount;

                const message = currentLang === 'en'
                  ? [
                      `📊 *[QUANTUM AI - SUBSCRIBERS ANALYTICS & TELEMETRY]* 🏛️`,
                      `📅 _Audit Timestamp: ${new Date().toUTCString()}_`,
                      ``,
                      `👥 *User & Account Overview:*`,
                      `  • *Total Registered Accounts:* \`${totalSubs}\``,
                      `  • *Active Subscriptions:* \`${activeSubs}\` (${totalSubs > 0 ? Math.round((activeSubs / totalSubs) * 100) : 0}%)`,
                      `  • *Expired Subscriptions:* \`${expiredSubs}\``,
                      `  • *cBots Online (Heartbeat in last 2h):* \`${onlineRecent}\``,
                      ``,
                      `⏳ *Renewal & Promotion Opportunities:*`,
                      `  • *Expiring in <= 7 Days:* \`${expiringSoon}\` accounts`,
                      expiringSoon > 0
                        ? analytics.expiringSoonList.map(s => `    - Account \`${s.accountNumber}\` (${s.telegramUsername ? '@' + s.telegramUsername : s.name}): ${s.daysRemaining} days left`).join('\n')
                        : `    _(All active accounts have > 7 days remaining)_`,
                      ``,
                      `📡 *Broadcast Infrastructure:*`,
                      `  • *VIP Institutional Channel:* \`${this.channelId || 'Not Configured'}\` ✅`,
                      `  • *Free Community Channel:* \`${this.freeChannelId || 'Not Configured'}\` ✅`,
                      `  • *Execution Engine:* \`Method 2 Split-Ticket + GTC Pending Orders\``,
                      ``,
                      `💡 *Actionable Telemetry Tips:*`,
                      `  1. Run promotion campaigns when accounts reach <= 3 days left.`,
                      `  2. Check /admin users for full account breakdowns.`,
                      ``,
                      `⏰ _Quantum AI Institutional Intelligence_`
                    ].join('\n')
                  : [
                      `📊 *[QUANTUM AI - STATISTIK & ANALITIK SUBSCRIBER]* 🏛️`,
                      `📅 _Tarikh Audit: ${new Date().toUTCString()}_`,
                      ``,
                      `👥 *Ringkasan Pengguna & Akaun:*`,
                      `  • *Jumlah Akaun Berdaftar:* \`${totalSubs} Akaun\``,
                      `  • *Langganan Aktif:* \`${activeSubs} Akaun\` (${totalSubs > 0 ? Math.round((activeSubs / totalSubs) * 100) : 0}%)`,
                      `  • *Langganan Tamat Tempoh:* \`${expiredSubs} Akaun\``,
                      `  • *cBot Online (Aktif 2 Jam Lepas):* \`${onlineRecent} cBot\``,
                      ``,
                      `⏳ *Peluang Promosi & Pembaharuan:*`,
                      `  • *Tamat Tempoh Dalam <= 7 Hari:* \`${expiringSoon} Akaun\``,
                      expiringSoon > 0
                        ? analytics.expiringSoonList.map(s => `    - Akaun \`${s.accountNumber}\` (${s.telegramUsername ? '@' + s.telegramUsername : s.name}): baki ${s.daysRemaining} hari`).join('\n')
                        : `    _(Semua akaun aktif mempunyai baki melebihi 7 hari)_`,
                      ``,
                      `📡 *Infrastruktur Penyiaran:*`,
                      `  • *Saluran VIP Disambungkan:* \`${this.channelId || 'Belum Dikonfigurasi'}\` ✅`,
                      `  • *Saluran Komuniti Percuma:* \`${this.freeChannelId || 'Belum Dikonfigurasi'}\` ✅`,
                      `  • *Protokol Eksekusi:* \`Method 2 Split-Ticket + GTC Pending Orders\``,
                      ``,
                      `💡 *Nasihat Pemasaran & Pemantauan:*`,
                      `  1. Hantar tawaran diskaun pembaharuan bila baki <= 3 hari.`,
                      `  2. Taip \`/admin users\` untuk melihat senarai penuh akaun pelanggan.`,
                      ``,
                      `⏰ _Quantum AI Institutional Intelligence_`
                    ].join('\n');

                await this.sendRawMessage(message, chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/admin users' || text === '/admin list' || text === '/users' || text === '/subscribers') {
                const { vipSubscriptionService } = await import('./vipSubscriptionService');
                const subs = vipSubscriptionService.getAllSubscribers();
                const now = Date.now();
                const oneDayMs = 24 * 60 * 60 * 1000;

                if (subs.length === 0) {
                  await this.sendRawMessage(
                    currentLang === 'en'
                      ? `📋 *[SUBSCRIBERS LIST]*\n\nNo accounts registered yet.`
                      : `📋 *[SENARAI AKAUN SUBSCRIBER]*\n\nBelum ada akaun didaftarkan.`,
                    chatId
                  );
                } else {
                  const lines = subs.map((s, idx) => {
                    const daysLeft = Math.max(0, Math.ceil((s.expiresAt - now) / oneDayMs));
                    const isOnline = s.lastVerifiedAt && (now - s.lastVerifiedAt) <= 2 * 3600 * 1000;
                    const onlineIndicator = isOnline ? '🟢 Online' : '⚪ Idle';
                    const userHandle = s.telegramUsername ? `@${s.telegramUsername}` : (s.name || 'Trader');
                    return `${idx + 1}. Akaun \`${s.accountNumber}\` (${userHandle})\n   • Status: *${s.status}* (${daysLeft} hari baki)\n   • cBot: ${onlineIndicator}`;
                  });

                  const msgList = currentLang === 'en'
                    ? `📋 *[VIP CTRADER SUBSCRIBERS LIST]*\n_Total: ${subs.length} accounts_\n\n` + lines.join('\n\n')
                    : `📋 *[SENARAI AKAUN VIP CTRADER]*\n_Jumlah: ${subs.length} akaun berdaftar_\n\n` + lines.join('\n\n');

                  await this.sendRawMessage(msgList, chatId, this.getOnboardingKeyboard(currentLang));
                }
              } else if (text === '/strategy' || text === '/smc' || text === '/analisis') {
                await this.sendRawMessage(this.getStrategyMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/risk' || text === '/execution' || text === '/be' || text === '/tp') {
                await this.sendRawMessage(this.getRiskMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/services' || text === '/vip' || text === '/copier') {
                await this.sendRawMessage(this.getServicesMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/start' || text === '/help' || text === '/guide' || text === '/menu' || text === '/language') {
                await this.sendRawMessage(this.getWelcomeMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
              }
            }
          }
        }
      } catch (err: any) {
        // Silent catch for network polling hiccups
      }

      this.commandListenerTimeout = setTimeout(poll, 3000);
      if (this.commandListenerTimeout.unref) this.commandListenerTimeout.unref();
    };

    poll();
  }
}

export const telegramNotificationService = TelegramNotificationService.getInstance();
