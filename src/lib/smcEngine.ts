import { CandleData, OrderBlock, FairValueGap, SmcStructures, SupportResistanceZone, Timeframe } from '../types';
import {
  detectOrderBlocks as coreDetectOrderBlocks,
  detectFairValueGaps as coreDetectFairValueGaps,
  detectSupportResistance as coreDetectSupportResistance,
  analyzeSmcStructures as coreAnalyzeSmcStructures,
  detectCandlestickPatterns as coreDetectCandlestickPatterns,
} from '@iati/core/smc';

/**
 * Presentation / Visualization Adapter for Frontend Charting.
 * Delegates directly to canonical @iati/core SMC algorithms.
 */
export function detectOrderBlocks(candles: CandleData[], timeframe: Timeframe): OrderBlock[] {
  return coreDetectOrderBlocks(candles, timeframe) as OrderBlock[];
}

export function detectFairValueGaps(candles: CandleData[], timeframe: Timeframe): FairValueGap[] {
  return coreDetectFairValueGaps(candles, timeframe) as FairValueGap[];
}

export function detectSupportResistance(candles: CandleData[], timeframe: Timeframe): SupportResistanceZone[] {
  return coreDetectSupportResistance(candles, timeframe) as SupportResistanceZone[];
}

export function analyzeSmcStructures(candles: CandleData[], timeframe: Timeframe): SmcStructures {
  return coreAnalyzeSmcStructures(candles, timeframe) as SmcStructures;
}

/**
 * Detect Candlestick Patterns
 * Delegates to canonical @iati/core algorithm
 */
export function detectCandlestickPatterns(candles: CandleData[]) {
  return coreDetectCandlestickPatterns(candles);
}

