import { CandleData, IndicatorValues } from '../types';

/**
 * Calculates Exponential Moving Average (EMA)
 */
export function calculateEMA(candles: CandleData[], period: number): number[] {
  if (candles.length < period) return candles.map(() => 0);
  const k = 2 / (period + 1);
  const emaValues: number[] = new Array(candles.length).fill(0);

  // Initial SMA as first EMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  emaValues[period - 1] = sum / period;

  for (let i = period; i < candles.length; i++) {
    emaValues[i] = candles[i].close * k + emaValues[i - 1] * (1 - k);
  }

  return emaValues;
}

/**
 * Calculates Simple Moving Average (SMA)
 */
export function calculateSMA(candles: CandleData[], period: number): number[] {
  const smaValues: number[] = new Array(candles.length).fill(0);
  if (candles.length < period) return smaValues;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  smaValues[period - 1] = sum / period;

  for (let i = period; i < candles.length; i++) {
    sum += candles[i].close - candles[i - period].close;
    smaValues[i] = sum / period;
  }

  return smaValues;
}

/**
 * Calculates Relative Strength Index (RSI)
 */
export function calculateRSI(candles: CandleData[], period: number = 14): number[] {
  const rsiValues: number[] = new Array(candles.length).fill(50);
  if (candles.length <= period) return rsiValues;

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    if (avgLoss === 0) {
      rsiValues[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsiValues[i] = 100 - 100 / (1 + rs);
    }
  }

  return rsiValues;
}

/**
 * Calculates MACD (12, 26, 9)
 */
export function calculateMACD(
  candles: CandleData[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
) {
  const fastEma = calculateEMA(candles, fastPeriod);
  const slowEma = calculateEMA(candles, slowPeriod);

  const macdLine: number[] = candles.map((_, i) => fastEma[i] - slowEma[i]);
  
  // Calculate Signal Line (EMA of MACD Line)
  const k = 2 / (signalPeriod + 1);
  const signalLine: number[] = new Array(candles.length).fill(0);
  
  let sum = 0;
  for (let i = slowPeriod - 1; i < slowPeriod - 1 + signalPeriod && i < candles.length; i++) {
    sum += macdLine[i];
  }
  const startIndex = slowPeriod - 1 + signalPeriod;
  if (startIndex < candles.length) {
    signalLine[startIndex] = sum / signalPeriod;
    for (let i = startIndex + 1; i < candles.length; i++) {
      signalLine[i] = macdLine[i] * k + signalLine[i - 1] * (1 - k);
    }
  }

  const histogram: number[] = candles.map((_, i) => macdLine[i] - signalLine[i]);

  return { macdLine, signalLine, histogram };
}

/**
 * Calculates ATR (Average True Range)
 */
export function calculateATR(candles: CandleData[], period = 14): number[] {
  const atr: number[] = new Array(candles.length).fill(0);
  if (candles.length < 2) return atr;

  const tr: number[] = new Array(candles.length).fill(0);
  tr[0] = candles[0].high - candles[0].low;

  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hpc = Math.abs(candles[i].high - candles[i - 1].close);
    const lpc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hpc, lpc);
  }

  let sum = 0;
  for (let i = 0; i < period && i < candles.length; i++) {
    sum += tr[i];
  }
  atr[period - 1] = sum / period;

  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }

  return atr;
}

/**
 * Calculates Bollinger Bands (20, 2)
 */
export function calculateBollingerBands(candles: CandleData[], period = 20, multiplier = 2) {
  const sma = calculateSMA(candles, period);
  const upper: number[] = new Array(candles.length).fill(0);
  const lower: number[] = new Array(candles.length).fill(0);

  for (let i = period - 1; i < candles.length; i++) {
    let sumSq = 0;
    const mean = sma[i];
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += Math.pow(candles[j].close - mean, 2);
    }
    const stdDev = Math.sqrt(sumSq / period);
    upper[i] = mean + multiplier * stdDev;
    lower[i] = mean - multiplier * stdDev;
  }

  return { upper, middle: sma, lower };
}

/**
 * Calculates SuperTrend (10, 3)
 */
export function calculateSuperTrend(candles: CandleData[], period = 10, multiplier = 3) {
  const atr = calculateATR(candles, period);
  const superTrend: number[] = new Array(candles.length).fill(0);
  const trend: ('BULLISH' | 'BEARISH')[] = new Array(candles.length).fill('BULLISH');

  let upperBand = 0;
  let lowerBand = 0;

  for (let i = period; i < candles.length; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    let basicUpper = hl2 + multiplier * atr[i];
    let basicLower = hl2 - multiplier * atr[i];

    const prevUpper = upperBand;
    const prevLower = lowerBand;

    upperBand = (basicUpper < prevUpper || candles[i - 1].close > prevUpper) ? basicUpper : prevUpper;
    lowerBand = (basicLower > prevLower || candles[i - 1].close < prevLower) ? basicLower : prevLower;

    const prevTrend = i > period ? trend[i - 1] : 'BULLISH';

    if (prevTrend === 'BULLISH' && candles[i].close < lowerBand) {
      trend[i] = 'BEARISH';
      superTrend[i] = upperBand;
    } else if (prevTrend === 'BEARISH' && candles[i].close > upperBand) {
      trend[i] = 'BULLISH';
      superTrend[i] = lowerBand;
    } else {
      trend[i] = prevTrend;
      superTrend[i] = prevTrend === 'BULLISH' ? lowerBand : upperBand;
    }
  }

  return { superTrend, trend };
}

/**
 * Calculates ADX (Average Directional Index)
 */
export function calculateADX(candles: CandleData[], period = 14) {
  const length = candles.length;
  if (length <= period * 2) {
    return { adx: 20, plusDI: 20, minusDI: 20, trendStrength: 'MODERATE' as const };
  }

  const tr: number[] = new Array(length).fill(0);
  const plusDM: number[] = new Array(length).fill(0);
  const minusDM: number[] = new Array(length).fill(0);

  for (let i = 1; i < length; i++) {
    const hDiff = candles[i].high - candles[i - 1].high;
    const lDiff = candles[i - 1].low - candles[i].low;

    plusDM[i] = (hDiff > lDiff && hDiff > 0) ? hDiff : 0;
    minusDM[i] = (lDiff > hDiff && lDiff > 0) ? lDiff : 0;

    const hl = candles[i].high - candles[i].low;
    const hpc = Math.abs(candles[i].high - candles[i - 1].close);
    const lpc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hpc, lpc);
  }

  // Smooth TR, +DM, -DM
  let trSmooth = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let plusDMSmooth = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let minusDMSmooth = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);

  const dxList: number[] = [];

  for (let i = period + 1; i < length; i++) {
    trSmooth = trSmooth - trSmooth / period + tr[i];
    plusDMSmooth = plusDMSmooth - plusDMSmooth / period + plusDM[i];
    minusDMSmooth = minusDMSmooth - minusDMSmooth / period + minusDM[i];

    const plusDI = (plusDMSmooth / trSmooth) * 100;
    const minusDI = (minusDMSmooth / trSmooth) * 100;
    const diDiff = Math.abs(plusDI - minusDI);
    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : (diDiff / diSum) * 100;
    dxList.push(dx);
  }

  const latestPlusDI = trSmooth === 0 ? 0 : (plusDMSmooth / trSmooth) * 100;
  const latestMinusDI = trSmooth === 0 ? 0 : (minusDMSmooth / trSmooth) * 100;
  const adxVal = dxList.length > 0 ? dxList.slice(-period).reduce((a, b) => a + b, 0) / Math.min(dxList.length, period) : 20;

  let trendStrength: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG' = 'MODERATE';
  if (adxVal < 20) trendStrength = 'WEAK';
  else if (adxVal < 30) trendStrength = 'MODERATE';
  else if (adxVal < 50) trendStrength = 'STRONG';
  else trendStrength = 'VERY_STRONG';

  return {
    adx: Number(adxVal.toFixed(2)),
    plusDI: Number(latestPlusDI.toFixed(2)),
    minusDI: Number(latestMinusDI.toFixed(2)),
    trendStrength
  };
}

/**
 * Calculates VWAP (Volume Weighted Average Price)
 */
export function calculateVWAP(candles: CandleData[]): number[] {
  const vwap: number[] = [];
  let cumTPV = 0;
  let cumVol = 0;

  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumTPV += tp * candles[i].volume;
    cumVol += candles[i].volume;
    vwap.push(cumVol === 0 ? candles[i].close : cumTPV / cumVol);
  }

  return vwap;
}

/**
 * Calculates OBV (On-Balance Volume)
 */
export function calculateOBV(candles: CandleData[]): number[] {
  const obv: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      obv.push(obv[i - 1] + candles[i].volume);
    } else if (candles[i].close < candles[i - 1].close) {
      obv.push(obv[i - 1] - candles[i].volume);
    } else {
      obv.push(obv[i - 1]);
    }
  }
  return obv;
}

/**
 * Calculates Ichimoku Cloud
 */
export function calculateIchimoku(candles: CandleData[]) {
  const len = candles.length;
  if (len < 52) {
    const lastPrice = candles[len - 1]?.close || 1.08;
    return {
      tenkanSen: lastPrice,
      kijunSen: lastPrice,
      senkouSpanA: lastPrice,
      senkouSpanB: lastPrice,
      chikouSpan: lastPrice,
      cloudState: 'INSIDE_CLOUD' as const
    };
  }

  const getHighLowAvg = (startIdx: number, endIdx: number) => {
    let h = -Infinity;
    let l = Infinity;
    for (let i = startIdx; i <= endIdx; i++) {
      if (candles[i].high > h) h = candles[i].high;
      if (candles[i].low < l) l = candles[i].low;
    }
    return (h + l) / 2;
  };

  const tenkanSen = getHighLowAvg(len - 9, len - 1);
  const kijunSen = getHighLowAvg(len - 26, len - 1);
  const senkouSpanA = (tenkanSen + kijunSen) / 2;
  const senkouSpanB = getHighLowAvg(len - 52, len - 1);
  const chikouSpan = candles[len - 1].close;

  const lastClose = candles[len - 1].close;
  const cloudTop = Math.max(senkouSpanA, senkouSpanB);
  const cloudBottom = Math.min(senkouSpanA, senkouSpanB);

  let cloudState: 'BULLISH_CLOUD' | 'BEARISH_CLOUD' | 'INSIDE_CLOUD' = 'INSIDE_CLOUD';
  if (lastClose > cloudTop) cloudState = 'BULLISH_CLOUD';
  else if (lastClose < cloudBottom) cloudState = 'BEARISH_CLOUD';

  return { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan, cloudState };
}

/**
 * Detect RSI Divergence
 */
export function detectRSIDivergence(candles: CandleData[], rsiValues: number[]): 'BULLISH' | 'BEARISH' | 'NONE' {
  if (candles.length < 30 || rsiValues.length < 30) return 'NONE';

  const len = candles.length;
  // Look at last 20 bars for local lows/highs
  const pCurr = candles[len - 1].close;
  const pPrev = candles[len - 15].close;
  const rsiCurr = rsiValues[len - 1];
  const rsiPrev = rsiValues[len - 15];

  // Bullish divergence: price making lower low, but RSI making higher low
  if (pCurr < pPrev && rsiCurr > rsiPrev && rsiCurr < 45) {
    return 'BULLISH';
  }
  // Bearish divergence: price making higher high, but RSI making lower high
  if (pCurr > pPrev && rsiCurr < rsiPrev && rsiCurr > 55) {
    return 'BEARISH';
  }

  return 'NONE';
}

/**
 * Master Indicator Calculator that combines all technical outputs
 */
export function calculateAllIndicators(candles: CandleData[]): IndicatorValues {
  const len = candles.length;
  const lastIndex = Math.max(0, len - 1);

  const ema20 = calculateEMA(candles, 20)[lastIndex] || candles[lastIndex].close;
  const ema50 = calculateEMA(candles, 50)[lastIndex] || candles[lastIndex].close;
  const ema100 = calculateEMA(candles, 100)[lastIndex] || candles[lastIndex].close;
  const ema200 = calculateEMA(candles, 200)[lastIndex] || candles[lastIndex].close;
  const sma50 = calculateSMA(candles, 50)[lastIndex] || candles[lastIndex].close;

  const rsiSeries = calculateRSI(candles, 14);
  const rsi = Number((rsiSeries[lastIndex] || 50).toFixed(2));
  const rsiDivergence = detectRSIDivergence(candles, rsiSeries);

  const macdData = calculateMACD(candles);
  const macd = {
    macdLine: Number((macdData.macdLine[lastIndex] || 0).toFixed(5)),
    signalLine: Number((macdData.signalLine[lastIndex] || 0).toFixed(5)),
    histogram: Number((macdData.histogram[lastIndex] || 0).toFixed(5))
  };

  const atrSeries = calculateATR(candles, 14);
  const atr = Number((atrSeries[lastIndex] || 0.0015).toFixed(5));

  const bb = calculateBollingerBands(candles, 20, 2);
  const bollingerBands = {
    upper: Number((bb.upper[lastIndex] || candles[lastIndex].close * 1.002).toFixed(5)),
    middle: Number((bb.middle[lastIndex] || candles[lastIndex].close).toFixed(5)),
    lower: Number((bb.lower[lastIndex] || candles[lastIndex].close * 0.998).toFixed(5))
  };

  const stData = calculateSuperTrend(candles, 10, 3);
  const superTrend = {
    value: Number((stData.superTrend[lastIndex] || candles[lastIndex].close).toFixed(5)),
    trend: stData.trend[lastIndex] || 'BULLISH'
  };

  const adx = calculateADX(candles, 14);

  const vwapSeries = calculateVWAP(candles);
  const vwap = Number((vwapSeries[lastIndex] || candles[lastIndex].close).toFixed(5));

  const obvSeries = calculateOBV(candles);
  const obv = obvSeries[lastIndex] || 0;

  const ichimoku = calculateIchimoku(candles);

  // Stochastic RSI approximation
  const rsiWindow = rsiSeries.slice(Math.max(0, len - 14));
  const minRsi = Math.min(...rsiWindow);
  const maxRsi = Math.max(...rsiWindow);
  const stochK = maxRsi === minRsi ? 50 : ((rsi - minRsi) / (maxRsi - minRsi)) * 100;

  return {
    ema20,
    ema50,
    ema100,
    ema200,
    sma50,
    rsi,
    rsiDivergence,
    macd,
    stochRsi: { k: Number(stochK.toFixed(2)), d: Number((stochK * 0.9).toFixed(2)) },
    cci: Number((((candles[lastIndex].close - sma50) / (atr || 0.001)) * 1.5).toFixed(2)),
    atr,
    bollingerBands,
    superTrend,
    adx,
    vwap,
    obv,
    ichimoku
  };
}
