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
      'EUR/USD': 1.08520,
      'GBP/USD': 1.26400,
      'EUR/JPY': 178.302,
      'USD/JPY': 155.450,
      'AUD/USD': 0.65200,
      'USD/CHF': 0.88450,
      'GBP/JPY': 196.420,
      'USD/CAD': 1.39850,
      'NZD/USD': 0.58900,
      'XAU/USD': 2652.50,
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

    this.transport.on('disconnect', () => {
      this.isFeedActive = false;
      this.connectionState = 'DISCONNECTED';
      for (const pair of this.symbolMap.values()) {
        this.healthStateByPair.set(pair, 'DISCONNECTED');
      }
      this.logStructuredEvent('CTRADER_DISCONNECTED', { reason: 'Transport disconnected' });
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

  public startHealthWatchdog(): void {
    if (this.watchdogTimer) return;

    this.watchdogTimer = setInterval(() => {
      this.evaluateFeedHealth();
    }, 3000);
    if (this.watchdogTimer.unref) {
      this.watchdogTimer.unref();
    }
  }

  public stopHealthWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  public evaluateFeedHealth(): MarketDataHealthReport {
    const now = Date.now();
    const subscribedPairs: CurrencyPair[] = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'NZD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY', 'XAU/USD'];
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

    // If transport is disconnected or all subscribed feeds are STALE, trigger controlled auto-reconnect
    const shouldReconnect = (!this.isFeedActive || (this.connectionState !== 'CONNECTING' && allStale)) && 
                            !this.isConnecting && 
                            !this.isReconnecting && 
                            this.reconnectAttempts < 10;
    if (shouldReconnect) {
      console.warn('[CTRADER-WATCHDOG] Feed is inactive or STALE. Triggering controlled auto-reconnect (attempt ' + (this.reconnectAttempts + 1) + ')...');
      this.triggerControlledReconnect().catch(err => {
        console.error('[CTRADER-WATCHDOG] Reconnect error:', err?.message || err);
      });
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
      const accAuthRes = await this.transport.sendRequest(2102, { ctidTraderAccountId: Number(accountId), accessToken }, 7000);
      this.logStructuredEvent('CTRADER_ACCOUNT_AUTHENTICATED', { 
        accountId, 
        ctidTraderAccountId: accAuthRes.decodedPayload?.ctidTraderAccountId || accountId 
      });
      this.isAccountAuthenticated = true;

      // 4. Resubscribe spots for all supported symbols
      const spotSymbolIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 41];
      await this.transport.subscribeSpots(Number(accountId), spotSymbolIds, true, 7000);
      this.logStructuredEvent('CTRADER_SPOT_SUBSCRIBED', { symbols: spotSymbolIds });

      this.isFeedActive = true;
      this.lastReconnectSuccessAt = Date.now();
      this.isReconnecting = false;
      this.logStructuredEvent('CTRADER_READY', {
        success: true,
        attempt: this.reconnectAttempts
      });

      // Immediately sync and reconcile all positions from cTrader to PostgreSQL
      try {
        await this.fetchRawOpenPositions();
        const { brokerReconciliationService } = await import('../../../apps/execution-router/src/services/brokerReconciliationService');
        await brokerReconciliationService.reconcile(String(accountId));
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
        const accAuthRes = await this.transport.sendRequest(2102, {
          ctidTraderAccountId: Number(accountId),
          accessToken
        }, 7000);
        this.logStructuredEvent('CTRADER_ACCOUNT_AUTHENTICATED', { 
          accountId, 
          ctidTraderAccountId: accAuthRes.decodedPayload?.ctidTraderAccountId || accountId 
        });
        this.isAccountAuthenticated = true;

        const spotSymbolIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 41];
        await this.transport.subscribeSpots(Number(accountId), spotSymbolIds, true, 7000);
        this.logStructuredEvent('CTRADER_SPOT_SUBSCRIBED', { symbols: spotSymbolIds });

        // Warmup historical M1 candles from REST (display only)
        const pairsToWarm: CurrencyPair[] = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY', 'USD/CHF', 'NZD/USD'];
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

  private lastOpenPositions: any[] = [];

  public getTransport(): CTraderTransport {
    return this.transport;
  }

  public getLastOpenPositions(): any[] {
    return this.lastOpenPositions;
  }

  public async fetchRawOpenPositions(): Promise<any[]> {
    if (!this.transport || !this.transport.isConnected() || !this.isAccountAuthenticated) {
      await this.startFeed().catch(() => {});
    }
    if (!this.transport || !this.transport.isConnected() || !this.isAccountAuthenticated) {
      return this.lastOpenPositions;
    }
    try {
      const accountId = Number(process.env.CTRADER_ACCOUNT_ID || 48282756);
      const recRes = await this.transport.sendRequest(2124, { ctidTraderAccountId: accountId }, 8000);
      if (recRes.payloadType === 2125 && Array.isArray(recRes.decodedPayload?.position)) {
        this.lastOpenPositions = recRes.decodedPayload.position;
        return this.lastOpenPositions;
      }
    } catch (err: any) {
      console.warn('[CTRADER-FEED] fetchRawOpenPositions error:', err.message);
    }
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
      if (dealsRes.payloadType === 2134 && Array.isArray(dealsRes.decodedPayload?.deal)) {
        this.lastClosedDeals = dealsRes.decodedPayload.deal;
        this.emit('brokerClosedDealsUpdated', this.lastClosedDeals);
        return this.lastClosedDeals;
      }
    } catch (err: any) {
      console.warn('[CTRADER-FEED] fetchRawClosedDeals error:', err.message);
    }
    return this.lastClosedDeals;
  }

  public async fetchLiveAccountStatus(): Promise<{
    balance: number;
    equity: number;
    accountNumber: string;
    ctidTraderAccountId: number;
    leverage: string;
    openPositionsCount: number;
    floatingPnL: number;
  } | null> {
    if (!this.transport || !this.transport.isConnected()) return null;
    try {
      const accountId = Number(process.env.CTRADER_ACCOUNT_ID || 48282756);
      const res = await this.transport.sendRequest(2121, { ctidTraderAccountId: accountId }, 4000);
      if (res.payloadType === 2122 && res.decodedPayload?.trader) {
        const trader = res.decodedPayload.trader;
        const moneyDigits = Number(trader.moneyDigits ?? 2);
        const divisor = Math.pow(10, moneyDigits);
        const rawBalance = Number(trader.balance || 0);
        const liveBalance = Number((rawBalance / divisor).toFixed(2));
        const leverageInCents = Number(trader.leverageInCents || 10000);
        const leverage = `1:${Math.round(leverageInCents / 100)}`;
        const traderLogin = String(trader.traderLogin || '5881460');

        let openPositionsCount = 0;
        try {
          const recRes = await this.transport.sendRequest(2124, { ctidTraderAccountId: accountId }, 3000);
          if (recRes.payloadType === 2125 && Array.isArray(recRes.decodedPayload?.position)) {
            this.lastOpenPositions = recRes.decodedPayload.position;
            openPositionsCount = this.lastOpenPositions.length;
            this.emit('brokerPositionsUpdated', this.lastOpenPositions);
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
            this.lastClosedDeals = dealsRes.decodedPayload.deal;
            this.emit('brokerClosedDealsUpdated', this.lastClosedDeals);
          }
        } catch {}

        const status = {
          balance: liveBalance,
          equity: liveBalance,
          accountNumber: traderLogin,
          ctidTraderAccountId: accountId,
          leverage,
          openPositionsCount,
          floatingPnL: 0
        };

        this.lastLiveAccountStatus = status;
        this.emit('liveAccountUpdate', status);
        return status;
      }
    } catch (err: any) {
      // Return cached status if available
      if (this.lastLiveAccountStatus) return this.lastLiveAccountStatus;
    }
    return null;
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
}

export const ctraderMarketDataFeedService = CTraderMarketDataFeedService.getInstance();
