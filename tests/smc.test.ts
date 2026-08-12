import { describe, it, expect } from 'vitest';
import {
  detectOrderBlocks,
  detectFairValueGaps,
  detectSupportResistance,
  analyzeSmcStructures,
  detectCandlestickPatterns,
  SmcCandle
} from '../packages/core/src/smc';

describe('Canonical SMC Algorithm Suite (@iati/core)', () => {
  it('should return empty/safe structures for insufficient candle data', () => {
    const emptyCandles: SmcCandle[] = [];
    const obs = detectOrderBlocks(emptyCandles, 'M15');
    const fvgs = detectFairValueGaps(emptyCandles, 'M15');
    const sr = detectSupportResistance(emptyCandles, 'M15');
    const smc = analyzeSmcStructures(emptyCandles, 'M15');

    expect(obs).toEqual([]);
    expect(fvgs).toEqual([]);
    expect(sr).toEqual([]);
    expect(smc.orderBlocks).toEqual([]);
    expect(smc.fairValueGaps).toEqual([]);
    expect(smc.liquiditySweeps).toEqual([]);
    expect(smc.lastBos).toBeUndefined();
    expect(smc.lastChoch).toBeUndefined();
  });

  it('should handle no-structure condition when price stays strictly within range', () => {
    // Range: high 105, low 95, close 100.
    // highestRecent * 0.999 = 104.895 -> close 100 < 104.895
    // lowestRecent * 1.001 = 95.095 -> close 100 > 95.095
    const candles: SmcCandle[] = Array.from({ length: 40 }, (_, i) => ({
      time: 1000000 + i * 60000,
      open: 100,
      high: i === 10 ? 105 : 101,
      low: i === 20 ? 95 : 99,
      close: 100,
      volume: 1000
    }));

    const smc = analyzeSmcStructures(candles, 'M15');
    expect(smc.orderBlocks).toEqual([]);
    expect(smc.fairValueGaps).toEqual([]);
    expect(smc.lastBos).toBeUndefined();
    expect(smc.lastChoch).toBeUndefined();
  });

  it('should detect bullish Order Block', () => {
    const candles: SmcCandle[] = Array.from({ length: 30 }, (_, i) => ({
      time: 100000 + i * 60000,
      open: 100 + i * 0.1,
      high: 100.5 + i * 0.1,
      low: 99.5 + i * 0.1,
      close: 100.1 + i * 0.1,
      volume: 1000
    }));

    // Setup bullish OB pattern at index 10, 11, 12
    candles[10] = { time: 110000, open: 105, high: 105.2, low: 103.8, close: 104 };
    candles[11] = { time: 111000, open: 104, high: 106.5, low: 103.9, close: 106.2 };
    candles[12] = { time: 112000, open: 106.2, high: 110, low: 106, close: 109.8 };

    const obs = detectOrderBlocks(candles, 'M15');
    const bullishOb = obs.find(ob => ob.type === 'BULLISH');

    expect(bullishOb).toBeDefined();
    expect(bullishOb?.type).toBe('BULLISH');
    expect(bullishOb?.high).toBe(105.2);
    expect(bullishOb?.low).toBe(103.8);
  });

  it('should detect bearish Order Block', () => {
    const candles: SmcCandle[] = Array.from({ length: 30 }, (_, i) => ({
      time: 100000 + i * 60000,
      open: 200 - i * 0.1,
      high: 200.5 - i * 0.1,
      low: 199.5 - i * 0.1,
      close: 199.9 - i * 0.1,
      volume: 1000
    }));

    // Setup bearish OB pattern at index 10, 11, 12
    candles[10] = { time: 110000, open: 195, high: 196.2, low: 194.8, close: 196 };
    candles[11] = { time: 111000, open: 196, high: 196.1, low: 193.5, close: 193.8 };
    candles[12] = { time: 112000, open: 193.8, high: 194, low: 189.5, close: 190 };

    const obs = detectOrderBlocks(candles, 'M15');
    const bearishOb = obs.find(ob => ob.type === 'BEARISH');

    expect(bearishOb).toBeDefined();
    expect(bearishOb?.type).toBe('BEARISH');
    expect(bearishOb?.high).toBe(196.2);
    expect(bearishOb?.low).toBe(194.8);
  });

  it('should detect bullish FVG and track filled status', () => {
    // Setup candles where subsequent candles stay above c1.high (101) until filled
    const candles: SmcCandle[] = Array.from({ length: 25 }, (_, i) => ({
      time: 100000 + i * 60000,
      open: 105,
      high: 106,
      low: 104,
      close: 105,
      volume: 1000
    }));

    // Bullish FVG: c1 (idx 10), c2 (idx 11), c3 (idx 12)
    // c3.low = 103 > c1.high = 101
    candles[10] = { time: 110000, open: 100, high: 101, low: 99.5, close: 100.8 };
    candles[11] = { time: 111000, open: 100.8, high: 106, low: 100.7, close: 105.8 };
    candles[12] = { time: 112000, open: 105.8, high: 108, low: 103, close: 107.5 };

    const fvgsUnfilled = detectFairValueGaps(candles, 'M15');
    expect(fvgsUnfilled.length).toBeGreaterThan(0);
    expect(fvgsUnfilled[0].type).toBe('BULLISH_FVG');
    expect(fvgsUnfilled[0].top).toBe(103);
    expect(fvgsUnfilled[0].bottom).toBe(101);

    // Now fill the FVG at idx 15
    candles[15] = { time: 115000, open: 105, high: 105, low: 100.5, close: 102 }; // low <= 101
    const fvgsAfterFill = detectFairValueGaps(candles, 'M15');
    const containsFilled = fvgsAfterFill.some(f => f.top === 103 && f.bottom === 101);
    expect(containsFilled).toBe(false);
  });

  it('should detect bearish FVG', () => {
    const candles: SmcCandle[] = Array.from({ length: 25 }, (_, i) => ({
      time: 100000 + i * 60000,
      open: 185,
      high: 186,
      low: 184,
      close: 185,
      volume: 1000
    }));

    // Bearish FVG: c3.high = 195 < c1.low = 198
    candles[10] = { time: 110000, open: 200, high: 200.5, low: 198, close: 198.2 };
    candles[11] = { time: 111000, open: 198.2, high: 198.3, low: 192, close: 192.5 };
    candles[12] = { time: 112000, open: 192.5, high: 195, low: 190, close: 191 };

    const fvgs = detectFairValueGaps(candles, 'M15');
    expect(fvgs.length).toBeGreaterThan(0);
    expect(fvgs[0].type).toBe('BEARISH_FVG');
    expect(fvgs[0].top).toBe(198);
    expect(fvgs[0].bottom).toBe(195);
  });

  it('should detect support and resistance zones from pivot highs/lows', () => {
    const candles: SmcCandle[] = Array.from({ length: 40 }, (_, i) => ({
      time: 100000 + i * 60000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1000
    }));

    // Pivot High at index 15
    candles[13] = { time: 113000, open: 100, high: 102, low: 99, close: 101 };
    candles[14] = { time: 114000, open: 101, high: 103, low: 100, close: 102 };
    candles[15] = { time: 115000, open: 102, high: 110, low: 101, close: 108 };
    candles[16] = { time: 116000, open: 108, high: 104, low: 101, close: 102 };
    candles[17] = { time: 117000, open: 102, high: 103, low: 100, close: 101 };

    // Pivot Low at index 25
    candles[23] = { time: 123000, open: 100, high: 101, low: 98, close: 99 };
    candles[24] = { time: 124000, open: 99, high: 100, low: 96, close: 97 };
    candles[25] = { time: 125000, open: 97, high: 98, low: 90, close: 92 };
    candles[26] = { time: 126000, open: 92, high: 95, low: 93, close: 94 };
    candles[27] = { time: 127000, open: 94, high: 96, low: 94, close: 95 };

    const zones = detectSupportResistance(candles, 'M15');
    const resistance = zones.find(z => z.type === 'RESISTANCE');
    const support = zones.find(z => z.type === 'SUPPORT');

    expect(resistance).toBeDefined();
    expect(support).toBeDefined();
  });

  it('should detect bullish BOS and CHOCH on strong breakout close', () => {
    const candles: SmcCandle[] = Array.from({ length: 35 }, (_, i) => ({
      time: 100000 + i * 60000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1000
    }));

    // Last candle closes at 105, with high 105 (highestRecent = 105, 105 > 105 * 0.999 = 104.895)
    const lastIndex = candles.length - 1;
    candles[lastIndex] = {
      time: 100000 + lastIndex * 60000,
      open: 100,
      high: 105,
      low: 100,
      close: 105
    };

    const smc = analyzeSmcStructures(candles, 'M15');
    expect(smc.lastBos?.type).toBe('BULLISH_BOS');
    expect(smc.lastChoch?.type).toBe('BULLISH_CHOCH');
  });

  it('should detect bearish BOS and CHOCH on strong breakdown close', () => {
    const candles: SmcCandle[] = Array.from({ length: 35 }, (_, i) => ({
      time: 100000 + i * 60000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1000
    }));

    // Last candle closes at 90, with low 90 (lowestRecent = 90, 90 < 90 * 1.001 = 90.09)
    const lastIndex = candles.length - 1;
    candles[lastIndex] = {
      time: 100000 + lastIndex * 60000,
      open: 100,
      high: 100,
      low: 90,
      close: 90
    };

    const smc = analyzeSmcStructures(candles, 'M15');
    expect(smc.lastBos?.type).toBe('BEARISH_BOS');
    expect(smc.lastChoch?.type).toBe('BEARISH_CHOCH');
  });

  it('should detect candlestick patterns deterministically', () => {
    const candles: SmcCandle[] = [
      { time: 100, open: 100, high: 101, low: 99, close: 100 },
      { time: 200, open: 100, high: 100.5, low: 99.5, close: 99.8 },
      { time: 300, open: 100, high: 100.1, low: 98.1, close: 100.1 }
    ];

    const patterns = detectCandlestickPatterns(candles);
    expect(patterns.some(p => p.type === 'BULLISH')).toBe(true);
  });
});
