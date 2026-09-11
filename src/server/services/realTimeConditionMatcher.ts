import { CandleData, CurrencyPair } from '../../types';

export interface MarketConditions {
  pair: CurrencyPair;
  timestamp: Date;
  currentPrice: number;
  
  // Volatility Analysis
  volatilityState: 'EXPANDING' | 'CONTRACTING' | 'NEUTRAL';
  volatilityPercentage: number;
  atr: number; // Average True Range
  
  // Trend Analysis
  trend: 'BULLISH' | 'BEARISH' | 'RANGING';
  trendStrength: number; // 0-100
  
  // Momentum
  momentum: 'STRONG' | 'WEAK' | 'NEUTRAL';
  rsi: number;
  
  // Price Position
  priceVsMA20: number; // % above/below 20-period MA
  priceVsMA50: number; // % above/below 50-period MA
  
  // Session
  session: 'LONDON' | 'NY' | 'OVERLAP' | 'ASIAN';
  
  // Summary
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

export type PatternSampleStatus = 'NO_DATA' | 'INSUFFICIENT_SAMPLE' | 'HIGH_FAILURE_PATTERN' | 'LOW_FAILURE_PATTERN';

export interface HistoricalFailurePattern {
  setupType: string; // 'MOMENTUM_CONTINUATION SELL'
  pair: CurrencyPair;
  failedWhen: string; // 'daily volatility expansion'
  failureRate: number; // 0-100
  failureCount: number;
  totalSamples: number;
  averageLoss: number;
  averageSL: number;
  status: PatternSampleStatus;
}

export interface VetoDecision {
  shouldVeto: boolean;
  reason: string;
  confidence: number; // 0-100
  conditions: MarketConditions;
  historicalPattern: HistoricalFailurePattern | null;
  explanation: string; // Detailed explanation for logging
}

/**
 * Real-Time Condition Matcher
 * Analyzes current market conditions and compares to historical failure patterns
 * Makes intelligent veto decisions based on whether conditions match past failures
 */
export class RealTimeConditionMatcher {
  private static instance: RealTimeConditionMatcher;

  private constructor() {}

  public static getInstance(): RealTimeConditionMatcher {
    if (!RealTimeConditionMatcher.instance) {
      RealTimeConditionMatcher.instance = new RealTimeConditionMatcher();
    }
    return RealTimeConditionMatcher.instance;
  }

  /**
   * Analyze current market conditions from live candles
   */
  analyzeMarketConditions(
    pair: CurrencyPair,
    candles: CandleData[],
    currentPrice: number
  ): MarketConditions {
    if (!candles || candles.length < 50) {
      return this.getDefaultConditions(pair, currentPrice);
    }

    const last20 = candles.slice(-20);
    const last50 = candles.slice(-50);

    // ✅ Calculate volatility
    const volatilityData = this.calculateVolatility(last20);
    const volatilityState = this.classifyVolatility(volatilityData.percentage);

    // ✅ Detect trend
    const trendData = this.detectTrend(last50);

    // ✅ Calculate momentum (RSI)
    const rsi = this.calculateRSI(candles);

    // ✅ Price vs Moving Averages
    const ma20 = this.calculateMA(last20, 20);
    const ma50 = this.calculateMA(last50, 50);
    const priceVsMA20 = ((currentPrice - ma20) / ma20) * 100;
    const priceVsMA50 = ((currentPrice - ma50) / ma50) * 100;

    // ✅ Detect session
    const session = this.detectSession();

    // ✅ Determine risk level
    const riskLevel = this.assessRiskLevel(volatilityState, trendData.strength, rsi);

    return {
      pair,
      timestamp: new Date(),
      currentPrice,
      volatilityState,
      volatilityPercentage: volatilityData.percentage,
      atr: volatilityData.atr,
      trend: trendData.trend,
      trendStrength: trendData.strength,
      momentum: rsi > 60 ? 'STRONG' : rsi < 40 ? 'WEAK' : 'NEUTRAL',
      rsi,
      priceVsMA20,
      priceVsMA50,
      session,
      riskLevel
    };
  }

  /**
   * Make veto decision based on current conditions vs historical pattern
   */
  evaluateVeto(
    setupType: string,
    currentConditions: MarketConditions,
    historicalPattern: HistoricalFailurePattern | null
  ): VetoDecision {
    // If no historical failure pattern, allow trade
    if (!historicalPattern || historicalPattern.failureRate < 60) {
      return {
        shouldVeto: false,
        reason: 'No significant historical failure pattern',
        confidence: 0,
        conditions: currentConditions,
        historicalPattern,
        explanation: 'Historical data does not indicate high failure rate for this setup'
      };
    }

    // ✅ Parse historical failure condition
    const failedUnder = this.parseFailureCondition(historicalPattern.failedWhen);

    // ✅ Check if CURRENT conditions match HISTORICAL failure conditions
    const conditionMatch = this.matchConditions(currentConditions, failedUnder);

    // ✅ SMART VETO LOGIC
    if (!conditionMatch.matches) {
      // Conditions are DIFFERENT from when it failed historically
      // ✅ ALLOW THE TRADE
      return {
        shouldVeto: false,
        reason: `Current conditions differ from historical failure pattern (${conditionMatch.reason})`,
        confidence: conditionMatch.divergence, // 0-100 how different
        conditions: currentConditions,
        historicalPattern,
        explanation: `Historical failures occurred during "${historicalPattern.failedWhen}" but current market shows different conditions: ${conditionMatch.reason}. Trade allowed due to condition divergence.`
      };
    }

    // Conditions MATCH historical failure pattern
    // ❌ VETO THE TRADE
    return {
      shouldVeto: true,
      reason: `Current conditions match historical failure pattern: ${historicalPattern.failedWhen}`,
      confidence: conditionMatch.similarity,
      conditions: currentConditions,
      historicalPattern,
      explanation: `${setupType} failed historically during "${historicalPattern.failedWhen}" (${historicalPattern.failureCount} losses). Current market conditions match that dangerous pattern: ${conditionMatch.reason}. Trade vetoed for safety.`
    };
  }

  /**
   * Parse human-readable failure condition
   */
  private parseFailureCondition(failedWhen: string): {
    volatility?: string;
    trend?: string;
    momentum?: string;
  } {
    const parsed: any = {};

    if (failedWhen.includes('volatility expansion')) {
      parsed.volatility = 'EXPANDING';
    } else if (failedWhen.includes('volatility contraction')) {
      parsed.volatility = 'CONTRACTING';
    }

    if (failedWhen.includes('bearish')) {
      parsed.trend = 'BEARISH';
    } else if (failedWhen.includes('bullish')) {
      parsed.trend = 'BULLISH';
    }

    if (failedWhen.includes('low liquidity') || failedWhen.includes('news')) {
      parsed.momentum = 'VOLATILE';
    }

    return parsed;
  }

  /**
   * Match current conditions against historical failure conditions
   */
  private matchConditions(current: MarketConditions, historical: any): {
    matches: boolean;
    similarity: number; // 0-100
    divergence: number; // 0-100 how different
    reason: string;
  } {
    const reasons: string[] = [];
    let matchScore = 0;
    let maxScore = 0;

    // Check volatility match
    if (historical.volatility) {
      maxScore += 40;
      if (current.volatilityState === historical.volatility) {
        matchScore += 40;
        reasons.push(`Volatility ${current.volatilityState}`);
      } else {
        reasons.push(`Volatility is ${current.volatilityState}, not ${historical.volatility}`);
      }
    }

    // Check trend match
    if (historical.trend) {
      maxScore += 40;
      if (current.trend === historical.trend) {
        matchScore += 40;
        reasons.push(`Trend is ${current.trend}`);
      } else {
        reasons.push(`Trend is ${current.trend}, not ${historical.trend}`);
      }
    }

    // Check momentum match
    if (historical.momentum) {
      maxScore += 20;
      if (current.momentum === 'STRONG') {
        reasons.push(`Momentum is ${current.momentum}`);
      }
    }

    const similarity = maxScore > 0 ? (matchScore / maxScore) * 100 : 0;
    const divergence = 100 - similarity;

    return {
      matches: similarity >= 70, // 70%+ match = conditions match
      similarity: Math.round(similarity),
      divergence: Math.round(divergence),
      reason: reasons.join(' | ')
    };
  }

  /**
   * Calculate volatility from candles
   */
  private calculateVolatility(candles: CandleData[]): { percentage: number; atr: number } {
    if (candles.length < 2) return { percentage: 0, atr: 0 };

    const ranges = candles.map(c => c.high - c.low);
    const atr = ranges.reduce((a, b) => a + b) / ranges.length;

    const closes = candles.map(c => c.close);
    const avgClose = closes.reduce((a, b) => a + b) / closes.length;
    const volatilityPercent = (atr / avgClose) * 100;

    return { percentage: volatilityPercent, atr };
  }

  /**
   * Classify volatility state
   */
  private classifyVolatility(volatilityPercent: number): 'EXPANDING' | 'CONTRACTING' | 'NEUTRAL' {
    if (volatilityPercent > 1.5) return 'EXPANDING';
    if (volatilityPercent < 0.5) return 'CONTRACTING';
    return 'NEUTRAL';
  }

  /**
   * Detect current trend
   */
  private detectTrend(candles: CandleData[]): { trend: 'BULLISH' | 'BEARISH' | 'RANGING'; strength: number } {
    if (candles.length < 10) {
      return { trend: 'RANGING', strength: 0 };
    }

    const first = candles[0].close;
    const last = candles[candles.length - 1].close;
    const change = ((last - first) / first) * 100;

    if (change > 0.5) {
      return { trend: 'BULLISH', strength: Math.min(change * 10, 100) };
    } else if (change < -0.5) {
      return { trend: 'BEARISH', strength: Math.min(Math.abs(change) * 10, 100) };
    }

    return { trend: 'RANGING', strength: 0 };
  }

  /**
   * Calculate RSI
   */
  private calculateRSI(candles: CandleData[], period: number = 14): number {
    if (candles.length < period) return 50;

    const closes = candles.map(c => c.close);
    let gains = 0, losses = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  /**
   * Calculate simple moving average
   */
  private calculateMA(candles: CandleData[], period: number): number {
    const closes = candles.slice(-period).map(c => c.close);
    return closes.reduce((a, b) => a + b) / closes.length;
  }

  /**
   * Detect current trading session
   */
  private detectSession(): 'LONDON' | 'NY' | 'OVERLAP' | 'ASIAN' {
    const utcHour = new Date().getUTCHours();
    if (utcHour >= 8 && utcHour < 12) return 'LONDON';
    if (utcHour >= 12 && utcHour < 16) return 'OVERLAP';
    if (utcHour >= 16 && utcHour < 21) return 'NY';
    return 'ASIAN';
  }

  /**
   * Assess overall risk level
   */
  private assessRiskLevel(
    volatility: string,
    trendStrength: number,
    rsi: number
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' {
    if (volatility === 'EXPANDING' && trendStrength > 80) return 'EXTREME';
    if (volatility === 'EXPANDING') return 'HIGH';
    if (volatility === 'CONTRACTING' && trendStrength < 20) return 'LOW';
    if (volatility === 'CONTRACTING') return 'MEDIUM';
    return 'MEDIUM';
  }

  /**
   * Get default conditions when insufficient data
   */
  private getDefaultConditions(pair: CurrencyPair, currentPrice: number): MarketConditions {
    return {
      pair,
      timestamp: new Date(),
      currentPrice,
      volatilityState: 'NEUTRAL',
      volatilityPercentage: 0,
      atr: 0,
      trend: 'RANGING',
      trendStrength: 0,
      momentum: 'NEUTRAL',
      rsi: 50,
      priceVsMA20: 0,
      priceVsMA50: 0,
      session: this.detectSession(),
      riskLevel: 'MEDIUM'
    };
  }
}

export const realTimeConditionMatcher = RealTimeConditionMatcher.getInstance();
