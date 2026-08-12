import { Candle, MarketFeatures, PriceFeatures, TrendFeatures, VolatilityFeatures, MomentumFeatures, LiquidityFeatures } from '@iati/core-types';

export class MarketFeatureEngine {
  calculatePriceFeatures(candle: Candle, previousCandle?: Candle): PriceFeatures {
    const priceChange = previousCandle ? candle.close - previousCandle.close : 0;
    const percentChange = previousCandle && previousCandle.close !== 0 ? (priceChange / previousCandle.close) * 100 : 0;
    const bodySize = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const isBullish = candle.close >= candle.open;

    return {
      ohlc: candle,
      priceChange: Number(priceChange.toFixed(5)),
      percentChange: Number(percentChange.toFixed(3)),
      bodySize: Number(bodySize.toFixed(5)),
      upperWick: Number(upperWick.toFixed(5)),
      lowerWick: Number(lowerWick.toFixed(5)),
      isBullish
    };
  }

  calculateTrendFeatures(candles: Candle[]): TrendFeatures {
    if (candles.length === 0) {
      return { sma20: 0, sma50: 0, ema20: 0, direction: 'SIDEWAYS', strength: 0 };
    }

    const closes = candles.map(c => c.close);
    const getSMA = (arr: number[], period: number) => {
      if (arr.length < period) period = arr.length;
      const slice = arr.slice(-period);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    };

    const getEMA = (arr: number[], period: number) => {
      if (arr.length === 0) return 0;
      const k = 2 / (period + 1);
      let ema = arr[0];
      for (let i = 1; i < arr.length; i++) {
        ema = arr[i] * k + ema * (1 - k);
      }
      return ema;
    };

    const sma20 = getSMA(closes, 20);
    const sma50 = getSMA(closes, 50);
    const ema20 = getEMA(closes, 20);

    const latestClose = closes[closes.length - 1];
    let direction: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' = 'SIDEWAYS';
    let strength = 0.5;

    if (sma20 > sma50 && latestClose > sma20) {
      direction = 'BULLISH';
      strength = Math.min(1, 0.5 + Math.abs(sma20 - sma50) / sma50 * 10);
    } else if (sma20 < sma50 && latestClose < sma20) {
      direction = 'BEARISH';
      strength = Math.min(1, 0.5 + Math.abs(sma20 - sma50) / sma50 * 10);
    } else {
      direction = 'SIDEWAYS';
      strength = 0.3;
    }

    return {
      sma20: Number(sma20.toFixed(5)),
      sma50: Number(sma50.toFixed(5)),
      ema20: Number(ema20.toFixed(5)),
      direction,
      strength: Number(strength.toFixed(2))
    };
  }

  calculateVolatilityFeatures(candles: Candle[]): VolatilityFeatures {
    if (candles.length < 2) {
      return { atr: 0.001, volatilityState: 'NORMAL', expansionRatio: 1.0 };
    }

    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trs.push(tr);
    }

    const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
    const recentTr = trs[trs.length - 1];
    const expansionRatio = atr > 0 ? recentTr / atr : 1.0;

    let volatilityState: 'HIGH' | 'LOW' | 'NORMAL' = 'NORMAL';
    if (expansionRatio > 1.5) {
      volatilityState = 'HIGH';
    } else if (expansionRatio < 0.7) {
      volatilityState = 'LOW';
    }

    return {
      atr: Number(atr.toFixed(5)),
      volatilityState,
      expansionRatio: Number(expansionRatio.toFixed(2))
    };
  }

  calculateMomentumFeatures(candles: Candle[]): MomentumFeatures {
    if (candles.length < 14) {
      return { rsi: 50, momentumScore: 0, acceleration: 0 };
    }

    const closes = candles.map(c => c.close);
    let gains = 0;
    let losses = 0;

    for (let i = closes.length - 14; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    const momentumScore = (rsi - 50) / 50; // -1 to +1
    const prevScore = closes.length >= 15 ? (closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5] : 0;
    const acceleration = momentumScore - prevScore;

    return {
      rsi: Number(rsi.toFixed(2)),
      momentumScore: Number(momentumScore.toFixed(2)),
      acceleration: Number(acceleration.toFixed(4))
    };
  }

  calculateLiquidityFeatures(candles: Candle[]): LiquidityFeatures {
    const latest = candles[candles.length - 1];
    const estimatedSpread = latest ? (latest.high - latest.low) * 0.1 : 0.0002;
    
    let condition: 'OPTIMAL' | 'NORMAL' | 'THIN' | 'ILLIQUID' = 'NORMAL';
    if (estimatedSpread < 0.0001) condition = 'OPTIMAL';
    else if (estimatedSpread > 0.002) condition = 'ILLIQUID';
    else if (estimatedSpread > 0.0008) condition = 'THIN';

    return {
      spread: Number(estimatedSpread.toFixed(5)),
      condition
    };
  }

  extractAllFeatures(candles: Candle[]): MarketFeatures {
    const latest = candles[candles.length - 1];
    const previous = candles.length > 1 ? candles[candles.length - 2] : undefined;

    return {
      price: this.calculatePriceFeatures(latest, previous),
      trend: this.calculateTrendFeatures(candles),
      volatility: this.calculateVolatilityFeatures(candles),
      momentum: this.calculateMomentumFeatures(candles),
      liquidity: this.calculateLiquidityFeatures(candles)
    };
  }
}
