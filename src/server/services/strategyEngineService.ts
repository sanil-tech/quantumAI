
export type MarketRegime = 'TRENDING' | 'RANGING' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'BREAKOUT' | 'UNCERTAIN';
export type SignalDirection = 'BUY' | 'SELL' | 'NO_TRADE';
export type SignalState =
  | 'GENERATED'
  | 'VALIDATED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'USER_REVIEW'
  | 'APPROVED'
  | 'EXECUTION_BLOCKED'
  | 'EXECUTION_REQUESTED'
  | 'CLOSED';

export interface MarketCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalFeatures {
  emaFast: number;
  emaSlow: number;
  rsi: number;
  atr: number;
  adx: number;
  spreadPips: number;
  isStale: boolean;
}

export interface StrategyDefinition {
  strategyId: string;
  name: string;
  version: string;
  supportedRegimes: MarketRegime[];
  minConfidence: number;
  maxRiskPercent: number;
}

export interface CanonicalSignal {
  signalId: string;
  symbol: string;
  direction: SignalDirection;
  strategyId: string;
  strategyVersion: string;
  regime: MarketRegime;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  slPips: number;
  tpPips: number;
  riskPercent: number;
  riskDollars: number;
  lotSize: number;
  confidence: number;
  confidenceComponents: {
    trendAlignment: number;
    momentum: number;
    volatility: number;
    structure: number;
    riskReward: number;
  };
  whyReasons: string[];
  whyNotReasons: string[];
  state: SignalState;
  createdAt: number;
  expiresAt: number;
}

export class MarketRegimeClassifier {
  public static classifyRegime(candles: MarketCandle[], atr: number, adx: number): MarketRegime {
    if (!candles || candles.length < 20 || !Number.isFinite(atr) || !Number.isFinite(adx)) {
      return 'UNCERTAIN';
    }

    if (adx >= 25) {
      return atr > 0.0020 ? 'HIGH_VOLATILITY' : 'TRENDING';
    } else if (adx < 20) {
      return atr < 0.0008 ? 'LOW_VOLATILITY' : 'RANGING';
    }

    return 'RANGING';
  }
}

export class StrategyEngineService {
  public static evaluateSignal(
    symbol: string,
    currentPrice: number,
    candles: MarketCandle[],
    features: TechnicalFeatures,
    strategy: StrategyDefinition,
    equity = 1000.0,
    currentTime = Date.now()
  ): CanonicalSignal {
    const signalId = 'SIG-' + symbol.replace('/', '') + '-' + currentTime;

    // 1. Data Quality Check
    if (features.isStale || features.spreadPips > 3.0 || currentPrice <= 0) {
      return {
        signalId,
        symbol,
        direction: 'NO_TRADE',
        strategyId: strategy.strategyId,
        strategyVersion: strategy.version,
        regime: 'UNCERTAIN',
        entryPrice: currentPrice,
        slPrice: 0,
        tpPrice: 0,
        slPips: 0,
        tpPips: 0,
        riskPercent: 0,
        riskDollars: 0,
        lotSize: 0,
        confidence: 0,
        confidenceComponents: { trendAlignment: 0, momentum: 0, volatility: 0, structure: 0, riskReward: 0 },
        whyReasons: [],
        whyNotReasons: ['Data quality check failed (stale data or spread too high: ' + features.spreadPips + ' pips)'],
        state: 'REJECTED',
        createdAt: currentTime,
        expiresAt: currentTime + 900000
      };
    }

    // 2. Regime Classification
    const regime = MarketRegimeClassifier.classifyRegime(candles, features.atr, features.adx);

    // 3. Technical Direction Logic
    let direction: SignalDirection = 'NO_TRADE';
    const whyReasons: string[] = [];
    const whyNotReasons: string[] = [];

    if (features.emaFast > features.emaSlow && features.rsi >= 50 && features.rsi <= 68) {
      direction = 'BUY';
      whyReasons.push('Fast EMA > Slow EMA (Bullish Momentum)');
      whyReasons.push('RSI in optimal bullish momentum band (' + features.rsi.toFixed(1) + ')');
      whyReasons.push('Market regime is ' + regime);
    } else if (features.emaFast < features.emaSlow && features.rsi <= 50 && features.rsi >= 32) {
      direction = 'SELL';
      whyReasons.push('Fast EMA < Slow EMA (Bearish Momentum)');
      whyReasons.push('RSI in optimal bearish momentum band (' + features.rsi.toFixed(1) + ')');
      whyReasons.push('Market regime is ' + regime);
    } else {
      whyNotReasons.push('No clear trend alignment between EMAs and RSI bands');
    }

    if (direction === 'NO_TRADE') {
      return {
        signalId,
        symbol,
        direction: 'NO_TRADE',
        strategyId: strategy.strategyId,
        strategyVersion: strategy.version,
        regime,
        entryPrice: currentPrice,
        slPrice: 0,
        tpPrice: 0,
        slPips: 0,
        tpPips: 0,
        riskPercent: 0,
        riskDollars: 0,
        lotSize: 0,
        confidence: 0,
        confidenceComponents: { trendAlignment: 0.3, momentum: 0.4, volatility: 0.5, structure: 0.4, riskReward: 0.5 },
        whyReasons: [],
        whyNotReasons,
        state: 'VALIDATED',
        createdAt: currentTime,
        expiresAt: currentTime + 900000
      };
    }

    // 4. Protective Price Model (20 pip SL / 40 pip TP)
    const slPips = 20.0;
    const tpPips = 40.0;
    const pipOffset = 0.00010;
    const slPrice = Number((direction === 'BUY' ? currentPrice - slPips * pipOffset : currentPrice + slPips * pipOffset).toFixed(5));
    const tpPrice = Number((direction === 'BUY' ? currentPrice + tpPips * pipOffset : currentPrice - tpPips * pipOffset).toFixed(5));

    const lotSize = 0.02;
    const riskDollars = Number(((slPips * (lotSize / 0.01) * 0.10)).toFixed(2));
    const riskPercent = Number(((riskDollars / equity) * 100).toFixed(2));

    // 5. Confidence Score
    const components = {
      trendAlignment: 0.90,
      momentum: 0.85,
      volatility: 0.80,
      structure: 0.85,
      riskReward: 0.90
    };
    const confidence = Math.round(
      (components.trendAlignment * 0.25 +
        components.momentum * 0.25 +
        components.volatility * 0.15 +
        components.structure * 0.15 +
        components.riskReward * 0.20) * 100
    );

    return {
      signalId,
      symbol,
      direction,
      strategyId: strategy.strategyId,
      strategyVersion: strategy.version,
      regime,
      entryPrice: currentPrice,
      slPrice,
      tpPrice,
      slPips,
      tpPips,
      riskPercent,
      riskDollars,
      lotSize,
      confidence,
      confidenceComponents: components,
      whyReasons,
      whyNotReasons,
      state: 'USER_REVIEW',
      createdAt: currentTime,
      expiresAt: currentTime + 900000 // 15 mins validity
    };
  }

  public static approveSignal(signal: CanonicalSignal): {
    approved: boolean;
    state: SignalState;
    executionState: 'BLOCKED_BY_SAFETY_GATE';
  } {
    signal.state = 'APPROVED';
    return {
      approved: true,
      state: 'APPROVED',
      executionState: 'BLOCKED_BY_SAFETY_GATE'
    };
  }
}
