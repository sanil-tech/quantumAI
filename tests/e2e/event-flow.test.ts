import { describe, it, expect } from 'vitest';
import { MarketDataService } from '../../apps/market-data/src/services/marketDataService';
import { intelligenceService } from '../../apps/intelligence/src/server';
import { decisionService } from '../../apps/decision-agent/src/server';

describe('E2E Microservices Event Flow (Sprint 2 -> 3 -> 4)', () => {
  it('should flow seamlessly from Market Data Ingestion to Intelligence State to Multi-Agent Decision Proposal', async () => {
    const symbol = 'EURUSD';
    const marketDataService = new MarketDataService();

    // Step 1: Ingest Market Data
    const candles = await marketDataService.ingestCandles(symbol, '1h', 50);
    expect(candles.length).toBe(50);

    // Step 2: Trigger Intelligence Service
    const state = await intelligenceService.processCandleUpdate(symbol, candles);
    expect(state.symbol).toBe('EUR/USD');
    expect(state.regime).toBeDefined();

    // Step 3: Trigger Decision Agent Service
    const proposal = await decisionService.processMarketStateUpdate({
      symbol,
      market_state: state,
      regime: state.regime.regime,
      confidence: state.confidence,
      timestamp: new Date()
    });

    expect(proposal.symbol).toBe('EUR/USD');
    expect(['BUY', 'SELL', 'NEUTRAL']).toContain(proposal.direction);
    expect(proposal.agent_votes.length).toBe(5);
    expect(proposal.why_direction).toBeDefined();
    expect(proposal.invalidate_conditions.length).toBeGreaterThan(0);
  });
});
