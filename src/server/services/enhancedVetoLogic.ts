import { TradingRepository } from '@iati/database';
import { realTimeConditionMatcher, VetoDecision, MarketConditions, HistoricalFailurePattern } from './realTimeConditionMatcher';
import { CandleData, CurrencyPair } from '../../types';
import { PostMortemReview } from '../../types';

export type PatternSampleStatus = 'NO_DATA' | 'INSUFFICIENT_SAMPLE' | 'HIGH_FAILURE_PATTERN' | 'LOW_FAILURE_PATTERN';

export interface HistoricalContextStats {
  totalSamples: number;
  wins: number;
  losses: number;
  failureRate: number;
  averageLossSize: number;
  status: PatternSampleStatus;
}

export interface VetoAnalysis {
  setupType: string;
  pair: CurrencyPair;
  currentPrice: number;
  decision: VetoDecision;
  historicalContext: HistoricalContextStats;
  recommendation: 'ALLOW' | 'VETO' | 'CAUTION';
  timestamp: Date;
}

/**
 * Enhanced Veto Logic Service
 * Integrates real-time conditions with historical learning
 * Makes intelligent veto decisions instead of blanket rejections
 */
export class EnhancedVetoLogic {
  private static instance: EnhancedVetoLogic;
  private tradingRepo: TradingRepository;
  public static readonly MIN_SAMPLE_THRESHOLD = 3;

  constructor(tradingRepo?: TradingRepository) {
    this.tradingRepo = tradingRepo || new TradingRepository();
  }

  public static getInstance(tradingRepo?: TradingRepository): EnhancedVetoLogic {
    if (!EnhancedVetoLogic.instance) {
      EnhancedVetoLogic.instance = new EnhancedVetoLogic(tradingRepo);
    }
    return EnhancedVetoLogic.instance;
  }

  /**
   * Smart veto decision: Compare current conditions to historical failures
   * Returns: ALLOW if conditions differ from failures, VETO if they match
   */
  async evaluateTradeWithContext(
    setupType: string,
    pair: CurrencyPair,
    currentPrice: number,
    candles: CandleData[],
    accountId: string
  ): Promise<VetoAnalysis> {
    // ✅ STEP 1: Analyze current market conditions (REAL-TIME)
    const currentConditions = realTimeConditionMatcher.analyzeMarketConditions(
      pair,
      candles,
      currentPrice
    );

    // ✅ STEP 2: Get historical failure patterns for this setup
    const historicalPattern = await this.getHistoricalFailurePattern(
      setupType,
      pair,
      accountId
    );

    // ✅ STEP 3: Get historical context (recent losses and sample count)
    const historicalContext = await this.getHistoricalContext(pair, setupType, accountId);

    // ✅ STEP 4: Make intelligent veto decision
    const decision = realTimeConditionMatcher.evaluateVeto(
      setupType,
      currentConditions,
      historicalPattern
    );

    // ✅ STEP 5: Determine recommendation
    const recommendation = this.determineRecommendation(
      decision,
      historicalContext,
      currentConditions
    );

    const analysis: VetoAnalysis = {
      setupType,
      pair,
      currentPrice,
      decision,
      historicalContext,
      recommendation,
      timestamp: new Date()
    };

    // Log the analysis
    this.logVetoAnalysis(analysis);

    return analysis;
  }

  /**
   * Get historical failure pattern for a specific setup
   */
  private async getHistoricalFailurePattern(
    setupType: string,
    pair: CurrencyPair,
    accountId: string
  ): Promise<HistoricalFailurePattern | null> {
    try {
      // Get closed trades for this pair
      const trades = accountId && accountId !== 'DEFAULT'
        ? await this.tradingRepo.getClosedPositions(accountId, 250)
        : await this.tradingRepo.getClosedPositionsAcrossAccounts(250);

      // Filter to this pair and similar setup type
      const relevantTrades = trades.filter(t =>
        t.symbol === pair &&
        t.proposalId?.includes(setupType.split(' ')[0])
      );

      if (relevantTrades.length < EnhancedVetoLogic.MIN_SAMPLE_THRESHOLD) {
        return null; // Not enough data - never claim 0% failure as certainty
      }

      // Calculate loss rate
      const losses = relevantTrades.filter(t => (Number(t.realizedProfit) || 0) < 0);
      const failureRate = (losses.length / relevantTrades.length) * 100;

      if (failureRate < 60) {
        return null; // Not a high-failure pattern
      }

      // Analyze conditions when failures occurred
      const failedWhen = this.analyzeFailureConditions(losses);

      const averageLoss = losses.length > 0
        ? losses.reduce((sum, t) => sum + Math.abs(Number(t.realizedProfit) || 0), 0) / losses.length
        : 0;

      return {
        setupType,
        pair,
        failedWhen,
        failureRate,
        failureCount: losses.length,
        totalSamples: relevantTrades.length,
        averageLoss,
        averageSL: 30, // Standard SL in pips
        status: 'HIGH_FAILURE_PATTERN'
      };
    } catch (err: any) {
      console.error(`[VETO LOGIC] Failed to get historical pattern: ${err.message}`);
      return null;
    }
  }

  /**
   * Analyze conditions when trades failed
   */
  private analyzeFailureConditions(losses: any[]): string {
    const reasons: string[] = [];

    if (losses.length >= 3) {
      reasons.push('daily volatility expansion');
    }

    return reasons.length > 0 ? reasons.join(' during ') : 'market volatility';
  }

  /**
   * Get historical context for decision-making
   */
  private async getHistoricalContext(
    pair: CurrencyPair,
    setupType: string,
    accountId: string
  ): Promise<HistoricalContextStats> {
    try {
      const trades = accountId && accountId !== 'DEFAULT'
        ? await this.tradingRepo.getClosedPositions(accountId, 250)
        : await this.tradingRepo.getClosedPositionsAcrossAccounts(250);

      const pairTrades = trades.filter(t => t.symbol === pair);
      const totalSamples = pairTrades.length;
      const losses = pairTrades.filter(t => (Number(t.realizedProfit) || 0) < 0);
      const wins = totalSamples - losses.length;

      const failureRate = totalSamples > 0
        ? (losses.length / totalSamples) * 100
        : 0;

      const averageLossSize = losses.length > 0
        ? losses.reduce((sum, t) => sum + Math.abs(Number(t.realizedProfit) || 0), 0) / losses.length
        : 0;

      let status: PatternSampleStatus = 'NO_DATA';
      if (totalSamples === 0) {
        status = 'NO_DATA';
      } else if (totalSamples < EnhancedVetoLogic.MIN_SAMPLE_THRESHOLD) {
        status = 'INSUFFICIENT_SAMPLE';
      } else if (failureRate >= 60) {
        status = 'HIGH_FAILURE_PATTERN';
      } else {
        status = 'LOW_FAILURE_PATTERN';
      }

      return {
        totalSamples,
        wins,
        losses: losses.length,
        failureRate,
        averageLossSize,
        status
      };
    } catch (err: any) {
      return {
        totalSamples: 0,
        wins: 0,
        losses: 0,
        failureRate: 0,
        averageLossSize: 0,
        status: 'NO_DATA'
      };
    }
  }

  /**
   * Determine final recommendation based on all factors
   */
  private determineRecommendation(
    decision: VetoDecision,
    context: HistoricalContextStats,
    conditions: MarketConditions
  ): 'ALLOW' | 'VETO' | 'CAUTION' {
    // If sample size is insufficient, never hard veto on historical pattern alone
    if (context.status === 'NO_DATA' || context.status === 'INSUFFICIENT_SAMPLE') {
      if (conditions.riskLevel === 'EXTREME') {
        return 'CAUTION';
      }
      return 'ALLOW';
    }

    if (decision.shouldVeto && decision.confidence > 80 && context.totalSamples >= EnhancedVetoLogic.MIN_SAMPLE_THRESHOLD) {
      // High confidence match to verified dangerous historical pattern
      return 'VETO';
    }

    if (decision.shouldVeto && decision.confidence <= 80) {
      // Lower confidence match - warn but allow
      return 'CAUTION';
    }

    // Conditions don't match historical failures
    if (!decision.shouldVeto && conditions.riskLevel === 'EXTREME') {
      return 'CAUTION';
    }

    // Conditions diverge significantly from failure pattern
    if (!decision.shouldVeto && decision.confidence > 70) {
      return 'ALLOW';
    }

    // Default: allow if no strong reason to veto
    return 'ALLOW';
  }

  /**
   * Log veto analysis for audit trail
   */
  private logVetoAnalysis(analysis: VetoAnalysis) {
    const status = analysis.recommendation === 'ALLOW' ? '✅ ALLOW' : analysis.recommendation === 'VETO' ? '❌ VETO' : '⚠️ CAUTION';

    console.log(`
[ENHANCED VETO LOGIC]
  Setup: ${analysis.setupType}
  Pair: ${analysis.pair}
  Price: ${analysis.currentPrice}
  
  Current Conditions:
    - Volatility: ${analysis.decision.conditions.volatilityState} (${analysis.decision.conditions.volatilityPercentage.toFixed(2)}%)
    - Trend: ${analysis.decision.conditions.trend} (strength: ${analysis.decision.conditions.trendStrength}%)
    - Momentum: ${analysis.decision.conditions.momentum} (RSI: ${analysis.decision.conditions.rsi.toFixed(1)})
    - Risk Level: ${analysis.decision.conditions.riskLevel}
  
  Historical Pattern:
    - Samples: ${analysis.historicalContext.totalSamples} (Wins: ${analysis.historicalContext.wins}, Losses: ${analysis.historicalContext.losses})
    - Failure Rate: ${analysis.historicalContext.failureRate.toFixed(1)}%
    - Status: ${analysis.historicalContext.status}
    - Avg Loss Size: $${analysis.historicalContext.averageLossSize.toFixed(2)}
  
  Decision: ${status}
  Confidence: ${analysis.decision.confidence}%
  Reason: ${analysis.decision.explanation}
    `);
  }

  /**
   * Export veto decision to database for learning
   */
  async recordVetoDecision(analysis: VetoAnalysis, decisionId: string) {
    try {
      await this.tradingRepo.saveTradeEvent({
        id: decisionId,
        tradeId: '',
        setupId: analysis.setupType,
        eventType: 'SIGNAL_VETO_DECISION',
        actor: 'EnhancedVetoLogic',
        details: {
          pair: analysis.pair,
          recommendation: analysis.recommendation,
          decision: analysis.decision.shouldVeto,
          confidence: analysis.decision.confidence,
          explanation: analysis.decision.explanation,
          conditions: {
            volatility: analysis.decision.conditions.volatilityState,
            trend: analysis.decision.conditions.trend,
            riskLevel: analysis.decision.conditions.riskLevel
          },
          timestamp: analysis.timestamp.toISOString()
        }
      });
    } catch (err: any) {
      console.error(`[VETO LOGIC] Failed to record decision: ${err.message}`);
    }
  }
}

export const enhancedVetoLogic = EnhancedVetoLogic.getInstance();
