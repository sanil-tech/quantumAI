import { describe, it, expect } from 'vitest';
import {
  buildMarketDataEnvelope,
  validateCandleArray,
  checkCandleFreshness,
  deriveExecutability,
  validateSingleCandle
} from '../packages/core/src/marketDataValidator';
import { validateExecutionSafety } from '../src/server/services/liveExecutionSafetyGuard';
import { MarketDataLineage } from '../src/server/domain/types';

describe('Phase 1B — Market Data Safety, Provenance & Fail-Closed Test Matrix', () => {
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

  // Test Case 1: Valid LIVE data
  it('TC1: Valid LIVE data generates valid envelope with executable: true', () => {
    const candles = createValidCandles(10, baseNow - 540000, 60000);
    const env = buildMarketDataEnvelope('EUR/USD', 'M1', 'LIVE', candles, 'YahooFinance', 'YAHOO', undefined, undefined, baseNow);

    expect(env.status).toBe('VALID');
    expect(env.dataMode).toBe('LIVE');
    expect(env.executable).toBe(true);
    expect(env.provenance.provider).toBe('YAHOO');
    expect(env.provenance.source).toBe('YahooFinance');
    expect(env.freshness.isFresh).toBe(true);
  });

  // Test Case 2: Valid HISTORICAL data
  it('TC2: Valid HISTORICAL data is status: VALID but executable: false for LIVE execution', () => {
    const candles = createValidCandles(10, baseNow - 86400000, 3600000);
    const env = buildMarketDataEnvelope('EUR/USD', 'H1', 'HISTORICAL', candles, 'HistoricalArchive', 'YAHOO_HIST', undefined, undefined, baseNow);

    expect(env.status).toBe('VALID');
    expect(env.dataMode).toBe('HISTORICAL');
    expect(env.executable).toBe(false);
  });

  // Test Case 3: Valid SIMULATION data
  it('TC3: Valid SIMULATION data is status: VALID but executable: false', () => {
    const candles = createValidCandles(10, baseNow - 540000, 60000);
    const env = buildMarketDataEnvelope('EUR/USD', 'M1', 'SIMULATION', candles, 'TickSimulator', 'SIMULATOR', undefined, undefined, baseNow);

    expect(env.status).toBe('VALID');
    expect(env.dataMode).toBe('SIMULATION');
    expect(env.executable).toBe(false);
  });

  // Test Case 4: Valid SYNTHETIC data
  it('TC4: Valid SYNTHETIC data is status: VALID but executable: false', () => {
    const candles = createValidCandles(10, baseNow - 540000, 60000);
    const env = buildMarketDataEnvelope('EUR/USD', 'M1', 'SYNTHETIC', candles, 'SyntheticGenerator', 'SYNTHETIC', undefined, undefined, baseNow);

    expect(env.status).toBe('VALID');
    expect(env.dataMode).toBe('SYNTHETIC');
    expect(env.executable).toBe(false);
  });

  // Test Case 5: LIVE provider timeout
  it('TC5: LIVE provider timeout produces status: UNAVAILABLE and executable: false', () => {
    const env = buildMarketDataEnvelope('EUR/USD', 'M15', 'LIVE', [], 'YahooFinance', 'YAHOO', 'UNAVAILABLE', 'LIVE_MARKET_DATA_UNAVAILABLE: Timeout', baseNow);

    expect(env.status).toBe('UNAVAILABLE');
    expect(env.executable).toBe(false);
    expect(env.data).toEqual([]);
    expect(env.reason).toContain('Timeout');
  });

  // Test Case 6: LIVE provider HTTP failure
  it('TC6: LIVE provider HTTP 500 failure produces status: UNAVAILABLE and executable: false', () => {
    const env = buildMarketDataEnvelope('EUR/USD', 'M15', 'LIVE', [], 'YahooFinance', 'YAHOO', 'UNAVAILABLE', 'LIVE_MARKET_DATA_UNAVAILABLE: HTTP 500', baseNow);

    expect(env.status).toBe('UNAVAILABLE');
    expect(env.executable).toBe(false);
    expect(env.data).toEqual([]);
  });

  // Test Case 7: LIVE stale candles
  it('TC7: LIVE candles older than timeframe threshold produce status: STALE and executable: false', () => {
    // Latest candle is 2 hours old for M15 timeframe (max allowed age: 45 mins)
    const candles = createValidCandles(10, baseNow - 7200000, 60000);
    const env = buildMarketDataEnvelope('EUR/USD', 'M15', 'LIVE', candles, 'YahooFinance', 'YAHOO', undefined, undefined, baseNow);

    expect(env.status).toBe('STALE');
    expect(env.freshness.isFresh).toBe(false);
    expect(env.executable).toBe(false);
  });

  // Test Case 8: LIVE malformed candles
  it('TC8: LIVE malformed candles (high < low) produce status: INVALID and executable: false', () => {
    const malformed = [
      { time: Math.floor(baseNow / 1000), open: 1.085, high: 1.080, low: 1.090, close: 1.085, volume: 100 }
    ];
    const env = buildMarketDataEnvelope('EUR/USD', 'M15', 'LIVE', malformed, 'YahooFinance', 'YAHOO', undefined, undefined, baseNow);

    expect(env.status).toBe('INVALID');
    expect(env.executable).toBe(false);
    expect(env.reason).toBe('HIGH_LESS_THAN_LOW');
  });

  // Test Case 9: LIVE empty response
  it('TC9: LIVE empty candle array produces status: UNAVAILABLE and executable: false', () => {
    const env = buildMarketDataEnvelope('EUR/USD', 'M15', 'LIVE', [], 'YahooFinance', 'YAHOO', undefined, undefined, baseNow);

    expect(env.status).toBe('UNAVAILABLE');
    expect(env.executable).toBe(false);
  });

  // Test Case 10: Synthetic data attempting LIVE execution
  it('TC10: Synthetic data lineage attempting REAL_LIVE execution is REJECTED by Safety Guard', () => {
    const lineage: MarketDataLineage = {
      dataClass: 'SYNTHETIC',
      provider: 'SyntheticGenerator',
      symbol: 'EUR/USD',
      timestamp: baseNow,
      receivedAt: baseNow
    };

    const result = validateExecutionSafety('REAL_LIVE', lineage);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('LINEAGE_SAFETY_VIOLATION');
  });

  // Test Case 11: Historical data attempting LIVE execution
  it('TC11: Historical data lineage attempting REAL_LIVE execution is REJECTED by Safety Guard', () => {
    const lineage: MarketDataLineage = {
      dataClass: 'HISTORICAL',
      provider: 'HistoricalArchive',
      symbol: 'EUR/USD',
      timestamp: baseNow,
      receivedAt: baseNow
    };

    const result = validateExecutionSafety('REAL_LIVE', lineage);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('LINEAGE_SAFETY_VIOLATION');
  });

  // Test Case 12: Simulation data attempting LIVE execution
  it('TC12: Simulation data lineage attempting REAL_LIVE execution is REJECTED by Safety Guard', () => {
    const lineage: MarketDataLineage = {
      dataClass: 'SIMULATED',
      provider: 'Simulator',
      symbol: 'EUR/USD',
      timestamp: baseNow,
      receivedAt: baseNow
    };

    const result = validateExecutionSafety('REAL_LIVE', lineage);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('LINEAGE_SAFETY_VIOLATION');
  });

  // Test Case 13: Valid LIVE data permitting analysis
  it('TC13: Valid LIVE data envelope passes executability and permits downstream analysis', () => {
    const candles = createValidCandles(10, baseNow - 540000, 60000);
    const env = buildMarketDataEnvelope('EUR/USD', 'M1', 'LIVE', candles, 'YahooFinance', 'YAHOO', undefined, undefined, baseNow);

    expect(env.status).toBe('VALID');
    expect(env.executable).toBe(true);
  });

  // Test Case 14: Invalid LIVE data blocking analysis
  it('TC14: Invalid LIVE data envelope blocks live execution/analysis', () => {
    const env = buildMarketDataEnvelope('EUR/USD', 'M15', 'LIVE', [], 'YahooFinance', 'YAHOO', 'UNAVAILABLE', 'Market feed error', baseNow);

    expect(env.status).toBe('UNAVAILABLE');
    expect(env.executable).toBe(false);
  });

  // Test Case 15: Timestamp ordering
  it('TC15: Non-monotonic timestamp ordering fails validation with TIMESTAMP_ORDERING_INVALID', () => {
    const unordered = [
      { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.08, volume: 100 },
      { time: 900, open: 1.08, high: 1.09, low: 1.07, close: 1.08, volume: 100 }
    ];

    const validation = validateCandleArray(unordered, baseNow);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('TIMESTAMP_ORDERING_INVALID');
  });

  // Test Case 16: Future timestamp
  it('TC16: Future timestamp beyond clock drift tolerance fails with FUTURE_TIMESTAMP_DETECTED', () => {
    const futureTime = Math.floor((baseNow + 3600000) / 1000); // 1 hour in the future
    const futureCandles = [
      { time: futureTime, open: 1.08, high: 1.09, low: 1.07, close: 1.08, volume: 100 }
    ];

    const validation = validateCandleArray(futureCandles, baseNow);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('FUTURE_TIMESTAMP_DETECTED');
  });

  // Test Case 17: Duplicate timestamp
  it('TC17: Duplicate timestamps fail validation with DUPLICATE_TIMESTAMP_DETECTED', () => {
    const duplicates = [
      { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.08, volume: 100 },
      { time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.08, volume: 100 }
    ];

    const validation = validateCandleArray(duplicates, baseNow);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('DUPLICATE_TIMESTAMP_DETECTED');
  });

  // Test Case 18: NaN / Infinity
  it('TC18: NaN or Infinity values fail validation with OHLC_NON_FINITE_OR_NON_POSITIVE', () => {
    const nanCandle = { time: 1000, open: NaN, high: 1.09, low: 1.07, close: 1.08, volume: 100 };
    const singleValidation = validateSingleCandle(nanCandle);

    expect(singleValidation.valid).toBe(false);
    expect(singleValidation.reason).toBe('OHLC_NON_FINITE_OR_NON_POSITIVE');
  });

  // Test Case 19: Invalid OHLC bounds
  it('TC19: Open or close exceeding high fails validation', () => {
    const invalidCandle = { time: 1000, open: 1.10, high: 1.09, low: 1.07, close: 1.08, volume: 100 };
    const singleValidation = validateSingleCandle(invalidCandle);

    expect(singleValidation.valid).toBe(false);
    expect(singleValidation.reason).toBe('OPEN_OR_CLOSE_EXCEEDS_HIGH');
  });

  // Test Case 20: Provider provenance preservation
  it('TC20: Provenance metadata accurately captures provider, source, and timestamps', () => {
    const candles = createValidCandles(5, baseNow - 60000, 60000);
    const env = buildMarketDataEnvelope('EUR/USD', 'M1', 'LIVE', candles, 'CustomSourceAPI', 'CUSTOM_PROV', undefined, undefined, baseNow);

    expect(env.provenance.source).toBe('CustomSourceAPI');
    expect(env.provenance.provider).toBe('CUSTOM_PROV');
    expect(env.provenance.receivedAt).toBe(baseNow);
    expect(env.provenance.marketTimestamp).toBe(candles[candles.length - 1].time * 1000);
  });
});
