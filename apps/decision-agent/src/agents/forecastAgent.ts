import { TradingAgent, AgentVote, MarketState, MarketDirection, ForecastResult } from '@iati/core-types';

export class ForecastAgent implements TradingAgent {
  id = 'agent-forecast';
  name = 'Probabilistic Forecast Agent';

  public predictProbabilities(state: MarketState): ForecastResult {
    let bullishProb = 0.33;
    let bearishProb = 0.33;
    let neutralProb = 0.34;

    if (state.trend.direction === 'BULLISH') {
      bullishProb += 0.25;
      neutralProb -= 0.15;
      bearishProb -= 0.10;
    } else if (state.trend.direction === 'BEARISH') {
      bearishProb += 0.25;
      neutralProb -= 0.15;
      bullishProb -= 0.10;
    }

    if (state.momentum.rsi > 50) {
      bullishProb += (state.momentum.rsi - 50) / 200;
    } else {
      bearishProb += (50 - state.momentum.rsi) / 200;
    }

    // Normalize
    const total = bullishProb + bearishProb + neutralProb;
    return {
      bullish_probability: Number((bullishProb / total).toFixed(2)),
      bearish_probability: Number((bearishProb / total).toFixed(2)),
      neutral_probability: Number((neutralProb / total).toFixed(2))
    };
  }

  async analyze(state: MarketState): Promise<AgentVote> {
    const forecast = this.predictProbabilities(state);
    let direction: MarketDirection = 'NEUTRAL';
    let confidence = forecast.neutral_probability;
    const evidence: string[] = [];

    if (forecast.bullish_probability > 0.55 && forecast.bullish_probability > forecast.bearish_probability) {
      direction = 'BUY';
      confidence = forecast.bullish_probability;
      evidence.push(`Bullish forecast probability computed at ${(forecast.bullish_probability * 100).toFixed(0)}%`);
    } else if (forecast.bearish_probability > 0.55 && forecast.bearish_probability > forecast.bullish_probability) {
      direction = 'SELL';
      confidence = forecast.bearish_probability;
      evidence.push(`Bearish forecast probability computed at ${(forecast.bearish_probability * 100).toFixed(0)}%`);
    } else {
      direction = 'NEUTRAL';
      confidence = forecast.neutral_probability;
      evidence.push(`Probabilities balanced: Bullish ${(forecast.bullish_probability * 100).toFixed(0)}%, Bearish ${(forecast.bearish_probability * 100).toFixed(0)}%`);
    }

    return {
      agent_id: this.id,
      agent_name: this.name,
      direction,
      confidence: Number(confidence.toFixed(2)),
      evidence,
      reasoning: `Forecast Agent probabilistic model: Bullish=${forecast.bullish_probability}, Bearish=${forecast.bearish_probability}, Neutral=${forecast.neutral_probability}`,
      timestamp: new Date()
    };
  }
}
