import { describe, it, expect } from 'vitest';
import { aggregateCandles } from '../src/lib/marketDataGenerator';
import { CandleData } from '../src/types';

describe('Chart Timeframe Aggregation Tests', () => {
  // Helper to generate 60 deterministic 1-minute candles starting at 2026-08-25T10:00:00Z (timestamp 1787652000)
  const BASE_TIME = 1787652000; // 10:00:00 UTC
  const mockM1Candles: CandleData[] = Array.from({ length: 60 }, (_, i) => {
    const t = BASE_TIME + i * 60;
    const base = 1.16000 + i * 0.00010;
    return {
      time: t,
      open: Number(base.toFixed(5)),
      high: Number((base + 0.00020).toFixed(5)),
      low: Number((base - 0.00010).toFixed(5)),
      close: Number((base + 0.00005).toFixed(5)),
      volume: 100 + i * 10
    };
  });

  it('returns native M1 candles unchanged when target timeframe is M1', () => {
    const result = aggregateCandles(mockM1Candles, 'M1');
    expect(result).toHaveLength(60);
    expect(result[0]).toEqual(mockM1Candles[0]);
    expect(result[59]).toEqual(mockM1Candles[59]);
  });

  it('correctly aggregates 60 M1 candles into 12 M5 candles (300s buckets)', () => {
    const result = aggregateCandles(mockM1Candles, 'M5');
    expect(result).toHaveLength(12);

    for (let b = 0; b < 12; b++) {
      const bucket = result[b];
      expect(bucket.time).toBe(BASE_TIME + b * 300);
      expect(bucket.time % 300).toBe(0); // Aligned to 5-minute UTC boundary

      const constituents = mockM1Candles.slice(b * 5, b * 5 + 5);
      expect(bucket.open).toBe(constituents[0].open);
      expect(bucket.close).toBe(constituents[4].close);
      expect(bucket.high).toBe(Math.max(...constituents.map(c => c.high)));
      expect(bucket.low).toBe(Math.min(...constituents.map(c => c.low)));
      expect(bucket.volume).toBe(constituents.reduce((sum, c) => sum + c.volume, 0));
    }
  });

  it('correctly aggregates 60 M1 candles into 4 M15 candles (900s buckets)', () => {
    const result = aggregateCandles(mockM1Candles, 'M15');
    expect(result).toHaveLength(4);

    for (let b = 0; b < 4; b++) {
      const bucket = result[b];
      expect(bucket.time).toBe(BASE_TIME + b * 900);
      expect(bucket.time % 900).toBe(0); // Aligned to 15-minute boundary

      const constituents = mockM1Candles.slice(b * 15, b * 15 + 15);
      expect(bucket.open).toBe(constituents[0].open);
      expect(bucket.close).toBe(constituents[14].close);
      expect(bucket.high).toBe(Math.max(...constituents.map(c => c.high)));
      expect(bucket.low).toBe(Math.min(...constituents.map(c => c.low)));
      expect(bucket.volume).toBe(constituents.reduce((sum, c) => sum + c.volume, 0));
    }
  });

  it('correctly aggregates 60 M1 candles into 2 M30 candles (1800s buckets)', () => {
    const result = aggregateCandles(mockM1Candles, 'M30');
    expect(result).toHaveLength(2);

    // Bucket 0 (10:00 - 10:29)
    const b0 = result[0];
    expect(b0.time).toBe(BASE_TIME);
    expect(b0.open).toBe(mockM1Candles[0].open);
    expect(b0.close).toBe(mockM1Candles[29].close);
    expect(b0.high).toBe(Math.max(...mockM1Candles.slice(0, 30).map(c => c.high)));
    expect(b0.low).toBe(Math.min(...mockM1Candles.slice(0, 30).map(c => c.low)));

    // Bucket 1 (10:30 - 10:59)
    const b1 = result[1];
    expect(b1.time).toBe(BASE_TIME + 1800);
    expect(b1.open).toBe(mockM1Candles[30].open);
    expect(b1.close).toBe(mockM1Candles[59].close);
    expect(b1.high).toBe(Math.max(...mockM1Candles.slice(30, 60).map(c => c.high)));
    expect(b1.low).toBe(Math.min(...mockM1Candles.slice(30, 60).map(c => c.low)));
  });

  it('correctly aggregates 60 M1 candles into 1 H1 candle (3600s bucket)', () => {
    const result = aggregateCandles(mockM1Candles, 'H1');
    expect(result).toHaveLength(1);

    const h1 = result[0];
    expect(h1.time).toBe(BASE_TIME);
    expect(h1.open).toBe(mockM1Candles[0].open);
    expect(h1.close).toBe(mockM1Candles[59].close);
    expect(h1.high).toBe(Math.max(...mockM1Candles.map(c => c.high)));
    expect(h1.low).toBe(Math.min(...mockM1Candles.map(c => c.low)));
    expect(h1.volume).toBe(mockM1Candles.reduce((s, c) => s + c.volume, 0));
  });

  it('preserves strictly ascending chronological order with zero duplicate timestamps', () => {
    const result = aggregateCandles(mockM1Candles, 'M5');
    const timestamps = result.map(c => c.time);
    const unique = new Set(timestamps);

    expect(unique.size).toBe(timestamps.length);

    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
  });

  it('handles partial / incomplete buckets correctly without failing', () => {
    // 7 candles: 5 in bucket 0, 2 in bucket 1
    const partial = mockM1Candles.slice(0, 7);
    const result = aggregateCandles(partial, 'M5');

    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(BASE_TIME);
    expect(result[1].time).toBe(BASE_TIME + 300);
    expect(result[1].open).toBe(partial[5].open);
    expect(result[1].close).toBe(partial[6].close);
  });

  it('returns empty array when input is empty or null', () => {
    expect(aggregateCandles([], 'M30')).toEqual([]);
    expect(aggregateCandles(null as any, 'M30')).toEqual([]);
    expect(aggregateCandles(undefined as any, 'M30')).toEqual([]);
  });
});
