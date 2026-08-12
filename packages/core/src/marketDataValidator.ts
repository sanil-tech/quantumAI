import {
  MarketDataEnvelope,
  MarketDataMode,
  MarketDataValidationStatus,
  MarketDataProvenance,
  MarketDataFreshness
} from '@iati/core-types';

export interface SmcCandleLike {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Canonical symbol normalizer.
 * Maps raw symbol strings like 'eurusd', 'EURUSD', 'EUR/USD', 'EURUSD=X' -> 'EUR/USD'
 * Rejects empty, whitespace-only, malformed, or ambiguous strings.
 */
export function normalizeSymbol(rawSymbol: string): string {
  if (!rawSymbol || typeof rawSymbol !== 'string') {
    throw new Error('INVALID_SYMBOL: Symbol must be a non-empty string');
  }

  const clean = rawSymbol.trim().toUpperCase();
  if (!clean || clean === 'UNKNOWN' || clean === 'UNDEFINED') {
    throw new Error('AMBIGUOUS_OR_INVALID_SYMBOL: Symbol cannot be empty or UNKNOWN');
  }

  // Common FX & Major instrument aliases
  if (clean === 'EURUSD' || clean === 'EUR/USD' || clean === 'EURUSD=X') return 'EUR/USD';
  if (clean === 'GBPUSD' || clean === 'GBP/USD' || clean === 'GBPUSD=X') return 'GBP/USD';
  if (clean === 'USDJPY' || clean === 'USD/JPY' || clean === 'USDJPY=X') return 'USD/JPY';
  if (clean === 'AUDUSD' || clean === 'AUD/USD' || clean === 'AUDUSD=X') return 'AUD/USD';
  if (clean === 'XAUUSD' || clean === 'XAU/USD' || clean === 'GC=F') return 'XAU/USD';
  if (clean === 'NASDAQ' || clean === 'US100' || clean === '^IXIC') return 'NASDAQ';
  if (clean === 'BTCUSD' || clean === 'BTC/USD' || clean === 'BTC-USD') return 'BTC/USD';

  // StandardSlash pattern XXX/YYY
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 2 && parts[0].length >= 2 && parts[1].length >= 2 && /^[A-Z0-9_-]+$/.test(parts[0]) && /^[A-Z0-9_-]+$/.test(parts[1])) {
      return `${parts[0]}/${parts[1]}`;
    }
  } else if (clean.length === 6 && /^[A-Z]+$/.test(clean)) {
    return `${clean.substring(0, 3)}/${clean.substring(3)}`;
  } else if (/^[A-Z0-9_-]+$/.test(clean)) {
    return clean;
  }

  throw new Error(`AMBIGUOUS_OR_INVALID_SYMBOL: Cannot normalize symbol '${rawSymbol}'`);
}

export interface TickLike {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number | Date;
  volume?: number;
}

/**
 * Validates bid/ask tick or quote data.
 */
export function validateTick(tick: TickLike, nowMs: number = Date.now()): CandleValidationResult {
  if (!tick || typeof tick !== 'object') {
    return { valid: false, status: 'INVALID', reason: 'TICK_NULL_OR_UNDEFINED' };
  }

  const { bid, ask, timestamp } = tick;

  if (typeof bid !== 'number' || !Number.isFinite(bid) || bid <= 0 ||
      typeof ask !== 'number' || !Number.isFinite(ask) || ask <= 0) {
    return { valid: false, status: 'INVALID', reason: 'TICK_PRICE_NON_FINITE_OR_NON_POSITIVE' };
  }

  if (bid > ask) {
    return { valid: false, status: 'INVALID', reason: 'NEGATIVE_SPREAD_BID_GREATER_THAN_ASK' };
  }

  const tsMs = timestamp instanceof Date ? timestamp.getTime() : (typeof timestamp === 'number' && timestamp < 1e11 ? timestamp * 1000 : Number(timestamp));

  if (!tsMs || isNaN(tsMs) || tsMs <= 0) {
    return { valid: false, status: 'INVALID', reason: 'TICK_TIMESTAMP_INVALID' };
  }

  if (tsMs > nowMs + 60000) {
    return { valid: false, status: 'INVALID', reason: 'FUTURE_TIMESTAMP_DETECTED' };
  }

  const spread = ask - bid;
  if (spread > bid * 0.5) {
    return { valid: false, status: 'INVALID', reason: 'ANOMALOUS_SPREAD_EXCEEDS_THRESHOLD' };
  }

  return { valid: true, status: 'VALID' };
}

/**
 * Deduplicates candles by timestamp and sorts them chronologically.
 */
export function deduplicateAndSortCandles<T extends SmcCandleLike>(candles: T[]): T[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];

  const seenTimes = new Set<number>();
  const result: T[] = [];

  for (const candle of candles) {
    const timeMs = candle.time < 1e11 ? candle.time * 1000 : candle.time;
    if (!seenTimes.has(timeMs)) {
      seenTimes.add(timeMs);
      result.push(candle);
    }
  }

  result.sort((a, b) => {
    const tA = a.time < 1e11 ? a.time * 1000 : a.time;
    const tB = b.time < 1e11 ? b.time * 1000 : b.time;
    return tA - tB;
  });

  return result;
}

/**
 * Detects timeframe gaps between consecutive candles.
 */
export function detectTimeframeGaps(candles: SmcCandleLike[], timeframe: string): { hasGaps: boolean; gapCount: number } {
  if (!Array.isArray(candles) || candles.length < 2) {
    return { hasGaps: false, gapCount: 0 };
  }

  const expectedIntervalMs = TIMEFRAME_MAX_AGE_MS[timeframe] || TIMEFRAME_MAX_AGE_MS['M15'];
  let gapCount = 0;

  for (let i = 1; i < candles.length; i++) {
    const prevMs = candles[i - 1].time < 1e11 ? candles[i - 1].time * 1000 : candles[i - 1].time;
    const currMs = candles[i].time < 1e11 ? candles[i].time * 1000 : candles[i].time;
    const diffMs = currMs - prevMs;

    if (diffMs > expectedIntervalMs * 3) {
      gapCount++;
    }
  }

  return { hasGaps: gapCount > 0, gapCount };
}

export const TIMEFRAME_MAX_AGE_MS: Record<string, number> = {
  M1: 3 * 60 * 1000,          // 3 mins
  M5: 15 * 60 * 1000,         // 15 mins
  M15: 45 * 60 * 1000,        // 45 mins
  M30: 90 * 60 * 1000,        // 90 mins
  H1: 3 * 3600 * 1000,        // 3 hours
  H4: 12 * 3600 * 1000,       // 12 hours
  D1: 48 * 3600 * 1000,       // 48 hours (weekend buffer)
  W1: 10 * 86400 * 1000,      // 10 days
  MN: 35 * 86400 * 1000       // 35 days
};

export interface CandleValidationResult {
  valid: boolean;
  status: MarketDataValidationStatus;
  reason?: string;
}

/**
 * Validates OHLCV structure and values of a single candle.
 */
export function validateSingleCandle(candle: any): CandleValidationResult {
  if (!candle || typeof candle !== 'object') {
    return { valid: false, status: 'INVALID', reason: 'CANDLE_NULL_OR_UNDEFINED' };
  }

  const { open, high, low, close, volume } = candle;

  if (
    typeof open !== 'number' || !Number.isFinite(open) || open <= 0 ||
    typeof high !== 'number' || !Number.isFinite(high) || high <= 0 ||
    typeof low !== 'number' || !Number.isFinite(low) || low <= 0 ||
    typeof close !== 'number' || !Number.isFinite(close) || close <= 0
  ) {
    return { valid: false, status: 'INVALID', reason: 'OHLC_NON_FINITE_OR_NON_POSITIVE' };
  }

  if (high < low) {
    return { valid: false, status: 'INVALID', reason: 'HIGH_LESS_THAN_LOW' };
  }

  if (open > high || close > high) {
    return { valid: false, status: 'INVALID', reason: 'OPEN_OR_CLOSE_EXCEEDS_HIGH' };
  }

  if (open < low || close < low) {
    return { valid: false, status: 'INVALID', reason: 'OPEN_OR_CLOSE_BELOW_LOW' };
  }

  if (volume !== undefined && (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0)) {
    return { valid: false, status: 'INVALID', reason: 'VOLUME_INVALID' };
  }

  const rawTime = candle.time !== undefined ? candle.time : candle.timestamp;
  const timeMs = rawTime instanceof Date
    ? rawTime.getTime()
    : typeof rawTime === 'number' && Number.isFinite(rawTime)
      ? (rawTime < 1e11 ? rawTime * 1000 : rawTime)
      : NaN;

  if (isNaN(timeMs) || timeMs <= 0) {
    return { valid: false, status: 'INVALID', reason: 'TIMESTAMP_INVALID' };
  }

  return { valid: true, status: 'VALID' };
}

/**
 * Validates array of candles for OHLC integrity, timestamp ordering, duplicates, and future dates.
 */
export function validateCandleArray(candles: any[], nowMs: number = Date.now()): CandleValidationResult {
  if (!Array.isArray(candles) || candles.length === 0) {
    return { valid: false, status: 'UNAVAILABLE', reason: 'EMPTY_OR_NON_ARRAY_CANDLES' };
  }

  let prevTime = -1;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const singleValidation = validateSingleCandle(candle);
    if (!singleValidation.valid) {
      return singleValidation;
    }

    const rawTime = candle.time !== undefined ? candle.time : candle.timestamp;
    const timeMs = rawTime instanceof Date
      ? rawTime.getTime()
      : typeof rawTime === 'number'
        ? (rawTime < 1e11 ? rawTime * 1000 : rawTime)
        : NaN;

    // Future timestamp check (allows max 60s clock drift)
    if (timeMs > nowMs + 60000) {
      return { valid: false, status: 'INVALID', reason: 'FUTURE_TIMESTAMP_DETECTED' };
    }

    // Monotonic timestamp & duplicate check
    if (i > 0) {
      if (timeMs === prevTime) {
        return { valid: false, status: 'INVALID', reason: 'DUPLICATE_TIMESTAMP_DETECTED' };
      }
      if (timeMs < prevTime) {
        return { valid: false, status: 'INVALID', reason: 'TIMESTAMP_ORDERING_INVALID' };
      }
    }

    prevTime = timeMs;
  }

  return { valid: true, status: 'VALID' };
}

/**
 * Evaluates freshness of the latest candle against timeframe threshold.
 */
export function checkCandleFreshness(
  candles: any[],
  timeframe: string,
  nowMs: number = Date.now()
): MarketDataFreshness {
  const maxAllowedAgeMs = TIMEFRAME_MAX_AGE_MS[timeframe] || TIMEFRAME_MAX_AGE_MS['M15'];

  if (!candles || candles.length === 0) {
    return { isFresh: false, ageMs: Infinity, maxAllowedAgeMs };
  }

  const latestCandle = candles[candles.length - 1];
  const rawTime = latestCandle.time !== undefined ? latestCandle.time : latestCandle.timestamp;
  const latestTimeMs = rawTime instanceof Date
    ? rawTime.getTime()
    : typeof rawTime === 'number'
      ? (rawTime < 1e11 ? rawTime * 1000 : rawTime)
      : NaN;

  const ageMs = isNaN(latestTimeMs) ? Infinity : Math.max(0, nowMs - latestTimeMs);
  const isFresh = ageMs <= maxAllowedAgeMs;

  return { isFresh, ageMs, maxAllowedAgeMs };
}

/**
 * Derives execution eligibility from data mode, status, freshness, and provider.
 */
export function deriveExecutability(
  dataMode: MarketDataMode,
  status: MarketDataValidationStatus,
  freshness: MarketDataFreshness,
  provider: string,
  source: string
): { executable: boolean; reason?: string } {
  if (dataMode !== 'LIVE') {
    return {
      executable: false,
      reason: `NON_LIVE_DATA_MODE (${dataMode}) IS NOT EXECUTABLE IN LIVE MODE`
    };
  }

  const isSyntheticOrMock =
    /SYNTHETIC|MOCK|SIMULATION|FIXTURE|GENERATOR/i.test(provider) ||
    /SYNTHETIC|MOCK|SIMULATION|FIXTURE|GENERATOR/i.test(source);

  if (isSyntheticOrMock) {
    return {
      executable: false,
      reason: `SYNTHETIC_OR_MOCK_PROVIDER (${provider}/${source}) CANNOT BE EXECUTED`
    };
  }

  if (status !== 'VALID') {
    return {
      executable: false,
      reason: `MARKET_DATA_STATUS_NOT_VALID (${status})`
    };
  }

  if (!freshness.isFresh) {
    return {
      executable: false,
      reason: `MARKET_DATA_STALE (ageMs: ${freshness.ageMs}ms > max: ${freshness.maxAllowedAgeMs}ms)`
    };
  }

  return { executable: true };
}

/**
 * Builds standard MarketDataEnvelope with explicit provenance, freshness, and execution eligibility.
 */
export function buildMarketDataEnvelope<T extends SmcCandleLike[]>(
  symbol: string,
  timeframe: string,
  dataMode: MarketDataMode,
  candles: T,
  source: string,
  provider: string,
  overrideStatus?: MarketDataValidationStatus,
  overrideReason?: string,
  nowMs: number = Date.now()
): MarketDataEnvelope<T> {
  const provenance: MarketDataProvenance = {
    source,
    provider,
    receivedAt: nowMs,
    marketTimestamp: candles && candles.length > 0
      ? (candles[candles.length - 1].time < 1e11 ? candles[candles.length - 1].time * 1000 : candles[candles.length - 1].time)
      : undefined
  };

  let validation = validateCandleArray(candles, nowMs);
  let status: MarketDataValidationStatus = overrideStatus || validation.status;
  let reason = overrideReason || validation.reason;

  const freshness = checkCandleFreshness(candles, timeframe, nowMs);

  if (status === 'VALID' && dataMode === 'LIVE' && !freshness.isFresh) {
    status = 'STALE';
    reason = `MARKET_DATA_STALE (ageMs: ${freshness.ageMs}ms > max: ${freshness.maxAllowedAgeMs}ms)`;
  }

  const { executable, reason: execReason } = deriveExecutability(dataMode, status, freshness, provider, source);

  return {
    symbol,
    timeframe,
    dataMode,
    status,
    data: candles || ([] as unknown as T),
    provenance,
    freshness,
    executable,
    reason: reason || execReason
  };
}
