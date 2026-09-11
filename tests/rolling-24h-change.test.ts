import { describe, it, expect } from 'vitest';
import { calculate24hRollingChange } from '../src/lib/marketDataGenerator';
import { CandleData } from '../src/types';

describe('24H Rolling Change Resilience Tests', () => {
  const now = Math.floor(Date.now() / 1000);

  const sampleCandles: CandleData[] = [
    { time: now - 86400, open: 1.10000, high: 1.10500, low: 1.09500, close: 1.10200, volume: 100 },
    { time: now - 43200, open: 1.10200, high: 1.11000, low: 1.10100, close: 1.10800, volume: 150 },
    { time: now, open: 1.10800, high: 1.11500, low: 1.10700, close: 1.11300, volume: 200 },
  ];

  it('calculates accurate 24h rolling change when currentPrice is supplied', () => {
    // 24h ago ref = open of candle 0 = 1.10000. Current price = 1.11300. Change = +1.18%
    const change = calculate24hRollingChange(sampleCandles, 1.11300);
    expect(change).toBe(1.18);
    expect(Number.isFinite(change)).toBe(true);
  });

  it('derives currentPrice from latest candle when currentPrice is undefined or not supplied', () => {
    // Latest candle close is 1.11300
    const change = calculate24hRollingChange(sampleCandles);
    expect(change).toBe(1.18);
    expect(Number.isFinite(change)).toBe(true);
  });

  it('handles negative price movements accurately', () => {
    const change = calculate24hRollingChange(sampleCandles, 1.08900);
    // (1.08900 - 1.10000) / 1.10000 * 100 = -1.00%
    expect(change).toBe(-1.00);
    expect(Number.isFinite(change)).toBe(true);
  });

  it('returns 0 without throwing or returning NaN for empty candle array', () => {
    expect(calculate24hRollingChange([])).toBe(0);
    expect(calculate24hRollingChange([], 1.10000)).toBe(0);
    expect(calculate24hRollingChange(null as any)).toBe(0);
    expect(calculate24hRollingChange(undefined as any)).toBe(0);
  });

  it('returns 0 when given a single candle', () => {
    const single: CandleData[] = [
      { time: now, open: 1.15000, high: 1.15500, low: 1.14500, close: 1.15000, volume: 50 }
    ];
    const change = calculate24hRollingChange(single, 1.15000);
    expect(change).toBe(0);
    expect(Number.isFinite(change)).toBe(true);
  });

  it('never returns NaN, Infinity, or -Infinity when currentPrice is invalid or zero', () => {
    expect(calculate24hRollingChange(sampleCandles, NaN)).toBe(1.18); // falls back to latest candle
    expect(calculate24hRollingChange(sampleCandles, 0)).toBe(1.18);
    expect(calculate24hRollingChange(sampleCandles, -5)).toBe(1.18);
    expect(calculate24hRollingChange(sampleCandles, Infinity)).toBe(1.18);
  });

  it('never returns NaN or Infinity when refPrice in candles is 0 or corrupted', () => {
    const corrupted: CandleData[] = [
      { time: now - 86400, open: 0, high: 0, low: 0, close: 0, volume: 0 },
      { time: now, open: 1.10000, high: 1.10500, low: 1.09500, close: 1.10000, volume: 100 }
    ];
    const change = calculate24hRollingChange(corrupted, 1.10000);
    expect(Number.isFinite(change)).toBe(true);
    expect(isNaN(change)).toBe(false);
  });
});
