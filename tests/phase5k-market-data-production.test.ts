import { describe, it, expect } from 'vitest';
import {
  buildMarketDataEnvelope,
  validateCandleArray,
  checkCandleFreshness,
  deriveExecutability,
  validateSingleCandle,
  normalizeSymbol,
  validateTick,
  deduplicateAndSortCandles,
  detectTimeframeGaps
} from '../packages/core/src/marketDataValidator';
import { validateExecutionSafety } from '../src/server/services/liveExecutionSafetyGuard';
import { intelligenceService } from '../apps/intelligence/src/server';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { MarketDataLineage } from '../src/server/domain/types';

describe('Phase 5K — Market Data Production Certification', () => {
  const baseNow = 1700000000000; // Reference timestamp

  const createValidCandles = (count = 10, startMs = baseNow - 600000, stepMs = 60000) => {
    const candles = [];
    for (let i = 0; i < count; i++) {
      const timeMs = startMs + i * stepMs;
      const base = 1.0850 + i * 0.0001;
      candles.push({
        time: Math.floor(timeMs / 1000), // seconds
        open: Number(base.toFixed(5)),
        high: Number((base + 0.0010).toFixed(5)),
        low: Number((base - 0.0010).toFixed(5)),
        close: Number((base + 0.0002).toFixed(5)),
        volume: 1000 + i * 10
      });
    }
    return candles;
  };

  // Section 1: Provenance & Data Lineage Isolation
  describe('1. Provenance & Data Lineage Isolation', () => {
    it('P5K-01: Valid LIVE data generates valid envelope with executable: true', () => {
      const candles = createValidCandles(10, baseNow - 540000, 60000);
      const env = buildMarketDataEnvelope('EUR/USD', 'M1', 'LIVE', candles, 'YahooFinance', 'YAHOO', undefined, undefined, baseNow);

      expect(env.status).toBe('VALID');
      expect(env.dataMode).toBe('LIVE');
      expect(env.executable).toBe(true);
      expect(env.provenance.provider).toBe('YAHOO');
      expect(env.provenance.source).toBe('YahooFinance');
      expect(env.freshness.isFresh).toBe(true);
    });

    it('P5K-02: SYNTHETIC and MOCK data providers are strictly non-executable for LIVE execution', () => {
      const candles = createValidCandles(10, baseNow - 540000, 60000);
      const synthEnv = buildMarketDataEnvelope('EUR/USD', 'M1', 'LIVE', candles, 'SyntheticGenerator', 'SYNTHETIC', undefined, undefined, baseNow);
      const mockEnv = buildMarketDataEnvelope('EUR/USD', 'M1', 'LIVE', candles, 'MockProvider', 'MOCK_QUANT_PROVIDER', undefined, undefined, baseNow);

      expect(synthEnv.executable).toBe(false);
      expect(synthEnv.reason).toContain('SYNTHETIC_OR_MOCK_PROVIDER');

      expect(mockEnv.executable).toBe(false);
      expect(mockEnv.reason).toContain('SYNTHETIC_OR_MOCK_PROVIDER');
    });

    it('P5K-03: Safety guard rejects non-LIVE lineages for REAL_LIVE execution environment', () => {
      const testCases: MarketDataLineage[] = [
        { dataClass: 'SIMULATED', provider: 'SimEngine', symbol: 'EUR/USD', timestamp: baseNow, receivedAt: baseNow },
        { dataClass: 'SYNTHETIC', provider: 'Generator', symbol: 'EUR/USD', timestamp: baseNow, receivedAt: baseNow },
        { dataClass: 'UNKNOWN', provider: 'Unknown', symbol: 'EUR/USD', timestamp: baseNow, receivedAt: baseNow },
        { dataClass: 'HISTORICAL', provider: 'Archive', symbol: 'EUR/USD', timestamp: baseNow, receivedAt: baseNow }
      ];

      for (const lineage of testCases) {
        const result = validateExecutionSafety('REAL_LIVE', lineage);
        expect(result.allowed).toBe(false);
        expect(result.code).toBeDefined();
      }
    });

    it('P5K-04: Missing lineage metadata fails closed on live execution safety guard', () => {
      const result = validateExecutionSafety('REAL_LIVE', undefined);
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('MISSING_LINEAGE');
    });
  });

  // Section 2: Symbol Normalization Certification
  describe('2. Symbol Normalization Certification', () => {
    it('P5K-05: Normalizes major forex pair raw symbol variations to canonical representation', () => {
      expect(normalizeSymbol('eurusd')).toBe('EUR/USD');
      expect(normalizeSymbol('EURUSD')).toBe('EUR/USD');
      expect(normalizeSymbol('EUR/USD')).toBe('EUR/USD');
      expect(normalizeSymbol('EURUSD=X')).toBe('EUR/USD');

      expect(normalizeSymbol('gbpusd')).toBe('GBP/USD');
      expect(normalizeSymbol('GBPUSD=X')).toBe('GBP/USD');

      expect(normalizeSymbol('usdjpy')).toBe('USD/JPY');
      expect(normalizeSymbol('USDJPY=X')).toBe('USD/JPY');

      expect(normalizeSymbol('audusd')).toBe('AUD/USD');
      expect(normalizeSymbol('xauusd')).toBe('XAU/USD');
      expect(normalizeSymbol('GC=F')).toBe('XAU/USD');
    });

    it('P5K-06: Normalizes indices and crypto assets to canonical format', () => {
      expect(normalizeSymbol('US100')).toBe('NASDAQ');
      expect(normalizeSymbol('^IXIC')).toBe('NASDAQ');
      expect(normalizeSymbol('NASDAQ')).toBe('NASDAQ');

      expect(normalizeSymbol('btcusd')).toBe('BTC/USD');
      expect(normalizeSymbol('BTC-USD')).toBe('BTC/USD');
      expect(normalizeSymbol('BTC/USD')).toBe('BTC/USD');
    });

    it('P5K-07: Fails closed on invalid or ambiguous symbol inputs', () => {
      expect(() => normalizeSymbol('')).toThrow('INVALID_SYMBOL');
      expect(() => normalizeSymbol('  ')).toThrow('AMBIGUOUS_OR_INVALID_SYMBOL');
      expect(() => normalizeSymbol('UNKNOWN')).toThrow('AMBIGUOUS_OR_INVALID_SYMBOL');
      expect(() => normalizeSymbol('UNDEFINED')).toThrow('AMBIGUOUS_OR_INVALID_SYMBOL');
      expect(() => normalizeSymbol('###INVALID###')).toThrow('AMBIGUOUS_OR_INVALID_SYMBOL');
    });
  });

  // Section 3: Tick & Quote Price Validation
  describe('3. Tick & Quote Price Validation', () => {
    it('P5K-08: Validates normal bid/ask tick data', () => {
      const validTick = { symbol: 'EUR/USD', bid: 1.08500, ask: 1.08510, timestamp: baseNow };
      const res = validateTick(validTick, baseNow);
      expect(res.valid).toBe(true);
      expect(res.status).toBe('VALID');
    });

    it('P5K-09: Rejects negative spread (bid > ask)', () => {
      const invalidTick = { symbol: 'EUR/USD', bid: 1.08550, ask: 1.08500, timestamp: baseNow };
      const res = validateTick(invalidTick, baseNow);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('NEGATIVE_SPREAD_BID_GREATER_THAN_ASK');
    });

    it('P5K-10: Rejects non-finite or non-positive prices', () => {
      expect(validateTick({ symbol: 'EUR/USD', bid: -1.0, ask: 1.085, timestamp: baseNow }, baseNow).valid).toBe(false);
      expect(validateTick({ symbol: 'EUR/USD', bid: NaN, ask: 1.085, timestamp: baseNow }, baseNow).valid).toBe(false);
      expect(validateTick({ symbol: 'EUR/USD', bid: 1.085, ask: Infinity, timestamp: baseNow }, baseNow).valid).toBe(false);
    });

    it('P5K-11: Rejects extreme anomalous spreads', () => {
      const anomalousTick = { symbol: 'EUR/USD', bid: 1.0000, ask: 2.0000, timestamp: baseNow };
      const res = validateTick(anomalousTick, baseNow);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('ANOMALOUS_SPREAD_EXCEEDS_THRESHOLD');
    });
  });

  // Section 4: Timestamp Integrity & Monotonic Ordering
  describe('4. Timestamp Integrity & Monotonic Ordering', () => {
    it('P5K-12: Rejects future timestamps beyond clock drift tolerance', () => {
      const futureTime = Math.floor((baseNow + 120000) / 1000); // 2 minutes in future
      const candles = [{ time: futureTime, open: 1.08, high: 1.09, low: 1.07, close: 1.08, volume: 100 }];

      const validation = validateCandleArray(candles, baseNow);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('FUTURE_TIMESTAMP_DETECTED');
    });

    it('P5K-13: Rejects out-of-order candlestick timestamps', () => {
      const unordered = [
        { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.08, volume: 100 },
        { time: 900, open: 1.08, high: 1.09, low: 1.07, close: 1.08, volume: 100 }
      ];

      const validation = validateCandleArray(unordered, baseNow);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('TIMESTAMP_ORDERING_INVALID');
    });

    it('P5K-14: Rejects duplicate timestamps within candle array', () => {
      const duplicates = [
        { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.08, volume: 100 },
        { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.08, volume: 100 }
      ];

      const validation = validateCandleArray(duplicates, baseNow);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('DUPLICATE_TIMESTAMP_DETECTED');
    });
  });

  // Section 5: Data Freshness & Fail-Closed Gating
  describe('5. Data Freshness & Fail-Closed Gating', () => {
    it('P5K-15: Evaluates freshness correctly against timeframe max age', () => {
      const freshCandles = createValidCandles(5, baseNow - 120000, 30000); // latest is 30s old
      const staleCandles = createValidCandles(5, baseNow - 7200000, 60000); // latest is 2 hours old for M15

      const freshEval = checkCandleFreshness(freshCandles, 'M15', baseNow);
      expect(freshEval.isFresh).toBe(true);

      const staleEval = checkCandleFreshness(staleCandles, 'M15', baseNow);
      expect(staleEval.isFresh).toBe(false);
    });

    it('P5K-16: Stale market data automatically sets envelope status to STALE and executable to false', () => {
      const staleCandles = createValidCandles(5, baseNow - 7200000, 60000);
      const env = buildMarketDataEnvelope('EUR/USD', 'M15', 'LIVE', staleCandles, 'YahooFinance', 'YAHOO', undefined, undefined, baseNow);

      expect(env.status).toBe('STALE');
      expect(env.executable).toBe(false);
      expect(env.reason).toContain('MARKET_DATA_STALE');
    });
  });

  // Section 6: OHLC Integrity & Structural Bounds
  describe('6. OHLC Integrity & Structural Bounds', () => {
    it('P5K-17: Rejects candles where high < low', () => {
      const invalid = { time: 1000, open: 1.08, high: 1.07, low: 1.09, close: 1.08 };
      const val = validateSingleCandle(invalid);
      expect(val.valid).toBe(false);
      expect(val.reason).toBe('HIGH_LESS_THAN_LOW');
    });

    it('P5K-18: Rejects candles where open or close exceeds high', () => {
      const invalidOpen = { time: 1000, open: 1.10, high: 1.09, low: 1.07, close: 1.08 };
      expect(validateSingleCandle(invalidOpen).reason).toBe('OPEN_OR_CLOSE_EXCEEDS_HIGH');

      const invalidClose = { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.10 };
      expect(validateSingleCandle(invalidClose).reason).toBe('OPEN_OR_CLOSE_EXCEEDS_HIGH');
    });

    it('P5K-19: Rejects candles where open or close is below low', () => {
      const invalidOpen = { time: 1000, open: 1.06, high: 1.09, low: 1.07, close: 1.08 };
      expect(validateSingleCandle(invalidOpen).reason).toBe('OPEN_OR_CLOSE_BELOW_LOW');
    });

    it('P5K-20: Rejects non-finite OHLC values', () => {
      const nanCandle = { time: 1000, open: NaN, high: 1.09, low: 1.07, close: 1.08 };
      expect(validateSingleCandle(nanCandle).reason).toBe('OHLC_NON_FINITE_OR_NON_POSITIVE');
    });
  });

  // Section 7: Deduplication, Sorting & Gap Detection
  describe('7. Deduplication, Sorting & Gap Detection', () => {
    it('P5K-21: Deduplicates candles by timestamp and sorts them in ascending order', () => {
      const messyCandles = [
        { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.08 },
        { time: 800, open: 1.08, high: 1.09, low: 1.07, close: 1.08 },
        { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.08 }, // duplicate
        { time: 900, open: 1.08, high: 1.09, low: 1.07, close: 1.08 }
      ];

      const cleaned = deduplicateAndSortCandles(messyCandles);
      expect(cleaned.length).toBe(3);
      expect(cleaned[0].time).toBe(800);
      expect(cleaned[1].time).toBe(900);
      expect(cleaned[2].time).toBe(1000);
    });

    it('P5K-22: Detects significant timeframe gaps between consecutive candles', () => {
      const candlesWithGap = [
        { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.08 },
        { time: 1000 + 100000, open: 1.08, high: 1.09, low: 1.07, close: 1.08 } // gap > 3 * 3 mins for M1
      ];

      const gapResult = detectTimeframeGaps(candlesWithGap, 'M1');
      expect(gapResult.hasGaps).toBe(true);
      expect(gapResult.gapCount).toBe(1);
    });
  });

  // Section 8: Intelligence Engine & Market State Boundary
  describe('8. Intelligence Engine & Market State Boundary', () => {
    it('P5K-23: Intelligence service normalizes symbol and processes valid candle updates', async () => {
      const candles = createValidCandles(10, baseNow - 540000, 60000);
      const state = await intelligenceService.processCandleUpdate('eurusd', candles);

      expect(state.symbol).toBe('EUR/USD');
      expect(state.regime).toBeDefined();
    });

    it('P5K-24: Intelligence service rejects malformed candle array update', async () => {
      const malformedCandles = [
        { time: Math.floor(baseNow / 1000), open: 1.08, high: 1.05, low: 1.09, close: 1.08 }
      ];

      await expect(intelligenceService.processCandleUpdate('EUR/USD', malformedCandles))
        .rejects.toThrow('INVALID_MARKET_DATA');
    });

    it('P5K-25: Intelligence service drops out-of-order market data updates without mutating newer state', async () => {
      const newerTime = Math.floor(baseNow / 1000);
      const olderTime = Math.floor((baseNow - 3600000) / 1000);

      const newerCandles = createValidCandles(5, baseNow - 300000, 60000);
      newerCandles[newerCandles.length - 1].time = newerTime;

      const olderCandles = createValidCandles(5, baseNow - 3900000, 60000);
      olderCandles[olderCandles.length - 1].time = olderTime;

      const stateNewer = await intelligenceService.processCandleUpdate('GBP/USD', newerCandles);
      const stateOlder = await intelligenceService.processCandleUpdate('GBP/USD', olderCandles);

      expect(new Date(stateOlder.timestamp).getTime()).toBe(newerTime * 1000);
    });
  });

  // Section 9: Decision Engine & Provider Failover Simulation
  describe('9. Decision Engine & Provider Failover Simulation', () => {
    it('P5K-26: AI Decision Engine opinion marks executable as false for AI-generated proposals', async () => {
      const opinion = await aiDecisionEngine.generateOpinion({
        pair: 'EUR/USD',
        timeframe: 'M15',
        currentPrice: 1.08350,
        dataMode: 'LIVE'
      });

      expect(opinion.executable).toBe(false);
      expect(opinion.proposalId).toBeDefined();
    }, 30000);

    it('P5K-27: Provider disconnect transitions envelope status to UNAVAILABLE and executable to false', () => {
      const disconnectedEnv = buildMarketDataEnvelope(
        'EUR/USD',
        'M15',
        'LIVE',
        [],
        'PrimaryFeed',
        'PRIMARY',
        'UNAVAILABLE',
        'PROVIDER_DISCONNECTED',
        baseNow
      );

      expect(disconnectedEnv.status).toBe('UNAVAILABLE');
      expect(disconnectedEnv.executable).toBe(false);
      expect(disconnectedEnv.reason).toBe('PROVIDER_DISCONNECTED');
    });

    it('P5K-28: Provider failover updates provenance explicitly while maintaining symbol normalization and validation', () => {
      const validCandles = createValidCandles(10, baseNow - 540000, 60000);
      const failoverEnv = buildMarketDataEnvelope(
        'EUR/USD',
        'M15',
        'LIVE',
        validCandles,
        'BackupFeed',
        'FAILOVER_PROVIDER',
        undefined,
        undefined,
        baseNow
      );

      expect(failoverEnv.status).toBe('VALID');
      expect(failoverEnv.provenance.provider).toBe('FAILOVER_PROVIDER');
      expect(failoverEnv.provenance.source).toBe('BackupFeed');
      expect(failoverEnv.executable).toBe(true);
    });
  });
});
