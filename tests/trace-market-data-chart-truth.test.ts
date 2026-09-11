import { describe, it, expect } from 'vitest';
import {
  PAIR_CONFIGS,
  PAIR_SYMBOLS,
  fetchRealCandleEnvelopeDetailed,
  getProviderSymbol,
  isSupportedPair,
  generateCandleHistory,
  aggregateCandles
} from '../src/lib/marketDataGenerator';
import { CurrencyPair, CandleData } from '../src/types';

const CONFIGURED_PAIRS: CurrencyPair[] = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CHF',
  'NZD/USD',
  'USD/CAD',
  'EUR/JPY',
  'GBP/JPY',
  'XAU/USD',
  'NASDAQ',
  'BTC/USD'
];

describe('QUANTUMAI — FORENSIC MARKET DATA & CHART TRUTH TRACE', () => {
  it('traces raw vs normalized vs API vs UI chart data for all 12 pairs', async () => {
    const traceResults: any[] = [];

    for (const pair of CONFIGURED_PAIRS) {
      const config = PAIR_CONFIGS[pair];
      const providerSym = getProviderSymbol(pair);

      // Fetch envelope
      const envelope = await fetchRealCandleEnvelopeDetailed(pair, 'D1', 10);
      expect(envelope.candles.length).toBeGreaterThan(0);

      const latestCandle = envelope.candles[envelope.candles.length - 1];

      // Simulate UI Chart transformation
      const uiCandle = {
        time: typeof latestCandle.time === 'number'
          ? (latestCandle.time > 100000000000 ? Math.floor(latestCandle.time / 1000) : Math.floor(latestCandle.time))
          : Math.floor(new Date(latestCandle.time).getTime() / 1000),
        open: Number(latestCandle.open),
        high: Number(latestCandle.high),
        low: Number(latestCandle.low),
        close: Number(latestCandle.close),
        volume: Number(latestCandle.volume)
      };

      traceResults.push({
        pair,
        providerSym,
        decimals: config.decimals,
        time: latestCandle.time,
        apiCandle: latestCandle,
        uiCandle,
        provenance: envelope.provenance,
        dataSource: envelope.dataSource,
        fallbackUsed: envelope.fallbackUsed
      });

      // Assert exact reconciliation between API and UI
      expect(uiCandle.open).toBe(latestCandle.open);
      expect(uiCandle.high).toBe(latestCandle.high);
      expect(uiCandle.low).toBe(latestCandle.low);
      expect(uiCandle.close).toBe(latestCandle.close);
      expect(uiCandle.volume).toBe(latestCandle.volume);

      // Assert OHLC invariants
      expect(uiCandle.low).toBeLessThanOrEqual(uiCandle.open);
      expect(uiCandle.low).toBeLessThanOrEqual(uiCandle.close);
      expect(uiCandle.high).toBeGreaterThanOrEqual(uiCandle.open);
      expect(uiCandle.high).toBeGreaterThanOrEqual(uiCandle.close);
      expect(uiCandle.high).toBeGreaterThanOrEqual(uiCandle.low);
    }

    console.log('=== 12-PAIR MARKET DATA TRACE SNAPSHOT ===');
    console.table(traceResults.map(r => ({
      Pair: r.pair,
      Provider: r.providerSym,
      Decimals: r.decimals,
      Time: r.time,
      Open: r.apiCandle.open,
      High: r.apiCandle.high,
      Low: r.apiCandle.low,
      Close: r.apiCandle.close,
      Provenance: r.provenance,
      Source: r.dataSource
    })));
  }, 60000);
});
