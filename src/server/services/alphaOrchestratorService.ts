
export type StrategyLifecycleState =
  | 'DRAFT'
  | 'RESEARCH'
  | 'BACKTESTED'
  | 'OUT_OF_SAMPLE_VALIDATED'
  | 'SHADOW_VALIDATED'
  | 'CANDIDATE'
  | 'APPROVED_FOR_CONTROLLED_DEMO'
  | 'ACTIVE_IN_SHADOW'
  | 'SUSPENDED'
  | 'RETIRED';

export type StrategyHealthState = 'HEALTHY' | 'WATCH' | 'DEGRADED' | 'SUSPENDED' | 'RETIRED';
export type TimeframeAlignment = 'STRONG_ALIGNMENT' | 'PARTIAL_ALIGNMENT' | 'CONFLICT' | 'INSUFFICIENT_DATA';

export interface TimeframeSignal {
  timeframe: 'M5' | 'M15' | 'H1' | 'H4';
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  momentum: number; // 0-100
  structure: 'HIGHER_HIGH' | 'LOWER_LOW' | 'CONSOLIDATION';
}

export interface GovernedStrategy {
  strategyId: string;
  strategyVersion: string;
  name: string;
  lifecycleState: StrategyLifecycleState;
  healthState: StrategyHealthState;
  supportedSymbols: string[];
  supportedTimeframes: string[];
  supportedRegimes: string[];
  expectancyPips: number;
  winRatePercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
}

export interface OrchestratedCandidate {
  strategyId: string;
  strategyVersion: string;
  symbol: string;
  direction: 'BUY' | 'SELL' | 'NO_TRADE';
  timeframeAlignment: TimeframeAlignment;
  overallConfidenceScore: number;
  rankingScore: number;
  whyReasons: string[];
  whyNotReasons: string[];
}

export class AlphaOrchestratorService {
  private static validLifecycleTransitions: Record<StrategyLifecycleState, StrategyLifecycleState[]> = {
    DRAFT: ['RESEARCH', 'RETIRED'],
    RESEARCH: ['BACKTESTED', 'RETIRED'],
    BACKTESTED: ['OUT_OF_SAMPLE_VALIDATED', 'RESEARCH', 'RETIRED'],
    OUT_OF_SAMPLE_VALIDATED: ['SHADOW_VALIDATED', 'RESEARCH', 'RETIRED'],
    SHADOW_VALIDATED: ['CANDIDATE', 'SUSPENDED', 'RETIRED'],
    CANDIDATE: ['APPROVED_FOR_CONTROLLED_DEMO', 'SUSPENDED', 'RETIRED'],
    APPROVED_FOR_CONTROLLED_DEMO: ['ACTIVE_IN_SHADOW', 'SUSPENDED', 'RETIRED'],
    ACTIVE_IN_SHADOW: ['SUSPENDED', 'RETIRED'],
    SUSPENDED: ['ACTIVE_IN_SHADOW', 'RETIRED', 'RESEARCH'],
    RETIRED: []
  };

  public static transitionLifecycle(
    strategy: GovernedStrategy,
    targetState: StrategyLifecycleState,
    reason: string
  ): { success: boolean; state: StrategyLifecycleState; reason: string } {
    const allowed = this.validLifecycleTransitions[strategy.lifecycleState] || [];
    if (!allowed.includes(targetState)) {
      return {
        success: false,
        state: strategy.lifecycleState,
        reason: 'INVALID_TRANSITION: ' + strategy.lifecycleState + ' -> ' + targetState
      };
    }
    strategy.lifecycleState = targetState;
    return { success: true, state: targetState, reason };
  }

  public static evaluateTimeframeAlignment(timeframes: TimeframeSignal[]): {
    alignment: TimeframeAlignment;
    dominantDirection: 'BUY' | 'SELL' | 'NO_TRADE';
    alignmentScore: number;
  } {
    if (!timeframes || timeframes.length < 3) {
      return { alignment: 'INSUFFICIENT_DATA', dominantDirection: 'NO_TRADE', alignmentScore: 0 };
    }

    const h4 = timeframes.find((t) => t.timeframe === 'H4');
    const h1 = timeframes.find((t) => t.timeframe === 'H1');
    const m15 = timeframes.find((t) => t.timeframe === 'M15');

    if (!h4 || !h1 || !m15) {
      return { alignment: 'INSUFFICIENT_DATA', dominantDirection: 'NO_TRADE', alignmentScore: 0 };
    }

    // Higher Timeframe Governance: H4 & H1 must agree
    if (h4.trend === h1.trend && h4.trend !== 'NEUTRAL') {
      if (m15.trend === h4.trend) {
        return {
          alignment: 'STRONG_ALIGNMENT',
          dominantDirection: h4.trend === 'BULLISH' ? 'BUY' : 'SELL',
          alignmentScore: 0.95
        };
      }
      return {
        alignment: 'PARTIAL_ALIGNMENT',
        dominantDirection: h4.trend === 'BULLISH' ? 'BUY' : 'SELL',
        alignmentScore: 0.70
      };
    }

    return {
      alignment: 'CONFLICT',
      dominantDirection: 'NO_TRADE',
      alignmentScore: 0.30
    };
  }

  public static evaluateDegradation(strategy: GovernedStrategy): StrategyHealthState {
    if (strategy.maxDrawdownPercent > 5.0 || strategy.profitFactor < 1.0) {
      strategy.healthState = 'DEGRADED';
    } else if (strategy.winRatePercent < 50.0) {
      strategy.healthState = 'WATCH';
    } else {
      strategy.healthState = 'HEALTHY';
    }
    return strategy.healthState;
  }

  public static rankStrategies(
    strategies: GovernedStrategy[],
    timeframeAlignment: TimeframeAlignment,
    symbol: string
  ): OrchestratedCandidate[] {
    const candidates: OrchestratedCandidate[] = [];

    for (const strat of strategies) {
      if (strat.healthState === 'SUSPENDED' || strat.healthState === 'RETIRED') {
        candidates.push({
          strategyId: strat.strategyId,
          strategyVersion: strat.strategyVersion,
          symbol,
          direction: 'NO_TRADE',
          timeframeAlignment,
          overallConfidenceScore: 0,
          rankingScore: 0,
          whyReasons: [],
          whyNotReasons: ['Strategy is ' + strat.healthState]
        });
        continue;
      }

      if (timeframeAlignment === 'CONFLICT' || timeframeAlignment === 'INSUFFICIENT_DATA') {
        candidates.push({
          strategyId: strat.strategyId,
          strategyVersion: strat.strategyVersion,
          symbol,
          direction: 'NO_TRADE',
          timeframeAlignment,
          overallConfidenceScore: 25,
          rankingScore: 10,
          whyReasons: [],
          whyNotReasons: ['Higher timeframes in conflict (' + timeframeAlignment + ')']
        });
        continue;
      }

      const baseConfidence = timeframeAlignment === 'STRONG_ALIGNMENT' ? 88 : 72;
      const rankingScore = strat.profitFactor * 25 + strat.expectancyPips * 2;

      candidates.push({
        strategyId: strat.strategyId,
        strategyVersion: strat.strategyVersion,
        symbol,
        direction: 'BUY',
        timeframeAlignment,
        overallConfidenceScore: baseConfidence,
        rankingScore,
        whyReasons: ['Strong multi-timeframe alignment (H4/H1/M15)', 'Strategy health is ' + strat.healthState],
        whyNotReasons: []
      });
    }

    return candidates.sort((a, b) => b.rankingScore - a.rankingScore);
  }
}
