import { MarketFeatures, MarketStructure, MarketRegime, MarketRegimeType, MarketState } from '@iati/core-types';

export class MarketRegimeEngine {
  classifyRegime(symbol: string, features: MarketFeatures, structure: MarketStructure): MarketRegime {
    const evidence: string[] = [];
    let regime: MarketRegimeType = 'RANGING';
    let confidence = 0.5;

    // Check Volatility Regime first
    if (features.volatility.volatilityState === 'HIGH') {
      evidence.push(`ATR expansion ratio ${features.volatility.expansionRatio} indicates elevated volatility`);
      if (features.trend.direction !== 'SIDEWAYS') {
        regime = 'TRENDING';
        confidence = 0.85;
        evidence.push(`Strong ${features.trend.direction} trend with strength ${features.trend.strength}`);
      } else {
        regime = 'HIGH_VOLATILITY';
        confidence = 0.80;
      }
    } else if (structure.isConsolidating || features.trend.direction === 'SIDEWAYS') {
      regime = 'RANGING';
      confidence = 0.78;
      evidence.push('Price bound within consolidation range');
      evidence.push(`RSI at ${features.momentum.rsi} near neutral center`);
    } else if (features.trend.direction === 'BULLISH' || features.trend.direction === 'BEARISH') {
      regime = 'TRENDING';
      confidence = 0.82;
      evidence.push(`Moving Averages aligned in ${features.trend.direction} order`);
      evidence.push(`Structure pattern: ${structure.pattern}`);
    } else if (structure.isBreakout) {
      regime = 'TRANSITION';
      confidence = 0.75;
      evidence.push('Breakout detected across local support/resistance level');
    }

    return {
      symbol,
      regime,
      confidence: Number(confidence.toFixed(2)),
      evidence
    };
  }

  generateMarketState(symbol: string, features: MarketFeatures, structure: MarketStructure): MarketState {
    const regime = this.classifyRegime(symbol, features, structure);

    return {
      symbol,
      timestamp: new Date(),
      trend: features.trend,
      momentum: features.momentum,
      volatility: features.volatility,
      liquidity: features.liquidity,
      structure,
      regime,
      confidence: regime.confidence,
      evidence: regime.evidence
    };
  }
}
