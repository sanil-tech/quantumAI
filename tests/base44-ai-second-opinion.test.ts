import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Base44AiService, base44AiService } from '../src/server/services/base44AiService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';

describe('Base44 AI Second Opinion & Token-Saving Architecture', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes Base44AiService with active configuration', () => {
    expect(base44AiService).toBeDefined();
    expect(base44AiService.isAvailable()).toBe(true);
  });

  it('rejects low confidence setups (<60%) locally without consuming any AI tokens', async () => {
    const weakSetup = {
      pair: 'EUR/USD',
      timeframe: 'M5',
      direction: 'BUY' as const,
      currentPrice: 1.08500,
      entryPrice: 1.08480,
      stopLoss: 1.08300,
      takeProfit1: 1.08900,
      confidence: 50, // WEAK
      reasons: ['Weak RSI divergence only']
    };

    const result = await base44AiService.evaluateTradeSignal(weakSetup);
    expect(result.decision).toBe('VETO');
    expect(result.provider).toBe('local_fallback');
    expect(result.reasoning).toContain('below minimum threshold');
  });

  it('caches evaluation results for 15 minutes to strictly prevent duplicate token consumption', async () => {
    const mockSetup = {
      pair: 'GBP/USD',
      timeframe: 'M5',
      direction: 'SELL' as const,
      currentPrice: 1.29500,
      entryPrice: 1.29550,
      stopLoss: 1.29800,
      takeProfit1: 1.29000,
      confidence: 82,
      reasons: ['Bearish FVG mitigation', 'Liquidity sweep of Asian High']
    };

    // First call: returns evaluation
    const firstResult = await base44AiService.evaluateTradeSignal(mockSetup);
    expect(['CONFIRM', 'VETO', 'ADJUST']).toContain(firstResult.decision);

    // Second call within 15 minutes on identical price bucket: must be returned from cache
    const secondResult = await base44AiService.evaluateTradeSignal(mockSetup);
    expect(secondResult.cached).toBe(true);
    expect(secondResult.decision).toBe(firstResult.decision);
    expect(secondResult.confidenceScore).toBe(firstResult.confidenceScore);
  });

  it('routes through aiDecisionEngine.getSecondOpinion with source BASE44_AI_LIVE', async () => {
    const candidate = {
      pair: 'USD/JPY' as any,
      timeframe: 'M5' as any,
      direction: 'BUY' as const,
      currentPrice: 154.500,
      entryZone: { min: 154.450, max: 154.550 },
      stopLoss: 154.100,
      takeProfit1: 155.200,
      takeProfit2: 155.800,
      riskRewardRatio: '1:2.0',
      confidence: 85,
      reasons: ['Bullish Order Block tap', 'SuperTrend Green']
    };

    const evaluation = await aiDecisionEngine.getSecondOpinion(candidate);
    expect(evaluation.confirmed).toBeDefined();
    expect(evaluation.source).toBe('BASE44_AI_LIVE');
    expect(evaluation.confidence).toBeGreaterThanOrEqual(50);
  });

  it('runs weekly adaptive learning & setup tuning review via Base44 with compact token footprint', async () => {
    const weeklyRequest = {
      totalClosed: 15,
      winsCount: 11,
      lossesCount: 4,
      winRate: 73.3,
      netPnL: 420.50,
      sampleClosedTrades: [
        { symbol: 'EUR/USD', direction: 'BUY', pnlDollars: 120, outcome: 'WIN' },
        { symbol: 'XAU/USD', direction: 'SELL', pnlDollars: -85, outcome: 'LOSS' },
        { symbol: 'GBP/USD', direction: 'BUY', pnlDollars: 145, outcome: 'WIN' }
      ]
    };

    const review = await base44AiService.runWeeklyHomeworkReview(weeklyRequest);
    expect(review.success).toBe(true);
    expect(review.winRate).toBe(73.3);
    expect(review.keyMistakesMs.length).toBeGreaterThanOrEqual(3);
    expect(review.winningPatternsMs.length).toBeGreaterThanOrEqual(3);
    expect(review.generatedAdaptiveRulesMs.length).toBeGreaterThanOrEqual(3);
    expect(review.setupTuningRecommendationsMs.length).toBeGreaterThanOrEqual(3);
    expect(review.primaryActiveRule).toBeDefined();
    expect(review.tokensUsedEstimate).toBeLessThanOrEqual(450); // Under ~400 token budget!
  });

  it('integrates aiDecisionEngine.runHomeworkSession with Base44 and updates active memory', async () => {
    const closedTrades = [
      { id: 't1', symbol: 'EUR/USD', direction: 'BUY', pnlDollars: 150, outcome: 'WIN' },
      { id: 't2', symbol: 'USD/JPY', direction: 'SELL', pnlDollars: -60, outcome: 'LOSS' }
    ];

    const prevReviewsCount = aiDecisionEngine.getPostMortemReviews().length;
    const sessionResult = await aiDecisionEngine.runHomeworkSession(closedTrades);

    expect(sessionResult.success).toBe(true);
    expect(sessionResult.provider).toBe('Base44 InvokeLLM Intelligence');
    expect(sessionResult.setupTuningRecommendationsMs).toBeDefined();
    expect(sessionResult.setupTuningRecommendationsMs.length).toBeGreaterThanOrEqual(3);
    expect(sessionResult.executiveSummaryMs).toBeDefined();

    // Verify memory was updated with the new adaptive rule
    const updatedReviews = aiDecisionEngine.getPostMortemReviews();
    expect(updatedReviews.length).toBe(prevReviewsCount + 1);
    expect(updatedReviews[0].adaptiveRuleMs).toBe(sessionResult.primaryActiveRule);
  });
});
