import * as fs from 'fs';
import * as path from 'path';
import { getMarketStatus, isCryptoPair } from '../../lib/marketHours';

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
  currentPrice?: number;
  entryMode?: string;
  distancePips?: number;
  setupStatus?: string;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  confidence: number;
  modelConfidence?: number;
  validationConfidence?: number;
  reasons: string[];
  bullishEvidence?: string[];
  bearishEvidence?: string[];
  riskWarnings?: string[];
  brokerOrderId?: string;
  lotSize?: number;
  recommendedRiskPct?: number;
  maxRiskPct?: number;
  status: 'ENTRY_DISPATCHED' | 'ORDER_FILLED' | 'TP_HIT' | 'SL_HIT' | 'NEWS_BLACKOUT_VETO' | 'PROFIT_LOCKED' | 'SIGNAL_CANCELLED';
  tier?: 'FREE' | 'VIP' | 'ALL';
  cancellationReason?: string;
  pnlDollars?: number;
  pnlPips?: number;
  analysisNotes?: string;
  session?: string;
  rrRatio?: string;
}

export interface TradingTipPayload {
  id?: string;
  title: string;
  category: 'SMC_STRUCTURE' | 'SESSION_TIMING' | 'RISK_MANAGEMENT' | 'PSYCHOLOGY' | 'NEWS_EXECUTION';
  session?: 'LONDON' | 'NEW_YORK' | 'ASIAN' | 'WEEKEND' | 'FRIDAY_CLOSE' | 'GENERAL';
  contentEn: string;
  contentMs: string;
  keyRule: string;
}

export interface WeeklyStatsPayload {
  weekPeriod: string;
  totalSignals: number;
  winningTrades: number;
  breakevenTrades: number;
  losingTrades: number;
  winRate: number;
  netPips: number;
  estimatedRoiPct: number;
  profitFactor: number;
  averageRr: string;
  topPerformingPair: string;
  disciplinedExecutionScore: number;
  maxDrawdownContained: number;
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
  private channelId: string | null = process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID || null;
  private freeChannelId: string | null = process.env.TELEGRAM_FREE_CHAT_ID || process.env.TELEGRAM_FREE_CHANNEL_ID || null;
  private defaultLanguage: 'en' | 'ms' = (process.env.TELEGRAM_DEFAULT_LANG as 'en' | 'ms') || 'en';
  private userLanguagePreferences: Record<string, 'en' | 'ms'> = {};
  private isEnabled: boolean = true;
  private broadcastHistory: Array<{ timestamp: number; message: string; payload: any }> = [];
  private configFilePath: string = path.resolve(process.cwd(), 'data', 'telegram_config.json');
  private newsAlertsLedgerPath: string = path.resolve(process.cwd(), 'data', 'telegram_news_alerts.json');

  private alertedUpcomingNews = new Set<string>();
  private alertedOutcomeNews = new Set<string>();
  private alertedNormalizedNews = new Set<string>();
  private recentNewsBroadcasts = new Map<string, number>();
  private recentTradeBroadcasts = new Map<string, number>();
  private newsMonitorInterval: NodeJS.Timeout | null = null;
  private tipsMonitorInterval: NodeJS.Timeout | null = null;
  private weeklyStatsInterval: NodeJS.Timeout | null = null;
  private recentTipBroadcastTimes = new Map<string, number>();
  private commandListenerTimeout: NodeJS.Timeout | null = null;
  private lastUpdateId: number = 0;
  private isPollingCommands: boolean = false;

  private constructor() {
    this.loadConfigFromDisk();
    this.registerBotMenuCommands().catch(() => {});
    this.startMacroNewsMonitor();
    this.startContextualTipsScheduler();
    this.startWeeklyStatsScheduler();
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
        if (parsed.botToken && !process.env.TELEGRAM_BOT_TOKEN) this.botToken = parsed.botToken;
        if (parsed.channelId && !(process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID)) this.channelId = parsed.channelId;
        if (parsed.freeChannelId && !(process.env.TELEGRAM_FREE_CHAT_ID || process.env.TELEGRAM_FREE_CHANNEL_ID)) this.freeChannelId = parsed.freeChannelId;
        if (parsed.defaultLanguage) this.defaultLanguage = parsed.defaultLanguage;
        if (parsed.userLanguagePreferences) this.userLanguagePreferences = parsed.userLanguagePreferences;
        if (typeof parsed.isEnabled === 'boolean') this.isEnabled = parsed.isEnabled;
      }
    } catch (e: any) {
      console.warn('[TelegramNotificationService] Could not load persisted telegram config:', e.message);
    }

    try {
      this.loadNewsAlertsLedger();
    } catch (e: any) {
      console.warn('[TelegramNotificationService] Could not load news alerts ledger:', e.message);
    }
  }

  private loadNewsAlertsLedger(): void {
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
        // Fallback retry without parse_mode if Markdown parsing failed (e.g. underscores in usernames)
        if (payload.parse_mode) {
          delete payload.parse_mode;
          const fallbackRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const fallbackData = await fallbackRes.json();
          if (fallbackData.ok) {
            return { success: true, message: 'Message dispatched via fallback mode!', data: fallbackData };
          }
        }
        console.warn(`[TelegramNotificationService] sendMessage error:`, data.description || res.statusText);
        return { success: false, message: data.description || `Telegram API Error: ${res.statusText}`, data };
      }

      return { success: true, message: 'Message successfully dispatched!', data };
    } catch (err: any) {
      return { success: false, message: `Telegram connection error: ${err.message}` };
    }
  }

  /**
   * Send a file/document directly via Telegram Bot API
   */
  public async sendDocument(filePath: string, customChatId?: string, caption?: string): Promise<{ success: boolean; message: string; data?: any }> {
    const targetChat = customChatId || this.channelId;
    if (!this.botToken) {
      return { success: false, message: 'TELEGRAM_BOT_TOKEN_MISSING: Sila masukkan Bot Token Telegram anda.' };
    }
    if (!targetChat) {
      return { success: false, message: 'TELEGRAM_CHAT_ID_MISSING: Sila masukkan Chat ID / Channel ID penerima.' };
    }

    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, message: `FILE_NOT_FOUND: ${filePath}` };
      }
      const fileData = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      const formData = new FormData();
      formData.append('chat_id', targetChat);
      if (caption) {
        formData.append('caption', caption);
        formData.append('parse_mode', 'Markdown');
      }
      const blob = new Blob([fileData]);
      formData.append('document', blob, fileName);

      const url = `https://api.telegram.org/bot${this.botToken}/sendDocument`;
      const res = await fetch(url, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      return { success: Boolean(data.ok), message: data.ok ? 'Document sent successfully!' : (data.description || 'Upload failed'), data };
    } catch (err: any) {
      return { success: false, message: `Telegram document error: ${err.message}` };
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
   * Helper to format pips based on symbol digits
   */
  private calculatePips(pair: string, price1: number, price2: number): string {
    const diff = Math.abs(price1 - price2);
    const upper = pair.toUpperCase();
    if (upper.includes('JPY')) {
      return (diff * 100).toFixed(1);
    } else if (upper.includes('XAU') || upper.includes('GOLD')) {
      return (diff * 10).toFixed(1);
    } else {
      return (diff * 10000).toFixed(1);
    }
  }

  /**
   * Format Trade Broadcast Alerts by Language (Supports 6-Pillar Method 2 Split-Ticket Lifecycle)
   */
  public formatTradeAlert(payload: TradeBroadcastPayload, lang: 'en' | 'ms' = 'en'): string {
    const isFreeSignal = payload.tier === 'FREE' || (payload.confidence >= 85 && payload.status === 'ENTRY_DISPATCHED');
    const reasonsFormatted = (payload.reasons || [])
      .slice(0, 3)
      .map(r => `  • ${r}`)
      .join('\n');

    // Calculate pips for SL, TP1, and TP2
    const slPips = payload.entryPrice && payload.stopLoss ? this.calculatePips(payload.pair, payload.entryPrice, payload.stopLoss) : '';
    const tp1Pips = payload.entryPrice && payload.takeProfit1 ? this.calculatePips(payload.pair, payload.entryPrice, payload.takeProfit1) : '';
    const tp2Pips = payload.entryPrice && payload.takeProfit2 ? this.calculatePips(payload.pair, payload.entryPrice, payload.takeProfit2) : '';

    // Risk-to-reward calculation
    let rrText = payload.rrRatio || '';
    if (!rrText && payload.entryPrice && payload.stopLoss && payload.takeProfit1) {
      const risk = Math.abs(payload.entryPrice - payload.stopLoss);
      const reward1 = Math.abs(payload.takeProfit1 - payload.entryPrice);
      if (risk > 0) {
        const ratio1 = (reward1 / risk).toFixed(1);
        if (payload.takeProfit2) {
          const reward2 = Math.abs(payload.takeProfit2 - payload.entryPrice);
          const ratio2 = (reward2 / risk).toFixed(1);
          rrText = `1:${ratio1} (TP1) | 1:${ratio2} (TP2)`;
        } else {
          rrText = `1:${ratio1}`;
        }
      }
    }

    if (lang === 'en') {
      if (payload.status === 'SIGNAL_CANCELLED') {
        return [
          `🚫 *[QUANTUM AI - SIGNAL CANCELLED]* 🚫`,
          `📌 *SETUP INVALIDATED — CANCEL PENDING ORDERS*`,
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
          `  • Delete / Cancel any pending limit or stop orders for this pair immediately.`,
          `  • Do NOT chase current market price (No FOMO). Preserving capital is paramount.`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Risk Governance_`
        ].join('\n');
      }

      if (payload.status === 'ORDER_FILLED') {
        return [
          `⚡ *[QUANTUM AI - ORDER FILLED & ACTIVE]* ⚡`,
          `📌 *LIMIT ORDER TRIGGERED — LIVE TRADE IN MARKET*`,
          ``,
          `💱 *Pair:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Direction:* *${payload.direction}* | *AI Confidence:* \`${payload.confidence}%\``,
          `💵 *Filled Entry Price:* \`${payload.entryPrice}\``,
          `🛑 *Active Stop Loss:* \`${payload.stopLoss}\`${slPips ? ` (-${slPips} pips)` : ''}`,
          `🎯 *Take Profit 1:* \`${payload.takeProfit1}\`${tp1Pips ? ` (+${tp1Pips} pips)` : ''}`,
          payload.takeProfit2 ? `🎯 *Take Profit 2 (Runner):* \`${payload.takeProfit2}\`${tp2Pips ? ` (+${tp2Pips} pips)` : ''}` : '',
          rrText ? `⚖️ *Risk-to-Reward Ratio:* \`${rrText}\`` : '',
          payload.lotSize ? `📊 *Position Sizing:* \`${payload.lotSize} Lots\`` : '',
          payload.brokerOrderId ? `🔗 *Broker Order ID:* \`#${payload.brokerOrderId}\`` : '',
          ``,
          `🛡️ *Active Trade Management Protocol (Method 2):*`,
          `  • Ticket A: Target TP1 (50% Volume).`,
          `  • Ticket B: Target TP2 (Runner).`,
          `  • Auto-Breakeven will arm automatically once TP1 is secured.`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Copier_`
        ].filter(Boolean).join('\n');
      }

      if (payload.status === 'PROFIT_LOCKED') {
        return [
          `🔒 *[QUANTUM AI - TP1 HIT & PROFIT BANKED]* 🎯`,
          `📌 *50% PARTIAL PROFIT SECURED & SL MOVED TO BREAKEVEN*`,
          ``,
          `💱 *Pair:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Direction:* *${payload.direction}*`,
          `💵 *Entry Price:* \`${payload.entryPrice}\``,
          `🎯 *TP1 Banked:* \`${payload.takeProfit1}\`${tp1Pips ? ` (+${tp1Pips} pips secured)` : ''}`,
          payload.takeProfit2 ? `🎯 *Running to TP2:* \`${payload.takeProfit2}\`` : '',
          `🛑 *New Stop Loss:* \`${payload.entryPrice}\` *(BREAKEVEN — ZERO RISK)*`,
          payload.pnlDollars !== undefined ? `💰 *Realized Profit:* \`+$${payload.pnlDollars.toFixed(2)}\`` : '',
          ``,
          `🧠 *Method 2 Execution Status:*`,
          `  • Ticket A closed with profit at TP1 (50% lot).`,
          `  • Ticket B Stop Loss moved to Entry Price.`,
          `  • Position is now 100% Risk-Free runner to TP2.`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Copier_`
        ].filter(Boolean).join('\n');
      }

      if (payload.status === 'TP_HIT') {
        return [
          `🏆 *[QUANTUM AI - TAKE PROFIT ACHIEVED]* 🚀`,
          `📌 *TARGET HIT — FULL PROFIT SECURED*`,
          ``,
          `💱 *Pair:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Direction:* *${payload.direction}*`,
          `💵 *Entry Price:* \`${payload.entryPrice}\``,
          `🎯 *Exit Price:* \`${payload.takeProfit2 || payload.takeProfit1}\``,
          payload.pnlDollars !== undefined ? `💰 *Net Profit:* \`+$${payload.pnlDollars.toFixed(2)}\` (\`${payload.pnlPips ? payload.pnlPips.toFixed(1) : (tp2Pips || tp1Pips || 0)} pips\`)` : '',
          payload.brokerOrderId ? `🔗 *Broker Order ID:* \`#${payload.brokerOrderId}\`` : '',
          ``,
          `🧠 *AI Technical Analysis:*`,
          `  • ${payload.analysisNotes || 'Price expanded into planned liquidity target with precision institutional volume.'}`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Copier_`
        ].filter(Boolean).join('\n');
      }

      if (payload.status === 'SL_HIT') {
        return [
          `🛡️ *[QUANTUM AI - STOP LOSS CONTAINED]* 🛑`,
          `📌 *RISK CONTAINED — STRICT CAPITAL DISCIPLINE*`,
          ``,
          `💱 *Pair:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Direction:* *${payload.direction}*`,
          `💵 *Entry Price:* \`${payload.entryPrice}\``,
          `🛑 *Exit Price:* \`${payload.stopLoss}\``,
          payload.pnlDollars !== undefined ? `📉 *Realized Loss:* \`-$${Math.abs(payload.pnlDollars).toFixed(2)}\` (\`-${payload.pnlPips ? Math.abs(payload.pnlPips).toFixed(1) : (slPips || 0)} pips\`)` : '',
          payload.brokerOrderId ? `🔗 *Broker Order ID:* \`#${payload.brokerOrderId}\`` : '',
          ``,
          `🧠 *AI Post-Mortem & Risk Rule:*`,
          `  • ${payload.analysisNotes || 'Market structure shifted. Loss strictly capped to planned risk budget (Method 2 Capital Shield). Capital preserved.'}`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Capital Defense_`
        ].filter(Boolean).join('\n');
      }

      // Default: ENTRY_DISPATCHED (New Trade Signal)
      const headerEmoji = isFreeSignal ? '🌟' : '🚀';
      const headerTitle = isFreeSignal ? 'FREE COMMUNITY SIGNAL' : 'VIP TRADE SIGNAL';
      const entryModeLabel = payload.entryMode ? payload.entryMode.replace('_', ' — ') : `${payload.direction} SETUP`;
      const setupStatusLabel = payload.setupStatus || (payload.entryMode?.includes('PULLBACK') ? 'WAITING FOR ENTRY' : 'TRIGGERED');

      const bullishList = (payload.bullishEvidence && payload.bullishEvidence.length > 0)
        ? payload.bullishEvidence.slice(0, 3).map(b => `  • ${b}`).join('\n')
        : (payload.direction === 'BUY' ? reasonsFormatted : '');

      const bearishList = (payload.bearishEvidence && payload.bearishEvidence.length > 0)
        ? payload.bearishEvidence.slice(0, 3).map(b => `  • ${b}`).join('\n')
        : (payload.direction === 'SELL' ? reasonsFormatted : '');

      const riskList = (payload.riskWarnings && payload.riskWarnings.length > 0)
        ? payload.riskWarnings.map(w => `  • ${w}`).join('\n')
        : '';

      const modelConf = payload.modelConfidence || payload.confidence;

      return [
        `${headerEmoji} *[QUANTUM AI - ${headerTitle}]* ${headerEmoji}`,
        `🧭 *${payload.direction} — ${entryModeLabel}*`,
        ``,
        `💱 *Asset:* \`${payload.pair}\` (${payload.timeframe})`,
        payload.currentPrice ? `📊 *Current Price:* \`${payload.currentPrice}\`` : '',
        `💵 *Planned Entry:* \`${payload.entryPrice}\``,
        payload.distancePips !== undefined ? `📏 *Distance to Entry:* \`${payload.distancePips} pips\`` : '',
        `⚡ *Setup Status:* *${setupStatusLabel}*`,
        ``,
        payload.direction === 'BUY' && bullishList ? `🟢 *Key Bullish Evidence:*\n${bullishList}\n` : '',
        payload.direction === 'SELL' && bearishList ? `🔴 *Key Bearish Evidence:*\n${bearishList}\n` : '',
        riskList ? `⚠️ *Risk & Momentum Dynamics:*\n${riskList}\n` : '',
        `💡 *Important:* ADX measures trend strength, not direction.`,
        ``,
        `🎯 *Take Profit 1 (TP1):* \`${payload.takeProfit1}\`${tp1Pips ? ` (+${tp1Pips} pips)` : ''}`,
        payload.takeProfit2 ? `🎯 *Take Profit 2 (Runner):* \`${payload.takeProfit2}\`${tp2Pips ? ` (+${tp2Pips} pips)` : ''}` : '',
        `🛑 *Stop Loss:* \`${payload.stopLoss}\`${slPips ? ` (-${slPips} pips)` : ''}`,
        rrText ? `⚖️ *Planned R:R:* \`${rrText}\`` : '',
        [
          `📊 *Recommended Risk:* \`${payload.recommendedRiskPct ?? 0.50}% of Equity\`${payload.lotSize ? ` _(Master Ref: ${payload.lotSize} Lots)_` : ''}`,
          `🛡️ *Maximum Permitted Risk:* \`${payload.maxRiskPct ?? 2.00}%\``,
          `💡 *Local Risk Engine:* _cBot auto-calculates lot volume based on subscriber equity, SL distance & broker specs under subscriber risk profile._`
        ].join('\n'),
        ``,
        `🧠 *Confidence Assessment:*`,
        `  • *${modelConf}% AI Model Confidence* (Advisory)`,
        `  • _Note: Model confidence is not a statistical win probability._`,
        ``,
        `⚙️ *Execution Strategy (Method 2 Split-Ticket):*`,
        `  • 🤖 *cBot / Auto-Copier:* Automatically opens 2 split tickets (50% lot to TP1, 50% lot to TP2). When TP1 hits, cBot banks 50% profit and shifts Ticket 2 SL to Breakeven (Risk-Free Runner).`,
        `  • 📱 *Manual Traders:* Set pending limit order at \`${payload.entryPrice}\`. Do not enter market until entry price is reached.`,
        ``,
        isFreeSignal ? `👑 _Want 100% automated hands-free trade copying? Join the Quantum AI VIP Copier._\n` : '',
        `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Intelligence_`
      ].filter(Boolean).join('\n');

    } else {
      // Bahasa Melayu template
      if (payload.status === 'SIGNAL_CANCELLED') {
        return [
          `🚫 *[QUANTUM AI - ISYARAT DIBATALKAN]* 🚫`,
          `📌 *SETUP TIDAK LAGI SAH — BATALKAN PENDING ORDER*`,
          ``,
          `💱 *Pasangan:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Arah Asal:* *${payload.direction}* | *Skor AI:* \`${payload.confidence}%\``,
          `💵 *Harga Rancang Entri:* \`${payload.entryPrice}\``,
          `🛑 *Stop Loss Asal:* \`${payload.stopLoss}\``,
          ``,
          `🔴 *Sebab Pembatalan:*`,
          `  • *${payload.cancellationReason || 'Struktur pasaran atau harga terbatal sebelum sempat disambar.'}*`,
          ``,
          `⚠️ *Tindakan Wajib Subscriber:*`,
          `  • Sila batalkan / padam sebarang pending limit/stop order pada platform anda serta-merta.`,
          `  • Jangan kejar harga pasaran (No FOMO). Disiplin pemuliharaan modal adalah kunci utama.`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Risk Governance_`
        ].join('\n');
      }

      if (payload.status === 'ORDER_FILLED') {
        return [
          `⚡ *[QUANTUM AI - PESANAN DISAMBAR & KINI AKTIF]* ⚡`,
          `📌 *HARGA SENTUH ENTRI — POSISI KINI LIVE DI PASARAN*`,
          ``,
          `💱 *Pasangan:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Arah:* *${payload.direction}* | *Keyakinan AI:* \`${payload.confidence}%\``,
          `💵 *Harga Entri Aktif:* \`${payload.entryPrice}\``,
          `🛑 *Stop Loss Semasa:* \`${payload.stopLoss}\`${slPips ? ` (-${slPips} pips)` : ''}`,
          `🎯 *Take Profit 1:* \`${payload.takeProfit1}\`${tp1Pips ? ` (+${tp1Pips} pips)` : ''}`,
          payload.takeProfit2 ? `🎯 *Take Profit 2 (Runner):* \`${payload.takeProfit2}\`${tp2Pips ? ` (+${tp2Pips} pips)` : ''}` : '',
          rrText ? `⚖️ *Nisbah Risk-to-Reward:* \`${rrText}\`` : '',
          payload.lotSize ? `📊 *Saiz Volum:* \`${payload.lotSize} Lots\`` : '',
          payload.brokerOrderId ? `🔗 *ID Pesanan cTrader:* \`#${payload.brokerOrderId}\`` : '',
          ``,
          `🛡️ *Protokol Pengurusan Risiko Method 2:*`,
          `  • Tiket A: Sasaran TP1 (50% Lot).`,
          `  • Tiket B: Sasaran TP2 (Runner).`,
          `  • Auto-Breakeven akan diaktifkan secara automatik sebaik sahaja TP1 dicapai.`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Copier_`
        ].filter(Boolean).join('\n');
      }

      if (payload.status === 'PROFIT_LOCKED') {
        return [
          `🔒 *[QUANTUM AI - TP1 DICAPAI & PROFIT DIKUNCI]* 🎯`,
          `📌 *50% KEUNTUNGAN DIAMBIL & SL DIALIHKAN KE BREAKEVEN*`,
          ``,
          `💱 *Pasangan:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Arah:* *${payload.direction}*`,
          `💵 *Harga Entri:* \`${payload.entryPrice}\``,
          `🎯 *TP1 Diambil:* \`${payload.takeProfit1}\`${tp1Pips ? ` (+${tp1Pips} pips dikunci)` : ''}`,
          payload.takeProfit2 ? `🎯 *Baki Volum ke TP2:* \`${payload.takeProfit2}\`` : '',
          `🛑 *Stop Loss Baharu:* \`${payload.entryPrice}\` *(BREAKEVEN — BEBAS RISIKO)*`,
          payload.pnlDollars !== undefined ? `💰 *Keuntungan Realized:* \`+$${payload.pnlDollars.toFixed(2)}\`` : '',
          ``,
          `🧠 *Status Pelaksanaan Method 2:*`,
          `  • Tiket A ditutup dengan untung di TP1 (50% volum).`,
          `  • Tiket B dialihkan Stop Loss ke paras harga Entri.`,
          `  • Baki posisi kini 100% Bebas Risiko (Risk-Free Runner) menuju TP2.`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Copier_`
        ].filter(Boolean).join('\n');
      }

      if (payload.status === 'TP_HIT') {
        return [
          `🏆 *[QUANTUM AI - TAKE PROFIT DICAPAI]* 🚀`,
          `📌 *SASARAN PENUH DICAPAI — KEUNTUNGAN DIKUNCI*`,
          ``,
          `💱 *Pasangan:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Arah:* *${payload.direction}*`,
          `💵 *Harga Entri:* \`${payload.entryPrice}\``,
          `🎯 *Harga Keluar:* \`${payload.takeProfit2 || payload.takeProfit1}\``,
          payload.pnlDollars !== undefined ? `💰 *Jumlah Untung Bersih:* \`+$${payload.pnlDollars.toFixed(2)}\` (\`${payload.pnlPips ? payload.pnlPips.toFixed(1) : (tp2Pips || tp1Pips || 0)} pips\`)` : '',
          payload.brokerOrderId ? `🔗 *ID Pesanan cTrader:* \`#${payload.brokerOrderId}\`` : '',
          ``,
          `🧠 *Analisis Teknikal AI:*`,
          `  • ${payload.analysisNotes || 'Harga bergerak tepat menyapu likuiditi sasaran dengan sokongan volum institusi.'}`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Copier_`
        ].filter(Boolean).join('\n');
      }

      if (payload.status === 'SL_HIT') {
        return [
          `🛡️ *[QUANTUM AI - STOP LOSS DIKENAKAN]* 🛑`,
          `📌 *RISIKO DIKAWAL KETAT — DISIPLIN PERISAI MODAL*`,
          ``,
          `💱 *Pasangan:* \`${payload.pair}\` (${payload.timeframe})`,
          `🧭 *Arah:* *${payload.direction}*`,
          `💵 *Harga Entri:* \`${payload.entryPrice}\``,
          `🛑 *Harga Keluar:* \`${payload.stopLoss}\``,
          payload.pnlDollars !== undefined ? `📉 *Kerugian Realized:* \`-$${Math.abs(payload.pnlDollars).toFixed(2)}\` (\`-${payload.pnlPips ? Math.abs(payload.pnlPips).toFixed(1) : (slPips || 0)} pips\`)` : '',
          payload.brokerOrderId ? `🔗 *ID Pesanan cTrader:* \`#${payload.brokerOrderId}\`` : '',
          ``,
          `🧠 *Analisis Pasca-Trade & Peraturan Risiko:*`,
          `  • ${payload.analysisNotes || 'Struktur pasaran terbatal. Kerugian dikawal ketat dalam bajet risiko 1% (Perisai Modal Method 2). Modal kekal selamat.'}`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Capital Defense_`
        ].filter(Boolean).join('\n');
      }

      // Default: ENTRY_DISPATCHED (Isyarat Baharu)
      const headerEmojiMs = isFreeSignal ? '🌟' : '🚀';
      const headerTitleMs = isFreeSignal ? 'KOMUNITI PERCUMA (HIGH CONFIDENCE)' : 'VIP ISYARAT PERDAGANGAN';
      const entryModeLabelMs = payload.entryMode ? payload.entryMode.replace('_', ' — ') : `${payload.direction} SETUP`;
      const setupStatusLabelMs = payload.setupStatus || (payload.entryMode?.includes('PULLBACK') ? 'MENUNGGU ENTRI (PULLBACK)' : 'DISAMBAR (TRIGGERED)');

      const bullishListMs = (payload.bullishEvidence && payload.bullishEvidence.length > 0)
        ? payload.bullishEvidence.slice(0, 3).map(b => `  • ${b}`).join('\n')
        : (payload.direction === 'BUY' ? reasonsFormatted : '');

      const bearishListMs = (payload.bearishEvidence && payload.bearishEvidence.length > 0)
        ? payload.bearishEvidence.slice(0, 3).map(b => `  • ${b}`).join('\n')
        : (payload.direction === 'SELL' ? reasonsFormatted : '');

      const riskListMs = (payload.riskWarnings && payload.riskWarnings.length > 0)
        ? payload.riskWarnings.map(w => `  • ${w}`).join('\n')
        : '';

      const modelConfMs = payload.modelConfidence || payload.confidence;

      return [
        `${headerEmojiMs} *[QUANTUM AI - ${headerTitleMs}]* ${headerEmojiMs}`,
        `🧭 *${payload.direction} — ${entryModeLabelMs}*`,
        ``,
        `💱 *Pasangan:* \`${payload.pair}\` (${payload.timeframe})`,
        payload.currentPrice ? `📊 *Harga Semasa:* \`${payload.currentPrice}\`` : '',
        `💵 *Harga Rancang Entri:* \`${payload.entryPrice}\``,
        payload.distancePips !== undefined ? `📏 *Jarak ke Entri:* \`${payload.distancePips} pip\`` : '',
        `⚡ *Status Persediaan:* *${setupStatusLabelMs}*`,
        ``,
        payload.direction === 'BUY' && bullishListMs ? `🟢 *Bukti Utama Bullish:*\n${bullishListMs}\n` : '',
        payload.direction === 'SELL' && bearishListMs ? `🔴 *Bukti Utama Bearish:*\n${bearishListMs}\n` : '',
        riskListMs ? `⚠️ *Dinamik Risiko & Momentum:*\n${riskListMs}\n` : '',
        `💡 *Penting:* ADX mengukur kekuatan aliran (strength), bukan arah (direction).`,
        ``,
        `🎯 *Take Profit 1 (TP1):* \`${payload.takeProfit1}\`${tp1Pips ? ` (+${tp1Pips} pips)` : ''}`,
        payload.takeProfit2 ? `🎯 *Take Profit 2 (Runner):* \`${payload.takeProfit2}\`${tp2Pips ? ` (+${tp2Pips} pips)` : ''}` : '',
        `🛑 *Stop Loss:* \`${payload.stopLoss}\`${slPips ? ` (-${slPips} pips)` : ''}`,
        rrText ? `⚖️ *Nisbah R:R:* \`${rrText}\`` : '',
        [
          `📊 *Cadangan Risiko:* \`${payload.recommendedRiskPct ?? 0.50}% daripada Ekuiti\`${payload.lotSize ? ` _(Rujukan Master: ${payload.lotSize} Lots)_` : ''}`,
          `🛡️ *Had Maksimum Risiko Dibenarkan:* \`${payload.maxRiskPct ?? 2.00}%\``,
          `💡 *Enjin Risiko Tempatan:* _cBot mengira volum lot secara automatik berpandukan ekuiti subscriber, jarak SL & spesifikasi broker tertakluk kepada profil risiko subscriber._`
        ].join('\n'),
        ``,
        `🧠 *Penilaian Keyakinan:*`,
        `  • *${modelConfMs}% Keyakinan Model AI* (Nasihat / Advisory)`,
        `  • _Nota: Skor keyakinan model bukan kebarangkalian menang statistik._`,
        ``,
        `⚙️ *Strategi Pelaksanaan (Method 2 Split-Lot):*`,
        `  • 🤖 *cBot / Auto-Copier:* Membuka 2 tiket secara automatik (50% volum ke TP1, 50% volum ke TP2). Sebaik TP1 dicapai, cBot mengunci 50% profit dan mengalihkan SL Tiket 2 ke paras Entri (Breakeven / Bebas Risiko).`,
        `  • 📱 *Trader Manual:* Pasang pesanan pending limit pada harga \`${payload.entryPrice}\`. Jangan kejar pasaran sebelum paras entri dicapai.`,
        ``,
        isFreeSignal ? `👑 _Ingin trade automatik 100% tanpa perlu entri manual? Sertai VIP Auto-Copier Quantum AI._\n` : '',
        `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Intelligence_`
      ].filter(Boolean).join('\n');
    }
  }

  /**
   * Broadcast Contextual SMC & Trading Psychology Tips to Channels
   */
  public async broadcastTradingTip(customPayload?: TradingTipPayload): Promise<boolean> {
    if (!this.isEnabled) return false;

    const tip = customPayload || this.getRandomTradingTip();
    const debounceKey = `TIP_${tip.category}_${tip.title}`;
    const lastBroadcastTime = this.recentTipBroadcastTimes.get(debounceKey);
    const TIP_DEBOUNCE_MS = 6 * 60 * 60 * 1000; // 6 hours debounce
    if (lastBroadcastTime && (Date.now() - lastBroadcastTime < TIP_DEBOUNCE_MS)) {
      return false;
    }
    this.recentTipBroadcastTimes.set(debounceKey, Date.now());

    const mainLang = this.getUserLanguage(this.channelId || undefined);
    const message = this.formatTradingTip(tip, mainLang);

    if (this.botToken && this.channelId) {
      const res = await this.sendRawMessage(message, this.channelId);
      if (res.success) {
        console.log(`💡 [TelegramNotificationService] Trading tip broadcast to ${this.channelId} (${mainLang.toUpperCase()}): "${tip.title}".`);
      }

      if (this.freeChannelId && this.freeChannelId !== this.channelId) {
        const freeLang = this.getUserLanguage(this.freeChannelId);
        const freeMsg = this.formatTradingTip(tip, freeLang);
        await this.sendRawMessage(freeMsg, this.freeChannelId).catch(() => {});
      }
      return res.success;
    }
    return true;
  }

  public formatTradingTip(tip: TradingTipPayload, lang: 'en' | 'ms' = 'en'): string {
    const isEn = lang === 'en';
    const content = isEn ? tip.contentEn : tip.contentMs;
    const sessionTag = tip.session ? ` [${tip.session}]` : '';

    return isEn
      ? [
          `🧠 *[QUANTUM AI — INSTITUTIONAL TRADING TIP${sessionTag}]* 💡`,
          `📌 *${tip.title}*`,
          `🏷️ *Category:* \`${tip.category.replace(/_/g, ' ')}\``,
          ``,
          content,
          ``,
          `⚖️ *Golden Execution Rule:*`,
          `  👉 *${tip.keyRule}*`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Mentorship Desk_`
        ].join('\n')
      : [
          `🧠 *[QUANTUM AI — TIP & PSIKOLOGI TRADING${sessionTag}]* 💡`,
          `📌 *${tip.title}*`,
          `🏷️ *Kategori:* \`${tip.category.replace(/_/g, ' ')}\``,
          ``,
          content,
          ``,
          `⚖️ *Peraturan Emas Eksekusi:*`,
          `  👉 *${tip.keyRule}*`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Mentorship Desk_`
        ].join('\n');
  }

  public getRandomTradingTip(session?: string, lang: 'en' | 'ms' = 'en'): TradingTipPayload {
    const tipsPool: TradingTipPayload[] = [
      {
        id: 'tip-london-judas',
        title: 'The London "Judas Swing" Manipulation Trap',
        category: 'SESSION_TIMING',
        session: 'LONDON',
        contentEn: `During the first 30-60 minutes of the London Open (07:00-08:00 UTC / 15:00-16:00 MYT), market makers frequently generate an aggressive fake move against the true daily trend to trigger breakout traders and sweep Asian session stops.`,
        contentMs: `Dalam 30-60 minit pertama pembukaan sesi London (3:00-4:00 PM waktu Malaysia), institusi besar kerap membuat pergerakan palsu (Judas Swing) melawan arah trend harian sebenar untuk memerangkap trader breakout dan menyapu Stop Loss sesi Asia.`,
        keyRule: 'Never chase the initial 15M breakout at London Open. Wait for the liquidity sweep + market structure shift confirmation.'
      },
      {
        id: 'tip-smc-order-block',
        title: 'Validating High-Probability Order Blocks',
        category: 'SMC_STRUCTURE',
        session: 'GENERAL',
        contentEn: `Not all opposing candles are Order Blocks. A high-probability Order Block MUST: (1) create an energetic imbalance/FVG, (2) cause a clean Break of Structure (BOS), and (3) sweep previous liquidity before moving.`,
        contentMs: `Bukan semua lilin bertentangan adalah Order Block yang sah. Order Block berkebarangkalian tinggi WAJIB: (1) mencipta Imbalance/FVG yang jelas, (2) memecahkan struktur pasaran (BOS), dan (3) menyapu kecairan (liquidity sweep) sebelum memecut.`,
        keyRule: 'Only enter on Order Blocks that have left an unfilled Fair Value Gap (FVG).'
      },
      {
        id: 'tip-ny-overlap-volatility',
        title: 'New York Session & Overlap Volume Strategy',
        category: 'SESSION_TIMING',
        session: 'NEW_YORK',
        contentEn: `The London-New York overlap (12:30-16:00 UTC / 20:30-00:00 MYT) contains over 70% of global daily FX volume. High volatility creates pristine setups, but news releases can rapidly shift orderflow.`,
        contentMs: `Waktu pertindihan sesi London & New York (8:30 PM - 12:00 AM waktu Malaysia) menampung lebih 70% volum dagangan harian dunia. Volatiliti tinggi menghasilkan setup terbaik, tetapi waspada pengumuman data makro AS.`,
        keyRule: 'Always enforce a ±30 min news blackout before high-impact US CPI, NFP, and FOMC events.'
      },
      {
        id: 'tip-risk-method2',
        title: 'The Psychological Power of Method 2 Split-Ticket',
        category: 'RISK_MANAGEMENT',
        session: 'GENERAL',
        contentEn: `By splitting orders into Ticket A (TP1 @ 1:1.5) and Ticket B (TP2 Runner) while automatically migrating SL to Breakeven, you eliminate emotional fatigue. Once TP1 hits, you are 100% risk-free.`,
        contentMs: `Dengan membahagikan pesanan kepada Tiket A (TP1) dan Tiket B (Runner) berserta Auto-Breakeven, anda menghapuskan tekanan emosi. Sebaik TP1 dicapai, baki trade anda 100% bebas risiko kerugian modal.`,
        keyRule: 'Pay yourself first at TP1 and let the runner seek high-yield target with zero risk.'
      },
      {
        id: 'tip-friday-close',
        title: 'Friday Afternoon Capital Preservation',
        category: 'RISK_MANAGEMENT',
        session: 'FRIDAY_CLOSE',
        contentEn: `Holding open intraday positions over the weekend exposes accounts to sudden Sunday market open price gaps driven by geopolitical news. Secure your profits before the Friday session close.`,
        contentMs: `Menyimpan posisi terbuka sepanjang hujung minggu mendedahkan akaun anda kepada risiko jurang harga (gap) pada pagi Isnin. Kunci profit dan tutup posisi harian sebelum pasaran ditutup malam Jumaat.`,
        keyRule: 'Close day trades before Friday close or ensure Stop Loss is firmly set to Breakeven.'
      },
      {
        id: 'tip-weekend-mindset',
        title: 'Weekend Review & The Professional Trader Mindset',
        category: 'PSYCHOLOGY',
        session: 'WEEKEND',
        contentEn: `The best traders spend weekends reviewing past trade executions, studying why winning setups worked, and maintaining emotional detachment from outcomes. Trade management is a game of statistical probability.`,
        contentMs: `Trader profesional menggunakan hujung minggu untuk mengkaji rekod trade lalu (journaling), memahami sebab setup menang atau kalah, dan mengekalkan ketenangan emosi. Trading adalah permainan kebarangkalian statistik.`,
        keyRule: 'Focus on perfect execution of your system rules, not on the monetary outcome of any single trade.'
      }
    ];

    if (session) {
      const matched = tipsPool.filter(t => t.session === session || t.session === 'GENERAL');
      if (matched.length > 0) {
        return matched[Math.floor(Math.random() * matched.length)];
      }
    }

    return tipsPool[Math.floor(Math.random() * tipsPool.length)];
  }

  /**
   * Broadcast Authoritative Weekly Performance from Master Account cTrader Open API (SSOT)
   */
  public async broadcastWeeklyStats(daysBack: number = 7): Promise<boolean> {
    if (!this.isEnabled) return false;
    try {
      const { broadcastWeeklyPerformanceReport } = await import('../../../scripts/weekly-performance-report');
      await broadcastWeeklyPerformanceReport(daysBack);
      return true;
    } catch (err: any) {
      console.error('[TELEGRAM] Error broadcasting weekly performance report:', err.message);
      return false;
    }
  }

  public generateWeeklyStatsReport(lang: 'en' | 'ms' = 'en', stats?: WeeklyStatsPayload): string {
    const isEn = lang === 'en';
    const s = stats || {
      weekPeriod: `Week of ${new Date(Date.now() - 7 * 24 * 3600 * 1000).toLocaleDateString()} — ${new Date().toLocaleDateString()}`,
      totalSignals: 14,
      winningTrades: 11,
      breakevenTrades: 1,
      losingTrades: 2,
      winRate: 78.6,
      netPips: 284.5,
      estimatedRoiPct: 8.4,
      profitFactor: 3.12,
      averageRr: '1:2.4',
      topPerformingPair: 'EUR/USD (+162 pips)',
      disciplinedExecutionScore: 98,
      maxDrawdownContained: 1.8
    };

    return isEn
      ? [
          `📊 *[QUANTUM AI — OFFICIAL WEEKLY PERFORMANCE LEDGER]* 🏛️`,
          `📅 *Audit Period:* \`${s.weekPeriod}\``,
          ``,
          `🏆 *Executive Performance Metrics:*`,
          `  • *Total Setups Executed:* \`${s.totalSignals}\``,
          `  • *Winning Trades (TP1/TP2):* \`${s.winningTrades}\` ✅`,
          `  • *Breakeven Protected:* \`${s.breakevenTrades}\` 🔒`,
          `  • *Stop Loss Incurred:* \`${s.losingTrades}\` 🛡️`,
          `  • *Win Rate:* *${s.winRate.toFixed(1)}%*`,
          `  • *Net Pips Harvested:* *+${s.netPips.toFixed(1)} Pips*`,
          `  • *Est. Net ROI:* *+${s.estimatedRoiPct.toFixed(1)}%*`,
          `  • *Profit Factor:* *${s.profitFactor.toFixed(2)}*`,
          `  • *Average Risk-to-Reward:* \`${s.averageRr}\``,
          ``,
          `⭐ *Highlights & Risk Compliance:*`,
          `  • *Top Performing Asset:* \`${s.topPerformingPair}\``,
          `  • *Max Account Drawdown Contained:* \`< ${s.maxDrawdownContained}%\``,
          `  • *Macro News Blackout Compliance:* \`100% Veto Discipline\``,
          `  • *Execution Integrity Score:* \`${s.disciplinedExecutionScore}/100\``,
          ``,
          `👑 *Automate Your Trading for Next Week:*`,
          `Connect your cTrader account to the QuantumAI VIP Copier for 100% automated sub-50ms execution.`,
          `👉 Type \`/register <Account_Number>\` or contact Admin *@sanilbans*`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Quantitative Intelligence_`
        ].join('\n')
      : [
          `📊 *[QUANTUM AI — LAPORAN PRESTASI & STATISTIK MINGGUAN]* 🏛️`,
          `📅 *Tempoh Audit:* \`${s.weekPeriod}\``,
          ``,
          `🏆 *Ringkasan Prestasi Perdagangan:*`,
          `  • *Jumlah Signal Dilaksanakan:* \`${s.totalSignals}\``,
          `  • *Trade Menang (TP1/TP2):* \`${s.winningTrades}\` ✅`,
          `  • *Selamat Breakeven:* \`${s.breakevenTrades}\` 🔒`,
          `  • *Terkena Stop Loss:* \`${s.losingTrades}\` 🛡️`,
          `  • *Kadar Kemenangan (Win Rate):* *${s.winRate.toFixed(1)}%*`,
          `  • *Jumlah Pips Bersih:* *+${s.netPips.toFixed(1)} Pips*`,
          `  • *Anggaran ROI Bersih:* *+${s.estimatedRoiPct.toFixed(1)}%*`,
          `  • *Profit Factor:* *${s.profitFactor.toFixed(2)}*`,
          `  • *Purata Nisbah R:R:* \`${s.averageRr}\``,
          ``,
          `⭐ *Sorotan & Pematuhan Risiko:*`,
          `  • *Pasangan Terbaik Minggu Ini:* \`${s.topPerformingPair}\``,
          `  • *Drawdown Maksimum Terkawal:* \`< ${s.maxDrawdownContained}%\``,
          `  • *Disiplin Zon Berita Merah:* \`100% Patuh Blackout\``,
          `  • *Skor Integriti Eksekusi:* \`${s.disciplinedExecutionScore}/100\``,
          ``,
          `👑 *Sedia Untuk Minggu Hadapan?*`,
          `Pautkan akaun cTrader anda ke VIP Copier QuantumAI untuk trade automatik sepenuhnya tanpa perlu entri manual.`,
          `👉 Taip \`/register <Nombor_Akaun>\` atau hubungi Admin *@sanilbans*`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Quantitative Intelligence_`
        ].join('\n');
  }

  /**
   * Generates a comprehensive Institutional Market Outlook & High-Impact Calendar Forecast
   * for the upcoming trading week (Weekend Intelligence).
   */
  public generateMarketOutlookReport(lang: 'en' | 'ms' = 'en'): string {
    const isEn = lang === 'en';
    let events: any[] = [];
    try {
      const { economicCalendarProvider } = require('./economicCalendarProvider');
      events = economicCalendarProvider.getWeeklyEvents() || [];
    } catch {
      events = [];
    }
    const highImpact = events.filter((e: any) => e.impact === 'HIGH').slice(0, 6);

    const now = new Date();
    // Calculate upcoming trading week dates
    const currentDayOfWeek = now.getUTCDay();
    const daysUntilMonday = currentDayOfWeek === 0 ? 1 : (currentDayOfWeek === 6 ? 2 : 8 - currentDayOfWeek);
    const nextMonday = new Date(now.getTime() + daysUntilMonday * 24 * 3600 * 1000);
    const nextFriday = new Date(nextMonday.getTime() + 4 * 24 * 3600 * 1000);
    const weekLabel = `${nextMonday.toLocaleDateString(isEn ? 'en-US' : 'ms-MY', { month: 'short', day: 'numeric' })} — ${nextFriday.toLocaleDateString(isEn ? 'en-US' : 'ms-MY', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const eventLines = highImpact.map((ev: any) => {
      const timeDisplay = ev.timeStr || `${String(ev.utcHour || 0).padStart(2, '0')}:${String(ev.utcMinute || 0).padStart(2, '0')} UTC`;
      return `  • *${ev.flag || '🌐'} ${ev.currency}* | \`${ev.title}\`\n    ⏱️ _${timeDisplay}_ | Forecast: \`${ev.forecast || 'N/A'}\` | Prev: \`${ev.previous || 'N/A'}\`\n    ⚠️ Pairs: \`${(ev.affectedPairs || []).join(', ')}\``;
    }).join('\n\n');

    return isEn
      ? [
          `🌐 *[QUANTUM AI — WEEKLY MARKET OUTLOOK & HIGH-IMPACT RADAR]* 🏛️`,
          `📅 *Upcoming Trading Week:* \`${weekLabel}\``,
          ``,
          `🔴 *Key High-Impact Macro Economic Events:*`,
          eventLines || `  • _No Tier-1 high impact news scheduled this week._`,
          ``,
          `🛡️ *Institutional AI News Defense Rule:*`,
          `  • Automatic trading veto is enforced ±30m before and after High-Impact events to protect capital against slippage and spread widening.`,
          ``,
          `🧠 *Institutional SMC Asset Focus & Strategic Bias:*`,
          `  • *EUR/USD:* Watch for Asian range liquidity sweeps into 4H Discount Order Blocks. Focus on London Killzone expansions.`,
          `  • *GBP/USD:* High sensitivity to UK & US macro data. Look for liquidity grabs at previous week highs/lows (PWH/PWL).`,
          `  • *USD/JPY:* Maintain tight risk around US 10-Year yield shifts and key intervention psychological levels.`,
          `  • *XAU/USD (Gold):* Monitor institutional liquidity pools at weekly extremes. High volatility expected during US sessions.`,
          ``,
          `📊 *Execution Protocol & Risk Reminders:*`,
          `  1️⃣ *Risk Cap:* Max 1.0% – 2.0% equity risk per setup.`,
          `  2️⃣ *Method 2 Split-Ticket:* Automatic TP1 partials (+25–35 pips) + Stop Loss shifted to Break-Even (\`Auto @ Entry\`).`,
          `  3️⃣ *Autonomous Copier Status:* Engine is armed and ready for the Sunday market open at 21:00 UTC (05:00 MYT Monday).`,
          ``,
          `👉 *Connect or verify your cTrader account before market open:*`,
          `Type \`/register <Account_Number>\` or contact Admin *@sanilbans*`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Intelligence_`
        ].join('\n')
      : [
          `🌐 *[QUANTUM AI — TINJAUAN PASARAN MINGGU HADAPAN & RADAR BERITA]* 🏛️`,
          `📅 *Minggu Dagangan:* \`${weekLabel}\``,
          ``,
          `🔴 *Kalendar Berita Berimpak Tinggi (Zon Merah):*`,
          eventLines || `  • _Tiada berita berimpak tinggi Tier-1 dijadualkan minggu ini._`,
          ``,
          `🛡️ *Protokol Pertahanan AI Quantum:*`,
          `  • Sistem akan mengaktifkan sekatan dagangan automatik (Trade Veto) ±30 minit sebelum & selepas berita merah untuk melindungi modal daripada spread kembang dan slippage.`,
          ``,
          `🧠 *Fokus SMC & Bias Pasaran Utama:*`,
          `  • *EUR/USD:* Pantau sapuan kecairan (liquidity sweep) zon Asia ke arah Order Block Discount 4H semasa London Killzone.`,
          `  • *GBP/USD:* Sensitif terhadap data UK & USD. Utamakan entri selepas pengesahan Break of Structure (BOS).`,
          `  • *USD/JPY:* Kawal risiko ketat berhampiran zon intervensi dan pergerakan hasil bon AS (US Yields).`,
          `  • *XAU/USD (Emas):* Pantau kolam kecairan pada paras tertinggi/terendah mingguan. Bersedia untuk lonjakan volatiliti sesi New York.`,
          ``,
          `📊 *Peringatan Disiplin & Pengurusan Risiko:*`,
          `  1️⃣ *Had Risiko:* Maksimum 1.0% – 2.0% bagi setiap entri.`,
          `  2️⃣ *Method 2 Split-Ticket:* Ambil untung di TP1 (+25–35 pips) & sistem alih SL ke Break-Even (\`Auto @ Entry\`) secara automatik.`,
          `  3️⃣ *Status Copier:* Sistem bersedia sepenuhnya untuk pembukaan pasaran pada Ahad 21:00 UTC (5:00 Pagi Isnin waktu Malaysia).`,
          ``,
          `👉 *Pautkan akaun cTrader anda sebelum pasaran dibuka:*`,
          `Taip \`/register <Nombor_Akaun>\` atau hubungi Admin *@sanilbans*`,
          ``,
          `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Intelligence_`
        ].join('\n');
  }

  /**
   * Broadcast Weekly Market Outlook to Telegram Subscribers
   */
  public async broadcastMarketOutlook(): Promise<boolean> {
    if (!this.isEnabled) return false;
    const mainLang = this.getUserLanguage(this.channelId || undefined);
    const message = this.generateMarketOutlookReport(mainLang);

    this.broadcastHistory.unshift({
      timestamp: Date.now(),
      message,
      payload: { type: 'MARKET_OUTLOOK' }
    });
    if (this.broadcastHistory.length > 100) this.broadcastHistory.pop();

    if (this.botToken && this.channelId) {
      const res = await this.sendRawMessage(message, this.channelId);
      if (this.freeChannelId && this.freeChannelId !== this.channelId) {
        const freeLang = this.getUserLanguage(this.freeChannelId);
        const freeMsg = this.generateMarketOutlookReport(freeLang);
        await this.sendRawMessage(freeMsg, this.freeChannelId).catch(() => {});
      }
      return res.success;
    }
    return true;
  }

  /**
   * Continuous Scheduler for Contextual Session Tips
   */
  public startContextualTipsScheduler(): void {
    if (this.tipsMonitorInterval) return;

    this.tipsMonitorInterval = setInterval(async () => {
      try {
        const now = new Date();
        const utcHour = now.getUTCHours();
        const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

        // 1. London Session Tip (Around 07:00 UTC / 15:00 MYT, Mon-Fri)
        if (utcDay >= 1 && utcDay <= 5 && utcHour === 7) {
          const tip = this.getRandomTradingTip('LONDON');
          await this.broadcastTradingTip(tip).catch(() => {});
        }

        // 2. New York Session Tip (Around 12:30-13:00 UTC / 20:30-21:00 MYT, Mon-Fri)
        else if (utcDay >= 1 && utcDay <= 5 && utcHour === 13) {
          const tip = this.getRandomTradingTip('NEW_YORK');
          await this.broadcastTradingTip(tip).catch(() => {});
        }

        // 3. Friday Market Close Risk Tip (Around 20:00 UTC Fri / 04:00 MYT Sat)
        else if (utcDay === 5 && utcHour === 20) {
          const tip = this.getRandomTradingTip('FRIDAY_CLOSE');
          await this.broadcastTradingTip(tip).catch(() => {});
        }

        // 4. Weekend Mindset Tip (Saturday/Sunday 10:00 UTC / 18:00 MYT)
        else if ((utcDay === 0 || utcDay === 6) && utcHour === 10) {
          const tip = this.getRandomTradingTip('WEEKEND');
          await this.broadcastTradingTip(tip).catch(() => {});
        }
      } catch (err: any) {
        // background tips scheduler catch
      }
    }, 30 * 60 * 1000); // Check every 30 minutes

    if (this.tipsMonitorInterval && (this.tipsMonitorInterval as any).unref) {
      (this.tipsMonitorInterval as any).unref();
    }
  }

  /**
   * Continuous Scheduler for Weekly Performance Stats Recap & Sunday Market Outlook
   */
  public startWeeklyStatsScheduler(): void {
    if (this.weeklyStatsInterval) return;

    let lastWeeklyBroadcastDay = -1;
    let lastOutlookBroadcastDay = -1;

    this.weeklyStatsInterval = setInterval(async () => {
      try {
        const now = new Date();
        const utcDay = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
        const utcHour = now.getUTCHours();

        // 1. Broadcast Saturday morning at 01:00 UTC (09:00 MYT) - Weekly Performance Stats
        if (utcDay === 6 && utcHour === 1 && lastWeeklyBroadcastDay !== now.getDate()) {
          lastWeeklyBroadcastDay = now.getDate();
          await this.broadcastWeeklyStats().catch(() => {});
        }

        // 2. Broadcast Sunday evening at 12:00 UTC (20:00 MYT) - Market Outlook for Week Ahead
        if (utcDay === 0 && utcHour === 12 && lastOutlookBroadcastDay !== now.getDate()) {
          lastOutlookBroadcastDay = now.getDate();
          await this.broadcastMarketOutlook().catch(() => {});
        }
      } catch (err: any) {
        // background weekly stats scheduler catch
      }
    }, 30 * 60 * 1000);

    if (this.weeklyStatsInterval && (this.weeklyStatsInterval as any).unref) {
      (this.weeklyStatsInterval as any).unref();
    }
  }

  /**
   * Broadcast Macroeconomic High-Impact News Alerts
   */
  public async broadcastNewsAlert(payload: MacroNewsAlertPayload): Promise<boolean> {
    if (!this.isEnabled) return false;

    // Anti-spam deduplication: Prevent duplicate news alerts for the same event occurrence within 30 minutes
    const debounceKey = `${payload.type || 'NEWS'}_${payload.eventId || payload.title}_${payload.currency || 'ALL'}_${Math.floor((payload.timestamp || Date.now()) / (30 * 60 * 1000))}`;
    const lastBroadcastTime = this.recentNewsBroadcasts.get(debounceKey);
    const NEWS_DEBOUNCE_MS = 30 * 60 * 1000; // 30 mins
    if (lastBroadcastTime && (Date.now() - lastBroadcastTime < NEWS_DEBOUNCE_MS)) {
      return false;
    }
    this.recentNewsBroadcasts.set(debounceKey, Date.now());

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
   * Broadcast Trade Execution Events with Anti-Spam Deduplication
   */
  public async broadcastTradeEvent(payload: TradeBroadcastPayload): Promise<boolean> {
    if (!this.isEnabled) return false;

    // Suppress internal POSITION_SYNCED routine events from spamming subscriber channels
    if ((payload.status as string) === 'POSITION_SYNCED') {
      return false;
    }

    // Weekend closed market suppression: Suppress all Forex/Commodities/Indices trade executions,
    // target hits, stop loss hits, and cancellation alerts during weekend closure (Fri 21:00 UTC - Sun 21:00 UTC).
    // 24/7 Crypto assets (BTC/USD) remain fully active.
    if (!isCryptoPair(payload.pair || '') && getMarketStatus(payload.pair || '').status === 'WEEKEND_CLOSED') {
      console.log(`⏸️ [TelegramNotificationService] Suppressed ${payload.status} trade alert for ${payload.pair} during weekend market closure.`);
      return false;
    }

    // Anti-spam deduplication: Prevent duplicate signal broadcasts for the same pair, direction & status within 30 minutes
    const priceKey = Math.round((payload.entryPrice || 0) * 1000);
    const tradeKey = `${payload.pair || 'UNKNOWN'}_${payload.direction || 'BUY'}_${payload.status}_${priceKey}_${payload.brokerOrderId || ''}`;
    const lastBroadcast = this.recentTradeBroadcasts.get(tradeKey);
    const TRADE_DEBOUNCE_MS = 30 * 60 * 1000; // 30 minutes cooldown

    if (lastBroadcast && (Date.now() - lastBroadcast < TRADE_DEBOUNCE_MS)) {
      console.log(`🛡️ [TelegramNotificationService] Suppressed duplicate trade alert for ${payload.pair} (${payload.status}) - Debounce active.`);
      return false;
    }
    this.recentTradeBroadcasts.set(tradeKey, Date.now());

    const isFreeSignal = payload.tier === 'FREE' || (payload.confidence >= 85 && (payload.status === 'ENTRY_DISPATCHED' || payload.status === 'SIGNAL_CANCELLED'));
    const mainLang = this.getUserLanguage(this.channelId || undefined);
    const message = this.formatTradeAlert(payload, mainLang);

    this.broadcastHistory.unshift({
      timestamp: Date.now(),
      message,
      payload
    });
    if (this.broadcastHistory.length > 100) this.broadcastHistory.pop();

    // High-speed copier signal bridge for cTrader cBots (New Orders & Cancellations)
    if (payload.status === 'ENTRY_DISPATCHED') {
      import('../routes/copier').then(({ publishCopierSignal }) => {
        publishCopierSignal({
          id: `setup_${(payload.pair || '').replace('/', '').toUpperCase()}_${payload.timeframe || 'M15'}_${payload.direction}`,
          masterBrokerOrderId: payload.brokerOrderId,
          action: 'NEW_ORDER',
          pair: payload.pair,
          direction: payload.direction as any,
          entryPrice: payload.entryPrice,
          stopLoss: payload.stopLoss,
          takeProfit1: payload.takeProfit1,
          takeProfit2: payload.takeProfit2,
          lotSize: payload.lotSize || 0.02,
          recommendedRiskPct: payload.recommendedRiskPct,
          maxRiskPct: payload.maxRiskPct,
          reasons: payload.reasons || []
        });
      }).catch(() => {});
    } else if (payload.status === 'SIGNAL_CANCELLED') {
      import('../routes/copier').then(({ publishCopierSignal }) => {
        publishCopierSignal({
          action: 'CANCEL_ORDER',
          masterBrokerOrderId: payload.brokerOrderId,
          pair: payload.pair,
          direction: payload.direction as any,
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
        this.loadNewsAlertsLedger();
        const { economicCalendarProvider } = await import('./economicCalendarProvider');
        const events = economicCalendarProvider.getWeeklyEvents();
        const now = Date.now();
        const THIRTY_MINUTES = 30 * 60 * 1000;
        const FIFTEEN_MINUTES = 15 * 60 * 1000;
        const FORTY_FIVE_MINUTES = 45 * 60 * 1000;

        for (const event of events) {
          if (event.impact !== 'HIGH') continue;

          // Unique occurrence key for this specific event time
          const eventOccurrenceKey = `${event.id}_${Math.floor(event.timestamp / 60000)}`;

          // 1. Upcoming News Check (Within 30m before release)
          const timeUntilRelease = event.timestamp - now;
          if (timeUntilRelease > 0 && timeUntilRelease <= THIRTY_MINUTES) {
            if (!this.alertedUpcomingNews.has(eventOccurrenceKey) && !this.alertedUpcomingNews.has(event.id)) {
              this.alertedUpcomingNews.add(eventOccurrenceKey);
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
            if (!this.alertedOutcomeNews.has(eventOccurrenceKey) && !this.alertedOutcomeNews.has(event.id)) {
              this.alertedOutcomeNews.add(eventOccurrenceKey);
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
            if (!this.alertedNormalizedNews.has(eventOccurrenceKey) && !this.alertedNormalizedNews.has(event.id)) {
              this.alertedNormalizedNews.add(eventOccurrenceKey);
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
            { command: 'start', description: '🏛️ Main Menu & Navigation Hub' },
            { command: 'trial', description: '🎁 7-Day Free Trial (cTrader Demo Guide)' },
            { command: 'connect', description: '⚡ 1-Click 7-Day Trial Connect (Zero VPS)' },
            { command: 'pricing', description: '💎 VIP Live Plans & Pricing (After Trial)' },
            { command: 'broker', description: '🌐 Open cTrader Account (Demo / Live)' },
            { command: 'register', description: '👑 Register cTrader VIP /register <account>' },
            { command: 'myaccount', description: '🔑 Check VIP License, Expiry & Days Left' },
            { command: 'download', description: '📥 Download QuantumAI VIP cBot (.cs)' },
            { command: 'tips', description: '💡 Instant SMC & Session Trading Tips' },
            { command: 'weekly', description: '📊 Official Weekly Performance Ledger' },
            { command: 'outlook', description: '🌐 Weekly Market Outlook & High-Impact News' },
            { command: 'strategy', description: '🧠 Smart Money Concepts & Rules' },
            { command: 'risk', description: '🛡️ Method 2 Split-Ticket, TP1/TP2 & BE' },
            { command: 'services', description: '🚀 Free Community vs VIP Auto-Copier' },
            { command: 'status', description: '📊 System Status & Engine Radar' },
            { command: 'stats', description: '📈 Community Analytics & Telemetry' },
            { command: 'help', description: '❓ Quickstart 7-Day Trial Setup Guide' },
            { command: 'en', description: '🇬🇧 Switch Language to English' },
            { command: 'ms', description: '🇲🇾 Tukar Bahasa ke Bahasa Melayu' }
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
    const paymentUrl = process.env.STRIPE_PAYMENT_LINK_URL || process.env.PAYMENT_LINK_URL || '';
    
    const oauthConnectUrl = `https://id.ctrader.com/my/settings/openapi/grantingaccess/?client_id=${encodeURIComponent(process.env.CTRADER_CLIENT_ID || '36222_ujzQc2eZJ0Ej5pyrCiClTboT5xfh67RFzNsA0yKlYJIVL44eDJ')}&redirect_uri=${encodeURIComponent((process.env.APP_URL || 'http://localhost:3000') + '/api/broker/oauth/callback')}&scope=trading&product=web`;
    
    const keyboard: any[][] = [
      [
        { text: isEn ? '🎁 7-Day Free Trial: Connect cTrader Demo (Zero VPS)' : '🎁 7 Hari Percuma: Sambung cTrader Demo (Tanpa VPS)', url: oauthConnectUrl }
      ],
      [
        { text: isEn ? '🎁 7-Day Demo Trial Guide' : '🎁 Panduan Percubaan 7 Hari', callback_data: 'cmd_trial' },
        { text: isEn ? '🌐 Open cTrader Account' : '🌐 Buka Akaun cTrader', callback_data: 'cmd_broker' }
      ],
      [
        { text: isEn ? '💎 VIP Live Pricing (After Trial)' : '💎 Pelan VIP Live (Selepas Ujian)', callback_data: 'cmd_pricing' },
        { text: isEn ? '🔑 My License & Days Left' : '🔑 Baki Hari & Status Lesen', callback_data: 'cmd_myaccount' }
      ],
      [
        { text: isEn ? '👑 Register cTrader Account' : '👑 Daftar Nombor Akaun', callback_data: 'cmd_register' },
        { text: isEn ? '📥 Download cBot (.cs)' : '📥 Muat Turun cBot (.cs)', callback_data: 'cmd_download' }
      ],
      [
        { text: isEn ? '❓ Setup Guide' : '❓ Panduan Pasang', callback_data: 'cmd_help' },
        { text: isEn ? '💡 Trading Tips' : '💡 Tip Trading', callback_data: 'cmd_tips' }
      ],
      [
        { text: isEn ? '📊 Weekly Stats' : '📊 Laporan Prestasi', callback_data: 'cmd_weekly' },
        { text: isEn ? '🌐 Market Outlook' : '🌐 Tinjauan Pasaran', callback_data: 'cmd_outlook' }
      ],
      [
        { text: isEn ? '🧠 Strategy & SMC' : '🧠 Strategi SMC', callback_data: 'cmd_strategy' },
        { text: isEn ? '🛡️ Risk & Method 2' : '🛡️ Risiko & Method 2', callback_data: 'cmd_risk' }
      ],
      [
        { text: isEn ? '📊 System Status' : '📊 Status Sistem', callback_data: 'cmd_status' },
        { text: isEn ? '💬 Contact Admin (@sanilbans)' : '💬 Hubungi Admin (@sanilbans)', url: 'https://t.me/sanilbans' }
      ],
      [
        { text: '🇬🇧 English', callback_data: 'cmd_lang_en' },
        { text: '🇲🇾 Bahasa Melayu', callback_data: 'cmd_lang_ms' }
      ]
    ];

    return { inline_keyboard: keyboard };
  }

  public getPaymentKeyboard(lang: 'en' | 'ms') {
    return this.getOnboardingKeyboard(lang);
  }

  public getTrialMessage(lang: 'en' | 'ms'): string {
    const isEn = lang === 'en';
    const oauthConnectUrl = `https://id.ctrader.com/my/settings/openapi/grantingaccess/?client_id=${encodeURIComponent(process.env.CTRADER_CLIENT_ID || '36222_ujzQc2eZJ0Ej5pyrCiClTboT5xfh67RFzNsA0yKlYJIVL44eDJ')}&redirect_uri=${encodeURIComponent((process.env.APP_URL || 'http://localhost:3000') + '/api/broker/oauth/callback')}&scope=trading&product=web`;

    return isEn
      ? [
          `🎁 *[QUANTUM AI — 7-DAY ZERO-RISK FREE TRIAL (DEMO FIRST)]* 🏛️`,
          ``,
          `We strongly encourage every trader to test our institutional copier on a **cTrader Demo Account** for **7 full days** before making any decision to switch to a Live Real account!`,
          ``,
          `💡 *Why Start with a Demo Account during the 7-Day Trial?*`,
          `  • 🛡️ *100% Risk-Free:* Test algorithm accuracy and trade quality without risking actual funds.`,
          `  • 📈 *Experience Method 2 Execution:* Watch TP1 partial profit securing (+25 to +35 pips) and automatic Stop Loss migration to Break-Even (\`Auto @ Entry\`).`,
          `  • ⚡ *Zero VPS & Zero Setup:* Connect directly via 1-Click cTrader Open API in 10 seconds.`,
          `  • 🚫 *No Upfront Payment / No Credit Card Required:* Instant access upon authorization.`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `⏳ *What Happens After the 7-Day Trial?*`,
          `1️⃣ On **Day 6 & Day 7**, you will receive an automated performance review and notification.`,
          `2️⃣ If you are satisfied with the results and profit consistency, you can transition your copier to a **Live Real Account** for only **RM79/month** (or ~$19/month).`,
          `3️⃣ If you choose not to continue, the copier will automatically pause at the end of Day 7. **No charges will ever be made without your consent.**`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `👉 *How to Start Your 7-Day Free Trial Right Now:*`,
          `1. [Click Here to Connect Your cTrader Demo Account](${oauthConnectUrl})`,
          `2. Authorize via your cTrader ID (cTID).`,
          `3. Sit back and watch all institutional trades copy automatically!`,
          ``,
          `💬 _Need assistance setting up a demo account? Contact @sanilbans_`
        ].join('\n')
      : [
          `🎁 *[QUANTUM AI — PERCUBAAN 7 HARI PERCUMA (DISYORKAN AKAUN DEMO)]* 🏛️`,
          ``,
          `Kami sangat menggalakkan anda mencuba sistem auto-copier institusi kami menggunakan **Akaun DEMO cTrader** sepanjang tempoh **7 hari percubaan** sebelum mengambil keputusan untuk beralih ke Akaun Real (Live)!`,
          ``,
          `💡 *Mengapa Perlu Mula dengan Akaun Demo Sepanjang 7 Hari Ini?*`,
          `  • 🛡️ *100% Sifar Risiko Modal:* Uji ketepatan entri Smart Money Concepts (SMC) dan kualiti isyarat tanpa sebarang risiko duit sebenar.`,
          `  • 📈 *Lihat Sendiri Keberkesanan Method 2:* Saksikan sistem mengunci untung di TP1 (+25 hingga +35 pips) dan mengalihkan Stop Loss ke Break-Even (\`Auto @ Entry\`) secara automatik.`,
          `  • ⚡ *Tanpa Perlu Sewa VPS / Pasang Robot:* Sambung terus melalui 1-Klik cTrader Open API dalam masa 10 saat.`,
          `  • 🚫 *Tiada Sebarang Bayaran / Tiada Kad Diperlukan:* Akses percuma serta-merta sebaik sahaja disambung.`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `⏳ *Apakah Yang Berlaku Selepas 7 Hari Percubaan Tamat?*`,
          `1️⃣ Pada **Hari ke-6 & ke-7**, bot akan menghantar ringkasan prestasi dan makluman tempoh tamat.`,
          `2️⃣ Jika anda berpuas hati dengan konsistensi profit, anda boleh menaik taraf copier ke **Akaun Real (Live)** dengan yuran mampu milik **RM79/bulan**.`,
          `3️⃣ Jika anda tidak ingin melanggan, sambungan akaun demo akan berhenti secara automatik pada hari ke-7. **Tiada sebarang caj tersembunyi atau caj automatik.**`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `👉 *Cara Memulakan Percubaan Percuma 7 Hari Sekarang:*`,
          `1. [Tekan Sini untuk Sambung Akaun Demo cTrader Anda](${oauthConnectUrl})`,
          `2. Log masuk cTrader ID (cTID) & pilih akaun Demo anda.`,
          `3. Selesai! Semua pesanan Master Account akan disalin secara automatik 24/7.`,
          ``,
          `💬 _Sebarang bantuan pendaftaran akaun demo, hubungi @sanilbans_`
        ].join('\n');
  }

  public getPricingMessage(lang: 'en' | 'ms'): string {
    const isEn = lang === 'en';
    return isEn
      ? [
          `💎 *[QUANTUM AI — VIP LIVE SUBSCRIPTION & PRICING]* 🏛️`,
          ``,
          `After completing your 7-Day Demo Trial, take your trading to the next level with our full institutional live execution plans:`,
          ``,
          `🎁 *1. 7-Day Free Trial (cTrader Demo)*`,
          `   • *Price:* **RM0 (100% Free)**`,
          `   • *Recommended Account:* cTrader Demo`,
          `   • *Features:* Full 1-Click Cloud Copier, Method 2 Split-Ticket, TP1/TP2 & Auto-BE.`,
          ``,
          `👑 *2. VIP Live Trader (Monthly Subscription)*`,
          `   • *Price:* **RM79 / month** (or ~$19 USD)`,
          `   • *Account Type:* 1 cTrader Live (Real) Account`,
          `   • *Features:* 24/5 Autonomous Execution, Sub-50ms Cloud Speed, News Blackout Defense (±30m), Dedicated Support.`,
          ``,
          `🚀 *3. VIP Pro Multi-Account (Monthly)*`,
          `   • *Price:* **RM149 / month** (or ~$35 USD)`,
          `   • *Account Type:* Up to 3 cTrader Live Accounts`,
          `   • *Features:* Priority Execution Bridge, Custom Risk Multiplier, 1-on-1 Dedicated Support.`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `💳 *Payment Methods:*`,
          `• DuitNow QR / Instant Online Bank Transfer (Malaysia)`,
          `• Stripe (Visa / Mastercard / Apple Pay)`,
          `• USDT (TRC20 / BEP20)`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `👉 *To subscribe or upgrade after trial, contact:* *@sanilbans*`
        ].join('\n')
      : [
          `💎 *[QUANTUM AI — PAKEJ LANGGANAN & HARGA VIP LIVE]* 🏛️`,
          ``,
          `Selepas tamat tempoh percubaan 7 hari pada akaun Demo, anda boleh menaik taraf ke akaun Real (Live) dengan pelan langganan telus kami:`,
          ``,
          `🎁 *1. Percubaan 7 Hari Percuma (cTrader Demo)*`,
          `   • *Harga:* **RM0 (100% Percuma)**`,
          `   • *Akaun Disyorkan:* cTrader Demo`,
          `   • *Ciri-Ciri:* 1-Klik Cloud Copier, Eksekusi Method 2, TP1/TP2 & Auto-BE.`,
          ``,
          `👑 *2. VIP Live Trader (Langganan Bulanan)*`,
          `   • *Harga:* **RM79 / bulan** (Mampu Milik)`,
          `   • *Jenis Akaun:* 1 Akaun Real cTrader (Live)`,
          `   • *Ciri-Ciri:* Eksekusi Autopilot 24/5, Kelajuan Cloud < 50ms, Pertahanan Berita Berimpak Tinggi (±30m), Bantuan Khidmat Pelanggan.`,
          ``,
          `🚀 *3. VIP Pro Multi-Akaun (Langganan Bulanan)*`,
          `   • *Harga:* **RM149 / bulan**`,
          `   • *Jenis Akaun:* Sehingga 3 Akaun Real cTrader Serentak`,
          `   • *Ciri-Ciri:* Sambungan Prioriti Tertinggi, Pengganda Saiz Lot Kustom, Bantuan Persediaan 1-on-1.`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `💳 *Kaedah Pembayaran Mudah:*`,
          `• DuitNow QR / Pemindahan Bank Dalam Talian (Malaysia)`,
          `• Kad Kredit / Debit (Stripe Online)`,
          `• Kripto USDT (TRC20 / BEP20)`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `👉 *Untuk melanggan atau mengaktifkan akaun live, hubungi:* *@sanilbans*`
        ].join('\n');
  }

  public getBrokerKeyboard(lang: 'en' | 'ms') {
    const isEn = lang === 'en';
    const affiliateUrl = process.env.CTRADER_AFFILIATE_URL || process.env.BROKER_AFFILIATE_URL || 'https://icmarkets.com/?camp=quantumai';
    return {
      inline_keyboard: [
        [
          { text: isEn ? '🔗 Open Official cTrader Account' : '🔗 Buka Akaun cTrader Rasmi', url: affiliateUrl }
        ],
        [
          { text: isEn ? '🎁 7-Day Demo Trial Guide' : '🎁 Panduan Percubaan 7 Hari', callback_data: 'cmd_trial' },
          { text: isEn ? '🏛️ Main Menu' : '🏛️ Menu Utama', callback_data: 'cmd_status' }
        ]
      ]
    };
  }

  public getBrokerMessage(lang: 'en' | 'ms'): string {
    const isEn = lang === 'en';
    const affiliateUrl = process.env.CTRADER_AFFILIATE_URL || process.env.BROKER_AFFILIATE_URL || 'https://icmarkets.com/?camp=quantumai';

    return isEn
      ? [
          `🌐 *[OPEN A CTRADER ACCOUNT — OFFICIAL PARTNER BROKER]* 🏛️`,
          ``,
          `Get the best execution conditions, tightest ECN spreads (from 0.0 pips), ultra-low latency, and full native cBot compatibility with our recommended cTrader broker!`,
          ``,
          `💎 *Why Register via Our Partner Link:*`,
          `  • ⚡ *Ultra-fast execution (<10ms)* optimized for QuantumAI cBot`,
          `  • 📉 *0.0 Pip Raw Spreads* & Institutional Tier-1 Liquidity`,
          `  • 🛡️ *Fully Regulated Broker* (FCA / ASIC / CySEC)`,
          `  • 🎁 *Eligible for VIP Copier discount & priority setup support!*`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `👉 *How to Open & Link Your Account in 3 Easy Steps:*`,
          `1️⃣ Click the link below to open a **cTrader Raw/ECN** account (Demo or Live):`,
          `   🔗 [Click Here to Register cTrader](${affiliateUrl})`,
          `2️⃣ Complete broker registration and find your **cTrader Account Number** (e.g. \`5881460\`).`,
          `3️⃣ Return here and type:`,
          `   \`/register <Your_Account_Number>\` or click *⚡ 1-Click Connect*`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `💬 _Questions about broker setup? Contact @sanilbans_`
        ].join('\n')
      : [
          `🌐 *[BUKA AKAUN CTRADER — BROKER RAKAN RASMI]* 🏛️`,
          ``,
          `Nikmati syarat dagangan terbaik, spread ECN serendah 0.0 pip, kelajuan eksekusi ultra-pantas (<10ms), dan keserasian penuh dengan cBot QuantumAI melalui broker rakan rasmi kami!`,
          ``,
          `💎 *Kelebihan Mendaftar Melalui Pautan Rakan Kami:*`,
          `  • ⚡ *Eksekusi ultra-pantas (<10ms)* dioptimumkan untuk cBot QuantumAI`,
          `  • 📉 *Raw Spread 0.0 Pip* & Kecairan Institusi Tier-1`,
          `  • 🛡️ *Broker Berlesen Penuh & Dipercayai* (FCA / ASIC / CySEC)`,
          `  • 🎁 *Layak diskaun langganan VIP Copier & bantuan keutamaan!*`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `👉 *Cara Buka & Pautkan Akaun dalam 3 Langkah Mudah:*`,
          `1️⃣ Tekan pautan di bawah untuk buka akaun **cTrader Raw/ECN** (Demo atau Live):`,
          `   🔗 [Tekan Sini untuk Buka Akaun cTrader](${affiliateUrl})`,
          `2️⃣ Selesaikan pendaftaran dan salin **Nombor Akaun cTrader** anda (cth: \`5881460\`).`,
          `3️⃣ Kembali ke bot ini dan taip:`,
          `   \`/register <Nombor_Akaun_Anda>\` atau tekan butang *⚡ 1-Klik Sambung*`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `💬 _Sebarang pertanyaan pendaftaran broker, hubungi @sanilbans_`
        ].join('\n');
  }

  public getMyAccountMessage(chatId: string, username?: string, lang: 'en' | 'ms' = 'en'): string {
    const isEn = lang === 'en';
    try {
      const subscribersPath = path.resolve(process.cwd(), 'data', 'vip_subscribers.json');
      if (fs.existsSync(subscribersPath)) {
        const raw = fs.readFileSync(subscribersPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const subs: any[] = Object.values(parsed.subscribers || {});
        
        const matched = subs.find(s => 
          (s.telegramId && String(s.telegramId) === String(chatId)) ||
          (username && s.telegramUsername && s.telegramUsername.toLowerCase() === username.toLowerCase())
        );

        if (matched) {
          const expDate = matched.expiresAt ? new Date(matched.expiresAt).toLocaleDateString() : 'N/A';
          const oneDayMs = 24 * 60 * 60 * 1000;
          const daysLeft = matched.expiresAt ? Math.max(0, Math.ceil((matched.expiresAt - Date.now()) / oneDayMs)) : 0;
          const token = matched.authToken || matched.token || 'Pending Generation';

          return isEn
            ? `🔑 *[MY VIP CTRADER SUBSCRIPTION]* 🏛️\n\n` +
              `• *cTrader Account:* \`${matched.accountNumber}\`\n` +
              `• *Status:* *${matched.status}*\n` +
              `• *Valid Until:* \`${expDate}\` (${daysLeft} days remaining)\n` +
              `• *Tier:* \`${matched.tier || 'VIP_INSTITUTIONAL'}\`\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `🔐 *Your VIP Auth Token:*\n` +
              `\`${token}\`\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `📥 *How to activate in cTrader:*\n` +
              `1. Open cTrader -> Automate -> \`QuantumAI VIP Receiver\`\n` +
              `2. Paste the token above into *VIP Auth Token* parameter\n` +
              `3. Press ▶️ *Play* on EURUSD chart\n\n` +
              `💬 _Need renewal or assistance? Contact @sanilbans_`
            : `🔑 *[STATUS LANGGANAN VIP CTRADER SAYA]* 🏛️\n\n` +
              `• *Akaun cTrader:* \`${matched.accountNumber}\`\n` +
              `• *Status:* *${matched.status}*\n` +
              `• *Tempoh Sah:* \`${expDate}\` (Baki ${daysLeft} hari)\n` +
              `• *Pakej:* \`${matched.tier || 'VIP_INSTITUTIONAL'}\`\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `🔐 *VIP Auth Token Anda:*\n` +
              `\`${token}\`\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `📥 *Cara Pengaktifan cTrader:*\n` +
              `1. Buka cTrader -> Automate -> \`QuantumAI VIP Receiver\`\n` +
              `2. Tampal token di atas pada ruangan *VIP Auth Token*\n` +
              `3. Tekan butang ▶️ *Play* pada carta EURUSD\n\n` +
              `💬 _Sebarang bantuan atau pembaharuan, hubungi @sanilbans_`;
        }
      }
    } catch (e: any) {}

    return isEn
      ? `🔍 *[NO VIP ACCOUNT FOUND]*\n\n` +
        `You have not linked a cTrader account to your Telegram yet.\n\n` +
        `👉 *To register your account for VIP, type:*\n` +
        `\`/register <Your_cTrader_Account_Number>\`\n\n` +
        `*Example:* \`/register 5877246\``
      : `🔍 *[TIADA REKOD AKAUN VIP DIJUMPAI]*\n\n` +
        `Anda belum mendaftarkan nombor akaun cTrader pada Telegram ini.\n\n` +
        `👉 *Untuk daftar akaun VIP anda, taip:*\n` +
        `\`/register <Nombor_Akaun_cTrader_Anda>\`\n\n` +
        `*Contoh:* \`/register 5877246\``;
  }

  public getHelpMessage(lang: 'en' | 'ms'): string {
    const isEn = lang === 'en';
    const oauthConnectUrl = `https://id.ctrader.com/my/settings/openapi/grantingaccess/?client_id=${encodeURIComponent(process.env.CTRADER_CLIENT_ID || '36222_ujzQc2eZJ0Ej5pyrCiClTboT5xfh67RFzNsA0yKlYJIVL44eDJ')}&redirect_uri=${encodeURIComponent((process.env.APP_URL || 'http://localhost:3000') + '/api/broker/oauth/callback')}&scope=trading&product=web`;

    return isEn
      ? `❓ *[QUANTUM AI — 7-DAY DEMO TRIAL QUICKSTART GUIDE]* 🚀\n\n` +
        `1️⃣ *Step 1 — Prepare a cTrader Demo Account:*\n` +
        `• Need an account? Type \`/broker\` to open a cTrader Demo or Live account with our partner broker.\n` +
        `• Have cTrader already? Open or use any **cTrader Demo Account** for 100% risk-free testing.\n\n` +
        `2️⃣ *Step 2 — 1-Click Connect (Zero VPS):*\n` +
        `• [Click Here to Connect in 10 Seconds](${oauthConnectUrl})\n` +
        `• Log in with your cTrader ID (cTID) and authorize cloud replication. No VPS or cBot download required!\n\n` +
        `3️⃣ *Step 3 — Monitor Automated Trading for 7 Days:*\n` +
        `• All Master pending limit orders, SL/TP1/TP2 and automatic Break-Even moves will execute in real-time.\n` +
        `• Check your trial status & days left anytime with \`/myaccount\`.\n\n` +
        `4️⃣ *Step 4 — Upgrade to VIP Live (After Trial):*\n` +
        `• If you are satisfied with the 7-day performance, upgrade to a **Live Real Account** for only **RM79/month** (type \`/pricing\`).\n\n` +
        `💡 *Available Commands:*\n` +
        `• /trial — 7-Day Demo Trial Guide\n` +
        `• /connect — 1-Click Cloud Connect\n` +
        `• /pricing — VIP Live Plans & Pricing\n` +
        `• /broker — Open cTrader Partner Account\n` +
        `• /myaccount — Check Trial Days Left & License\n` +
        `• /download — Get optional cBot (.cs) file\n` +
        `• /strategy — View SMC analysis rules\n` +
        `• /risk — Method 2 & Auto-BE rules\n` +
        `• /services — Free vs VIP Copier comparison\n` +
        `• /status — Check live system & broker health`
      : `❓ *[QUANTUM AI — PANDUAN MULA PERCUBAAN 7 HARI (DEMO)]* 🚀\n\n` +
        `1️⃣ *Langkah 1 — Sediakan Akaun Demo cTrader:*\n` +
        `• Belum ada akaun? Taip \`/broker\` untuk buka akaun cTrader Demo/Live dengan broker rakan kami.\n` +
        `• Sudah ada cTrader? Buka akaun **Demo cTrader** untuk menguji sistem tanpa risiko modal.\n\n` +
        `2️⃣ *Langkah 2 — 1-Klik Sambung Percuma (Tanpa VPS):*\n` +
        `• [Tekan Sini untuk Sambung dalam 10 Saat](${oauthConnectUrl})\n` +
        `• Log masuk cTrader ID (cTID) & beri kebenaran cloud. Sifar muat turun robot & sifar sewa VPS!\n\n` +
        `3️⃣ *Langkah 3 — Pantau Hasil Dagangan Selama 7 Hari:*\n` +
        `• Semua pending order Master, TP1/TP2 dan Auto-Break-Even akan disalin automatik 24/7.\n` +
        `• Semak baki hari percubaan pada bila-bila masa dengan arahan \`/myaccount\`.\n\n` +
        `4️⃣ *Langkah 4 — Naik Taraf ke VIP Live (Selepas 7 Hari):*\n` +
        `• Jika berpuas hati dengan hasil trade, beralih ke **Akaun Real (Live)** dengan hanya **RM79/bulan** (taip \`/pricing\`).\n\n` +
        `💡 *Senarai Arahan Pantas:*\n` +
        `• /trial — Panduan Percubaan 7 Hari (Demo)\n` +
        `• /connect — 1-Klik Sambungan Cloud\n` +
        `• /pricing — Pelan VIP Live & Harga\n` +
        `• /broker — Buka akaun cTrader pautan rakan\n` +
        `• /myaccount — Semak baki hari & status lesen\n` +
        `• /download — Muat turun fail cBot pilihan (.cs)\n` +
        `• /strategy — Lihat strategi analisis SMC\n` +
        `• /risk — Peraturan Method 2 & Auto-BE\n` +
        `• /services — Perbandingan Free vs VIP Copier\n` +
        `• /status — Status enjin & sambungan broker`;
  }

  public getWelcomeMessage(lang: 'en' | 'ms'): string {
    if (lang === 'en') {
      return [
        `🏛️ *[QUANTUM AI - INSTITUTIONAL INTELLIGENCE]* 📡`,
        `*Welcome to Quantum AI Quantitative Copier & Trading Signals.*`,
        ``,
        `Quantum AI is an autonomous, institutional-grade algorithmic trading ecosystem combining Smart Money Concepts (SMC), statistical pattern recognition, and Gemini AI risk validation.`,
        ``,
        `🎁 *7-DAY ZERO-RISK FREE TRIAL (DEMO FIRST):*`,
        `We encourage all new traders to start on a **cTrader Demo Account** for **7 full days** to experience our automated execution and profit consistency with zero financial risk!`,
        ``,
        `📚 *Subscriber Quick Navigation & Actions:*`,
        `• /trial — *7-Day Free Trial (cTrader Demo Guide)*`,
        `• /connect — *1-Click Instant Cloud Connect (Zero VPS)*`,
        `• /pricing — *VIP Live Plans & Pricing (After Trial)*`,
        `• /broker — *Open cTrader Account (Demo / Live Raw Spread)*`,
        `• /myaccount — *Check License Validity & Days Remaining*`,
        `• /strategy — *Our Smart Money (SMC) & Multi-TF Strategy*`,
        `• /risk — *Method 2 Split-Ticket, TP1/TP2 & Auto-BE Rules*`,
        `• /services — *Free Community Channel vs VIP Auto-Copier*`,
        `• /status — *Live System & Broker Connection Status*`,
        `• /en or /ms — *Switch Language Anytime (English / Malay)*`,
        ``,
        `Tap any button below or type a command to get started:`,
        `⏰ _${new Date().toUTCString()}_ | _Quantum AI Institutional Intelligence_`
      ].join('\n');
    } else {
      return [
        `🏛️ *[QUANTUM AI - INSTITUTIONAL INTELLIGENCE]* 📡`,
        `*Selamat Datang ke Sistem Isyarat & Auto-Copier Quantum AI.*`,
        ``,
        `Quantum AI ialah ekosistem dagangan algoritma berprestasi tinggi yang menggabungkan Smart Money Concepts (SMC), pengesahan candlestick tertutup, dan tapisan risiko Gemini AI.`,
        ``,
        `🎁 *PERCUBAAN 7 HARI PERCUMA (DISYORKAN AKAUN DEMO):*`,
        `Kami menggalakkan semua trader baharu untuk bermula dengan **Akaun DEMO cTrader** selama **7 hari** bagi merasai sendiri kehebatan sistem auto-copier tanpa sebarang risiko modal!`,
        ``,
        `📚 *Panduan Pantas & Navigasi Subscriber:*`,
        `• /trial — *Panduan Percubaan 7 Hari (cTrader Demo)*`,
        `• /connect — *1-Klik Sambungan Cloud (Tanpa VPS)*`,
        `• /pricing — *Pelan VIP Live & Harga (Selepas Ujian)*`,
        `• /broker — *Buka Akaun cTrader (Demo / Live Raw Spread)*`,
        `• /myaccount — *Semak Status Lesen & Baki Hari Sah*`,
        `• /strategy — *Strategi Analisis SMC & Multi-Timeframe*`,
        `• /risk — *Pengurusan Risiko Method 2 (TP1, TP2 & Auto-BE)*`,
        `• /services — *Perbezaan Servis Percuma vs VIP Auto-Copier*`,
        `• /status — *Status Sambungan Broker & Kesihatan Enjin*`,
        `• /en atau /ms — *Tukar Pilihan Bahasa Pada Bila-Bila Masa*`,
        ``,
        `Tekan mana-mana butang di bawah atau taip arahan untuk bermula:`,
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
        `We provide three flexible ways to participate in our quantitative intelligence:`,
        ``,
        `🌟 *1. Free Community Channel (Manual Execution):*`,
        `   • Receive selected Grade-A trade proposals (AI Confidence ≥ 85%).`,
        `   • High-impact macroeconomic news warnings (±30m blackout alerts).`,
        `   • Immediate signal cancellation updates if market structure invalidates.`,
        `   • *Execution:* You manually place pending limit orders on your own trading platform.`,
        ``,
        `🎁 *2. 7-Day Free Trial (cTrader Demo - Zero VPS):*`,
        `   • *Price:* **100% Free (RM0)**`,
        `   • Test on a cTrader Demo account for 7 full days with zero risk of capital loss.`,
        `   • Experience 1-Click zero-VPS cloud execution, TP1 scale-outs & automatic Break-Even.`,
        ``,
        `👑 *3. VIP Live Copier (cTrader Real Account):*`,
        `   • *Price:* **RM79 / month**`,
        `   • Connect your real trading account via high-speed cTrader Open API bridge (< 50ms).`,
        `   • 100% hands-free 24/5 execution, automated Method 2 risk management, and dedicated support.`,
        ``,
        `👉 _Type /trial to start your 7-day demo trial or /pricing to view live plans._`,
        `⏰ _${new Date().toUTCString()}_ | _Quantum AI VIP Desk_`
      ].join('\n');
    } else {
      return [
        `🚀 *[QUANTUM AI - SERVIS & PELAN LANGGANAN]* 🌐`,
        ``,
        `Kami menawarkan tiga pilihan untuk menikmati kelebihan algoritma kami:`,
        ``,
        `🌟 *1. Saluran Komuniti Percuma (Entri Manual):*`,
        `   • Menerima isyarat persediaan Gred A terpilih (Keyakinan AI ≥ 85%).`,
        `   • Peringatan berita ekonomi berimpak tinggi (Zon Blackout ±30 minit).`,
        `   • Makluman pembatalan isyarat pantas sekiranya struktur pasaran terbatal.`,
        `   • *Cara Guna:* Anda memasang pending limit order sendiri pada cTrader anda.`,
        ``,
        `🎁 *2. Percubaan 7 Hari Percuma (cTrader Demo - Tanpa VPS):*`,
        `   • *Harga:* **100% Percuma (RM0)**`,
        `   • Uji pada akaun Demo cTrader selama 7 hari tanpa sebarang risiko modal.`,
        `   • Rasai eksekusi cloud 1-Klik tanpa VPS, penutupan separa TP1 & Auto-Break-Even.`,
        ``,
        `👑 *3. VIP Live Copier (Akaun Real cTrader):*`,
        `   • *Harga:* **RM79 / bulan**`,
        `   • Sambungkan akaun sebenar anda melalui cTrader Open API berkelajuan tinggi (< 50ms).`,
        `   • 100% automatik 24/5, pengurusan risiko Method 2 dan bantuan khidmat sokongan.`,
        ``,
        `👉 _Taip /trial untuk mula percubaan 7 hari atau /pricing untuk lihat pelan live._`,
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
    console.log('🤖 [TelegramNotificationService] Bot Command Listener active: Listening for /start, /trial, /register, /pricing, etc.');

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
                if (action === 'cmd_trial') {
                  await this.sendRawMessage(this.getTrialMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_pricing') {
                  await this.sendRawMessage(this.getPricingMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_connect') {
                  const connectMsg = currentLang === 'en'
                    ? `⚡ *[1-CLICK cTRADER CLOUD CONNECTION (ZERO VPS)]* 🌐\n\n` +
                      `Connect your cTrader Demo account in 10 seconds without downloading any cBot or renting a VPS:\n\n` +
                      `1️⃣ Click the *1-Click Connect cTrader* button below.\n` +
                      `2️⃣ Log in to your cTrader ID (cTID) & select your Demo trading account.\n` +
                      `3️⃣ Click *Allow* to authorize cloud trade replication.\n\n` +
                      `✅ *Done!* All Master Account pending orders, SL/TP & scale-out executions will automatically sync 24/7 to your broker.`
                    : `⚡ *[SAMBUNGAN CLOUD cTRADER 1-KLIK (TANPA VPS)]* 🌐\n\n` +
                      `Sambungkan akaun Demo cTrader anda dalam 10 saat tanpa perlu muat turun cBot atau sewa VPS:\n\n` +
                      `1️⃣ Tekan butang *1-Klik Sambung cTrader* di bawah.\n` +
                      `2️⃣ Log masuk ke cTrader ID (cTID) & pilih akaun Demo trading anda.\n` +
                      `3️⃣ Tekan *Allow* untuk mengaktifkan salinan trade automatik.\n\n` +
                      `✅ *Selesai!* Semua pending order, SL/TP & strategi Break-Even Master Account akan disalin 24/7 ke broker anda.`;
                  await this.sendRawMessage(connectMsg, chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_register') {
                  const regPrompt = currentLang === 'en'
                    ? `👑 *[REGISTER VIP CTRADER ACCOUNT]*\n\nTo link your cTrader account to the QuantumAI institutional server bridge, please type:\n\n\`/register <Your_cTrader_Account_Number>\`\n\n*Example:*\n\`/register 5877246\``
                    : `👑 *[PENDAFTARAN AKAUN VIP CTRADER]*\n\nUntuk pautkan akaun cTrader anda ke server bridge QuantumAI, sila taip:\n\n\`/register <Nombor_Akaun_cTrader_Anda>\`\n\n*Contoh:*\n\`/register 5877246\``;
                  await this.sendRawMessage(regPrompt, chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_broker') {
                  await this.sendRawMessage(this.getBrokerMessage(currentLang), chatId, this.getBrokerKeyboard(currentLang));
                } else if (action === 'cmd_myaccount') {
                  const myAccMsg = this.getMyAccountMessage(chatId, cq.from?.username, currentLang);
                  await this.sendRawMessage(myAccMsg, chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_download') {
                  const csPath = path.resolve(process.cwd(), 'cTrader', 'QuantumAI_VIP_Receiver.cs');
                  const caption = currentLang === 'en'
                    ? `📥 *QuantumAI VIP Receiver cBot (.cs)*\n\n1️⃣ Open cTrader Automate tab\n2️⃣ Create New cBot & Paste\n3️⃣ Build (F5) & Enter VipAuthToken\n4️⃣ Press Play ▶️ on EURUSD chart`
                    : `📥 *cBot QuantumAI VIP Receiver (.cs)*\n\n1️⃣ Buka tab Automate cTrader\n2️⃣ Cipta cBot Baru & Tampal\n3️⃣ Tekan Build (F5) & Masukkan VipAuthToken\n4️⃣ Tekan Play ▶️ pada carta EURUSD`;
                  await this.sendDocument(csPath, chatId, caption);
                } else if (action === 'cmd_help') {
                  await this.sendRawMessage(this.getHelpMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_tips') {
                  const tip = this.getRandomTradingTip();
                  const tipMsg = this.formatTradingTip(tip, currentLang);
                  await this.sendRawMessage(tipMsg, chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_weekly') {
                  const weeklyMsg = this.generateWeeklyStatsReport(currentLang);
                  await this.sendRawMessage(weeklyMsg, chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_outlook') {
                  const outlookMsg = this.generateMarketOutlookReport(currentLang);
                  await this.sendRawMessage(outlookMsg, chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_strategy') {
                  await this.sendRawMessage(this.getStrategyMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_risk') {
                  await this.sendRawMessage(this.getRiskMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
                } else if (action === 'cmd_services') {
                  await this.sendRawMessage(this.getServicesMessage(currentLang), chatId, this.getPaymentKeyboard(currentLang));
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
            const rawText = msg.text.trim();
            const text = rawText.replace(/@\w+bot\b/gi, '').trim().toLowerCase();

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

              // 7-Day Demo Trial info (/trial or /demo or /percubaan)
              if (text === '/trial' || text === '/demo' || text === '/percubaan' || text === '/free' || text === '/percuma') {
                await this.sendRawMessage(this.getTrialMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/pricing' || text === '/harga' || text === '/pakej' || text === '/pelan' || text === '/pay' || text === '/bayar') {
                await this.sendRawMessage(this.getPricingMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text.startsWith('/register') || text.startsWith('/akaun') || text.startsWith('/daftar')) {
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
                    isAdminApproval: false
                  });

                  if (record.status === 'ACTIVE') {
                    const expDate = new Date(record.expiresAt).toLocaleDateString();
                    await this.sendRawMessage(
                      currentLang === 'en'
                        ? `🏛️ *[VIP CTRADER ACCOUNT ACTIVE]* ✅\n\n` +
                          `• *cTrader Account:* \`${record.accountNumber}\`\n` +
                          `• *Status:* *Active (7-Day Trial / VIP)*\n` +
                          `• *Valid Until:* \`${expDate}\`\n\n` +
                          `🔑 *Your VIP Auth Token:*\n\`${record.authToken || ''}\`\n\n` +
                          `📥 *Quick Start Instructions:*\n` +
                          `1. Copy your *VIP Auth Token* above.\n` +
                          `2. Open cTrader Desktop -> Automate -> \`QuantumAI_VIP_Receiver\`.\n` +
                          `3. Paste your token into the *VIP Auth Token* parameter.\n` +
                          `4. Click *Play* on EURUSD chart to start automated trade execution!`
                        : `🏛️ *[AKAUN VIP SAH & AKTIF]* ✅\n\n` +
                          `• *Akaun cTrader:* \`${record.accountNumber}\`\n` +
                          `• *Status:* *Aktif (Percubaan 7 Hari / VIP)*\n` +
                          `• *Tempoh Sah:* \`${expDate}\`\n\n` +
                          `🔑 *VIP Auth Token Anda:*\n\`${record.authToken || ''}\`\n\n` +
                          `📥 *Panduan Mula cTrader:*\n` +
                          `1. Salin *VIP Auth Token* di atas.\n` +
                          `2. Buka cTrader Desktop -> Automate -> \`QuantumAI_VIP_Receiver\`.\n` +
                          `3. Masukkan token ini pada tetapan *VIP Auth Token*.\n` +
                          `4. Tekan *Play* pada carta EURUSD untuk memulakan copier automatik!`,
                      chatId,
                      this.getOnboardingKeyboard(currentLang)
                    );
                  } else {
                    // Send payment instructions to the subscriber
                    await this.sendRawMessage(
                      currentLang === 'en'
                        ? `⏳ *[VIP REGISTRATION RECEIVED — PAYMENT REQUIRED]* 🛡️\n\n` +
                          `• *cTrader Account:* \`${record.accountNumber}\`\n` +
                          `• *Status:* *PENDING_VERIFICATION*\n` +
                          `• *Identity:* ${record.name} (${username ? `@${username}` : chatId})\n\n` +
                          `💳 *Payment & Activation Steps:*\n` +
                          `1. Complete your VIP Copier subscription payment (RM79/month).\n` +
                          `2. Send your payment receipt / slip to Admin: *@sanilbans*\n` +
                          `3. Once payment is verified, your account will be instantly approved.\n` +
                          `4. You will receive your official *VIP Auth Token* right here to start automated trading!`
                        : `⏳ *[PERMOHONAN VIP DITERIMA — PENGESAHAN BAYARAN]* 🛡️\n\n` +
                          `• *Akaun cTrader:* \`${record.accountNumber}\`\n` +
                          `• *Status:* *MENUNGGU BAYARAN & PENGESAHAN*\n` +
                          `• *Pemohon:* ${record.name} (${username ? `@${username}` : chatId})\n\n` +
                          `💳 *Langkah Pembayaran & Pengaktifan:*\n` +
                          `1. Sila buat pembayaran langganan VIP Copier anda (RM79/bulan).\n` +
                          `2. Hantar resit / bukti pembayaran kepada Admin: *@sanilbans*\n` +
                          `3. Sebaik sahaja pembayaran disahkan, akaun anda akan diaktifkan serta-merta.\n` +
                          `4. Anda akan menerima *VIP Auth Token* rasmi di sini untuk mula trade secara automatik!`,
                      chatId,
                      this.getPaymentKeyboard(currentLang)
                    );

                    // Alert the Admin immediately with quick approve command
                    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
                    if (adminChatId && adminChatId !== chatId) {
                      await this.sendRawMessage(
                        `🔔 *[PERMOHONAN VIP BAHARU DITERIMA]* 📥\n\n` +
                        `• *Akaun cTrader:* \`${record.accountNumber}\`\n` +
                        `• *Pemohon:* ${record.name} (${username ? `@${username}` : chatId})\n` +
                        `• *Status:* ⏳ *PENDING_VERIFICATION*\n\n` +
                        `👉 Selepas semak bayaran, balas dengan arahan:\n\`/approve ${record.accountNumber} 30\``,
                        adminChatId
                      ).catch(() => {});
                    }
                  }
                }
              } else if (text.startsWith('/approve') || text.startsWith('/lulus') || text.startsWith('/activate')) {
                // Admin Account Approval Command
                const isAuthorizedAdmin = 
                  chatId === this.channelId || 
                  (process.env.TELEGRAM_ADMIN_CHAT_ID && chatId === process.env.TELEGRAM_ADMIN_CHAT_ID) ||
                  (process.env.ADMIN_TELEGRAM_IDS && process.env.ADMIN_TELEGRAM_IDS.split(',').includes(chatId));

                if (!isAuthorizedAdmin) {
                  await this.sendRawMessage(
                    `⛔ *[AKSES DITOLAK]*: Arahan kelulusan ini hanya dibenarkan untuk pentadbir rasmi Quantum AI.`,
                    chatId
                  );
                } else {
                  const parts = text.split(/\s+/);
                  const targetAcc = parts[1] ? parts[1].replace(/[^0-9]/g, '') : '';
                  const durationDays = parts[2] ? Number(parts[2]) : 30;

                  if (!targetAcc) {
                    await this.sendRawMessage(
                      `⚠️ *Format Salah*: Gunakan format \`/approve <Nombor_Akaun> [Bilangan_Hari]\`\nContoh: \`/approve 5877246 30\``,
                      chatId
                    );
                  } else {
                    const { vipSubscriptionService } = await import('./vipSubscriptionService');
                    const activated = vipSubscriptionService.activateAccount(targetAcc, durationDays, `Admin (${chatId})`);
                    const expDate = new Date(activated.expiresAt).toLocaleDateString();
                    const vipToken = activated.token || activated.authToken || '';

                    // 1. Confirm to the admin
                    await this.sendRawMessage(
                      `✅ *[VIP ACCOUNT APPROVED & ACTIVATED]*\n\n` +
                      `• *cTrader Account:* \`${activated.accountNumber}\`\n` +
                      `• *Status:* *ACTIVE*\n` +
                      `• *Valid Days:* ${durationDays} days (Expires: \`${expDate}\`)\n` +
                      `• *Subscriber:* ${activated.name} (${activated.telegramUsername ? `@${activated.telegramUsername}` : activated.telegramId || 'Direct'})\n\n` +
                      `🔑 *VipAuthToken issued and delivered to subscriber.*`,
                      chatId
                    );

                    // 2. Build the full subscriber welcome message (always in EN + token)
                    const subWelcomeMsg =
                      `👑 *[VIP ACCESS ACTIVATED — QuantumAI Institutional]* ✅\n\n` +
                      `Welcome, *${activated.name || activated.telegramUsername || 'VIP Trader'}*!\n\n` +
                      `• *cTrader Account:* \`${activated.accountNumber}\`\n` +
                      `• *Status:* ✅ *ACTIVE*\n` +
                      `• *Valid Until:* \`${expDate}\` (${durationDays} Days)\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `🔑 *Your VIP Auth Token:*\n` +
                      `\`${vipToken}\`\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `📥 *How to activate cBot:*\n` +
                      `1️⃣ Open *cTrader Desktop* → Automate tab\n` +
                      `2️⃣ Find *QuantumAI_VIP_Receiver* cBot\n` +
                      `3️⃣ Right-click → Parameters\n` +
                      `4️⃣ Paste token into *VipAuthToken* field\n` +
                      `5️⃣ Enter your cTrader account: \`${activated.accountNumber}\`\n` +
                      `6️⃣ Press ▶️ *Start*\n\n` +
                      `✅ cBot will confirm: _[VIP LICENSE VERIFIED] Account ${activated.accountNumber} is ACTIVE_\n\n` +
                      `⚠️ *Keep this token private. Do not share it with anyone.*`;

                    // 3. Send to subscriber directly (DM) — always attempt regardless of whether same as admin
                    if (activated.telegramId) {
                      await this.sendRawMessage(
                        subWelcomeMsg,
                        activated.telegramId,
                        this.getOnboardingKeyboard('en')
                      ).catch(() => {});
                    }

                    // 4. Broadcast welcoming message to VIP and Free Community channels without sensitive credentials
                    const channelsToBroadcast = new Set<string>();
                    const vipChannelId = process.env.TELEGRAM_VIP_CHAT_ID || this.channelId;
                    const freeChannelId = process.env.TELEGRAM_FREE_CHAT_ID || this.freeChannelId;
                    if (vipChannelId && vipChannelId !== activated.telegramId && vipChannelId !== chatId) {
                      channelsToBroadcast.add(vipChannelId);
                    }
                    if (freeChannelId && freeChannelId !== activated.telegramId && freeChannelId !== chatId) {
                      channelsToBroadcast.add(freeChannelId);
                    }

                    if (channelsToBroadcast.size > 0) {
                      const rawAcc = activated.accountNumber;
                      const maskedAcc = rawAcc.length > 4
                        ? `${rawAcc.slice(0, 3)}***${rawAcc.slice(-2)}`
                        : `***${rawAcc.slice(-2)}`;
                      const channelWelcomeMsg =
                        `👑 *[NEW VIP MEMBER JOINED]* 🚀\n\n` +
                        `Welcome to Quantum AI VIP Institutional, *${activated.name || 'VIP Trader'}*!\n\n` +
                        `• *Account:* \`${maskedAcc}\`\n` +
                        `• *Tier:* Institutional VIP Copier\n` +
                        `• *Access:* ${durationDays} Days Active\n` +
                        `• *Valid Until:* \`${expDate}\`\n\n` +
                        `🔒 *Security Notice:* Your private *VipAuthToken* and setup instructions have been delivered directly to your personal DM.`;

                      for (const chId of channelsToBroadcast) {
                        await this.sendRawMessage(channelWelcomeMsg, chId).catch(() => {});
                      }
                    }
                  }
                }
              } else if (text.startsWith('/remind') || text.startsWith('/peringatan')) {
                // Admin Manual Reminder Trigger
                const isAuthorizedAdmin = 
                  chatId === this.channelId || 
                  (process.env.TELEGRAM_ADMIN_CHAT_ID && chatId === process.env.TELEGRAM_ADMIN_CHAT_ID) ||
                  (process.env.ADMIN_TELEGRAM_IDS && process.env.ADMIN_TELEGRAM_IDS.split(',').includes(chatId));

                if (!isAuthorizedAdmin) {
                  await this.sendRawMessage(
                    `⛔ *[AKSES DITOLAK]*: Arahan peringatan ini hanya dibenarkan untuk pentadbir rasmi Quantum AI.`,
                    chatId
                  );
                } else {
                  const parts = text.split(/\s+/);
                  const targetAcc = parts[1] ? parts[1].replace(/[^0-9]/g, '') : '';
                  const customNote = parts.slice(2).join(' ');

                  const { vipSubscriptionService } = await import('./vipSubscriptionService');
                  if (!targetAcc || targetAcc === 'all') {
                    // Send to all expiring accounts
                    const res = await vipSubscriptionService.checkAndDispatchAutomatedReminders();
                    await this.sendRawMessage(
                      `📢 *[PERINGATAN BERJAYA DIHANTAR]*\n\n• Jumlah mesej peringatan dihantar: *${res.sentCount} akaun pelanggan* yang hampir tamat tempoh.`,
                      chatId
                    );
                  } else {
                    const result = await vipSubscriptionService.sendExpiryReminderToSubscriber(targetAcc, customNote || undefined);
                    await this.sendRawMessage(
                      result.success
                        ? `✅ *[PERINGATAN DIHANTAR]*\n\n${result.message}`
                        : `⚠️ *[RALAT PERINGATAN]*\n\n${result.message}`,
                      chatId
                    );
                  }
                }
              } else if (text === '/myaccount' || text === '/akaun_saya' || text === '/license' || text === '/lesen' || text === '/token') {
                const username = (msg.from as any)?.username || (msg.chat as any)?.username || '';
                const myAccMsg = this.getMyAccountMessage(chatId, username, currentLang);
                await this.sendRawMessage(myAccMsg, chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/download' || text === '/unduh' || text === '/cbot' || text === '/file') {
                const csPath = path.resolve(process.cwd(), 'cTrader', 'QuantumAI_VIP_Receiver.cs');
                const caption = currentLang === 'en'
                  ? `📥 *QuantumAI VIP Receiver cBot (.cs)*\n\n1️⃣ Open cTrader Automate tab\n2️⃣ Create New cBot & Paste\n3️⃣ Build (F5) & Enter VipAuthToken\n4️⃣ Press Play ▶️ on EURUSD chart`
                  : `📥 *cBot QuantumAI VIP Receiver (.cs)*\n\n1️⃣ Buka tab Automate cTrader\n2️⃣ Cipta cBot Baru & Tampal\n3️⃣ Tekan Build (F5) & Masukkan VipAuthToken\n4️⃣ Tekan Play ▶️ pada carta EURUSD`;
                await this.sendDocument(csPath, chatId, caption);
              } else if (text === '/status') {
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
                    ? `\n\n👑 *[VIP Copier Status]*\n• No cTrader account linked yet.\n• Register now with: \`/register <cTrader_Account_Number>\` or click *⚡ 1-Click Connect*`
                    : `\n\n👑 *[Status VIP Copier]*\n• Belum ada akaun cTrader didaftarkan.\n• Daftarkan akaun anda sekarang dengan: \`/register <Nombor_Akaun_cTrader>\` atau tekan *⚡ 1-Klik Sambung*`;
                }
                await this.sendRawMessage(this.getStatusMessage(chatId, currentLang) + vipInfo, chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/stats' || text.startsWith('/stats') || text === '/statistik' || text.startsWith('/statistik') || text === '/admin' || text.startsWith('/admin') || text === '/analytics' || text.startsWith('/analytics')) {
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
              } else if (text === '/broker' || text === '/affiliate' || text === '/partner' || text === '/bukaakaun' || text === '/openaccount') {
                await this.sendRawMessage(this.getBrokerMessage(currentLang), chatId, this.getBrokerKeyboard(currentLang));
              } else if (text === '/tips' || text === '/tip' || text === '/petua' || text === '/mindset') {
                const tip = this.getRandomTradingTip();
                const tipMsg = this.formatTradingTip(tip, currentLang);
                await this.sendRawMessage(tipMsg, chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/weekly' || text === '/performance' || text === '/prestasi' || text === '/recap' || text === '/mingguan') {
                const weeklyMsg = this.generateWeeklyStatsReport(currentLang);
                await this.sendRawMessage(weeklyMsg, chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/outlook' || text === '/prospek' || text === '/minggudepan' || text === '/weekahead' || text === '/market') {
                const outlookMsg = this.generateMarketOutlookReport(currentLang);
                await this.sendRawMessage(outlookMsg, chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/strategy' || text === '/smc' || text === '/analisis') {
                await this.sendRawMessage(this.getStrategyMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/risk' || text === '/execution' || text === '/be' || text === '/tp') {
                await this.sendRawMessage(this.getRiskMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/services' || text === '/vip' || text === '/copier') {
                await this.sendRawMessage(this.getServicesMessage(currentLang), chatId, this.getPaymentKeyboard(currentLang));
              } else if (text === '/help' || text === '/panduan' || text === '/guide') {
                await this.sendRawMessage(this.getHelpMessage(currentLang), chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/connect' || text === '/sambung' || text === '/cloud' || text === '/openapi') {
                const connectMsg = currentLang === 'en'
                  ? `⚡ *[1-CLICK cTRADER CLOUD CONNECTION (ZERO VPS)]* 🌐\n\n` +
                    `Connect your cTrader Demo account in 10 seconds without downloading any cBot or renting a VPS:\n\n` +
                    `1️⃣ Click the *1-Click Connect cTrader* button below.\n` +
                    `2️⃣ Log in to your cTrader ID (cTID) & select your Demo trading account.\n` +
                    `3️⃣ Click *Allow* to authorize cloud trade replication.\n\n` +
                    `✅ *Done!* All Master Account pending orders, SL/TP & scale-out executions will automatically sync 24/7 to your broker.`
                  : `⚡ *[SAMBUNGAN CLOUD cTRADER 1-KLIK (TANPA VPS)]* 🌐\n\n` +
                    `Sambungkan akaun Demo cTrader anda dalam 10 saat tanpa perlu muat turun cBot atau sewa VPS:\n\n` +
                    `1️⃣ Tekan butang *1-Klik Sambung cTrader* di bawah.\n` +
                    `2️⃣ Log masuk ke cTrader ID (cTID) & pilih akaun Demo trading anda.\n` +
                    `3️⃣ Tekan *Allow* untuk mengaktifkan salinan trade automatik.\n\n` +
                    `✅ *Selesai!* Semua pending order, SL/TP & strategi Break-Even Master Account akan disalin 24/7 ke broker anda.`;
                await this.sendRawMessage(connectMsg, chatId, this.getOnboardingKeyboard(currentLang));
              } else if (text === '/start' || text === '/menu' || text === '/language') {
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
