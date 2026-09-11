import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { LearningService } from '../src/server/services/learningService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { BacktestEngine } from '../apps/decision-agent/src/services/backtestEngine';
import { TradingRepository } from '@iati/database';
import { PostMortemReview } from '../src/types';

describe('QUANTUMAI — ADAPTIVE LEARNING PROVENANCE & AUTHORITY BOUNDARY TEST SUITE', () => {
  let signalService: SignalIntelligenceService;
  let learningService: LearningService;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      getPostMortemReviews: vi.fn().mockResolvedValue([]),
      getUnlearnedClosedPositions: vi.fn().mockResolvedValue([]),
      getPostMortemByTradeAndVersion: vi.fn().mockResolvedValue(null),
      getPositionById: vi.fn(),
      savePostMortemReview: vi.fn().mockImplementation(async ({ review }) => review),
      saveTradeEvent: vi.fn().mockResolvedValue({ id: 'evt_test_1' }),
      getClosedPositions: vi.fn().mockResolvedValue([]),
      getClosedPositionsAcrossAccounts: vi.fn().mockResolvedValue([])
    };

    signalService = SignalIntelligenceService.getInstance();
    learningService = new LearningService(mockRepo);
    aiDecisionEngine.setPostMortemReviews([]);
  });

  it('1. REAL_TRADE + CLOSED PostgreSQL position: creates authoritative learning record with POSTGRESQL authority', async () => {
    mockRepo.getPositionById.mockResolvedValue({
      positionId: 'pos_auth_closed_1',
      symbol: 'EUR/USD',
      direction: 'BUY',
      status: 'CLOSED',
      entryPrice: 1.08500,
      closePrice: 1.08200,
      stopLoss: 1.08200,
      takeProfit: 1.09000,
      realizedProfit: -30.00,
      pnlPips: -30,
      closedAt: new Date()
    });

    const result = await learningService.processClosedTrade({
      tradeId: 'pos_auth_closed_1',
      learningVersion: '1.0'
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('pm-pos_auth_closed_1-1.0');
    expect(result.provenance).toBe('REAL_TRADE');
    expect(result.authority).toBe('POSTGRESQL');
    expect(result.outcome).toBe('LOSS');
    expect(mockRepo.savePostMortemReview).toHaveBeenCalledTimes(1);
  });

  it('2. REAL_TRADE + OPEN position: strictly rejected from authoritative post-mortem learning', async () => {
    mockRepo.getPositionById.mockResolvedValue({
      positionId: 'pos_auth_open_1',
      symbol: 'EUR/USD',
      direction: 'BUY',
      status: 'OPEN',
      entryPrice: 1.08500,
      currentPrice: 1.08600
    });

    await expect(learningService.processClosedTrade({
      tradeId: 'pos_auth_open_1',
      learningVersion: '1.0'
    })).rejects.toThrow('OPEN_TRADE_LEARNING_REJECTED');

    expect(mockRepo.savePostMortemReview).not.toHaveBeenCalled();
  });

  it('3. HISTORICAL_BACKTEST: generates advisory warnings but CANNOT trigger authoritative execution veto', () => {
    // Inject 3 simulated 1-year backtest loss reviews
    const backtestLossReviews: PostMortemReview[] = [
      {
        id: 'pm-1y-1787680102312-36',
        timestamp: Date.now() - 3600000 * 24,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.17385,
        exitPrice: 1.16770,
        stopLoss: 1.16770,
        takeProfit: 1.18500,
        pnlDollars: -45.00,
        outcome: 'LOSS',
        rootCauseMs: 'Ujian Backtest 1-Tahun...',
        rootCauseEn: '1-Year Backtest Evaluation: BUY setup on EUR/USD stopped out at SL 1.16770 during daily volatility expansion.',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 3,
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE',
        dataSource: 'EXTERNAL_HISTORICAL'
      },
      {
        id: 'pm-1y-1787679502288-36',
        timestamp: Date.now() - 3600000 * 18,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.17385,
        exitPrice: 1.16770,
        stopLoss: 1.16770,
        takeProfit: 1.18500,
        pnlDollars: -45.00,
        outcome: 'LOSS',
        rootCauseMs: '...',
        rootCauseEn: '1-Year Backtest Evaluation: BUY setup on EUR/USD stopped out at SL 1.16770 during daily volatility expansion.',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 3,
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE',
        dataSource: 'EXTERNAL_HISTORICAL'
      },
      {
        id: 'pm-1y-1787678903133-36',
        timestamp: Date.now() - 3600000 * 12,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.17385,
        exitPrice: 1.16770,
        stopLoss: 1.16770,
        takeProfit: 1.18500,
        pnlDollars: -45.00,
        outcome: 'LOSS',
        rootCauseMs: '...',
        rootCauseEn: '1-Year Backtest Evaluation: BUY setup on EUR/USD stopped out at SL 1.16770 during daily volatility expansion.',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 3,
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE',
        dataSource: 'EXTERNAL_HISTORICAL'
      }
    ];

    aiDecisionEngine.setPostMortemReviews(backtestLossReviews);

    // Evaluate candidate bullish setup on EUR/USD
    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      style: 'SWING_TRADER',
      currentPrice: 1.17500,
      indicators: {
        rsi: 58,
        ema20: 1.17400,
        ema50: 1.17200,
        ema200: 1.16800,
        adx: 28,
        atr: 0.0035,
        macd: { histogram: 0.0008 }
      },
      smc: {
        orderBlocks: [{ type: 'BULLISH', high: 1.17450, low: 1.17350 }],
        fairValueGaps: []
      },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // Authoritative execution veto must NOT trigger
    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);

    // Advisory Backtest Warning must be present in learning evidence
    const hasBacktestWarning = result.learningEvidence.some(e => e.includes('[BACKTEST WARNING]'));
    expect(hasBacktestWarning).toBe(true);
    expect(result.learningEvidence[0]).toContain('Source: HISTORICAL_BACKTEST. Authority: BACKTEST_ENGINE. Execution Veto: NO.');
  });

  it('4. SYNTHETIC_SIMULATION: generates advisory simulation warning, never blocks execution', () => {
    const syntheticReviews: PostMortemReview[] = [
      {
        id: 'pm-sim-1787680000000-1',
        timestamp: Date.now() - 3600000,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.08500,
        exitPrice: 1.08000,
        stopLoss: 1.08000,
        takeProfit: 1.09500,
        pnlDollars: -50.00,
        outcome: 'LOSS',
        rootCauseMs: '...',
        rootCauseEn: 'Simulation fallback stopped out.',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 2,
        provenance: 'SYNTHETIC_SIMULATION',
        authority: 'SIMULATION_ONLY',
        dataSource: 'SYNTHETIC_FALLBACK',
        fallbackUsed: true
      }
    ];

    aiDecisionEngine.setPostMortemReviews(syntheticReviews);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.08500,
      indicators: { rsi: 60, ema50: 1.08300, adx: 26 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.08450, low: 1.08350 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).not.toBe('VETO');
    expect(result.vetoReasons.length).toBe(0);
    const hasSimWarning = result.learningEvidence.some(e => e.includes('[SIMULATION WARNING]'));
    expect(hasSimWarning).toBe(true);
  });

  it('5. Backtest records do not inflate REAL_TRADE sample size: 2 Real + 20 Backtest = Insufficient Real Sample, No Veto', () => {
    const mixedReviews: PostMortemReview[] = [
      // 2 REAL_TRADE losses (N=2 < MIN_SAMPLE_THRESHOLD of 3)
      {
        id: 'pm-real-1',
        timestamp: Date.now() - 86400000,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.08500,
        exitPrice: 1.08200,
        stopLoss: 1.08200,
        takeProfit: 1.09000,
        pnlDollars: -30.00,
        outcome: 'LOSS',
        rootCauseMs: 'Real trade loss 1',
        rootCauseEn: 'Real trade loss 1',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 3,
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      },
      {
        id: 'pm-real-2',
        timestamp: Date.now() - 43200000,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.08600,
        exitPrice: 1.08300,
        stopLoss: 1.08300,
        takeProfit: 1.09200,
        pnlDollars: -30.00,
        outcome: 'LOSS',
        rootCauseMs: 'Real trade loss 2',
        rootCauseEn: 'Real trade loss 2',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 3,
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      }
    ];

    // Add 20 BACKTEST losses
    for (let i = 0; i < 20; i++) {
      mixedReviews.push({
        id: `pm-1y-${Date.now()}-${i}`,
        timestamp: Date.now() - (i + 1) * 3600000,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.17000,
        exitPrice: 1.16500,
        stopLoss: 1.16500,
        takeProfit: 1.18000,
        pnlDollars: -50.00,
        outcome: 'LOSS',
        rootCauseMs: 'Backtest loss',
        rootCauseEn: 'Backtest loss',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 3,
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE'
      });
    }

    aiDecisionEngine.setPostMortemReviews(mixedReviews);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.08500,
      indicators: { rsi: 58, ema50: 1.08300, adx: 27 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.08450, low: 1.08350 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // Real trade sample count is 2 (< 3 threshold), so authoritative VETO must NOT fire!
    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
  });

  it('6. Genuine REAL_TRADE failure pattern (N >= 3) triggers authoritative PostgreSQL execution veto', () => {
    const authoritative3Losses: PostMortemReview[] = [
      {
        id: 'pm-real-loss-1',
        timestamp: Date.now() - 86400000 * 3,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.08500,
        exitPrice: 1.08200,
        stopLoss: 1.08200,
        takeProfit: 1.09000,
        pnlDollars: -30.00,
        outcome: 'LOSS',
        rootCauseMs: '...',
        rootCauseEn: 'Order block failure under trend reversal',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 3,
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      },
      {
        id: 'pm-real-loss-2',
        timestamp: Date.now() - 86400000 * 2,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.08600,
        exitPrice: 1.08300,
        stopLoss: 1.08300,
        takeProfit: 1.09200,
        pnlDollars: -30.00,
        outcome: 'LOSS',
        rootCauseMs: '...',
        rootCauseEn: 'Order block failure under trend reversal',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 3,
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      },
      {
        id: 'pm-real-loss-3',
        timestamp: Date.now() - 86400000 * 1,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.08700,
        exitPrice: 1.08400,
        stopLoss: 1.08400,
        takeProfit: 1.09300,
        pnlDollars: -30.00,
        outcome: 'LOSS',
        rootCauseMs: '...',
        rootCauseEn: 'Order block failure under trend reversal',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 3,
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      }
    ];

    aiDecisionEngine.setPostMortemReviews(authoritative3Losses);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.08500,
      indicators: { rsi: 58, ema50: 1.08300, adx: 27 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.08450, low: 1.08350 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // Authoritative execution veto MUST fire
    expect(result.action).toBe('VETO');
    expect(result.status).toBe('VETOED');
    expect(result.vetoReasons.length).toBeGreaterThanOrEqual(1);
    expect(result.vetoReasons[0]).toContain('[ADAPTIVE LEARNING VETO]');
    expect(result.vetoReasons[0]).toContain('Source: REAL_TRADE. Authority: POSTGRESQL.');
  });

  it('7. Backtest engine executes 1-year multi-pair simulation and assigns HISTORICAL_BACKTEST provenance', async () => {
    const engine = new BacktestEngine();
    const result = await engine.execute1YearMultiPairBacktest();

    expect(result).toBeDefined();
    expect(result?.totalPairsTested).toBe(7);
    expect(result?.overallWinRatePercent).toBeGreaterThan(0);
    expect(result?.pairSummaries.length).toBe(7);

    // Verify reviews in aiDecisionEngine carry explicit backtest provenance
    const reviews = aiDecisionEngine.getPostMortemReviews();
    const backtestPms = reviews.filter(r => r.id.startsWith('pm-1y-'));
    expect(backtestPms.length).toBeGreaterThan(0);
    backtestPms.forEach(pm => {
      expect(['HISTORICAL_BACKTEST', 'SYNTHETIC_SIMULATION']).toContain(pm.provenance);
      expect(['BACKTEST_ENGINE', 'SIMULATION_ONLY']).toContain(pm.authority);
    });
  });

  it('8. Execution safety gate remains FAIL-CLOSED with 0 broker orders', () => {
    expect((signalService as any).transmitOrder).toBeUndefined();
    expect(process.env.EXECUTION_ENVIRONMENT).not.toBe('LIVE');
  });
});
