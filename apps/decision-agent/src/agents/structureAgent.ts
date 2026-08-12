import { TradingAgent, AgentVote, MarketState, MarketDirection } from '@iati/core-types';

export class MarketStructureAgent implements TradingAgent {
  id = 'agent-structure';
  name = 'Market Structure Agent';

  async analyze(state: MarketState): Promise<AgentVote> {
    const { structure } = state;
    let direction: MarketDirection = 'NEUTRAL';
    let confidence = 0.5;
    const evidence: string[] = [];

    if (structure.higherHighs && structure.higherLows) {
      direction = 'BUY';
      confidence = 0.80;
      evidence.push('Forming consecutive Higher Highs and Higher Lows');
      if (structure.isBreakout) {
        confidence += 0.10;
        evidence.push(`Confirmed bullish breakout above resistance zone ${structure.resistanceZones.join(', ')}`);
      }
    } else if (structure.lowerHighs && structure.lowerLows) {
      direction = 'SELL';
      confidence = 0.80;
      evidence.push('Forming consecutive Lower Highs and Lower Lows');
      if (structure.isBreakout) {
        confidence += 0.10;
        evidence.push(`Confirmed bearish breakdown below support zone ${structure.supportZones.join(', ')}`);
      }
    } else if (structure.isConsolidating) {
      direction = 'NEUTRAL';
      confidence = 0.70;
      evidence.push('Price locked within narrow consolidation box');
    } else {
      direction = 'NEUTRAL';
      confidence = 0.50;
      evidence.push('Mixed structural signals without clear swing high/low progression');
    }

    return {
      agent_id: this.id,
      agent_name: this.name,
      direction,
      confidence: Number(Math.min(0.95, confidence).toFixed(2)),
      evidence,
      reasoning: `Market Structure Agent identified pattern: ${structure.pattern}. Direction: ${direction}.`,
      timestamp: new Date()
    };
  }
}
