import { CandleData } from '../types';

export type ChartPatternType = 
  | 'CHANNEL_UP'
  | 'CHANNEL_DOWN'
  | 'ASCENDING_TRIANGLE'
  | 'DESCENDING_TRIANGLE'
  | 'SYMMETRICAL_TRIANGLE'
  | 'RISING_WEDGE'
  | 'FALLING_WEDGE'
  | 'DOUBLE_TOP'
  | 'DOUBLE_BOTTOM'
  | 'HEAD_AND_SHOULDERS'
  | 'INVERSE_HEAD_AND_SHOULDERS';

export interface DetectedChartPattern {
  id: string;
  name: string;
  type: ChartPatternType;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  timeframe: string;
  quality: number; // 1 to 10
  length: number; // candle count
  identificationTime: number;
  breakoutLevel?: number;
  targetPrice?: number;
  description: string;
}

interface SwingPoint {
  index: number;
  price: number;
  time: number;
  type: 'HIGH' | 'LOW';
}

/**
 * Finds local swing highs and lows with a given lookback window.
 */
function findSwingPoints(candles: CandleData[], windowSize: number = 3): SwingPoint[] {
  const swings: SwingPoint[] = [];
  if (candles.length < windowSize * 2 + 1) return swings;

  for (let i = windowSize; i < candles.length - windowSize; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - windowSize; j <= i + windowSize; j++) {
      if (j === i) continue;
      if (candles[j].high >= current.high) isHigh = false;
      if (candles[j].low <= current.low) isLow = false;
    }

    if (isHigh) {
      swings.push({ index: i, price: current.high, time: current.time, type: 'HIGH' });
    } else if (isLow) {
      swings.push({ index: i, price: current.low, time: current.time, type: 'LOW' });
    }
  }

  return swings;
}

/**
 * Computes linear regression slope and R-squared for a set of points.
 */
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
    sumY2 += p.y * p.y;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const yPred = slope * p.x + intercept;
    ssTot += Math.pow(p.y - yMean, 2);
    ssRes += Math.pow(p.y - yPred, 2);
  }

  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

/**
 * Main Chart Pattern Detection Engine (In-House Autochartist Equivalent)
 */
export function detectChartPatterns(candles: CandleData[], timeframe: string = 'M15'): DetectedChartPattern[] {
  const patterns: DetectedChartPattern[] = [];
  if (!candles || candles.length < 30) return patterns;

  const currentPrice = candles[candles.length - 1].close;
  const swings = findSwingPoints(candles, 3);
  const highs = swings.filter(s => s.type === 'HIGH');
  const lows = swings.filter(s => s.type === 'LOW');

  if (highs.length < 3 || lows.length < 3) return patterns;

  const recentHighs = highs.slice(-5);
  const recentLows = lows.slice(-5);
  const patternLength = candles.length - Math.min(recentHighs[0].index, recentLows[0].index);

  const highPoints = recentHighs.map(h => ({ x: h.index, y: h.price }));
  const lowPoints = recentLows.map(l => ({ x: l.index, y: l.price }));

  const highReg = linearRegression(highPoints);
  const lowReg = linearRegression(lowPoints);

  const highStd = Math.sqrt(highPoints.reduce((acc, p) => acc + Math.pow(p.y - (highReg.slope * p.x + highReg.intercept), 2), 0) / highPoints.length);
  const lowStd = Math.sqrt(lowPoints.reduce((acc, p) => acc + Math.pow(p.y - (lowReg.slope * p.x + lowReg.intercept), 2), 0) / lowPoints.length);
  const meanPrice = (recentHighs[recentHighs.length - 1].price + recentLows[recentLows.length - 1].price) / 2;

  // Normalized Slopes
  const normHighSlope = (highReg.slope / meanPrice) * 100;
  const normLowSlope = (lowReg.slope / meanPrice) * 100;

  // 1. Ascending Triangle (Horizontal Resistance + Rising Support)
  if (Math.abs(normHighSlope) < 0.04 && normLowSlope > 0.03) {
    const quality = Math.min(9, Math.max(5, Math.round((highReg.r2 + lowReg.r2) * 4.5) + 1));
    const resLevel = recentHighs[recentHighs.length - 1].price;
    const height = resLevel - recentLows[0].price;
    patterns.push({
      id: `pat_asc_triangle_${timeframe}_${Date.now()}`,
      name: 'Ascending Triangle',
      type: 'ASCENDING_TRIANGLE',
      direction: 'UP',
      timeframe,
      quality,
      length: patternLength,
      identificationTime: Date.now(),
      breakoutLevel: resLevel,
      targetPrice: Number((resLevel + height * 0.8).toFixed(5)),
      description: `Rintangan mendatar pada ${resLevel} dengan sokongan cerun menaik (Bullish Confluence).`
    });
  }

  // 2. Descending Triangle (Horizontal Support + Falling Resistance)
  else if (Math.abs(normLowSlope) < 0.04 && normHighSlope < -0.03) {
    const quality = Math.min(9, Math.max(5, Math.round((highReg.r2 + lowReg.r2) * 4.5) + 1));
    const suppLevel = recentLows[recentLows.length - 1].price;
    const height = recentHighs[0].price - suppLevel;
    patterns.push({
      id: `pat_desc_triangle_${timeframe}_${Date.now()}`,
      name: 'Descending Triangle',
      type: 'DESCENDING_TRIANGLE',
      direction: 'DOWN',
      timeframe,
      quality,
      length: patternLength,
      identificationTime: Date.now(),
      breakoutLevel: suppLevel,
      targetPrice: Number((suppLevel - height * 0.8).toFixed(5)),
      description: `Sokongan mendatar pada ${suppLevel} dengan rintangan cerun menurun (Bearish Breakdown).`
    });
  }

  // 3. Channel Up (Parallel Rising Trendlines)
  else if (normHighSlope > 0.03 && normLowSlope > 0.03 && Math.abs(normHighSlope - normLowSlope) < 0.08) {
    const quality = Math.min(8, Math.max(5, Math.round((highReg.r2 + lowReg.r2) * 4)));
    patterns.push({
      id: `pat_chan_up_${timeframe}_${Date.now()}`,
      name: 'Channel Up',
      type: 'CHANNEL_UP',
      direction: 'UP',
      timeframe,
      quality,
      length: patternLength,
      identificationTime: Date.now(),
      targetPrice: Number((currentPrice * 1.004).toFixed(5)),
      description: `Saluran harga selari menaik (Higher Highs & Higher Lows). Trend menaik kekal utuh.`
    });
  }

  // 4. Channel Down (Parallel Falling Trendlines)
  else if (normHighSlope < -0.03 && normLowSlope < -0.03 && Math.abs(normHighSlope - normLowSlope) < 0.08) {
    const quality = Math.min(8, Math.max(5, Math.round((highReg.r2 + lowReg.r2) * 4)));
    patterns.push({
      id: `pat_chan_down_${timeframe}_${Date.now()}`,
      name: 'Channel Down',
      type: 'CHANNEL_DOWN',
      direction: 'DOWN',
      timeframe,
      quality,
      length: patternLength,
      identificationTime: Date.now(),
      targetPrice: Number((currentPrice * 0.996).toFixed(5)),
      description: `Saluran harga selari menurun (Lower Highs & Lower Lows). Trend menurun berterusan.`
    });
  }

  // 5. Rising Wedge (Both slope UP but converging -> Bearish Reversal)
  else if (normHighSlope > 0.02 && normLowSlope > normHighSlope + 0.03) {
    const quality = Math.min(8, Math.max(6, Math.round(lowReg.r2 * 8)));
    patterns.push({
      id: `pat_rising_wedge_${timeframe}_${Date.now()}`,
      name: 'Rising Wedge',
      type: 'RISING_WEDGE',
      direction: 'DOWN',
      timeframe,
      quality,
      length: patternLength,
      identificationTime: Date.now(),
      targetPrice: Number((currentPrice * 0.995).toFixed(5)),
      description: `Baji harga menaik yang menirus (Amaran kelemahan pembeli / Potensi pembalikan Bearish).`
    });
  }

  // 6. Falling Wedge (Both slope DOWN but converging -> Bullish Reversal)
  else if (normHighSlope < -0.02 && normHighSlope > normLowSlope + 0.03) {
    const quality = Math.min(8, Math.max(6, Math.round(highReg.r2 * 8)));
    patterns.push({
      id: `pat_falling_wedge_${timeframe}_${Date.now()}`,
      name: 'Falling Wedge',
      type: 'FALLING_WEDGE',
      direction: 'UP',
      timeframe,
      quality,
      length: patternLength,
      identificationTime: Date.now(),
      targetPrice: Number((currentPrice * 1.005).toFixed(5)),
      description: `Baji harga menurun yang menirus (Amaran tekanan jualan melemah / Potensi lonjakan Bullish).`
    });
  }

  // 7. Double Top (Two equal peaks at resistance)
  if (recentHighs.length >= 2) {
    const p1 = recentHighs[recentHighs.length - 2];
    const p2 = recentHighs[recentHighs.length - 1];
    const diffPct = Math.abs(p1.price - p2.price) / p1.price;
    if (diffPct < 0.0015 && p2.index - p1.index >= 8) {
      patterns.push({
        id: `pat_double_top_${timeframe}_${Date.now()}`,
        name: 'Double Top',
        type: 'DOUBLE_TOP',
        direction: 'DOWN',
        timeframe,
        quality: 7,
        length: candles.length - p1.index,
        identificationTime: Date.now(),
        breakoutLevel: p1.price,
        description: `Puncak berkembar pada paras ${p1.price.toFixed(5)} gagal melepasi rintangan.`
      });
    }
  }

  // 8. Double Bottom (Two equal troughs at support)
  if (recentLows.length >= 2) {
    const p1 = recentLows[recentLows.length - 2];
    const p2 = recentLows[recentLows.length - 1];
    const diffPct = Math.abs(p1.price - p2.price) / p1.price;
    if (diffPct < 0.0015 && p2.index - p1.index >= 8) {
      patterns.push({
        id: `pat_double_bottom_${timeframe}_${Date.now()}`,
        name: 'Double Bottom',
        type: 'DOUBLE_BOTTOM',
        direction: 'UP',
        timeframe,
        quality: 7,
        length: candles.length - p1.index,
        identificationTime: Date.now(),
        breakoutLevel: p1.price,
        description: `Lembah berkembar pada paras ${p1.price.toFixed(5)} menunjukkan sokongan lantai kukuh.`
      });
    }
  }

  return patterns;
}
