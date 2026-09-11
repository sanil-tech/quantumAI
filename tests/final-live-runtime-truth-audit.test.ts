import { describe, it, expect, beforeEach } from 'vitest';
import { TradingRepository } from '@iati/database';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { learningService } from '../src/server/services/learningService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { CurrencyPair, PostMortemReview } from '../src/types';

const CONFIGURED_PAIRS: CurrencyPair[] = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CHF',
  'NZD/USD',
  'USD/CAD',
  'EUR/JPY',
  'GBP/JPY',
  'XAU/USD',
  'NASDAQ',
  'BTC/USD'
];

describe('QUANTUMAI — FINAL LIVE RUNTIME TRUTH AUDIT SUITE', () => {
  let signalService: SignalIntelligenceService;
  let repo: TradingRepository;

  beforeEach(() => {
    signalService = SignalIntelligenceService.getInstance();
    repo = new TradingRepository();
    aiDecisionEngine.setPostMortemReviews([]);
  });

  it('1. PostgreSQL Direct Query & Baseline Invariant', async () => {
    const posRes = await repo.query('SELECT position_id, symbol, status, realized_profit, opened_at, closed_at FROM positions ORDER BY opened_at ASC');
    expect(posRes.rows.length).toBe(4);

    const openPositions = posRes.rows.filter(r => r.status === 'OPEN');
    const closedPositions = posRes.rows.filter(r => r.status === 'CLOSED');
    expect(openPositions.length).toBe(2);
    expect(closedPositions.length).toBe(2);

    const pmRes = await repo.query('SELECT id, trade_id, learning_version, review FROM post_mortem_reviews ORDER BY created_at ASC');
    expect(pmRes.rows.length).toBe(2);

    pmRes.rows.forEach(row => {
      const rev = typeof row.review === 'string' ? JSON.parse(row.review) : row.review;
      expect(rev.outcome).toBe('WIN');
      expect(row.learning_version).toBe('1.0');
      // Ensure linked to a CLOSED position
      const matchingPos = closedPositions.find(p => p.position_id === row.trade_id);
      expect(matchingPos).toBeDefined();
      expect(matchingPos.status).toBe('CLOSED');
    });
  });

  it('2. Runtime Signal Path & Rehydrated PostgreSQL State', async () => {
    // Rehydrate learning service directly from database
    const persistedReviews = await learningService.loadPersistedLearning();
    expect(persistedReviews.length).toBe(2);
    for (const r of persistedReviews) {
      expect(r.provenance).toBe('REAL_TRADE');
      expect(r.authority).toBe('POSTGRESQL');
      expect(r.dataSource).toBe('POSTGRESQL_CLOSED_POSITION');
      expect(r.outcome).toBe('WIN');
    }

    // Set rehydrated reviews into decision engine
    aiDecisionEngine.setPostMortemReviews(persistedReviews);

    // Evaluate EUR/USD under current market conditions
    const evalResult = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // Invariant: N=2 (both wins) MUST NOT produce a veto
    expect(evalResult.action).not.toBe('VETO');
    expect(evalResult.status).not.toBe('VETOED');
    expect(evalResult.vetoReasons.length).toBe(0);
    expect(evalResult.learningEvidence.some(e => e.includes('[ADAPTIVE LEARNING VETO]'))).toBe(false);
  });

  it('3. Current Veto Inventory Across All 12 Configured Pairs', async () => {
    const persisted = await learningService.loadPersistedLearning();
    aiDecisionEngine.setPostMortemReviews(persisted);

    for (const pair of CONFIGURED_PAIRS) {
      const evalResult = signalService.evaluateCandidateSetup({
        pair,
        timeframe: 'H1',
        currentPrice: 1.0850,
        indicators: { rsi: 50, ema50: 1.0800, adx: 20 },
        smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
        postMortemReviews: aiDecisionEngine.getPostMortemReviews()
      });

      // No pair in current live state has >= 3 losses, so NO pair should be vetoed
      expect(evalResult.action).not.toBe('VETO');
      expect(evalResult.status).not.toBe('VETOED');
      expect(evalResult.vetoReasons.length).toBe(0);
    }
  });

  it('4. Hard Invariant: [ADAPTIVE LEARNING VETO] Requires 3+ Real Losses', () => {
    // 2 Real losses (N=2)
    const twoRealLosses: PostMortemReview[] = [1, 2].map(i => ({
      id: `pm-real-test-2l-${i}`,
      timestamp: Date.now() - i * 3600000,
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0800,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: -45.00,
      outcome: 'LOSS',
      rootCauseEn: 'Order block failure during daily volatility expansion.',
      provenance: 'REAL_TRADE',
      authority: 'POSTGRESQL',
      dataSource: 'POSTGRESQL_CLOSED_POSITION'
    }));

    aiDecisionEngine.setPostMortemReviews(twoRealLosses);

    const result2 = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // N=2 MUST NOT VETO
    expect(result2.action).not.toBe('VETO');
    expect(result2.status).not.toBe('VETOED');

    // Add 3rd Real loss (N=3)
    const threeRealLosses: PostMortemReview[] = [
      ...twoRealLosses,
      {
        id: 'pm-real-test-2l-3',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -45.00,
        outcome: 'LOSS',
        rootCauseEn: 'Order block failure during daily volatility expansion.',
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL',
        dataSource: 'POSTGRESQL_CLOSED_POSITION'
      }
    ];

    aiDecisionEngine.setPostMortemReviews(threeRealLosses);

    const result3 = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // N=3 MUST VETO
    expect(result3.action).toBe('VETO');
    expect(result3.status).toBe('VETOED');
    expect(result3.vetoReasons[0]).toContain('[ADAPTIVE LEARNING VETO]');
  });

  it('5. Historical pm-1y Records Remain Non-Blocking Advisory Warnings', () => {
    const historicalReviews: PostMortemReview[] = [
      {
        id: 'pm-1y-1787680102312-36',
        timestamp: 1787680102312,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.17385,
        exitPrice: 1.16770,
        stopLoss: 1.16770,
        takeProfit: 1.18500,
        pnlDollars: -45.00,
        outcome: 'LOSS',
        rootCauseEn: '1-Year Backtest Evaluation: BUY setup on EUR/USD stopped out at SL 1.16770 during daily volatility expansion.',
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE'
      },
      {
        id: 'pm-1y-1787679502288-36',
        timestamp: 1787679502288,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.17385,
        exitPrice: 1.16770,
        stopLoss: 1.16770,
        takeProfit: 1.18500,
        pnlDollars: -45.00,
        outcome: 'LOSS',
        rootCauseEn: '1-Year Backtest Evaluation: BUY setup on EUR/USD stopped out at SL 1.16770 during daily volatility expansion.',
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE'
      },
      {
        id: 'pm-1y-1787678903133-36',
        timestamp: 1787678903133,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.17385,
        exitPrice: 1.16770,
        stopLoss: 1.16770,
        takeProfit: 1.18500,
        pnlDollars: -45.00,
        outcome: 'LOSS',
        rootCauseEn: '1-Year Backtest Evaluation: BUY setup on EUR/USD stopped out at SL 1.16770 during daily volatility expansion.',
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE'
      }
    ];

    aiDecisionEngine.setPostMortemReviews(historicalReviews);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.1750,
      indicators: { rsi: 58, ema50: 1.1720, adx: 28 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.1745, low: 1.1735 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
    expect(result.learningEvidence.some(e => e.includes('[BACKTEST WARNING]'))).toBe(true);
    expect(result.learningEvidence.some(e => e.includes('[ADAPTIVE LEARNING VETO]'))).toBe(false);
  });

  it('6. Execution Safety Remains Strictly Fail-Closed', () => {
    const safetyCheck = validateExecutionEnvironmentSafety({
      environment: 'LIVE' as any,
      brokerId: 'live-broker',
      symbol: 'EUR/USD',
      direction: 'BUY',
      requestedLotSize: 1.0
    });

    expect(safetyCheck.allowed).toBe(false);
    expect(safetyCheck.reason).toContain('LIVE execution rejected');
  });
});
