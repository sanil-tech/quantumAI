import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { decisionRouter } from '../src/server/routes/decision';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { PostMortemReview } from '../src/types';

describe('QUANTUMAI — Production Adaptive Learning End-to-End Proof', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', decisionRouter);
    app.use('/api/forex', decisionRouter);
    aiDecisionEngine.setPostMortemReviews([]);
  });

  it('A. Production Baseline: /api/forex/ai-opinion produces unadapted baseline Stop Loss without learning memory', async () => {
    const payload = {
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    };

    const res = await request(app).post('/api/forex/ai-opinion').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.pair).toBe('EUR/USD');
    expect(res.body.action).toBe('BUY');
    // Baseline: priceNum - atr * 1.4 = 1.0850 - 0.0028 = 1.08220
    expect(res.body.stopLoss).toBe(1.08220);
    expect(res.body.invalidationLevel).toBe(1.08200);

    const hasAdaptiveTag = res.body.reasons.some((r: string) => r.includes('[ADAPTIVE LEARNING MEMORY]'));
    expect(hasAdaptiveTag).toBe(false);
  });

  it('B. Production Adapted: /api/forex/ai-opinion measurably expands Stop Loss buffer when loss history exists', async () => {
    const persistedLossReview: PostMortemReview = {
      id: 'pm-loss-EURUSD-1.0',
      tradeId: 'trade-closed-001',
      positionId: 'trade-closed-001',
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
      rootCauseEn: 'Premature stop out from standard tight SL buffer during volatility surge',
      rootCauseMs: 'Stop Loss terlalu ketat',
      lessonLearnedEn: 'Expand SL buffer to 1.8x ATR for EUR/USD',
      lessonLearnedMs: 'Besarkan penampan SL ke 1.8x ATR',
      adaptiveRuleEn: 'Expand Stop Loss buffer to 1.8x ATR for EUR/USD setups',
      adaptiveRuleMs: 'Besarkan zon penampan Stop Loss ke 1.8x ATR',
      ratingScore: 60,
      strategyId: 'SMC_QUANT_V1',
      strategyVersion: '1.0'
    };

    // Load persisted lesson into production engine memory (as done on server boot)
    aiDecisionEngine.setPostMortemReviews([persistedLossReview]);

    // Send IDENTICAL market conditions and inputs to production endpoint
    const payload = {
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    };

    const res = await request(app).post('/api/forex/ai-opinion').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.pair).toBe('EUR/USD');
    expect(res.body.action).toBe('BUY');
    // Adapted: priceNum - atr * 1.8 = 1.0850 - 0.0036 = 1.08140
    expect(res.body.stopLoss).toBe(1.08140);
    expect(res.body.invalidationLevel).toBe(1.08120);

    // Measurable mathematical difference of exactly 0.00080 (8 pips wider buffer)
    const slDifference = Number((1.08220 - res.body.stopLoss).toFixed(5));
    expect(slDifference).toBe(0.00080);

    // Evidence must contain explicit proof of adaptive learning consumption
    const adaptiveReason = res.body.reasons.find((r: string) => r.includes('[ADAPTIVE LEARNING MEMORY]'));
    expect(adaptiveReason).toBeDefined();
    expect(adaptiveReason).toContain('Applied rule from pm-loss-EURUSD-1.0');
    expect(adaptiveReason).toContain('Expand Stop Loss buffer to 1.8x ATR for EUR/USD setups');
  });

  it('C. Symbol Isolation: Loss lesson for EUR/USD does not alter decision parameters for GBP/USD', async () => {
    const persistedLossReview: PostMortemReview = {
      id: 'pm-loss-EURUSD-1.0',
      tradeId: 'trade-closed-001',
      positionId: 'trade-closed-001',
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
      rootCauseEn: 'EUR/USD volatility',
      rootCauseMs: 'Volatiliti EUR/USD',
      lessonLearnedEn: 'Expand EUR/USD SL',
      lessonLearnedMs: 'Besarkan SL EUR/USD',
      adaptiveRuleEn: 'Expand EUR/USD SL buffer',
      adaptiveRuleMs: 'Besarkan SL EUR/USD',
      ratingScore: 60,
      strategyId: 'SMC_QUANT_V1',
      strategyVersion: '1.0'
    };

    aiDecisionEngine.setPostMortemReviews([persistedLossReview]);

    const gbpPayload = {
      pair: 'GBP/USD',
      timeframe: 'M15',
      currentPrice: 1.3000,
      indicators: { rsi: 55, ema50: 1.2990, atr: 0.0020 }
    };

    const res = await request(app).post('/api/forex/ai-opinion').send(gbpPayload);
    expect(res.status).toBe(200);
    // Baseline 1.4x ATR for GBP/USD: 1.3000 - 0.0028 = 1.29720
    expect(res.body.stopLoss).toBe(1.29720);
    const hasAdaptiveTag = res.body.reasons.some((r: string) => r.includes('[ADAPTIVE LEARNING MEMORY]'));
    expect(hasAdaptiveTag).toBe(false);
  });

  it('D. Restart Survival: Reloading persisted lessons restores adaptive decision influence', async () => {
    const persistedLessons: PostMortemReview[] = [
      {
        id: 'pm-reloaded-EURUSD',
        tradeId: 'trade-reloaded-01',
        positionId: 'trade-reloaded-01',
        learningVersion: '1.0',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0820,
        stopLoss: 1.0820,
        takeProfit: 1.0910,
        pnlDollars: -100.00,
        pnlPips: -30,
        outcome: 'LOSS',
        rootCauseEn: 'Tight SL failure',
        rootCauseMs: 'SL gagal',
        lessonLearnedEn: 'Expand SL buffer',
        lessonLearnedMs: 'Besarkan SL',
        adaptiveRuleEn: 'Expand SL to 1.8x ATR',
        adaptiveRuleMs: 'Besarkan SL ke 1.8x ATR',
        ratingScore: 70,
        strategyId: 'SMC_QUANT_V1',
        strategyVersion: '1.0'
      }
    ];

    // 1. Simulating application crash/restart: memory wiped
    aiDecisionEngine.setPostMortemReviews([]);
    const wipedRes = await request(app).post('/api/forex/ai-opinion').send({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    });
    expect(wipedRes.body.stopLoss).toBe(1.08220); // Baseline

    // 2. Simulating server boot reload: loading persisted records from PostgreSQL
    aiDecisionEngine.setPostMortemReviews(persistedLessons);
    const reloadedRes = await request(app).post('/api/forex/ai-opinion').send({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    });
    expect(reloadedRes.body.stopLoss).toBe(1.08140); // Immediately adapted
  });
});
