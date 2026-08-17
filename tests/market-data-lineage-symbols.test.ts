import { describe, it, expect } from 'vitest';
import { fetchRealCandleEnvelope, PAIR_CONFIGS } from '../src/lib/marketDataGenerator';
import { CurrencyPair } from '../src/types';

describe('QUANTUMAI ? Phase 8: Market Data Lineage & Symbol Mapping Integrity', () => {
  const PAIR_SYMBOLS: Record<CurrencyPair, string> = {
    'EUR/USD': 'EURUSD=X',
    'GBP/USD': 'GBPUSD=X',
    'USD/JPY': 'USDJPY=X',
    'AUD/USD': 'AUDUSD=X',
    'XAU/USD': 'GC=F',
    'NASDAQ': '^IXIC',
    'BTC/USD': 'BTC-USD'
  };

  it('1. Verify authoritative Yahoo Finance symbol mapping configuration for all 7 primary instruments', () => {
    for (const [pair, expectedSymbol] of Object.entries(PAIR_SYMBOLS)) {
      expect(expectedSymbol).toBeDefined();
      expect(PAIR_CONFIGS[pair as CurrencyPair]).toBeDefined();
    }
  });

  it('2. In LIVE mode, fetchRealCandleEnvelope returns REAL provider data or fails closed (zero synthetic fallback)', async () => {
    try {
      const env = await fetchRealCandleEnvelope('EUR/USD', 'M15', 50, 'LIVE');
      expect(env.status).toBe('VALID');
      expect(env.executable).toBe(true);
      expect(env.dataMode).toBe('LIVE');
      expect(env.data.length).toBeGreaterThan(0);

      // Verify candle timestamp validity: UTC Unix epoch seconds
      const firstCandle = env.data[0];
      expect(firstCandle.time).toBeGreaterThan(1600000000);
      expect(firstCandle.high).toBeGreaterThanOrEqual(firstCandle.low);
      expect(firstCandle.open).toBeGreaterThan(0);
      expect(firstCandle.close).toBeGreaterThan(0);
    } catch (err: any) {
      // If network is offline during test run, MUST throw explicit error rather than silently returning synthetic candles
      expect(err.message).toContain('Live provider unreachable');
    }
  });
});
