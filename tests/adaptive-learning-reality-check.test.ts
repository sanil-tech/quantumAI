import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TradingRepository } from '../packages/database/src/repository';
import { LearningService } from '../src/server/services/learningService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { PostMortemReview } from '../src/types';

describe('QUANTUMAI ? Phase 6: Adaptive Learning Reality Check', () => {
  let mockDbRows: any[] = [];
  let repo: TradingRepository;
  let learningService: LearningService;

  beforeEach(() => {
    mockDbRows = [];
    repo = new TradingRepository({ connectionString: 'postgres://test:test@localhost:5432/testdb' });

    // Mock direct PostgreSQL queries to inspect real SQL interactions and simulate real DB table
    (repo as any).query = async (text: string, params: any[] = []) => {
      const sql = text.trim();
      if (sql.startsWith('INSERT INTO post_mortem_reviews')) {
        const [id, trade_id, learning_version, review] = params;
        const existingIdx = mockDbRows.findIndex(r => r.trade_id === trade_id && r.learning_version === learning_version);
        const row = { id, trade_id, learning_version, review, created_at: new Date() };
        if (existingIdx !== -1) {
          mockDbRows[existingIdx] = row;
        } else {
          mockDbRows.push(row);
        }
        return { rows: [row] };
      }
      if (sql.startsWith('SELECT * FROM post_mortem_reviews')) {
        return { rows: [...mockDbRows].reverse() };
      }
      return { rows: [] };
    };

    learningService = new LearningService(repo);
    aiDecisionEngine.setPostMortemReviews([]);
  });

  afterEach(() => {
    aiDecisionEngine.setPostMortemReviews([]);
  });

  it('TEST A: No prior learning lesson produces baseline decision parameters', async () => {
    const payload = {
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    };

    const opinion = await aiDecisionEngine.generateOpinion(payload);

    expect(opinion.action).toBe('BUY');
    // Baseline Stop Loss: 1.0850 - (0.0020 * 1.4) = 1.08220
    expect(opinion.stopLoss).toBe(1.08220);
    expect(opinion.invalidationLevel).toBe(1.08200);

    const hasAdaptiveTag = opinion.reasons.some((r: string) => r.includes('[ADAPTIVE LEARNING MEMORY]'));
    expect(hasAdaptiveTag).toBe(false);
  });

  it('TEST B: Insert persisted EUR/USD LOSS lesson -> reload -> decision changes to adapted parameters', async () => {
    const lossReview: PostMortemReview = {
      id: 'pm-loss-eurusd-real',
      tradeId: 'trade-real-001',
      positionId: 'pos-real-001',
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
      rootCauseEn: 'Volatility spike pierced standard 1.4x ATR SL',
      rootCauseMs: 'Spike volatiliti menembusi SL 1.4x ATR',
      lessonLearnedEn: 'Expand Stop Loss buffer for EUR/USD setups',
      lessonLearnedMs: 'Besarkan penampan Stop Loss untuk EUR/USD',
      adaptiveRuleEn: 'Expand Stop Loss buffer to 1.8x ATR for EUR/USD setups',
      adaptiveRuleMs: 'Besarkan zon penampan Stop Loss ke 1.8x ATR',
      ratingScore: 65,
      strategyId: 'SMC_QUANT_V1',
      strategyVersion: '1.0'
    };

    // 1. Persist directly to PostgreSQL repository
    await repo.savePostMortemReview(lossReview.id, lossReview.tradeId, lossReview, '1.0');

    // 2. Startup / Reload LearningService from database
    const loadedLessons = await learningService.loadPersistedLearning();
    expect(loadedLessons.length).toBe(1);
    expect(loadedLessons[0].id).toBe('pm-loss-eurusd-real');

    // 3. Generate proposal under identical market inputs
    const payload = {
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    };

    const opinion = await aiDecisionEngine.generateOpinion(payload);

    // 4. Verify decision variable changed: Stop Loss is 1.08140 (1.8x ATR) instead of 1.08220 (1.4x ATR)
    expect(opinion.stopLoss).toBe(1.08140);
    expect(opinion.invalidationLevel).toBe(1.08120);

    const adaptiveTag = opinion.reasons.find((r: string) => r.includes('[ADAPTIVE LEARNING MEMORY]'));
    expect(adaptiveTag).toBeDefined();
    expect(adaptiveTag).toContain('pm-loss-eurusd-real');
    expect(adaptiveTag).toContain('Expand Stop Loss buffer to 1.8x ATR');
  });

  it('TEST C: Query PostgreSQL repository directly and verify lesson schema integrity', async () => {
    const lossReview: PostMortemReview = {
      id: 'pm-loss-eurusd-direct-sql',
      tradeId: 'trade-sql-001',
      positionId: 'pos-sql-001',
      learningVersion: '1.0',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -120.00,
      pnlPips: -30,
      outcome: 'LOSS',
      rootCauseEn: 'Liquidity sweep stopped out trade',
      rootCauseMs: 'Sapuan likuiditi',
      lessonLearnedEn: 'Buffer enlargement required',
      lessonLearnedMs: 'Perlu buffer lebih besar',
      adaptiveRuleEn: 'Expand EUR/USD SL buffer',
      adaptiveRuleMs: 'Besarkan SL',
      ratingScore: 70,
      strategyId: 'SMC_QUANT_V1',
      strategyVersion: '1.0'
    };

    await repo.savePostMortemReview(lossReview.id, lossReview.tradeId, lossReview, '1.0');

    // Query database rows directly
    const directRows = await repo.getPostMortemReviews(10);
    expect(directRows.length).toBe(1);
    expect(directRows[0].id).toBe('pm-loss-eurusd-direct-sql');
    expect(directRows[0].outcome).toBe('LOSS');
    expect(directRows[0].pair).toBe('EUR/USD');
  });

  it('TEST D: Clear in-memory engine state -> reload from DB -> adaptation persists', async () => {
    const lossReview: PostMortemReview = {
      id: 'pm-loss-eurusd-reload',
      tradeId: 'trade-reload-001',
      positionId: 'pos-reload-001',
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
      rootCauseMs: 'SL ketat gagal',
      lessonLearnedEn: 'Buffer enlargement required',
      lessonLearnedMs: 'Perlu buffer lebih besar',
      adaptiveRuleEn: 'Expand SL to 1.8x ATR',
      adaptiveRuleMs: 'Besarkan SL ke 1.8x ATR',
      ratingScore: 75,
      strategyId: 'SMC_QUANT_V1',
      strategyVersion: '1.0'
    };

    await repo.savePostMortemReview(lossReview.id, lossReview.tradeId, lossReview, '1.0');

    // 1. Wipe in-memory state
    aiDecisionEngine.setPostMortemReviews([]);
    const wipedOpinion = await aiDecisionEngine.generateOpinion({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    });
    expect(wipedOpinion.stopLoss).toBe(1.08220); // Baseline

    // 2. Reload from PostgreSQL
    await learningService.loadPersistedLearning();
    const reloadedOpinion = await aiDecisionEngine.generateOpinion({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    });
    expect(reloadedOpinion.stopLoss).toBe(1.08140); // Adapted
  });

  it('TEST E: EUR/USD learning does NOT corrupt GBP/USD baseline decision', async () => {
    const lossReview: PostMortemReview = {
      id: 'pm-loss-eurusd-isolated',
      tradeId: 'trade-eur-001',
      positionId: 'pos-eur-001',
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
      rootCauseMs: 'Volatiliti EUR',
      lessonLearnedEn: 'Expand EUR SL',
      lessonLearnedMs: 'Besarkan SL EUR',
      adaptiveRuleEn: 'Expand EUR/USD SL buffer',
      adaptiveRuleMs: 'Besarkan SL EUR',
      ratingScore: 60,
      strategyId: 'SMC_QUANT_V1',
      strategyVersion: '1.0'
    };

    await repo.savePostMortemReview(lossReview.id, lossReview.tradeId, lossReview, '1.0');
    await learningService.loadPersistedLearning();

    const gbpOpinion = await aiDecisionEngine.generateOpinion({
      pair: 'GBP/USD',
      timeframe: 'M15',
      currentPrice: 1.3000,
      indicators: { rsi: 55, ema50: 1.2990, atr: 0.0020 }
    });

    // GBP/USD Stop Loss remains unadapted at baseline (1.4x ATR): 1.3000 - (0.0020 * 1.4) = 1.29720
    expect(gbpOpinion.stopLoss).toBe(1.29720);
    const hasAdaptiveTag = gbpOpinion.reasons.some((r: string) => r.includes('[ADAPTIVE LEARNING MEMORY]'));
    expect(hasAdaptiveTag).toBe(false);
  });

  it('TEST F: WIN lesson does NOT trigger defensive SL widening (only LOSS lessons do)', async () => {
    const winReview: PostMortemReview = {
      id: 'pm-win-eurusd-target',
      tradeId: 'trade-win-001',
      positionId: 'pos-win-001',
      learningVersion: '1.0',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0910,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: 300.00,
      pnlPips: 60,
      outcome: 'WIN',
      rootCauseEn: 'Order block reacted cleanly into liquidity pool',
      rootCauseMs: 'Order block bereaksi sempurna',
      lessonLearnedEn: 'Standard 1.4x ATR SL buffer was optimal',
      lessonLearnedMs: 'Penampan standard adalah optimum',
      adaptiveRuleEn: 'Maintain standard SL buffer for high-probability setups',
      adaptiveRuleMs: 'Kekalkan penampan standard',
      ratingScore: 95,
      strategyId: 'SMC_QUANT_V1',
      strategyVersion: '1.0'
    };

    await repo.savePostMortemReview(winReview.id, winReview.tradeId, winReview, '1.0');
    await learningService.loadPersistedLearning();

    const eurOpinion = await aiDecisionEngine.generateOpinion({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    });

    // Win lesson does not expand SL: remains baseline 1.4x ATR (1.08220)
    expect(eurOpinion.stopLoss).toBe(1.08220);
    const hasAdaptiveTag = eurOpinion.reasons.some((r: string) => r.includes('[ADAPTIVE LEARNING MEMORY]'));
    expect(hasAdaptiveTag).toBe(false);
  });
});
