import { TradingAgent, AgentVote, MarketState, MarketDirection } from '@iati/core-types';

export class MomentumAgent implements TradingAgent {
  id = 'agent-momentum';
  name = 'Momentum Oscillators Agent';

  async analyze(state: MarketState): Promise<AgentVote> {
    const { momentum } = state;
    let direction: MarketDirection = 'NEUTRAL';
    let confidence = 0.5;
    const evidence: string[] = [];

    if (momentum.rsi > 55 && momentum.momentumScore > 0.2) {
      direction = 'BUY';
      confidence = Math.min(0.90, 0.5 + (momentum.rsi - 50) / 50 * 0.5);
      evidence.push(`RSI at ${momentum.rsi} demonstrates bullish momentum expansion`);
      evidence.push(`Momentum score: ${momentum.momentumScore}`);
    } else if (momentum.rsi < 45 && momentum.momentumScore < -0.2) {
      direction = 'SELL';
      confidence = Math.min(0.90, 0.5 + (50 - momentum.rsi) / 50 * 0.5);
      evidence.push(`RSI at ${momentum.rsi} demonstrates bearish momentum contraction`);
      evidence.push(`Momentum score: ${momentum.momentumScore}`);
    } else {
      direction = 'NEUTRAL';
      confidence = 0.60;
      evidence.push(`RSI at neutral value ${momentum.rsi}`);
    }

    if (momentum.rsi > 75) {
      evidence.push('WARNING: Oversold/Overbought zone (>75). Exhaustion risk elevated.');
      confidence *= 0.8;
    } else if (momentum.rsi < 25) {
      evidence.push('WARNING: Oversold/Overbought zone (<25). Exhaustion risk elevated.');
      confidence *= 0.8;
    }

    return {
      agent_id: this.id,
      agent_name: this.name,
      direction,
      confidence: Number(confidence.toFixed(2)),
      evidence,
      reasoning: `Momentum Agent assessed RSI (${momentum.rsi}) and momentum score (${momentum.momentumScore}). Direction: ${direction}.`,
      timestamp: new Date()
    };
  }
}
