import { MarketState, AgentVote, TradeProposal, MarketDirection } from '@iati/core-types';
import { normalizeSymbol } from '@iati/core';
import { TrendAgent } from './agents/trendAgent';
import { MarketStructureAgent } from './agents/structureAgent';
import { LiquidityAgent } from './agents/liquidityAgent';
import { MomentumAgent } from './agents/momentumAgent';
import { ForecastAgent } from './agents/forecastAgent';

export class ChiefDecisionAgent {
  private agents = [
    new TrendAgent(),
    new MarketStructureAgent(),
    new LiquidityAgent(),
    new MomentumAgent(),
    new ForecastAgent()
  ];

  // Agent weights based on institutional reliability
  private agentWeights: Record<string, number> = {
    'agent-trend': 0.25,
    'agent-structure': 0.25,
    'agent-momentum': 0.20,
    'agent-liquidity': 0.15,
    'agent-forecast': 0.15
  };

  async evaluateMarketState(state: MarketState): Promise<TradeProposal> {
    if (!state || typeof state !== 'object' || !state.symbol) {
      throw new Error('INVALID_MARKET_STATE: MarketState object is missing or malformed');
    }

    const canonicalSymbol = normalizeSymbol(state.symbol);

    // Collect votes with individual fault tolerance and timeout guard
    const votes: AgentVote[] = await Promise.all(
      this.agents.map(async (agent) => {
        try {
          // Timeout guard per agent (2000ms)
          const timeoutPromise = new Promise<AgentVote>((_, reject) =>
            setTimeout(() => reject(new Error(`Agent ${agent.name} timed out`)), 2000)
          );
          return await Promise.race([agent.analyze(state), timeoutPromise]);
        } catch (err: any) {
          // Fallback vote on agent failure or timeout
          return {
            agent_id: agent.id,
            agent_name: agent.name,
            direction: 'NEUTRAL' as MarketDirection,
            confidence: 0,
            evidence: [`Agent error/timeout: ${err?.message || 'Unavailable'}`],
            reasoning: `Agent failed or timed out during evaluation: ${err?.message}`,
            timestamp: new Date()
          };
        }
      })
    );

    let buyWeight = 0;
    let sellWeight = 0;
    let neutralWeight = 0;

    const agreedAgents: string[] = [];
    const allEvidence: string[] = [];

    for (const vote of votes) {
      // Validate vote parameters
      const validDirection = (['BUY', 'SELL', 'NEUTRAL'].includes(vote.direction) ? vote.direction : 'NEUTRAL') as MarketDirection;
      const validConfidence = Math.max(0, Math.min(1, isNaN(vote.confidence) ? 0 : vote.confidence));

      const weight = (this.agentWeights[vote.agent_id] || 0.2) * validConfidence;
      if (validDirection === 'BUY') {
        buyWeight += weight;
      } else if (validDirection === 'SELL') {
        sellWeight += weight;
      } else {
        neutralWeight += weight;
      }

      vote.evidence.forEach(e => allEvidence.push(`[${vote.agent_name}] ${e}`));
    }

    const totalWeight = buyWeight + sellWeight + neutralWeight || 1;
    const buyScore = buyWeight / totalWeight;
    const sellScore = sellWeight / totalWeight;
    const neutralScore = neutralWeight / totalWeight;

    let winningDirection: MarketDirection = 'NEUTRAL';
    let rawConfidence = neutralScore;

    if (buyScore > 0.45 && buyScore > sellScore) {
      winningDirection = 'BUY';
      rawConfidence = buyScore;
    } else if (sellScore > 0.45 && sellScore > buyScore) {
      winningDirection = 'SELL';
      rawConfidence = sellScore;
    } else {
      winningDirection = 'NEUTRAL';
      rawConfidence = neutralScore;
    }

    // Ensure confidence bounds [0, 1]
    const finalConfidence = Math.max(0, Math.min(1, isNaN(rawConfidence) ? 0 : rawConfidence));

    votes.forEach(v => {
      if (v.direction === winningDirection && v.confidence > 0) {
        agreedAgents.push(v.agent_name);
      }
    });

    // Determine Invalidation conditions for Explainability
    const invalidate_conditions: string[] = [];
    const supportList = state.structure?.supportZones ? state.structure.supportZones.join(', ') : 'None';
    const resistanceList = state.structure?.resistanceZones ? state.structure.resistanceZones.join(', ') : 'None';

    if (winningDirection === 'BUY') {
      invalidate_conditions.push(`Breakdown below key support zone: ${supportList}`);
      invalidate_conditions.push('Regime shift to HIGH_VOLATILITY with RSI dropping below 40');
      invalidate_conditions.push('Spread expansion > 0.0010 (Illiquid environment)');
    } else if (winningDirection === 'SELL') {
      invalidate_conditions.push(`Breakout above key resistance zone: ${resistanceList}`);
      invalidate_conditions.push('Regime shift to TRENDING Bullish with RSI rising above 60');
      invalidate_conditions.push('Spread expansion > 0.0010 (Illiquid environment)');
    } else {
      invalidate_conditions.push('Decisive candle close outside consolidation box');
      invalidate_conditions.push('Clear directional alignment across Trend and Structure agents');
    }

    const why_direction = winningDirection === 'NEUTRAL'
      ? `Consensus weighted score favored NEUTRAL (${(neutralScore * 100).toFixed(0)}%). Agents disagreed or market conditions lacked sufficient edge.`
      : `Consensus weighted score favored ${winningDirection} with ${(finalConfidence * 100).toFixed(0)}% confidence across ${agreedAgents.length} agreeing agents (${agreedAgents.join(', ')}).`;

    const proposal: TradeProposal = {
      id: `prop-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      symbol: canonicalSymbol,
      direction: winningDirection,
      confidence: Number(finalConfidence.toFixed(2)),
      evidence: Array.from(new Set(allEvidence)),
      agent_votes: votes,
      why_direction,
      invalidate_conditions,
      timestamp: new Date()
    };

    return proposal;
  }
}
