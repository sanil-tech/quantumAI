import { describe, it, expect } from 'vitest';
import { ChiefDecisionAgent } from '../apps/decision-agent/src/chiefAgent';
import { TrendAgent } from '../apps/decision-agent/src/agents/trendAgent';
import { ForecastAgent } from '../apps/decision-agent/src/agents/forecastAgent';
import { MarketState } from '@iati/core-types';

describe('Multi-Agent AI Decision Engine (Sprint 4)', () => {
  const dummyState: MarketState = {
    symbol: 'EURUSD',
    timestamp: new Date(),
    trend: {
      sma20: 1.0880,
      sma50: 1.0820,
      ema20: 1.0875,
      direction: 'BULLISH',
      strength: 0.85
    },
    momentum: {
      rsi: 62.5,
      momentumScore: 0.45,
      acceleration: 0.05
    },
    volatility: {
      atr: 0.0025,
      volatilityState: 'NORMAL',
      expansionRatio: 1.1
    },
    liquidity: {
      spread: 0.0001,
      condition: 'OPTIMAL'
    },
    structure: {
      higherHighs: true,
      higherLows: true,
      lowerHighs: false,
      lowerLows: false,
      supportZones: [1.0820],
      resistanceZones: [1.0910],
      isConsolidating: false,
      isBreakout: true,
      pattern: 'BULLISH_STRUCTURE'
    },
    regime: {
      symbol: 'EURUSD',
      regime: 'TRENDING',
      confidence: 0.88,
      evidence: ['SMA alignment', 'High strength']
    },
    confidence: 0.88,
    evidence: ['Bullish trend aligned']
  };

  it('TrendAgent should vote BUY for bullish market state', async () => {
    const trendAgent = new TrendAgent();
    const vote = await trendAgent.analyze(dummyState);

    expect(vote.direction).toBe('BUY');
    expect(vote.confidence).toBeGreaterThan(0.6);
  });

  it('ForecastAgent should calculate probabilistic estimates', async () => {
    const forecastAgent = new ForecastAgent();
    const probs = forecastAgent.predictProbabilities(dummyState);

    expect(probs.bullish_probability).toBeGreaterThan(probs.bearish_probability);
    expect(probs.bullish_probability + probs.bearish_probability + probs.neutral_probability).toBeCloseTo(1.0, 1);
  });

  it('ChiefDecisionAgent should synthesize all votes into a TradeProposal', async () => {
    const chief = new ChiefDecisionAgent();
    const proposal = await chief.evaluateMarketState(dummyState);

    expect(proposal.symbol).toBe('EUR/USD');
    expect(proposal.direction).toBe('BUY');
    expect(proposal.confidence).toBeGreaterThan(0.6);
    expect(proposal.agent_votes).toHaveLength(5);
    expect(proposal.why_direction).toBeDefined();
    expect(proposal.invalidate_conditions.length).toBeGreaterThan(0);
  });
});
