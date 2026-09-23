import { EventEmitter } from 'events';
import { CTraderTransport } from '../../integrations/ctrader/ctraderTransport';
import { CandleData, CurrencyPair } from '../../types';
import { fetchRealCandleHistory } from '../../lib/marketDataGenerator';

export type MarketDataHealthState = 'HEALTHY' | 'DEGRADED' | 'STALE' | 'DISCONNECTED';
export type ConnectionState = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'RECONNECTING';

export interface SymbolHealthReport {
  symbol: CurrencyPair;
  state: MarketDataHealthState;
  lastSpotEventAt: number | null;
  ageMs: number | null;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  ticksReceived: number;
  candlesCompleted: number;
}

export interface MarketDataHealthReport {
  overallState: MarketDataHealthState;
  connectionState: ConnectionState;
  staleThresholdMs: number;
  lastTransportActivityAt: number | null;
  symbols: Record<string, SymbolHealthReport>;
  reconnect: {
    attempts: number;
    lastAttemptAt: number | null;
    lastSuccessAt: number | null;
  };
  timestamp: number;
}

export interface SpotFeedStatus {
  connected: boolean;
  subscribedSymbols: string[];
  lastTickTimestamp: number | null;
  lastBid: number | null;
  lastAsk: number | null;
  lastError: string | null;
  totalTicksReceived: number;
  totalCandlesCompletedByPair: Record<string, number>;
}

export interface LiveCandleResult {
  valid: boolean;
  candles: CandleData[];
  candleCount: number;
  reason?: 'INSUFFICIENT_CANDLE_HISTORY' | 'PAIR_NOT_SUBSCRIBED' | 'FEED_NOT_CONNECTED' | 'MARKET_DATA_STALE';
}

function detectSession(utcHour: number): string {
  if (utcHour >= 8 && utcHour < 12) return 'LONDON';
  if (utcHour >= 12 && utcHour < 16) return 'OVERLAP_LONDON_NY';
  if (utcHour >= 16 && utcHour < 21) return 'NEW_YORK';
  return 'ASIAN';
}

export class CTraderMarketDataFeedService extends EventEmitter {
  private static instance: CTraderMarketDataFeedService;
  private transport: CTraderTransport = new CTraderTransport();
  private isConnecting: boolean = false;
  private isFeedActive: boolean = false;
  private isReconnecting: boolean = false;

  // ── OAuth2 Token Auto-Refresh ──────────────────────────────────────────────
  /**
   * Attempts to exchange the stored refresh token for a new access token.
   * Updates process.env and writes to .env on success.
   * Returns the new access token string, or throws on failure.
   */
  public static async refreshAccessToken(): Promise<string> {
    const clientId = process.env.CTRADER_CLIENT_ID?.trim();
    const clientSecret = process.env.CTRADER_CLIENT_SECRET?.trim();
    const refreshToken = process.env.CTRADER_REFRESH_TOKEN?.trim();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('CTRADER_TOKEN_REFRESH_FAILED: Missing client credentials or refresh token in environment.');
    }

    const https = await import('https');
    const fs = await import('fs');
    const path = await import('path');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString();

    const raw = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'openapi.ctrader.com',
          path: '/apps/token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: any) => (data += chunk));
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { throw new Error('CTRADER_TOKEN_REFRESH_FAILED: Unparseable response: ' + raw.slice(0, 200)); }

    if (parsed.error || parsed.errorCode) {
      throw new Error(`CTRADER_TOKEN_REFRESH_FAILED: ${parsed.error || parsed.errorCode} - ${parsed.error_description || parsed.description || 'No description'}`);
    }

    const newAccessToken: string = parsed.accessToken || parsed.access_token;
    const newRefreshToken: string | undefined = parsed.refreshToken || parsed.refresh_token;

    if (!newAccessToken) {
      throw new Error('CTRADER_TOKEN_REFRESH_FAILED: No access_token in response: ' + raw.slice(0, 200));
    }

    // Update runtime environment immediately
    process.env.CTRADER_ACCESS_TOKEN = newAccessToken;
    if (newRefreshToken) process.env.CTRADER_REFRESH_TOKEN = newRefreshToken;

    // Persist to .env file so the new token survives server restarts
    try {
      const envPath = path.resolve('.env');
      let envContent = fs.readFileSync(envPath, 'utf-8');
      const replaceKey = (key: string, val: string) => {
        const re = new RegExp(`^${key}=.*$`, 'm');
        envContent = re.test(envContent) ? envContent.replace(re, `${key}=${val}`) : envContent + `\n${key}=${val}`;
      };
      replaceKey('CTRADER_ACCESS_TOKEN', newAccessToken);
      if (newRefreshToken) replaceKey('CTRADER_REFRESH_TOKEN', newRefreshToken);
      fs.writeFileSync(envPath, envContent, 'utf-8');
      console.log('[CTRADER-TOKEN] Access token refreshed and .env updated.');
    } catch (writeErr: any) {
      console.warn('[CTRADER-TOKEN] Could not write new tokens to .env:', writeErr.message);
    }

    return newAccessToken;
  }
  // ──────────────────────────────────────────────────────────────────────────
  private connectionState: ConnectionState = 'DISCONNECTED';
  private lastTransportActivityAt: number | null = null;
  private lastTickTimestamp: number | null = null;
  private lastBid: number | null = null;
  private lastAsk: number | null = null;
  private lastError: string | null = null;
  private totalTicksReceived: number = 0;

  // Stale Watchdog Configuration
  private staleThresholdMs: number = Number(process.env.CTRADER_SPOT_STALE_MS) || 15000;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private lastReconnectAttemptAt: number | null = null;
  private lastReconnectSuccessAt: number | null = null;

  private isAccountAuthenticated: boolean = false;

  // Per-pair tracking
  private lastSpotEventAtByPair: Map<CurrencyPair, number> = new Map();
  private healthStateByPair: Map<CurrencyPair, MarketDataHealthState> = new Map();
  private candlesByPair: Map<string, CandleData[]> = new Map();
  private currentCandleByPair: Map<string, CandleData> = new Map();
  private totalCandlesCompletedByPair: Map<string, number> = new Map();
  private spotByPair: Map<string, { bid: number; ask: number; timestamp: number; ticks: number }> = new Map();
  private lastClosedDeals: any[] = [];
  private lastOpenPositions: any[] = [];
  private lastLiveAccountStatus: any = null;
  private accountsStatusMap: Map<string, any> = new Map();

  // Symbol mapping: symbolId -> CurrencyPair
  private symbolMap: Map<number, CurrencyPair> = new Map([
    [1, 'EUR/USD'],
    [2, 'GBP/USD'],
    [3, 'EUR/JPY'],
    [4, 'USD/JPY'],
    [5, 'AUD/USD'],
    [6, 'USD/CHF'],
    [7, 'GBP/JPY'],
    [8, 'USD/CAD'],
    [12, 'NZD/USD'],
    [41, 'XAU/USD'],
    [21501, 'NASDAQ'],
    [22395, 'BTC/USD']
  ]);

  private pairToSymbolId: Map<CurrencyPair, number> = new Map([
    ['EUR/USD', 1],
    ['GBP/USD', 2],
    ['EUR/JPY', 3],
    ['USD/JPY', 4],
    ['AUD/USD', 5],
    ['USD/CHF', 6],
    ['GBP/JPY', 7],
    ['USD/CAD', 8],
    ['NZD/USD', 12],
    ['XAU/USD', 41],
    ['NASDAQ', 21501],
    ['BTC/USD', 22395]
  ]);

  public static readonly MIN_CANDLE_THRESHOLD = 26;
  public static readonly MAX_CANDLES_PER_PAIR = 250;

  private initDefaultSpots(): void {
    const defaults: Record<CurrencyPair, number> = {
      'EUR/USD': 1.15380,
      'GBP/USD': 1.34760,
      'EUR/JPY': 178.680,
      'USD/JPY': 154.850,
      'AUD/USD': 0.71260,
      'USD/CHF': 0.81690,
      'GBP/JPY': 208.700,
      'USD/CAD': 1.39000,
      'NZD/USD': 0.57726,
      'XAU/USD': 4270.00,
      'NASDAQ': 20850.0,
      'BTC/USD': 92450.0
    };
    const now = Date.now();
    for (const [pair, price] of Object.entries(defaults)) {
      const spread = pair.includes('JPY') ? 0.015 : pair.includes('XAU') ? 0.40 : pair.includes('BTC') ? 15.0 : 0.00015;
      const dec = pair.includes('JPY') ? 3 : (pair.includes('XAU') || pair.includes('BTC')) ? 2 : 5;
      const bid = Number((price - spread / 2).toFixed(dec));
      const ask = Number((price + spread / 2).toFixed(dec));
      this.spotByPair.set(pair, { bid, ask, timestamp: now, ticks: 1 });
      this.spotByPair.set(pair.replace('/', ''), { bid, ask, timestamp: now, ticks: 1 });
    }
  }

  private constructor() {
    super();
    this.initDefaultSpots();
    this.setupTransportListeners();
    if (process.env.NODE_ENV !== 'test') {
      this.startHealthWatchdog();
    }
  }

  public static getInstance(): CTraderMarketDataFeedService {
    if (!CTraderMarketDataFeedService.instance) {
      CTraderMarketDataFeedService.instance = new CTraderMarketDataFeedService();
    }
    return CTraderMarketDataFeedService.instance;
  }

  public setStaleThresholdMs(ms: number): void {
    this.staleThresholdMs = Math.max(1000, ms);
  }

  public getStaleThresholdMs(): number {
    return this.staleThresholdMs;
  }

  private setupTransportListeners(): void {
    this.transport.on('spotEvent', (spotRecord) => {
      this.lastTransportActivityAt = Date.now();
      this.handleInboundSpot(spotRecord);
    });

    this.transport.on('executionEvent', async (eventRecord) => {
      this.lastTransportActivityAt = Date.now();
      this.logStructuredEvent('CTRADER_EXECUTION_EVENT_RECEIVED', {
        executionType: eventRecord?.executionTypeName || eventRecord?.executionType,
        symbol: eventRecord?.position?.symbolId || eventRecord?.order?.symbolId
      });
      try {
        await this.fetchRawOpenPositions();
        const { brokerReconciliationService } = await import('../../../apps/execution-router/src/services/brokerReconciliationService');
        await brokerReconciliationService.reconcile(String(process.env.CTRADER_ACCOUNT_ID || '48282756'));
      } catch (err: any) {
        console.warn('[CTRADER-FEED] Auto-reconciliation on executionEvent warning:', err.message);
      }
    });

    this.transport.on('orderFilled', async () => {
      try {
        await this.fetchRawOpenPositions();
        const { brokerReconciliationService } = await import('../../../apps/execution-router/src/services/brokerReconciliationService');
        await brokerReconciliationService.reconcile(String(process.env.CTRADER_ACCOUNT_ID || '48282756'));
      } catch (_) {}
    });

    this.transport.on('orderCancelled', async () => {
      try {
        await this.fetchRawOpenPositions();
        const { brokerReconciliationService } = await import('../../../apps/execution-router/src/services/brokerReconciliationService');
        await brokerReconciliationService.reconcile(String(process.env.CTRADER_ACCOUNT_ID || '48282756'));
      } catch (_) {}
    });

    // 'disconnect' is emitted by CTraderTransport on socket close or error
    this.transport.on('disconnect', (err?: Error) => {
      if (!this.isFeedActive && this.connectionState === 'DISCONNECTED') return; // already handled
      this.isFeedActive = false;
      this.isAccountAuthenticated = false;
      this.connectionState = 'DISCONNECTED';
      for (const pair of this.symbolMap.values()) {
        this.healthStateByPair.set(pair, 'DISCONNECTED');
      }
      this.logStructuredEvent('CTRADER_DISCONNECTED', { reason: err?.message || 'Socket closed unexpectedly' });
      this.emit('feedDisconnected');
    });

    this.transport.on('error', (err) => {
      this.lastError = err.message;
      this.logStructuredEvent('CTRADER_FEED_STALE', { error: err.message });
      this.emit('feedError', err);
    });
  }

  private logStructuredEvent(eventType: string, details: Record<string, any> = {}): void {
    const logObj = {
      event: eventType,
      timestamp: new Date().toISOString(),
      connectionState: this.connectionState,
      overallHealth: this.calculateOverallHealth(),
      ...details
    };
    console.log(`[CTRADER-AUDIT] ${eventType}:`, JSON.stringify(logObj));
    this.emit(eventType, logObj);
  }

  private handleInboundSpot(spot: any): void {
    const symbol = this.symbolMap.get(spot.symbolId);
    if (!symbol) return;

    if (spot.bid && spot.ask && spot.bid > 0 && spot.ask > 0) {
      const now = Date.now();
      this.lastBid = spot.bid;
      this.lastAsk = spot.ask;
      const tickTs = spot.timestamp || now;
      this.lastTickTimestamp = tickTs;
      this.lastTransportActivityAt = now;
      this.lastSpotEventAtByPair.set(symbol, now);
      this.totalTicksReceived++;
      this.reconnectAttempts = 0;

      // Transition symbol state to HEALTHY upon arrival of verified fresh non-zero tick
      const previousState = this.healthStateByPair.get(symbol);
      this.healthStateByPair.set(symbol, 'HEALTHY');
      if (previousState !== 'HEALTHY') {
        this.logStructuredEvent('CTRADER_FEED_HEALTHY', {
          symbol,
          bid: spot.bid,
          ask: spot.ask,
          previousState
        });
      }

      this.spotByPair.set(symbol, {
        bid: spot.bid,
        ask: spot.ask,
        timestamp: tickTs,
        ticks: (this.spotByPair.get(symbol)?.ticks || 0) + 1
      });

      const dec = symbol.includes('JPY') ? 3 : (symbol === 'XAU/USD' || symbol === 'BTC/USD') ? 2 : 5;
      const midPrice = parseFloat(((spot.bid + spot.ask) / 2).toFixed(dec));
      const session = detectSession(new Date(tickTs).getUTCHours());

      // ─── AUTHORITATIVE M1 Candle Aggregation ───
      const minuteBucket = Math.floor(tickTs / 60000) * 60;
      const timeStr = new Date(minuteBucket * 1000).toISOString();
      const current = this.currentCandleByPair.get(symbol);

      if (!current || current.time !== timeStr) {
        if (current) {
          const closed = { ...current };
          const history = this.candlesByPair.get(symbol) || [];
          history.push(closed);
          if (history.length > CTraderMarketDataFeedService.MAX_CANDLES_PER_PAIR) {
            history.shift();
          }
          this.candlesByPair.set(symbol, history);
          this.totalCandlesCompletedByPair.set(
            symbol,
            (this.totalCandlesCompletedByPair.get(symbol) || 0) + 1
          );

          this.emit('candleClosed', { symbol, candle: closed, session });
        }

        // Open new candle
        this.currentCandleByPair.set(symbol, {
          time: timeStr,
          open: midPrice,
          high: midPrice,
          low: midPrice,
          close: midPrice,
          volume: 1
        });
      } else {
        current.high = Math.max(current.high, midPrice);
        current.low = Math.min(current.low, midPrice);
        current.close = midPrice;
        current.volume = (current.volume || 1) + 1;
        this.currentCandleByPair.set(symbol, current);
      }

      // Emit live tick event
      this.emit('marketTick', {
        symbol,
        currentPrice: midPrice,
        bid: spot.bid,
        ask: spot.ask,
        highPrice: spot.ask,
        lowPrice: spot.bid,
        session,
        timestamp: tickTs
      });
    }
  }

  private reconciliationTimer: NodeJS.Timeout | null = null;

  public startHealthWatchdog(): void {
    if (this.watchdogTimer) return;

    this.watchdogTimer = setInterval(() => {
      this.evaluateFeedHealth();
    }, 3000);
    if (this.watchdogTimer.unref) {
      this.watchdogTimer.unref();
    }

    if (!this.reconciliationTimer) {
      this.reconciliationTimer = setInterval(async () => {
        if (this.isFeedActive && this.isAccountAuthenticated) {
          try {
            await this.fetchRawOpenPositions();
            const { brokerReconciliationService } = await import('../../../apps/execution-router/src/services/brokerReconciliationService');
            await brokerReconciliationService.reconcile(String(process.env.CTRADER_ACCOUNT_ID || '48282756'));
          } catch (_) {}
        }
      }, 10000);
      if (this.reconciliationTimer.unref) {
        this.reconciliationTimer.unref();
      }
    }
  }

  public stopHealthWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.reconciliationTimer) {
      clearInterval(this.reconciliationTimer);
      this.reconciliationTimer = null;
    }
  }

  private async resolveSpotSymbols(accountId:number):Promise<number[]> {
    const response=await this.transport.sendRequest(2114,{ctidTraderAccountId:accountId,includeArchivedSymbols:false},10000);
    if(response.payloadType!==2115||!Array.isArray(response.decodedPayload?.symbol))throw Error('BROKER_SYMBOL_LIST_UNAVAILABLE');
    const wanted=[
      'EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CHF','NZD/USD','USD/CAD',
      'EUR/GBP','EUR/JPY','EUR/AUD','EUR/CAD','EUR/CHF','EUR/NZD',
      'GBP/JPY','GBP/AUD','GBP/CAD','GBP/CHF','GBP/NZD',
      'AUD/JPY','AUD/CAD','AUD/CHF','AUD/NZD',
      'NZD/JPY','NZD/CAD','NZD/CHF',
      'CAD/JPY','CAD/CHF','CHF/JPY','XAU/USD'
    ];
    this.symbolMap.clear();this.pairToSymbolId.clear();
    for(const pair of wanted){const matches=response.decodedPayload.symbol.filter((x:any)=>String(x.symbolName).replace('/','').toUpperCase()===pair.replace('/',''));if(matches.length!==1)continue;const id=Number(matches[0].symbolId);if(!(id>0))continue;this.symbolMap.set(id,pair as CurrencyPair);this.pairToSymbolId.set(pair as CurrencyPair,id);}
    if(!this.symbolMap.size)throw Error('NO_SUPPORTED_BROKER_SYMBOLS');
    return [...this.symbolMap.keys()];
  }

  public evaluateFeedHealth(): MarketDataHealthReport {
    const now = Date.now();
    const subscribedPairs: CurrencyPair[] = Array.from(this.pairToSymbolId.keys());
    let allStale = true;

    for (const pair of subscribedPairs) {
      const lastSpotAt = this.lastSpotEventAtByPair.get(pair);
      if (!this.isFeedActive || this.connectionState === 'DISCONNECTED') {
        this.healthStateByPair.set(pair, 'DISCONNECTED');
      } else if (!lastSpotAt) {
        this.healthStateByPair.set(pair, 'DEGRADED');
      } else {
        const elapsed = now - lastSpotAt;
        if (elapsed > this.staleThresholdMs) {
          const wasHealthy = this.healthStateByPair.get(pair) === 'HEALTHY';
          this.healthStateByPair.set(pair, 'STALE');
          if (wasHealthy) {
            this.logStructuredEvent('CTRADER_FEED_STALE', {
              symbol: pair,
              lastSpotEventAt: new Date(lastSpotAt).toISOString(),
              elapsedMs: elapsed,
              thresholdMs: this.staleThresholdMs
            });
            this.emit('feedStale', { symbol: pair, elapsedMs: elapsed });
          }
        } else {
          allStale = false;
          this.healthStateByPair.set(pair, 'HEALTHY');
        }
      }
    }

    // Exponential backoff guard: don't reconnect too soon after previous attempt
    const backoffMs = Math.min(30000, 3000 * Math.pow(1.8, this.reconnectAttempts));
    const sinceLastAttempt = this.lastReconnectAttemptAt ? now - this.lastReconnectAttemptAt : Infinity;

    // If transport is disconnected or all subscribed feeds are STALE, trigger controlled auto-reconnect
    const shouldReconnect = (!this.isFeedActive || (this.connectionState !== 'CONNECTING' && allStale)) &&
                            !this.isConnecting &&
                            !this.isReconnecting &&
                            this.reconnectAttempts < 20 &&
                            sinceLastAttempt >= backoffMs;
    if (shouldReconnect) {
      const nextBackoffSec = (backoffMs / 1000).toFixed(1);
      console.warn(`[CTRADER-WATCHDOG] Feed inactive or STALE. Auto-reconnect attempt ${this.reconnectAttempts + 1}/20 (backoff=${nextBackoffSec}s)...`);
      this.triggerControlledReconnect().catch(err => {
        console.error('[CTRADER-WATCHDOG] Reconnect error:', err?.message || err);
      });
    } else if (this.reconnectAttempts >= 20) {
      // Hard cap reached — reset counter to allow retries again after a long pause
      if (sinceLastAttempt >= 120000) {
        console.warn('[CTRADER-WATCHDOG] Reconnect cap reset after 2-minute pause. Will retry.');
        this.reconnectAttempts = 0;
      }
    }

    return this.getFeedHealth();
  }

  public async triggerControlledReconnect(): Promise<boolean> {
    if (this.isReconnecting) return false;
    this.isReconnecting = true;
    this.connectionState = 'RECONNECTING';
    this.reconnectAttempts++;
    this.lastReconnectAttemptAt = Date.now();

    this.logStructuredEvent('CTRADER_RECONNECT_STARTED', {
      attempt: this.reconnectAttempts
    });

    try {
      // 1. Cleanly disconnect transport
      await this.transport.disconnect().catch(() => {});
      this.isFeedActive = false;

      // 2. Mark state as DEGRADED until fresh ticks arrive
      for (const pair of this.symbolMap.values()) {
        this.healthStateByPair.set(pair, 'DEGRADED');
      }

      // 3. Connect & Authenticate
      const host = process.env.CTRADER_HOST || 'demo.ctraderapi.com';
      const port = Number(process.env.CTRADER_PORT) || 5035;
      const clientId = process.env.CTRADER_CLIENT_ID;
      const clientSecret = process.env.CTRADER_CLIENT_SECRET;
      const accessToken = process.env.CTRADER_ACCESS_TOKEN;
      const accountId = process.env.CTRADER_ACCOUNT_ID;

      if (!clientId || !clientSecret || !accessToken || !accountId) {
        throw new Error('CTRADER_CONFIG_ERROR: Missing cTrader credentials for reconnect.');
      }

      this.logStructuredEvent('CTRADER_CONNECTION_ATTEMPT', { host, port });
      await this.transport.connect(host, port);
      this.connectionState = 'CONNECTED';
      this.logStructuredEvent('CTRADER_TLS_CONNECTED', { host, port });

      this.logStructuredEvent('CTRADER_APPLICATION_AUTHENTICATING', { host, port });
      await this.transport.sendRequest(2100, { clientId, clientSecret }, 7000);
      this.logStructuredEvent('CTRADER_APPLICATION_AUTHENTICATED', { status: 'SUCCESS' });

      this.logStructuredEvent('CTRADER_ACCOUNT_AUTHENTICATING', { accountId });
      let effectiveAccessToken = accessToken;
      let accAuthRes: any;
      try {
        accAuthRes = await this.transport.sendRequest(2102, { ctidTraderAccountId: Number(accountId), accessToken: effectiveAccessToken }, 7000);
      } catch (authErr: any) {
        // If token is expired/invalid, attempt to refresh it and retry once
        if (authErr.message?.includes('ACCESS_TOKEN_INVALID') || authErr.message?.includes('ACCESS_DENIED') || authErr.message?.includes('ALREADY_LOGGED_IN')) {
          if (!authErr.message?.includes('ALREADY_LOGGED_IN')) {
            this.logStructuredEvent('CTRADER_TOKEN_REFRESH_ATTEMPT', { reason: authErr.message });
            try {
              effectiveAccessToken = await CTraderMarketDataFeedService.refreshAccessToken();
              this.logStructuredEvent('CTRADER_TOKEN_REFRESHED', { success: true });
              accAuthRes = await this.transport.sendRequest(2102, { ctidTraderAccountId: Number(accountId), accessToken: effectiveAccessToken }, 7000);
            } catch (refreshErr: any) {
              this.logStructuredEvent('CTRADER_TOKEN_REFRESH_FAILED', { error: refreshErr.message });
              throw new Error(`CTRADER_AUTH_FAILED: Token refresh also failed. Please manually obtain a new token. Original: ${authErr.message}. Refresh error: ${refreshErr.message}`);
            }
          } else {
            // ALREADY_LOGGED_IN means the account is still auth'd from a prior session — treat as success
            this.logStructuredEvent('CTRADER_ACCOUNT_ALREADY_AUTHENTICATED', { accountId });
            accAuthRes = { decodedPayload: { ctidTraderAccountId: Number(accountId) } };
          }
        } else {
          throw authErr;
        }
      }
      this.logStructuredEvent('CTRADER_ACCOUNT_AUTHENTICATED', { 
        accountId, 
        ctidTraderAccountId: accAuthRes.decodedPayload?.ctidTraderAccountId || accountId 
      });
      this.isAccountAuthenticated = true;

      // 4. Resubscribe spots for all supported symbols
      const spotSymbolIds = await this.resolveSpotSymbols(Number(accountId));
      await this.transport.subscribeSpots(Number(accountId), spotSymbolIds, true, 7000);
      this.logStructuredEvent('CTRADER_SPOT_SUBSCRIBED', { symbols: spotSymbolIds });

      this.isFeedActive = true;
      this.lastReconnectSuccessAt = Date.now();
      this.isReconnecting = false;
      this.reconnectAttempts = 0; // reset backoff counter on success
      this.logStructuredEvent('CTRADER_READY', {
        success: true,
        attempt: this.reconnectAttempts
      });

      // Immediately sync and reconcile all positions from cTrader to PostgreSQL
      try {
        await this.fetchRawOpenPositions();
        const { brokerReconciliationService } = await import('../../../apps/execution-router/src/services/brokerReconciliationService');
        await brokerReconciliationService.reconcile(String(accountId));
        
        // Broadcast Telegram alerts for each synced position
        if (this.lastOpenPositions.length > 0) {
          const { telegramNotificationService } = await import('./telegramNotificationService');
          
          // First, fetch pending limit orders to get SL/TP from them
          let pendingOrders: any[] = [];
          try {
            const ctrader = new (await import('../../../apps/execution-router/src/adapters/ctraderAdapter')).CTraderAdapter({ accountId: String(accountId) });
            pendingOrders = await ctrader.getPendingOrders().catch(() => []);
          } catch (_) {}
          
          for (const pos of this.lastOpenPositions) {
            try {
              // Resolve symbol by matching entry price to live spot prices
              const entryPrice = Number(pos.price || 0);
              let symbol: CurrencyPair = 'UNKNOWN' as CurrencyPair;
              let closestDiff = Infinity;
              
              // Find symbol by matching price against live spot prices
              const allPrices = this.getAllSpotPrices();
              for (const [sym, spot] of Object.entries(allPrices)) {
                if (sym.includes('/')) {
                  const diff = Math.abs(spot - entryPrice);
                  if (diff < closestDiff && diff < 0.01) {
                    closestDiff = diff;
                    symbol = sym as CurrencyPair;
                  }
                }
              }
              
              // Only process if we found a valid symbol
              if (symbol === 'UNKNOWN') continue;
              
              // Try to find matching pending order to get the REAL SL/TP that was sent to cTrader
              let direction = 'SELL';
              let stopLoss = 0;
              let takeProfit1 = 0;
              let tp2Runner = 0;
              
              const matchingOrder = pendingOrders.find(o => {
                const orderSym = (o.symbol || '').replace('/', '').toUpperCase();
                const posSym = symbol.replace('/', '').toUpperCase();
                const priceMatch = Math.abs((o.limitPrice || 0) - entryPrice) < 0.001;
                return orderSym === posSym && priceMatch;
              });
              
              if (matchingOrder) {
                // Use REAL SL/TP from pending order that was sent to cTrader
                direction = matchingOrder.tradeSide === 1 ? 'BUY' : 'SELL';
                stopLoss = Number(matchingOrder.stopLoss || 0);
                takeProfit1 = Number(matchingOrder.takeProfit || 0);
                
                // Calculate TP2 runner from the actual TP1
                if (takeProfit1 !== 0) {
                  const riskAmount = Math.abs(entryPrice - stopLoss);
                  tp2Runner = direction === 'BUY'
                    ? takeProfit1 + (riskAmount * 1.8)
                    : takeProfit1 - (riskAmount * 1.8);
                  tp2Runner = Number(tp2Runner.toFixed(symbol.includes('JPY') ? 3 : 5));
                }
                
                console.log(`[CTRADER-FEED] Position synced from PENDING ORDER: Symbol=${symbol}, Dir=${direction}, Entry=${entryPrice}, SL=${stopLoss}, TP1=${takeProfit1}, TP2=${tp2Runner}`);
              } else {
                // Fallback to calculated values if no pending order found
                const isJpy = symbol.includes('JPY');
                const isGold = symbol.includes('XAU') || symbol.includes('GOLD');
                const isBtc = symbol.includes('BTC');
                const isNas = symbol.includes('NAS') || symbol.includes('TECH') || symbol.includes('USTEC');
                
                const pipMultiplier = isJpy ? 0.01 : (isGold || isBtc || isNas) ? 1 : 0.0001;
                const slPips = isJpy ? 35.0 : (isGold ? 45.0 : (isNas ? 100.0 : (isBtc ? 500.0 : 30.0)));
                const tpPips = isJpy ? 70.0 : (isGold ? 90.0 : (isNas ? 200.0 : (isBtc ? 1000.0 : 60.0)));
                
                direction = 'SELL';
                stopLoss = direction === 'SELL' 
                  ? Number((entryPrice + (slPips * pipMultiplier)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5))
                  : Number((entryPrice - (slPips * pipMultiplier)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5));
                
                takeProfit1 = direction === 'SELL'
                  ? Number((entryPrice - (tpPips * pipMultiplier)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5))
                  : Number((entryPrice + (tpPips * pipMultiplier)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5));
                
                tp2Runner = direction === 'SELL'
                  ? Number((entryPrice - (tpPips * pipMultiplier * 1.8)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5))
                  : Number((entryPrice + (tpPips * pipMultiplier * 1.8)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5));
                
                console.log(`[CTRADER-FEED] Position synced (CALCULATED): Symbol=${symbol}, Dir=${direction}, Entry=${entryPrice}, SL=${stopLoss}, TP1=${takeProfit1}, TP2=${tp2Runner}`);
              }
            } catch (syncErr: any) {
              console.warn('[CTRADER-FEED] Position sync notification error:', syncErr.message);
            }
          }
        }
      } catch (_) {}

      return true;
    } catch (err: any) {
      this.isReconnecting = false;
      this.connectionState = 'DISCONNECTED';
      this.isFeedActive = false;
      this.lastError = err.message || String(err);
      this.logStructuredEvent('CTRADER_ERROR', { error: this.lastError });
      console.error('[CTRADER-RECONNECT-FAILED]', this.lastError);
      return false;
    }
  }

  private startFeedPromise: Promise<boolean> | null = null;

  public async startFeed(): Promise<boolean> {
    if (this.isFeedActive && this.isAccountAuthenticated) {
      return true;
    }
    if (this.startFeedPromise) {
      return this.startFeedPromise;
    }

    this.startFeedPromise = (async () => {
      this.isConnecting = true;
      this.connectionState = 'CONNECTING';
      this.lastError = null;

      try {
        const host = process.env.CTRADER_HOST || 'demo.ctraderapi.com';
        const port = Number(process.env.CTRADER_PORT) || 5035;
        const clientId = process.env.CTRADER_CLIENT_ID;
        const clientSecret = process.env.CTRADER_CLIENT_SECRET;
        const accessToken = process.env.CTRADER_ACCESS_TOKEN;
        const accountId = process.env.CTRADER_ACCOUNT_ID;

        if (!clientId || !clientSecret || !accessToken || !accountId) {
          throw new Error('CTRADER_CONFIG_ERROR: Missing cTrader credentials for spot market feed.');
        }

        this.logStructuredEvent('CTRADER_CONNECTION_ATTEMPT', { host, port });
        await this.transport.connect(host, port);
        this.connectionState = 'CONNECTED';
        this.logStructuredEvent('CTRADER_TLS_CONNECTED', { host, port });

        this.logStructuredEvent('CTRADER_APPLICATION_AUTHENTICATING', { host, port });
        await this.transport.sendRequest(2100, { clientId, clientSecret }, 7000);
        this.logStructuredEvent('CTRADER_APPLICATION_AUTHENTICATED', { status: 'SUCCESS' });

        this.logStructuredEvent('CTRADER_ACCOUNT_AUTHENTICATING', { accountId });
        let startFeedToken = accessToken;
        let accAuthRes: any;
        try {
          accAuthRes = await this.transport.sendRequest(2102, {
            ctidTraderAccountId: Number(accountId),
            accessToken: startFeedToken
          }, 7000);
        } catch (authErr: any) {
          if (authErr.message?.includes('ACCESS_TOKEN_INVALID') || authErr.message?.includes('ACCESS_DENIED')) {
            this.logStructuredEvent('CTRADER_TOKEN_REFRESH_ATTEMPT', { reason: authErr.message });
            try {
              startFeedToken = await CTraderMarketDataFeedService.refreshAccessToken();
              this.logStructuredEvent('CTRADER_TOKEN_REFRESHED', { success: true });
              accAuthRes = await this.transport.sendRequest(2102, {
                ctidTraderAccountId: Number(accountId),
                accessToken: startFeedToken
              }, 7000);
            } catch (refreshErr: any) {
              this.logStructuredEvent('CTRADER_TOKEN_REFRESH_FAILED', { error: refreshErr.message });
              throw new Error(`CTRADER_AUTH_FAILED: Token refresh failed. ${authErr.message} | Refresh: ${refreshErr.message}`);
            }
          } else if (authErr.message?.includes('ALREADY_LOGGED_IN')) {
            this.logStructuredEvent('CTRADER_ACCOUNT_ALREADY_AUTHENTICATED', { accountId });
            accAuthRes = { decodedPayload: { ctidTraderAccountId: Number(accountId) } };
          } else {
            throw authErr;
          }
        }
        this.logStructuredEvent('CTRADER_ACCOUNT_AUTHENTICATED', { 
          accountId, 
          ctidTraderAccountId: accAuthRes.decodedPayload?.ctidTraderAccountId || accountId 
        });
        this.isAccountAuthenticated = true;

        const spotSymbolIds = await this.resolveSpotSymbols(Number(accountId));
        await this.transport.subscribeSpots(Number(accountId), spotSymbolIds, true, 7000);
        this.logStructuredEvent('CTRADER_SPOT_SUBSCRIBED', { symbols: spotSymbolIds });

        // Warmup historical M1 candles from REST (display only)
        const pairsToWarm: CurrencyPair[] = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY', 'USD/CHF', 'NZD/USD', 'EUR/GBP', 'AUD/JPY', 'EUR/CHF', 'EUR/AUD', 'GBP/AUD'];
        for (const pair of pairsToWarm) {
          try {
            const history = await fetchRealCandleHistory(pair, 'M1', 100);
            if (history && history.length > 0) {
              const validHistory = history.filter(c => c.high > c.low || c.open !== c.close);
              if (validHistory.length > 0) {
                this.candlesByPair.set(pair, validHistory);
                this.totalCandlesCompletedByPair.set(pair, validHistory.length);
                console.log(`[CTRADER-FEED] Warmed up ${pair} with ${validHistory.length} valid historical M1 candles.`);
              }
            }
          } catch (err: any) {
            console.warn(`[CTRADER-FEED] Warm-up failed for ${pair}:`, err.message || err);
          }
        }

        this.isFeedActive = true;
        this.isConnecting = false;
        this.logStructuredEvent('CTRADER_READY', { host, port, accountId });
        this.emit('feedStarted');
        console.log('[CTRADER-FEED] Feed started. Subscribed to EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CHF, NZD/USD, USD/CAD, EUR/JPY, GBP/JPY, XAU/USD.');

        // Immediately fetch and reconcile all open positions from cTrader to PostgreSQL
        try {
          await this.fetchRawOpenPositions();
          const { brokerReconciliationService } = await import('../../../apps/execution-router/src/services/brokerReconciliationService');
          await brokerReconciliationService.reconcile(String(accountId));
          console.log(`[CTRADER-FEED] Synchronized ${this.lastOpenPositions.length} live positions from cTrader into PostgreSQL.`);
          
          // Broadcast Telegram alerts for each synced position
          if (this.lastOpenPositions.length > 0) {
            const { telegramNotificationService } = await import('./telegramNotificationService');
            for (const pos of this.lastOpenPositions) {
              try {
                // Resolve symbol by matching entry price to live spot prices
                const entryPrice = Number(pos.price || 0);
                let symbol: CurrencyPair = 'UNKNOWN' as CurrencyPair;
                let closestDiff = Infinity;
                
                // Find symbol by matching price against live spot prices
                const allPrices = this.getAllSpotPrices();
                for (const [sym, spot] of Object.entries(allPrices)) {
                  if (sym.includes('/')) {
                    const diff = Math.abs(spot - entryPrice);
                    if (diff < closestDiff && diff < 0.01) {
                      closestDiff = diff;
                      symbol = sym as CurrencyPair;
                    }
                  }
                }
                
                // Only process if we found a valid symbol
                if (symbol === 'UNKNOWN') continue;
                
                const direction = 'SELL';
                
                // Calculate SL/TP based on pair characteristics (from autonomousMarketScannerService)
                const isJpy = symbol.includes('JPY');
                const isGold = symbol.includes('XAU') || symbol.includes('GOLD');
                const isBtc = symbol.includes('BTC');
                const isNas = symbol.includes('NAS') || symbol.includes('TECH') || symbol.includes('USTEC');
                
                const pipMultiplier = isJpy ? 0.01 : (isGold || isBtc || isNas) ? 1 : 0.0001;
                const slPips = isJpy ? 35.0 : (isGold ? 45.0 : (isNas ? 100.0 : (isBtc ? 500.0 : 30.0)));
                const tpPips = isJpy ? 70.0 : (isGold ? 90.0 : (isNas ? 200.0 : (isBtc ? 1000.0 : 60.0)));
                
                // Calculate SL and TP1
                const stopLoss = direction === 'SELL' 
                  ? Number((entryPrice + (slPips * pipMultiplier)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5))
                  : Number((entryPrice - (slPips * pipMultiplier)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5));
                
                const takeProfit1 = direction === 'SELL'
                  ? Number((entryPrice - (tpPips * pipMultiplier)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5))
                  : Number((entryPrice + (tpPips * pipMultiplier)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5));
                
                // Calculate TP2 (runner: 2x risk:reward)
                const tp2Runner = direction === 'SELL'
                  ? Number((entryPrice - (tpPips * pipMultiplier * 1.8)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5))
                  : Number((entryPrice + (tpPips * pipMultiplier * 1.8)).toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5));
                
                console.log(`[CTRADER-FEED] Position synced: Symbol=${symbol}, Entry=${entryPrice}, SL=${stopLoss}, TP1=${takeProfit1}, TP2=${tp2Runner}`);
              } catch (syncErr: any) {
                console.warn('[CTRADER-FEED] Position sync notification error:', syncErr.message);
              }
            }
          }
        } catch (err: any) {
          console.warn('[CTRADER-FEED] Initial position sync warning:', err.message);
        }

        return true;
      } catch (err: any) {
        this.isConnecting = false;
        this.isFeedActive = false;
        this.isAccountAuthenticated = false;
        this.connectionState = 'DISCONNECTED';
        this.lastError = err?.message || String(err);
        this.logStructuredEvent('CTRADER_ERROR', { error: this.lastError });
        console.error('[START-FEED-DEBUG-ERROR]', this.lastError);
        return false;
      } finally {
        this.startFeedPromise = null;
      }
    })();

    return this.startFeedPromise;
  }

  public async stopFeed(): Promise<void> {
    this.isFeedActive = false;
    this.isConnecting = false;
    this.connectionState = 'DISCONNECTED';
    await this.transport.disconnect();
    this.emit('feedStopped');
  }

  public getSymbolHealth(symbol: CurrencyPair): MarketDataHealthState {
    return this.healthStateByPair.get(symbol) || (this.isFeedActive ? 'DEGRADED' : 'DISCONNECTED');
  }

  public isSymbolHealthy(symbol: CurrencyPair): boolean {
    return this.getSymbolHealth(symbol) === 'HEALTHY';
  }

  private calculateOverallHealth(): MarketDataHealthState {
    if (!this.isFeedActive || this.connectionState === 'DISCONNECTED') return 'DISCONNECTED';
    if (this.connectionState === 'RECONNECTING') return 'DEGRADED';
    const states = Array.from(this.healthStateByPair.values());
    if (states.length === 0) return 'DEGRADED';
    if (states.some(s => s === 'STALE')) return 'STALE';
    if (states.some(s => s === 'DEGRADED')) return 'DEGRADED';
    if (states.every(s => s === 'HEALTHY')) return 'HEALTHY';
    return 'DEGRADED';
  }

  public getFeedHealth(): MarketDataHealthReport {
    const now = Date.now();
    const symbolsReport: Record<string, SymbolHealthReport> = {};

    for (const [id, symbol] of this.symbolMap.entries()) {
      const lastSpotAt = this.lastSpotEventAtByPair.get(symbol) || null;
      const spot = this.spotByPair.get(symbol);
      const dec = symbol.includes('JPY') ? 3 : (symbol === 'XAU/USD' || symbol === 'BTC/USD') ? 2 : 5;
      const mid = spot ? parseFloat(((spot.bid + spot.ask) / 2).toFixed(dec)) : null;

      symbolsReport[symbol] = {
        symbol,
        state: this.getSymbolHealth(symbol),
        lastSpotEventAt: lastSpotAt,
        ageMs: lastSpotAt ? (now - lastSpotAt) : null,
        bid: spot?.bid || null,
        ask: spot?.ask || null,
        mid,
        ticksReceived: spot?.ticks || 0,
        candlesCompleted: this.totalCandlesCompletedByPair.get(symbol) || 0
      };
    }

    return {
      overallState: this.calculateOverallHealth(),
      connectionState: this.connectionState,
      staleThresholdMs: this.staleThresholdMs,
      lastTransportActivityAt: this.lastTransportActivityAt,
      symbols: symbolsReport,
      reconnect: {
        attempts: this.reconnectAttempts,
        lastAttemptAt: this.lastReconnectAttemptAt,
        lastSuccessAt: this.lastReconnectSuccessAt
      },
      timestamp: now
    };
  }

  public getLiveCandles(pair: CurrencyPair = 'EUR/USD'): LiveCandleResult {
    if (!this.isFeedActive && this.totalTicksReceived === 0) {
      return { valid: false, candles: [], candleCount: 0, reason: 'FEED_NOT_CONNECTED' };
    }

    const health = this.getSymbolHealth(pair);
    if (health === 'STALE' || health === 'DISCONNECTED') {
      return {
        valid: false,
        candles: this.candlesByPair.get(pair) || [],
        candleCount: (this.candlesByPair.get(pair) || []).length,
        reason: 'MARKET_DATA_STALE'
      };
    }

    const closedCandles = this.candlesByPair.get(pair) || [];
    const current = this.currentCandleByPair.get(pair);
    const allCandles = current ? [...closedCandles, current] : [...closedCandles];
    const count = allCandles.length;

    if (count < CTraderMarketDataFeedService.MIN_CANDLE_THRESHOLD) {
      return {
        valid: false,
        candles: allCandles,
        candleCount: count,
        reason: 'INSUFFICIENT_CANDLE_HISTORY'
      };
    }

    return { valid: true, candles: allCandles, candleCount: count };
  }

  public getLivePrice(pair: CurrencyPair): number | null {
    const current = this.currentCandleByPair.get(pair);
    if (current && typeof current.close === 'number' && current.close > 0) {
      return current.close;
    }
    const candles = this.candlesByPair.get(pair);
    if (candles && candles.length > 0) {
      return candles[candles.length - 1].close;
    }
    return null;
  }

  public async getCandles(pair: CurrencyPair = 'EUR/USD', timeframe: string = 'M1', count: number = 100): Promise<CandleData[]> {
    const live = this.getLiveCandles(pair);
    if (live.valid && live.candles.length > 0) {
      return live.candles.slice(-count);
    }
    return fetchRealCandleHistory(pair, timeframe as any, count);
  }

  public getFeedStatus(): SpotFeedStatus {
    const byPair: Record<string, number> = {};
    this.totalCandlesCompletedByPair.forEach((count, pair) => { byPair[pair] = count; });
    return {
      connected: this.isFeedActive,
      subscribedSymbols: Array.from(this.symbolMap.values()),
      lastTickTimestamp: this.lastTickTimestamp,
      lastBid: this.lastBid,
      lastAsk: this.lastAsk,
      lastError: this.lastError,
      totalTicksReceived: this.totalTicksReceived,
      totalCandlesCompletedByPair: byPair
    };
  }

  public getTransport(): CTraderTransport {
    return this.transport;
  }

  public getLastOpenPositions(): any[] {
    return this.lastOpenPositions;
  }

  public async fetchRawOpenPositions(requireFresh = false): Promise<any[]> {
    if (!this.transport || !this.transport.isConnected() || !this.isAccountAuthenticated) {
      await this.startFeed().catch(() => {});
    }
    if (!this.transport || !this.transport.isConnected() || !this.isAccountAuthenticated) {
      if (requireFresh) throw new Error('MASTER_POSITIONS_UNAVAILABLE');
      return this.lastOpenPositions;
    }
    try {
      const accountId = Number(process.env.CTRADER_ACCOUNT_ID || 48282756);
      const recRes = await this.transport.sendRequest(2124, { ctidTraderAccountId: accountId }, 8000);
      if (recRes.payloadType === 2125) {
        this.lastOpenPositions = Array.isArray(recRes.decodedPayload?.position) ? recRes.decodedPayload.position : [];
        return this.lastOpenPositions;
      }
    } catch (err: any) {
      console.warn('[CTRADER-FEED] fetchRawOpenPositions error:', err.message);
    }
    if (requireFresh) throw new Error('MASTER_POSITIONS_UNAVAILABLE');
    return this.lastOpenPositions;
  }

  public getLastClosedDeals(): any[] {
    return this.lastClosedDeals;
  }

  public async fetchRawClosedDeals(days: number = 90, maxRows: number = 500): Promise<any[]> {
    if (!this.transport || !this.transport.isConnected() || !this.isAccountAuthenticated) {
      await this.startFeed().catch(() => {});
    }
    if (!this.transport || !this.transport.isConnected() || !this.isAccountAuthenticated) {
      return this.lastClosedDeals;
    }
    try {
      const accountId = Number(process.env.CTRADER_ACCOUNT_ID || 48282756);
      const fromTimestamp = Date.now() - days * 24 * 60 * 60 * 1000;
      const toTimestamp = Date.now() + 24 * 60 * 60 * 1000;
      const dealsRes = await this.transport.sendRequest(2133, {
        ctidTraderAccountId: accountId,
        fromTimestamp,
        toTimestamp,
        maxRows
      }, 8000);
      if (dealsRes.payloadType === 2134) {
        this.lastClosedDeals = Array.isArray(dealsRes.decodedPayload?.deal) ? dealsRes.decodedPayload.deal : [];
        this.emit('brokerClosedDealsUpdated', this.lastClosedDeals);
        return this.lastClosedDeals;
      }
    } catch (err: any) {
      console.warn('[CTRADER-FEED] fetchRawClosedDeals error:', err.message);
    }
    return this.lastClosedDeals;
  }

  /**
   * Dynamically discovers and synchronizes all authorized cTrader accounts under the current Spotware OAuth access token.
   */
  public async discoverAndSyncAllAccounts(): Promise<any[]> {
    if (!this.transport || !this.transport.isConnected()) return [];
    try {
      const accessToken = process.env.CTRADER_ACCESS_TOKEN;
      if (!accessToken) return [];

      const res = await this.transport.sendRequest(2149, { accessToken }, 7000);
      const accounts = res.decodedPayload?.ctidTraderAccount || [];
      const results: any[] = [];

      for (const acc of accounts) {
        const ctid = acc.ctidTraderAccountId;
        const login = String(acc.traderLogin || ctid);
        try {
          await this.transport.sendRequest(2102, { ctidTraderAccountId: ctid, accessToken }, 5000).catch(() => {});

          const traderRes = await this.transport.sendRequest(2121, { ctidTraderAccountId: ctid }, 5000);
          const trader = traderRes.decodedPayload?.trader;
          if (trader) {
            const moneyDigits = Number(trader.moneyDigits ?? 2);
            const divisor = Math.pow(10, moneyDigits);
            const rawBalance = Number(trader.balance || 0);
            const liveBalance = Number((rawBalance / divisor).toFixed(2));
            const leverageInCents = Number(trader.leverageInCents || 10000);
            const leverage = `1:${Math.round(leverageInCents / 100)}`;
            const traderLogin = String(trader.traderLogin || login);

            let openPositionsCount = 0;
            try {
              const recRes = await this.transport.sendRequest(2124, { ctidTraderAccountId: ctid }, 3000);
              if (recRes.payloadType === 2125 && Array.isArray(recRes.decodedPayload?.position)) {
                openPositionsCount = recRes.decodedPayload.position.length;
              }
            } catch {}

            const status = {
              accountNumber: traderLogin,
              ctidTraderAccountId: ctid,
              balance: liveBalance,
              equity: liveBalance,
              leverage,
              brokerTitle: acc.brokerTitleShort || 'Spotware',
              isLive: !!acc.isLive,
              openPositionsCount,
              floatingPnL: 0,
              lastSyncedAt: Date.now()
            };

            this.accountsStatusMap.set(traderLogin, status);
            this.accountsStatusMap.set(String(ctid), status);
            results.push(status);
            this.emit('accountStatusUpdated', status);
          }
        } catch (err: any) {
          console.warn(`[CTRADER-FEED] Sync notice for account ${ctid}:`, err.message);
        }
      }
      return results;
    } catch (err: any) {
      console.warn('[CTRADER-FEED] discoverAndSyncAllAccounts notice:', err.message);
      return [];
    }
  }

  public async fetchLiveAccountStatus(targetAccount?: string | number): Promise<{
    balance: number;
    equity: number;
    accountNumber: string;
    ctidTraderAccountId: number;
    leverage: string;
    openPositionsCount: number;
    floatingPnL: number;
  } | null> {
    if (!this.transport || !this.transport.isConnected()) return null;
    const targetKey = targetAccount ? String(targetAccount).trim() : String(process.env.CTRADER_ACCOUNT_ID || '48282756');

    // Return fresh cached status if recently synced (within 3 seconds)
    const cached = this.accountsStatusMap.get(targetKey);
    if (cached && (Date.now() - (cached.lastSyncedAt || 0) < 3000)) {
      return cached;
    }

    // Resolve CTID trader account ID strictly
    let accountId = Number(targetKey);
    const isMasterRequest = !targetAccount || targetKey === '5881460' || targetKey === '48282756' || targetKey === String(process.env.CTRADER_ACCOUNT_ID);

    if (isMasterRequest) {
      accountId = Number(process.env.CTRADER_ACCOUNT_ID || 48282756);
    } else if (cached && cached.ctidTraderAccountId) {
      accountId = cached.ctidTraderAccountId;
    } else if (targetKey === '5877246') {
      accountId = 48218932;
    } else if (isNaN(accountId) || accountId < 10000000) {
      // Account is not registered under current Spotware OAuth CTID list
      if (cached) return cached;
      return null;
    }

    try {
      const accessToken = process.env.CTRADER_ACCESS_TOKEN;
      if (accessToken) {
        await this.transport.sendRequest(2102, { ctidTraderAccountId: accountId, accessToken }, 4000).catch(() => {});
      }

      const res = await this.transport.sendRequest(2121, { ctidTraderAccountId: accountId }, 4000);
      if (res.payloadType === 2122 && res.decodedPayload?.trader) {
        const trader = res.decodedPayload.trader;
        const moneyDigits = Number(trader.moneyDigits ?? 2);
        const divisor = Math.pow(10, moneyDigits);
        const rawBalance = Number(trader.balance || 0);
        const liveBalance = Number((rawBalance / divisor).toFixed(2));
        const leverageInCents = Number(trader.leverageInCents || 10000);
        const leverage = `1:${Math.round(leverageInCents / 100)}`;
        const traderLogin = String(trader.traderLogin || targetKey);

        let openPositionsCount = 0;
        try {
          const recRes = await this.transport.sendRequest(2124, { ctidTraderAccountId: accountId }, 3000);
          if (recRes.payloadType === 2125 && Array.isArray(recRes.decodedPayload?.position)) {
            openPositionsCount = recRes.decodedPayload.position.length;
            if (isMasterRequest) {
              this.lastOpenPositions = recRes.decodedPayload.position;
              this.emit('brokerPositionsUpdated', this.lastOpenPositions);
            }
          }
        } catch {}

        try {
          const dealsRes = await this.transport.sendRequest(2133, {
            ctidTraderAccountId: accountId,
            fromTimestamp: Date.now() - 90 * 24 * 60 * 60 * 1000,
            toTimestamp: Date.now() + 60 * 60 * 1000,
            maxRows: 500
          }, 4000);
          if (dealsRes.payloadType === 2134 && Array.isArray(dealsRes.decodedPayload?.deal)) {
            if (isMasterRequest) {
              this.lastClosedDeals = dealsRes.decodedPayload.deal;
              this.emit('brokerClosedDealsUpdated', this.lastClosedDeals);
            }
          }
        } catch {}

        const status = {
          balance: liveBalance,
          equity: liveBalance,
          accountNumber: traderLogin,
          ctidTraderAccountId: accountId,
          leverage,
          openPositionsCount,
          floatingPnL: 0,
          lastSyncedAt: Date.now()
        };

        this.accountsStatusMap.set(traderLogin, status);
        this.accountsStatusMap.set(String(accountId), status);

        if (targetKey === String(process.env.CTRADER_ACCOUNT_ID || '48282756') || traderLogin === '5881460') {
          this.lastLiveAccountStatus = status;
          this.emit('liveAccountUpdate', status);
        }
        return status;
      }
    } catch (err: any) {
      if (cached) return cached;
      if (this.lastLiveAccountStatus && (targetKey === '5881460' || targetKey === '48282756')) {
        return this.lastLiveAccountStatus;
      }
    }
    return cached || null;
  }

  public getLatestTick(pair: string): { bid: number; ask: number; timestamp: number } | null {
    if (!pair) return null;
    const normalized = pair.includes('/') ? pair : (pair.length === 6 ? `${pair.slice(0, 3)}/${pair.slice(3)}` : pair);
    const spot = this.spotByPair.get(normalized) || this.spotByPair.get(pair) || this.spotByPair.get(pair.replace('/', ''));
    if (spot && spot.bid > 0 && spot.ask > 0) {
      return { bid: spot.bid, ask: spot.ask, timestamp: spot.timestamp };
    }
    return null;
  }

  public getAllSpotPrices(): Record<string, number> {
    const prices: Record<string, number> = {};
    for (const [sym, spot] of this.spotByPair.entries()) {
      if (spot && spot.bid > 0 && spot.ask > 0) {
        const dec = sym.includes('JPY') ? 3 : (sym === 'XAU/USD' || sym === 'BTC/USD') ? 2 : 5;
        const mid = parseFloat(((spot.bid + spot.ask) / 2).toFixed(dec));
        prices[sym] = mid;
        prices[sym.replace('/', '')] = mid;
      }
    }
    return prices;
  }

  public async syncLiveAccount(): Promise<void> {
    try {
      await this.fetchLiveAccountStatus();
    } catch {}
  }

  public isConnected(): boolean {
    return !!(this.transport && this.transport.isConnected() && this.isAccountAuthenticated);
  }

  /**
   * Directly executes a market order via cTrader Open API ProtoOANewOrderReq (2106)
   */
  public async executeMarketOrderForSubscriber(params: {
    ctidTraderAccountId: number;
    symbol: string;
    direction: 'BUY' | 'SELL';
    quantity: number;
    stopLoss?: number;
    takeProfit?: number;
    accessToken?: string;
    orderType?: 'LIMIT' | 'MARKET';
    limitPrice?: number;
    masterOrderId?: string;
  }): Promise<{
    success: boolean;
    positionId?: string;
    orderId?: string;
    dealId?: string;
    executionPrice?: number;
    error?: string;
  }> {
    if (!this.transport || !this.transport.isConnected()) {
      return { success: false, error: 'cTrader broker transport disconnected' };
    }

    const { ctidTraderAccountId, symbol, direction, quantity, stopLoss, takeProfit } = params;
    const token = params.accessToken || process.env.CTRADER_ACCESS_TOKEN;

    try {
      // 1. Account Auth for this specific subscriber
      if (token) {
        await this.transport.sendRequest(2102, { ctidTraderAccountId, accessToken: token }, 5000).catch(() => {});
      }

      // 2. Resolve Symbol ID
      const symNorm = symbol.toUpperCase().replace('/', '').replace('_', '');
      const normalizedPair = symNorm.length===6 ? symNorm.slice(0,3)+'/'+symNorm.slice(3) : symbol;
      const symbolId=this.pairToSymbolId.get(normalizedPair as CurrencyPair);
      if(!symbolId)throw new Error('BROKER_SYMBOL_UNAVAILABLE');

      // 3. Compute Volume in Cents
      const isGold = symNorm.includes('XAU') || symNorm.includes('GOLD') || symbolId === 41;
      const isBtc = symNorm.includes('BTC') || symbolId === 22395;
      const isIndex = symNorm.includes('NAS') || symbolId === 21501;

      let volumeCents = Math.round(quantity * 10000000);
      if (isGold) volumeCents = Math.round(quantity * 10000);
      else if (isBtc) volumeCents = Math.round(quantity * 100);
      else if (isIndex) volumeCents = Math.max(100, Math.round(quantity * 100));

      const minVolume = isGold ? 100 : (isBtc ? 1 : (isIndex ? 100 : 100000));
      if (volumeCents < minVolume) volumeCents = minVolume;

      // 4. Build ProtoOANewOrderReq payload
      const payload: any = {
        ctidTraderAccountId,
        symbolId,
        orderType: params.orderType === 'LIMIT' ? 2 : 1,
        tradeSide: direction === 'BUY' ? 1 : 2,
        volume: volumeCents,
        comment: params.masterOrderId ? `QuantumAI_COPY_${params.masterOrderId}` : `QuantumAI_${Date.now()}`
      };

      const curTick = this.getLatestTick(symbol);
      const isJpy = symNorm.includes('JPY');
      const entryRef = curTick ? (direction === 'BUY' ? curTick.ask : curTick.bid) : (isJpy ? 155.0 : 1.0850);

      if (params.orderType === 'LIMIT') {
        if (!(params.limitPrice! > 0)) throw new Error('LIMIT_PRICE_REQUIRED');
        payload.limitPrice = params.limitPrice;
        payload.stopLoss = stopLoss;
        payload.takeProfit = takeProfit;
      }
      if (params.orderType !== 'LIMIT' && stopLoss && stopLoss > 0) {
        const slDiff = Math.abs(entryRef - stopLoss);
        payload.relativeStopLoss = Math.round(slDiff * 100000);
      }
      if (params.orderType !== 'LIMIT' && takeProfit && takeProfit > 0) {
        const tpDiff = Math.abs(takeProfit - entryRef);
        payload.relativeTakeProfit = Math.round(tpDiff * 100000);
      }

      console.log(`[CTRADER-LIVE-EXECUTION] Transmitting ProtoOANewOrderReq to cTrader broker for CTID #${ctidTraderAccountId}: symbol=${symbol} (${symbolId}), vol=${volumeCents}, side=${direction}`);
      const res = await this.transport.sendRequest(2106, payload, 8000);

      if (res.payloadType === 2126) {
        const rawPos = res.decodedPayload?.position || res.payload?.position;
        const rawOrder = res.decodedPayload?.order || res.payload?.order;
        const rawDeal = res.decodedPayload?.deal || res.payload?.deal;

        const posId = rawPos?.positionId ? String(rawPos.positionId) : (rawOrder?.positionId ? String(rawOrder.positionId) : undefined);
        const orderId = rawOrder?.orderId ? String(rawOrder.orderId) : undefined;
        const dealId = rawDeal?.dealId ? String(rawDeal.dealId) : undefined;
        const execPrice = rawDeal?.executionPrice || rawPos?.price || entryRef;

        return {
          success: true,
          positionId: posId,
          orderId,
          dealId,
          executionPrice: execPrice
        };
      }

      return { success: false, error: 'BROKER_CONFIRMATION_MISSING' };
    } catch (err: any) {
      console.warn(`[CTRADER-LIVE-EXECUTION] ProtoOANewOrderReq notice for CTID #${ctidTraderAccountId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Directly closes a position via cTrader Open API ProtoOAClosePositionReq (2111)
   */
  public async closePositionForSubscriber(params: {
    ctidTraderAccountId: number;
    positionId: number | string;
    volume: number;
    accessToken?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.transport || !this.transport.isConnected()) {
      return { success: false, error: 'cTrader broker transport disconnected' };
    }
    const { ctidTraderAccountId, positionId, volume } = params;
    const token = params.accessToken || process.env.CTRADER_ACCESS_TOKEN;

    try {
      if (token) {
        await this.transport.sendRequest(2102, { ctidTraderAccountId, accessToken: token }, 5000).catch(() => {});
      }

      console.log(`[CTRADER-LIVE-CLOSE] Transmitting ProtoOAClosePositionReq for CTID #${ctidTraderAccountId}: posId=${positionId}, vol=${volume}`);
      await this.transport.sendRequest(2111, {
        ctidTraderAccountId,
        positionId: Number(positionId),
        volume: Math.round(volume)
      }, 8000);

      return { success: true };
    } catch (err: any) {
      console.warn(`[CTRADER-LIVE-CLOSE] ProtoOAClosePositionReq notice for CTID #${ctidTraderAccountId}:`, err.message);
      return { success: false, error: err.message };
    }
  }
}

export const ctraderMarketDataFeedService = CTraderMarketDataFeedService.getInstance();

