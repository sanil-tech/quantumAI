import { ctraderMarketDataFeedService } from './ctraderMarketDataFeedService';
import { fetchRealCandleHistory } from '../../lib/marketDataGenerator';
import { CurrencyPair } from '../../types';

export interface PriceDivergenceRecord {
  symbol: CurrencyPair;
  cTraderBid: number | null;
  cTraderAsk: number | null;
  cTraderMid: number | null;
  externalReferencePrice: number | null;
  difference: number | null;
  differencePips: number | null;
  cTraderTimestamp: string | null;
  externalTimestamp: string | null;
  cTraderDataAgeMs: number | null;
  status: 'ALIGNED' | 'PRICE_DIVERGENCE_WARNING' | 'DATA_UNAVAILABLE';
  evaluatedAt: string;
}

export class MarketDivergenceDiagnosticService {
  private static instance: MarketDivergenceDiagnosticService;
  private diagnostics: Map<CurrencyPair, PriceDivergenceRecord> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private divergenceThresholdPips: number = 2.0;

  private constructor() {
    this.startPeriodicCheck();
  }

  public static getInstance(): MarketDivergenceDiagnosticService {
    if (!MarketDivergenceDiagnosticService.instance) {
      MarketDivergenceDiagnosticService.instance = new MarketDivergenceDiagnosticService();
    }
    return MarketDivergenceDiagnosticService.instance;
  }

  public setDivergenceThresholdPips(pips: number): void {
    this.divergenceThresholdPips = Math.max(0.5, pips);
  }

  public startPeriodicCheck(): void {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => {
      this.evaluateAllSymbols().catch(() => {});
    }, 15000);
  }

  public stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  public async evaluateSymbol(symbol: CurrencyPair): Promise<PriceDivergenceRecord> {
    const now = Date.now();
    const feedHealth = ctraderMarketDataFeedService.getFeedHealth();
    const symbolHealth = feedHealth.symbols[symbol];
    const cTraderMid = symbolHealth?.mid || null;
    const cTraderBid = symbolHealth?.bid || null;
    const cTraderAsk = symbolHealth?.ask || null;
    const cTraderTimestamp = symbolHealth?.lastSpotEventAt ? new Date(symbolHealth.lastSpotEventAt).toISOString() : null;
    const cTraderDataAgeMs = symbolHealth?.ageMs || null;

    let externalPrice: number | null = null;
    let externalTimestamp: string | null = null;

    try {
      const candles = await fetchRealCandleHistory(symbol, 'M1', 2);
      if (candles && candles.length > 0) {
        const latest = candles[candles.length - 1];
        externalPrice = latest.close;
        externalTimestamp = typeof latest.time === 'number' ? new Date(latest.time * 1000).toISOString() : String(latest.time);
      }
    } catch {
      // Diagnostic failure is non-fatal
    }

    const pipFactor = symbol === 'USD/JPY' ? 100 : (symbol === 'XAU/USD' || symbol === 'NASDAQ' || symbol === 'BTC/USD') ? 1 : 10000;
    let difference: number | null = null;
    let differencePips: number | null = null;
    let status: 'ALIGNED' | 'PRICE_DIVERGENCE_WARNING' | 'DATA_UNAVAILABLE' = 'DATA_UNAVAILABLE';

    if (cTraderMid !== null && externalPrice !== null) {
      difference = parseFloat((cTraderMid - externalPrice).toFixed(5));
      differencePips = parseFloat((Math.abs(difference) * pipFactor).toFixed(1));

      if (differencePips > this.divergenceThresholdPips || (cTraderDataAgeMs && cTraderDataAgeMs > 30000)) {
        status = 'PRICE_DIVERGENCE_WARNING';
        console.warn(
          `[DIAGNOSTIC-WARNING] Price divergence on ${symbol}: cTrader=${cTraderMid} (Age: ${cTraderDataAgeMs}ms) vs External=${externalPrice} (Diff: ${differencePips} pips)`
        );
      } else {
        status = 'ALIGNED';
      }
    }

    const record: PriceDivergenceRecord = {
      symbol,
      cTraderBid,
      cTraderAsk,
      cTraderMid,
      externalReferencePrice: externalPrice,
      difference,
      differencePips,
      cTraderTimestamp,
      externalTimestamp,
      cTraderDataAgeMs,
      status,
      evaluatedAt: new Date(now).toISOString()
    };

    this.diagnostics.set(symbol, record);
    return record;
  }

  public async evaluateAllSymbols(): Promise<Record<string, PriceDivergenceRecord>> {
    const symbols: CurrencyPair[] = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
    const results: Record<string, PriceDivergenceRecord> = {};

    for (const sym of symbols) {
      results[sym] = await this.evaluateSymbol(sym);
    }
    return results;
  }

  public getDiagnostics(): Record<string, PriceDivergenceRecord> {
    const res: Record<string, PriceDivergenceRecord> = {};
    this.diagnostics.forEach((val, key) => { res[key] = val; });
    return res;
  }
}

export const marketDivergenceDiagnosticService = MarketDivergenceDiagnosticService.getInstance();
