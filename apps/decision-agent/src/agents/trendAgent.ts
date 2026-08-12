import { TradingAgent, AgentVote, MarketState, MarketDirection } from '@iati/core-types';

export class TrendAgent implements TradingAgent {
  id = 'agent-trend';
  name = 'Trend Analysis Agent';

  async analyze(state: MarketState): Promise<AgentVote> {
    const { trend } = state;
    let direction: MarketDirection = 'NEUTRAL';
    let confidence = 0.5;
    const evidence: string[] = [];

    if (trend.direction === 'BULLISH') {
      direction = 'BUY';
      confidence = Math.min(0.95, 0.6 + trend.strength * 0.35);
      evidence.push(`SMA20 (${trend.sma20}) is above SMA50 (${trend.sma50}) in bullish configuration`);
      evidence.push(`Trend strength measured at ${(trend.strength * 100).toFixed(0)}%`);
    } else if (trend.direction === 'BEARISH') {
      direction = 'SELL';
      confidence = Math.min(0.95, 0.6 + trend.strength * 0.35);
      evidence.push(`SMA20 (${trend.sma20}) is below SMA50 (${trend.sma50}) in bearish configuration`);
      evidence.push(`Trend strength measured at ${(trend.strength * 100).toFixed(0)}%`);
    } else {
      direction = 'NEUTRAL';
      confidence = 0.5;
      evidence.push('Moving averages are converging horizontally in a neutral band');
    }

    return {
      agent_id: this.id,
      agent_name: this.name,
      direction,
      confidence: Number(confidence.toFixed(2)),
      evidence,
      reasoning: `Trend Agent classified market direction as ${direction} with confidence ${confidence.toFixed(2)} based on MA alignment and trend strength.`,
      timestamp: new Date()
    };
  }
}
