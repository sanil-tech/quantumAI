import { TradingAgent, AgentVote, MarketState, MarketDirection } from '@iati/core-types';

export class LiquidityAgent implements TradingAgent {
  id = 'agent-liquidity';
  name = 'Liquidity & Microstructure Agent';

  async analyze(state: MarketState): Promise<AgentVote> {
    const { liquidity } = state;
    let direction: MarketDirection = 'NEUTRAL';
    let confidence = 0.5;
    const evidence: string[] = [];

    if (liquidity.condition === 'OPTIMAL') {
      confidence = 0.85;
      evidence.push(`Tight spread (${liquidity.spread}) provides optimal execution environment`);
      if (state.trend.direction === 'BULLISH') direction = 'BUY';
      else if (state.trend.direction === 'BEARISH') direction = 'SELL';
      else direction = 'NEUTRAL';
    } else if (liquidity.condition === 'THIN') {
      confidence = 0.60;
      evidence.push(`Elevated spread (${liquidity.spread}) indicates thin orderbook depth`);
      direction = 'NEUTRAL';
    } else if (liquidity.condition === 'ILLIQUID') {
      confidence = 0.90;
      evidence.push(`Illiquid conditions detected with spread ${liquidity.spread}. Execution risk too high.`);
      direction = 'NEUTRAL';
    } else {
      confidence = 0.70;
      evidence.push('Normal market liquidity condition');
      if (state.trend.direction === 'BULLISH') direction = 'BUY';
      else if (state.trend.direction === 'BEARISH') direction = 'SELL';
    }

    return {
      agent_id: this.id,
      agent_name: this.name,
      direction,
      confidence: Number(confidence.toFixed(2)),
      evidence,
      reasoning: `Liquidity Agent evaluated condition '${liquidity.condition}'. Direction: ${direction}.`,
      timestamp: new Date()
    };
  }
}
