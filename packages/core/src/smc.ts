/**
 * Canonical Smart Money Concepts (SMC) & Market Structure Algorithms
 * Source of Truth: @iati/core
 */

export interface SmcCandle {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type SmcTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export interface SmcOrderBlock {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  timeframe: string;
  timestamp: number | string;
  mitigated: boolean;
}

export interface SmcFairValueGap {
  id: string;
  type: 'BULLISH_FVG' | 'BEARISH_FVG';
  top: number;
  bottom: number;
  timeframe: string;
  filled: boolean;
}

export interface SmcSupportResistanceZone {
  id: string;
  type: 'SUPPORT' | 'RESISTANCE';
  priceStart: number;
  priceEnd: number;
  strength: number;
  testedCount: number;
  timeframe: string;
}

export interface SmcCandlestickPattern {
  name: string;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  description: string;
}

export interface SmcStructures {
  orderBlocks: SmcOrderBlock[];
  fairValueGaps: SmcFairValueGap[];
  lastBos?: {
    type: 'BULLISH_BOS' | 'BEARISH_BOS';
    price: number;
    timestamp: number | string;
  };
  lastChoch?: {
    type: 'BULLISH_CHOCH' | 'BEARISH_CHOCH';
    price: number;
    timestamp: number | string;
  };
  liquiditySweeps: {
    type: 'BUY_SIDE_SWEEP' | 'SELL_SIDE_SWEEP';
    price: number;
    timestamp: number | string;
  }[];
}

/**
 * Detect Order Blocks in candlestick sequence
 */
export function detectOrderBlocks(candles: SmcCandle[], timeframe: string): SmcOrderBlock[] {
  const orderBlocks: SmcOrderBlock[] = [];
  if (!candles || candles.length < 10) return orderBlocks;

  const len = candles.length;

  for (let i = len - 25; i < len - 3; i++) {
    if (i < 2) continue;

    const curr = candles[i];
    const next1 = candles[i + 1];
    const next2 = candles[i + 2];

    const currRange = curr.high - curr.low;
    const nextEngulfing = Math.abs(next2.close - next1.open);

    // Bullish OB: Last down candle before strong expansion move up
    if (curr.close < curr.open && next1.close > next1.open && next2.close > next2.open) {
      if (next2.close > curr.high && nextEngulfing > currRange * 1.2) {
        orderBlocks.push({
          id: `ob-bullish-${i}-${timeframe}`,
          type: 'BULLISH',
          high: curr.high,
          low: curr.low,
          timeframe,
          timestamp: curr.time,
          mitigated: candles.slice(i + 3).some(c => c.low <= curr.high)
        });
      }
    }

    // Bearish OB: Last up candle before strong expansion move down
    if (curr.close > curr.open && next1.close < next1.open && next2.close < next2.open) {
      if (next2.close < curr.low && nextEngulfing > currRange * 1.2) {
        orderBlocks.push({
          id: `ob-bearish-${i}-${timeframe}`,
          type: 'BEARISH',
          high: curr.high,
          low: curr.low,
          timeframe,
          timestamp: curr.time,
          mitigated: candles.slice(i + 3).some(c => c.high >= curr.low)
        });
      }
    }
  }

  return orderBlocks.slice(-6);
}

/**
 * Detect Fair Value Gaps (FVG)
 */
export function detectFairValueGaps(candles: SmcCandle[], timeframe: string): SmcFairValueGap[] {
  const fvgs: SmcFairValueGap[] = [];
  if (!candles || candles.length < 5) return fvgs;

  const len = candles.length;

  for (let i = len - 20; i < len - 1; i++) {
    if (i < 2) continue;

    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    // Bullish FVG
    if (c3.low > c1.high && c2.close > c2.open) {
      const gapSize = c3.low - c1.high;
      if (gapSize > (c2.high - c2.low) * 0.15) {
        const isFilled = candles.slice(i + 1).some(c => c.low <= c1.high);
        fvgs.push({
          id: `fvg-bull-${i}-${timeframe}`,
          type: 'BULLISH_FVG',
          top: c3.low,
          bottom: c1.high,
          timeframe,
          filled: isFilled
        });
      }
    }

    // Bearish FVG
    if (c3.high < c1.low && c2.close < c2.open) {
      const gapSize = c1.low - c3.high;
      if (gapSize > (c2.high - c2.low) * 0.15) {
        const isFilled = candles.slice(i + 1).some(c => c.high >= c1.low);
        fvgs.push({
          id: `fvg-bear-${i}-${timeframe}`,
          type: 'BEARISH_FVG',
          top: c1.low,
          bottom: c3.high,
          timeframe,
          filled: isFilled
        });
      }
    }
  }

  return fvgs.filter(f => !f.filled).slice(-5);
}

/**
 * Detect Support & Resistance Zones
 */
export function detectSupportResistance(candles: SmcCandle[], timeframe: string): SmcSupportResistanceZone[] {
  const zones: SmcSupportResistanceZone[] = [];
  if (!candles || candles.length < 20) return zones;

  const len = candles.length;
  const pivotHighs: { price: number; index: number }[] = [];
  const pivotLows: { price: number; index: number }[] = [];

  for (let i = 5; i < len - 5; i++) {
    const isHigh =
      candles[i].high > candles[i - 1].high &&
      candles[i].high > candles[i - 2].high &&
      candles[i].high > candles[i + 1].high &&
      candles[i].high > candles[i + 2].high;

    const isLow =
      candles[i].low < candles[i - 1].low &&
      candles[i].low < candles[i - 2].low &&
      candles[i].low < candles[i + 1].low &&
      candles[i].low < candles[i + 2].low;

    if (isHigh) pivotHighs.push({ price: candles[i].high, index: i });
    if (isLow) pivotLows.push({ price: candles[i].low, index: i });
  }

  pivotHighs.slice(-6).forEach((ph, idx) => {
    const dec = ph.price > 1000 ? 2 : ph.price > 100 ? 3 : 5;
    zones.push({
      id: `res-${idx}-${timeframe}`,
      type: 'RESISTANCE',
      priceStart: Number((ph.price * 0.9997).toFixed(dec)),
      priceEnd: Number((ph.price * 1.0003).toFixed(dec)),
      strength: 3,
      testedCount: 2,
      timeframe
    });
  });

  pivotLows.slice(-6).forEach((pl, idx) => {
    const dec = pl.price > 1000 ? 2 : pl.price > 100 ? 3 : 5;
    zones.push({
      id: `sup-${idx}-${timeframe}`,
      type: 'SUPPORT',
      priceStart: Number((pl.price * 0.9997).toFixed(dec)),
      priceEnd: Number((pl.price * 1.0003).toFixed(dec)),
      strength: 3,
      testedCount: 2,
      timeframe
    });
  });

  return zones;
}

/**
 * Detect BOS, CHOCH, Liquidity Sweeps
 */
export function analyzeSmcStructures(candles: SmcCandle[], timeframe: string): SmcStructures {
  const orderBlocks = detectOrderBlocks(candles, timeframe);
  const fairValueGaps = detectFairValueGaps(candles, timeframe);

  const len = candles ? candles.length : 0;
  if (len < 30) {
    return { orderBlocks, fairValueGaps, liquiditySweeps: [] };
  }

  const recentCandles = candles.slice(-30);
  const highestRecent = Math.max(...recentCandles.map(c => c.high));
  const lowestRecent = Math.min(...recentCandles.map(c => c.low));
  const lastCandle = candles[len - 1];

  let lastBos: SmcStructures['lastBos'] = undefined;
  let lastChoch: SmcStructures['lastChoch'] = undefined;
  const liquiditySweeps: SmcStructures['liquiditySweeps'] = [];

  if (lastCandle.close > highestRecent * 0.999) {
    lastBos = {
      type: 'BULLISH_BOS',
      price: lastCandle.close,
      timestamp: lastCandle.time
    };
    lastChoch = {
      type: 'BULLISH_CHOCH',
      price: lastCandle.close,
      timestamp: lastCandle.time
    };
  } else if (lastCandle.close < lowestRecent * 1.001) {
    lastBos = {
      type: 'BEARISH_BOS',
      price: lastCandle.close,
      timestamp: lastCandle.time
    };
    lastChoch = {
      type: 'BEARISH_CHOCH',
      price: lastCandle.close,
      timestamp: lastCandle.time
    };
  }

  if (lastCandle.high > highestRecent && lastCandle.close < highestRecent) {
    liquiditySweeps.push({
      type: 'BUY_SIDE_SWEEP',
      price: lastCandle.high,
      timestamp: lastCandle.time
    });
  }
  if (lastCandle.low < lowestRecent && lastCandle.close > lowestRecent) {
    liquiditySweeps.push({
      type: 'SELL_SIDE_SWEEP',
      price: lastCandle.low,
      timestamp: lastCandle.time
    });
  }

  return {
    orderBlocks,
    fairValueGaps,
    lastBos,
    lastChoch,
    liquiditySweeps
  };
}

/**
 * Detect Candlestick Patterns
 */
export function detectCandlestickPatterns(candles: SmcCandle[]): SmcCandlestickPattern[] {
  const len = candles ? candles.length : 0;
  if (len < 3) return [];

  const patterns: SmcCandlestickPattern[] = [];
  const c = candles[len - 1];
  const prev = candles[len - 2];

  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;

  if (lowerWick > body * 2.2 && upperWick < body * 0.8) {
    patterns.push({
      name: 'Bullish Pin Bar / Hammer',
      type: 'BULLISH',
      description: 'Long lower tail indicates strong rejection of lower prices.'
    });
  } else if (upperWick > body * 2.2 && lowerWick < body * 0.8) {
    patterns.push({
      name: 'Bearish Shooting Star',
      type: 'BEARISH',
      description: 'Long upper tail indicates strong rejection of higher prices.'
    });
  }

  if (c.close > c.open && prev.close < prev.open && c.close > prev.open && c.open < prev.close) {
    patterns.push({
      name: 'Bullish Engulfing',
      type: 'BULLISH',
      description: 'Current green candle completely engulfs the previous red candle.'
    });
  } else if (c.close < c.open && prev.close > prev.open && c.close < prev.open && c.open > prev.close) {
    patterns.push({
      name: 'Bearish Engulfing',
      type: 'BEARISH',
      description: 'Current red candle completely engulfs the previous green candle.'
    });
  }

  if (body <= range * 0.1) {
    patterns.push({
      name: 'Doji',
      type: 'NEUTRAL',
      description: 'Indecision candle with minimal real body.'
    });
  }

  return patterns;
}
