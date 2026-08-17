import { describe, it, expect, beforeEach } from 'vitest';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { PostMortemReview } from '../src/types';

describe('QUANTUMAI — Adaptive Learning Lifecycle & Future Decision Influence', () => {
  beforeEach(() => {
    aiDecisionEngine.setPostMortemReviews([]);
  });

  it('1. aiDecisionEngine starts with empty learning memory when no reviews are loaded', () => {
    expect(aiDecisionEngine.getPostMortemReviews()).toEqual([]);
  });

  it('2. Persisted learning records can be loaded and stored in decision engine memory', () => {
    const mockPersistedLesson: PostMortemReview = {
      id: 'pm-test-EURUSD-1.0',
      tradeId: 'trade-test-01',
      positionId: 'trade-test-01',
      learningVersion: '1.0',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -150.00,
      pnlPips: -30,
      outcome: 'LOSS',
      rootCauseEn: 'Premature stop out due to tight SL during London volatility surge',
      rootCauseMs: 'Stop Loss terlalu ketat semasa lonjakan volatiliti London',
      lessonLearnedEn: 'Expand SL buffer to at least 1.8x ATR on EUR/USD',
      lessonLearnedMs: 'Besarkan penampan SL sekurang-kurangnya 1.8x ATR pada EUR/USD',
      adaptiveRuleEn: 'Expand Stop Loss buffer to 1.8x ATR for EUR/USD setups',
      adaptiveRuleMs: 'Besarkan zon penampan Stop Loss ke 1.8x ATR',
      ratingScore: 65,
      strategyId: 'SMC_QUANT_V1',
      strategyVersion: '1.0'
    };

    aiDecisionEngine.setPostMortemReviews([mockPersistedLesson]);
    const loaded = aiDecisionEngine.getPostMortemReviews();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('pm-test-EURUSD-1.0');
    expect(loaded[0].adaptiveRuleEn).toBe('Expand Stop Loss buffer to 1.8x ATR for EUR/USD setups');
  });

  it('3. Future deterministic opinion calculation directly adapts SL buffer when loss history exists for symbol', async () => {
    const mockLossLesson: PostMortemReview = {
      id: 'pm-loss-EURUSD-1.0',
      tradeId: 'trade-loss-01',
      positionId: 'trade-loss-01',
      learningVersion: '1.0',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -150.00,
      pnlPips: -30,
      outcome: 'LOSS',
      rootCauseEn: 'Tight SL triggered prematurely',
      rootCauseMs: 'SL terlalu ketat',
      lessonLearnedEn: 'Widen SL buffer',
      lessonLearnedMs: 'Besarkan SL',
      adaptiveRuleEn: 'Expand SL buffer to 1.8x ATR',
      adaptiveRuleMs: 'Besarkan SL ke 1.8x ATR',
      ratingScore: 60,
      strategyId: 'SMC_QUANT_V1',
      strategyVersion: '1.0'
    };

    // Case A: Opinion without learning memory (baseline)
    aiDecisionEngine.setPostMortemReviews([]);
    const baselineOpinion = await aiDecisionEngine.generateOpinion({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    });

    // Case B: Opinion with persisted learning memory loaded
    aiDecisionEngine.setPostMortemReviews([mockLossLesson]);
    const adaptedOpinion = await aiDecisionEngine.generateOpinion({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    });

    // Baseline uses 1.4x ATR: 1.0850 - 0.0020 * 1.4 = 1.08220
    // Adapted uses 1.8x ATR: 1.0850 - 0.0020 * 1.8 = 1.08140 (wider SL buffer)
    expect(baselineOpinion.stopLoss).toBe(1.08220);
    expect(adaptedOpinion.stopLoss).toBe(1.08140);
    expect(adaptedOpinion.stopLoss).toBeLessThan(baselineOpinion.stopLoss);

    // Verify adaptive learning rule appears in trade proposal evidence
    const hasAdaptiveEvidence = adaptedOpinion.reasons.some((r: string) => r.includes('[ADAPTIVE LEARNING MEMORY]'));
    expect(hasAdaptiveEvidence).toBe(true);
  });

  it('4. Proves learning state does not affect unrelated currency pairs', async () => {
    const mockLossLesson: PostMortemReview = {
      id: 'pm-loss-GBPUSD-1.0',
      tradeId: 'trade-loss-gbp',
      positionId: 'trade-loss-gbp',
      learningVersion: '1.0',
      timestamp: Date.now(),
      pair: 'GBP/USD',
      direction: 'BUY',
      entryPrice: 1.3000,
      exitPrice: 1.2950,
      stopLoss: 1.2950,
      takeProfit: 1.3100,
      pnlDollars: -100.00,
      pnlPips: -50,
      outcome: 'LOSS',
      rootCauseEn: 'GBP specific volatility',
      rootCauseMs: 'Volatiliti GBP',
      lessonLearnedEn: 'Widen GBP SL',
      lessonLearnedMs: 'Besarkan SL GBP',
      adaptiveRuleEn: 'Expand GBP SL buffer',
      adaptiveRuleMs: 'Besarkan SL GBP',
      ratingScore: 70,
      strategyId: 'SMC_QUANT_V1',
      strategyVersion: '1.0'
    };

    aiDecisionEngine.setPostMortemReviews([mockLossLesson]);

    // Query EUR/USD opinion (unrelated to GBP/USD lesson)
    const eurusdOpinion = await aiDecisionEngine.generateOpinion({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    });

    // EUR/USD should retain standard baseline 1.4x ATR SL buffer: 1.0850 - 0.0020 * 1.4 = 1.08220
    expect(eurusdOpinion.stopLoss).toBe(1.08220);
    const hasAdaptiveEvidence = eurusdOpinion.reasons.some((r: string) => r.includes('[ADAPTIVE LEARNING MEMORY]'));
    expect(hasAdaptiveEvidence).toBe(false);
  });

  it('5. Survives restart: simulated reload from persistence populates engine memory', () => {
    // 1. Initial run: save lesson
    const savedLessons: PostMortemReview[] = [
      {
        id: 'pm-persisted-restart-01',
        tradeId: 'trade-01',
        positionId: 'trade-01',
        learningVersion: '1.0',
        timestamp: Date.now(),
        pair: 'XAU/USD',
        direction: 'BUY',
        entryPrice: 2400.0,
        exitPrice: 2380.0,
        stopLoss: 2380.0,
        takeProfit: 2450.0,
        pnlDollars: -200,
        pnlPips: -200,
        outcome: 'LOSS',
        rootCauseEn: 'Gold NY open spread widening',
        rootCauseMs: 'Pelebaran spread pembukaan Gold NY',
        lessonLearnedEn: 'Use 2.5x ATR buffer for Gold during NY open',
        lessonLearnedMs: 'Gunakan penampan 2.5x ATR untuk Gold waktu NY',
        adaptiveRuleEn: 'Apply wider SL on Gold NY open',
        adaptiveRuleMs: 'Gunakan SL lebih luas untuk Gold waktu NY',
        ratingScore: 50,
        strategyId: 'SMC_QUANT_V1',
        strategyVersion: '1.0'
      }
    ];

    // 2. Simulated engine restart (empty memory)
    aiDecisionEngine.setPostMortemReviews([]);
    expect(aiDecisionEngine.getPostMortemReviews().length).toBe(0);

    // 3. Engine boot reload (loading persisted lessons from DB)
    aiDecisionEngine.setPostMortemReviews(savedLessons);
    expect(aiDecisionEngine.getPostMortemReviews().length).toBe(1);
    expect(aiDecisionEngine.getPostMortemReviews()[0].id).toBe('pm-persisted-restart-01');
  });
});
