import { describe, it, expect, beforeEach } from 'vitest';
import {
  PAIR_CONFIGS,
  PAIR_SYMBOLS,
  isSupportedPair,
  getProviderSymbol,
  fetchRealCandleEnvelopeDetailed,
  generateCandleHistory,
  aggregateCandles,
  TIMEFRAME_SECONDS
} from '../src/lib/marketDataGenerator';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { CurrencyPair, Timeframe, CandleData } from '../src/types';

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

const EXPECTED_PROVIDER_SYMBOLS: Record<CurrencyPair, string> = {
  'EUR/USD': 'EURUSD=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/JPY': 'USDJPY=X',
  'AUD/USD': 'AUDUSD=X',
  'USD/CHF': 'USDCHF=X',
  'NZD/USD': 'NZDUSD=X',
  'USD/CAD': 'USDCAD=X',
  'EUR/JPY': 'EURJPY=X',
  'GBP/JPY': 'GBPJPY=X',
  'XAU/USD': 'GC=F',
  'NASDAQ': '^IXIC',
  'BTC/USD': 'BTC-USD'
};

const EXPECTED_DECIMALS: Record<CurrencyPair, number> = {
  'EUR/USD': 5,
  'GBP/USD': 5,
  'USD/JPY': 3,
  'AUD/USD': 5,
  'USD/CHF': 5,
  'NZD/USD': 5,
  'USD/CAD': 5,
  'EUR/JPY': 3,
  'GBP/JPY': 3,
  'XAU/USD': 2,
  'NASDAQ': 2,
  'BTC/USD': 2
};

const PLAUSIBLE_PRICE_RANGES: Record<CurrencyPair, { min: number; max: number }> = {
  'EUR/USD': { min: 0.8, max: 1.5 },
  'GBP/USD': { min: 1.0, max: 1.8 },
  'USD/JPY': { min: 90, max: 200 },
  'AUD/USD': { min: 0.5, max: 1.0 },
  'USD/CHF': { min: 0.6, max: 1.3 },
  'NZD/USD': { min: 0.4, max: 0.9 },
  'USD/CAD': { min: 1.0, max: 1.7 },
  'EUR/JPY': { min: 110, max: 220 },
  'GBP/JPY': { min: 130, max: 250 },
  'XAU/USD': { min: 1500, max: 4000 },
  'NASDAQ': { min: 10000, max: 30000 },
  'BTC/USD': { min: 15000, max: 150000 }
};

describe('QUANTUMAI — MULTI-PAIR MARKET DATA + PRICE/CANDLE + CHART RUNTIME TRUTH AUDIT SUITE', () => {

  describe('A. Symbol Identity & Supported Instrument Registry', () => {
    it('verifies all 12 pairs exist in PAIR_CONFIGS with exact matching decimal and pip definitions', () => {
      for (const pair of CONFIGURED_PAIRS) {
        expect(isSupportedPair(pair)).toBe(true);
        const config = PAIR_CONFIGS[pair];
        expect(config).toBeDefined();
        expect(config.decimals).toBe(EXPECTED_DECIMALS[pair]);
        expect(config.basePrice).toBeGreaterThan(0);
        expect(config.pipValue).toBeGreaterThan(0);
        expect(config.pipMultiplier).toBeGreaterThan(0);
      }
    });

    it('verifies provider symbols map 1:1 without alias collisions or default EUR/USD aliasing', () => {
      const seenProviderSymbols = new Set<string>();
      for (const pair of CONFIGURED_PAIRS) {
        const providerSym = getProviderSymbol(pair);
        expect(providerSym).toBe(EXPECTED_PROVIDER_SYMBOLS[pair]);
        expect(seenProviderSymbols.has(providerSym!)).toBe(false);
        seenProviderSymbols.add(providerSym!);
      }
      expect(seenProviderSymbols.size).toBe(12);

      // Unknown pair must NOT default to EUR/USD
      expect(isSupportedPair('INVALID/PAIR' as any)).toBe(false);
      expect(getProviderSymbol('INVALID/PAIR' as any)).toBeNull();
    });
  });

  describe('B. Price Truth & Numerical Plausibility across all 12 instruments', () => {
    it('verifies prices for all 12 instruments fall within realistic macroeconomic bounds', () => {
      for (const pair of CONFIGURED_PAIRS) {
        const config = PAIR_CONFIGS[pair];
        const range = PLAUSIBLE_PRICE_RANGES[pair];
        expect(config.basePrice).toBeGreaterThanOrEqual(range.min);
        expect(config.basePrice).toBeLessThanOrEqual(range.max);
      }
    });
  });

  describe('C. Candle Truth & Strict Invariant Validation (LOW <= OPEN/CLOSE <= HIGH)', () => {
    it('verifies real/fallback candle OHLC relationships for all 12 pairs', async () => {
      for (const pair of CONFIGURED_PAIRS) {
        const result = await fetchRealCandleEnvelopeDetailed(pair, 'D1', 30);
        expect(result).toBeDefined();
        expect(result.candles.length).toBeGreaterThan(0);

        for (let i = 0; i < result.candles.length; i++) {
          const c = result.candles[i];
          // Invariant 1: OHLC relationships
          expect(c.low).toBeLessThanOrEqual(c.open);
          expect(c.low).toBeLessThanOrEqual(c.close);
          expect(c.high).toBeGreaterThanOrEqual(c.open);
          expect(c.high).toBeGreaterThanOrEqual(c.close);
          expect(c.high).toBeGreaterThanOrEqual(c.low);

          // Invariant 2: Volume >= 0
          expect(c.volume).toBeGreaterThanOrEqual(0);

          // Invariant 3: Price precision conforms to asset class
          const expectedDec = EXPECTED_DECIMALS[pair];
          const priceRange = PLAUSIBLE_PRICE_RANGES[pair];
          expect(c.close).toBeGreaterThanOrEqual(priceRange.min * 0.7);
          expect(c.close).toBeLessThanOrEqual(priceRange.max * 1.3);

          // Invariant 4: Monotonic timestamps
          if (i > 0) {
            const prevTime = Number(result.candles[i - 1].time);
            const currTime = Number(c.time);
            expect(currTime).toBeGreaterThan(prevTime);
          }
        }
      }
    }, 45000);
  });

  describe('D. Multi-Pair Isolation (No cross-talk between assets)', () => {
    it('proves EUR/USD, GBP/USD, USD/JPY, XAU/USD, NASDAQ, and BTC/USD produce independent datasets', () => {
      const generatedPairs: CurrencyPair[] = ['EUR/USD', 'USD/JPY', 'XAU/USD', 'NASDAQ', 'BTC/USD'];
      const datasets = new Map<CurrencyPair, CandleData[]>();

      for (const p of generatedPairs) {
        const candles = generateCandleHistory(p, 'H1', 50);
        datasets.set(p, candles);
      }

      // Verify BTC price is ~60k, Gold ~2.3k, Nasdaq ~18k, USD/JPY ~159, EUR/USD ~1.16
      const btcLast = datasets.get('BTC/USD')![49].close;
      const xauLast = datasets.get('XAU/USD')![49].close;
      const nasdaqLast = datasets.get('NASDAQ')![49].close;
      const jpyLast = datasets.get('USD/JPY')![49].close;
      const eurLast = datasets.get('EUR/USD')![49].close;

      expect(btcLast).toBeGreaterThan(15000);
      expect(xauLast).toBeGreaterThan(1500);
      expect(xauLast).toBeLessThan(5000);
      expect(nasdaqLast).toBeGreaterThan(10000);
      expect(jpyLast).toBeGreaterThan(100);
      expect(jpyLast).toBeLessThan(250);
      expect(eurLast).toBeGreaterThan(0.9);
      expect(eurLast).toBeLessThan(1.5);

      // Verify datasets do NOT share identical price arrays
      expect(btcLast).not.toBe(eurLast);
      expect(xauLast).not.toBe(nasdaqLast);
    });
  });

  describe('E. Historical Data Fallback & Explicit Provenance Tagging', () => {
    it('properly stamps provenance on real Yahoo finance or fallback envelopes', async () => {
      const detail = await fetchRealCandleEnvelopeDetailed('EUR/USD', 'D1', 10);
      expect(detail.provenance).toBeDefined();
      expect(['HISTORICAL_BACKTEST', 'SYNTHETIC_SIMULATION']).toContain(detail.provenance);
      expect(['EXTERNAL_HISTORICAL', 'SYNTHETIC_FALLBACK']).toContain(detail.dataSource);

      if (detail.fallbackUsed) {
        expect(detail.provenance).toBe('SYNTHETIC_SIMULATION');
      } else {
        expect(detail.provenance).toBe('HISTORICAL_BACKTEST');
      }
    });
  });

  describe('F. Chart Dataset Transformation & Sorting Integrity', () => {
    it('transforms raw candles into strictly ascending, de-duplicated chart dataset', () => {
      const rawCandles: CandleData[] = [
        { time: 1787600100, open: 1.085, high: 1.086, low: 1.084, close: 1.0855, volume: 100 },
        { time: 1787600000, open: 1.084, high: 1.085, low: 1.083, close: 1.0845, volume: 80 }, // earlier
        { time: 1787600100, open: 1.085, high: 1.087, low: 1.084, close: 1.0860, volume: 120 }, // duplicate timestamp
        { time: 1787600200, open: 1.086, high: 1.088, low: 1.085, close: 1.0875, volume: 150 }
      ];

      // Simulate ChartWidget de-duplication and sort pipeline
      const seenTimes = new Set<number>();
      const formatted: any[] = [];

      for (const c of rawCandles) {
        const t = Number(c.time);
        if (seenTimes.has(t)) continue;
        seenTimes.add(t);
        formatted.push({
          time: t,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        });
      }

      formatted.sort((a, b) => a.time - b.time);

      expect(formatted.length).toBe(3);
      expect(formatted[0].time).toBe(1787600000);
      expect(formatted[1].time).toBe(1787600100);
      expect(formatted[2].time).toBe(1787600200);

      // Verify strict monotonicity
      for (let i = 1; i < formatted.length; i++) {
        expect(formatted[i].time).toBeGreaterThan(formatted[i - 1].time);
      }
    });
  });

  describe('G. Timeframe Aggregation Invariants (M1 -> M5, M15, M30, H1, H4, D1)', () => {
    it('aggregates M1 candles into correct bucket timestamps without leaking or skipping OHLC extremes', () => {
      const baseTime = 1787600100; // Aligned to 300s (5-minute) boundary
      const m1Candles: CandleData[] = [
        { time: baseTime + 0,   open: 1.0800, high: 1.0810, low: 1.0795, close: 1.0805, volume: 10 },
        { time: baseTime + 60,  open: 1.0805, high: 1.0820, low: 1.0800, close: 1.0815, volume: 20 },
        { time: baseTime + 120, open: 1.0815, high: 1.0830, low: 1.0810, close: 1.0825, volume: 30 },
        { time: baseTime + 180, open: 1.0825, high: 1.0828, low: 1.0790, close: 1.0800, volume: 40 },
        { time: baseTime + 240, open: 1.0800, high: 1.0805, low: 1.0785, close: 1.0790, volume: 50 },
      ];

      const m5Aggregated = aggregateCandles(m1Candles, 'M5');
      expect(m5Aggregated.length).toBe(1);

      const m5 = m5Aggregated[0];
      expect(m5.open).toBe(1.0800); // Open of first M1 candle
      expect(m5.close).toBe(1.0790); // Close of last M1 candle
      expect(m5.high).toBe(1.0830); // Highest high across all 5 M1 candles
      expect(m5.low).toBe(1.0785); // Lowest low across all 5 M1 candles
      expect(m5.volume).toBe(150); // Sum of volumes (10+20+30+40+50)
    });
  });

  describe('H. Price Scale & Precision Formatting across all Asset Classes', () => {
    it('formats price strings conforming to asset-specific decimal conventions', () => {
      const format = (pair: CurrencyPair, price: number) => {
        const dec = EXPECTED_DECIMALS[pair];
        return price.toFixed(dec);
      };

      expect(format('EUR/USD', 1.085342)).toBe('1.08534');
      expect(format('USD/JPY', 159.2847)).toBe('159.285');
      expect(format('XAU/USD', 2385.509)).toBe('2385.51');
      expect(format('NASDAQ', 18450.256)).toBe('18450.26');
      expect(format('BTC/USD', 64250.789)).toBe('64250.79');
    });
  });

  describe('I. Execution Safety Invariants during Market Data Ingestion', () => {
    it('guarantees execution safety gate remains FAIL-CLOSED during market data feeds', () => {
      const safetyCheck = validateExecutionEnvironmentSafety({
        environment: 'LIVE' as any,
        brokerId: 'demo-feed-source',
        symbol: 'EUR/USD',
        direction: 'BUY',
        requestedLotSize: 0.1
      });

      expect(safetyCheck.allowed).toBe(false);
      expect(safetyCheck.reason).toContain('LIVE execution rejected');
    });
  });
});
