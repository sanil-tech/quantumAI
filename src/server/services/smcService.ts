import {
  analyzeSmcStructures,
  detectOrderBlocks,
  detectFairValueGaps,
  detectSupportResistance,
  SmcCandle,
  SmcStructures
} from '@iati/core';

export class ServerSmcService {
  /**
   * Authoritative Server-Side SMC Analysis
   */
  getCanonicalSmcAnalysis(candles: SmcCandle[], timeframe: string = 'M15'): SmcStructures {
    return analyzeSmcStructures(candles, timeframe);
  }

  getOrderBlocks(candles: SmcCandle[], timeframe: string = 'M15') {
    return detectOrderBlocks(candles, timeframe);
  }

  getFairValueGaps(candles: SmcCandle[], timeframe: string = 'M15') {
    return detectFairValueGaps(candles, timeframe);
  }

  getSupportResistance(candles: SmcCandle[], timeframe: string = 'M15') {
    return detectSupportResistance(candles, timeframe);
  }
}

export const serverSmcService = new ServerSmcService();
