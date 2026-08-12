import { Candle, MarketStructure } from '@iati/core-types';

export class MarketStructureAnalyzer {
  analyzeStructure(candles: Candle[]): MarketStructure {
    if (candles.length < 5) {
      return {
        higherHighs: false,
        higherLows: false,
        lowerHighs: false,
        lowerLows: false,
        supportZones: [],
        resistanceZones: [],
        isConsolidating: false,
        isBreakout: false,
        pattern: 'UNDEFINED'
      };
    }

    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    const latestHigh = highs[highs.length - 1];
    const prevHigh = highs[highs.length - 3];
    const latestLow = lows[lows.length - 1];
    const prevLow = lows[lows.length - 3];

    const higherHighs = latestHigh > prevHigh;
    const higherLows = latestLow > prevLow;
    const lowerHighs = latestHigh < prevHigh;
    const lowerLows = latestLow < prevLow;

    // Calculate Support and Resistance
    const maxHigh = Math.max(...highs.slice(-20));
    const minLow = Math.min(...lows.slice(-20));
    const supportZones = [Number(minLow.toFixed(5))];
    const resistanceZones = [Number(maxHigh.toFixed(5))];

    // Range calculation for Consolidation
    const range = maxHigh - minLow;
    const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
    const rangePercent = (range / avgClose) * 100;

    const isConsolidating = rangePercent < 0.8;
    const latestClose = closes[closes.length - 1];
    const isBreakout = latestClose > maxHigh * 0.998 || latestClose < minLow * 1.002;

    let pattern = 'RANGING_STRUCTURE';
    if (higherHighs && higherLows) pattern = 'BULLISH_STRUCTURE';
    else if (lowerHighs && lowerLows) pattern = 'BEARISH_STRUCTURE';
    else if (isConsolidating) pattern = 'CONSOLIDATION_BOX';

    return {
      higherHighs,
      higherLows,
      lowerHighs,
      lowerLows,
      supportZones,
      resistanceZones,
      isConsolidating,
      isBreakout,
      pattern
    };
  }
}
