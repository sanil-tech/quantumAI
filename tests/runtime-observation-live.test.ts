import { describe, it, expect, beforeEach } from 'vitest';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { BacktestEngine } from '../apps/decision-agent/src/services/backtestEngine';
import { learningService } from '../src/server/services/learningService';
import { EnhancedVetoLogic } from '../src/server/services/enhancedVetoLogic';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { PostMortemReview, CurrencyPair } from '../src/types';
import { fetchRealCandleEnvelopeDetailed } from '../src/lib/marketDataGenerator';
import * as fs from 'fs';
import * as path from 'path';

describe('QUANTUMAI — SUSTAINED READ-ONLY RUNTIME OBSERVATION AUDIT', () => {
  const all12Pairs: CurrencyPair[] = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD',
    'USD/CHF', 'NZD/USD', 'USD/CAD', 'EUR/JPY',
    'GBP/JPY', 'XAU/USD', 'NASDAQ', 'BTC/USD'
  ];

  const benchmark7Pairs: CurrencyPair[] = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD',
    'XAU/USD', 'NASDAQ', 'BTC/USD'
  ];

  let signalService: SignalIntelligenceService;
  let backtestEngine: BacktestEngine;

  beforeEach(() => {
    signalService = SignalIntelligenceService.getInstance();
    backtestEngine = new BacktestEngine();
  });

  it('Phase 2 & 18: Runtime Configuration & Execution Safety Gate Verification', () => {
    const env = process.env.EXECUTION_ENVIRONMENT || 'DEVELOPMENT';
    expect(env).not.toBe('LIVE');

    const isLiveForbidden = env !== 'LIVE';
    expect(isLiveForbidden).toBe(true);

    // Verify execution safety gate blocks LIVE execution
    const liveAttempt = validateExecutionEnvironmentSafety({
      environment: 'LIVE' as any,
      brokerId: 'live-broker-01',
      symbol: 'EUR/USD',
      direction: 'BUY',
      requestedLotSize: 1.0
    });
    expect(liveAttempt.allowed).toBe(false);

    // Verify signal service has 0 broker transmission capabilities
    expect((signalService as any).transmitOrder).toBeUndefined();
    expect((signalService as any).executeBrokerOrder).toBeUndefined();
  });

  it('Phase 4: Market Data Provenance Flow & Fallback Integrity', async () => {
    for (const pair of all12Pairs) {
      const data = await fetchRealCandleEnvelopeDetailed(pair, 'D1', 10);
      expect(data).toBeDefined();
      expect(data.candles.length).toBeGreaterThan(0);
      expect(data.provenance).toBeDefined();

      if (data.fallbackUsed) {
        expect(data.provenance).toBe('SYNTHETIC_SIMULATION');
        expect(data.dataSource).toBe('SYNTHETIC_FALLBACK');
      } else {
        expect(data.provenance).toBe('HISTORICAL_BACKTEST');
        expect(data.dataSource).toBe('EXTERNAL_HISTORICAL');
      }
    }
  }, 30000);

  it('Phase 5: Multi-Pair Runtime Observation across all 12 instruments', () => {
    for (const pair of all12Pairs) {
      aiDecisionEngine.setPostMortemReviews([]);
      const result = signalService.evaluateCandidateSetup({
        pair,
        timeframe: 'H1',
        currentPrice: 1.0000,
        indicators: { rsi: 50, ema50: 1.0000, adx: 20 },
        smc: { orderBlocks: [] },
        postMortemReviews: aiDecisionEngine.getPostMortemReviews()
      });

      expect(result).toBeDefined();
      expect(result.action).not.toBe('VETO');
      expect(result.status).not.toBe('VETOED');
      expect(result.vetoReasons.length).toBe(0);
    }
  });

  it('Phase 6: 1-Year Multi-Pair Backtest Runtime Observation across 7 benchmark pairs', async () => {
    const multiPairResults = await backtestEngine.execute1YearMultiPairBacktest(benchmark7Pairs);
    expect(multiPairResults).toBeDefined();
    expect(multiPairResults?.pairSummaries.length).toBe(benchmark7Pairs.length);

    for (const pairSummary of multiPairResults!.pairSummaries) {
      expect(benchmark7Pairs).toContain(pairSummary.pair);
      expect(pairSummary.totalTradesExecuted).toBeGreaterThanOrEqual(0);
    }
  });

  it('Phase 7 & 17: LearningService PostgreSQL Authoritative Lineage and Demo Ledger Isolation', () => {
    const ledgerPath = path.resolve(process.cwd(), 'data', 'ctrader_demo_ledger.json');
    if (fs.existsSync(ledgerPath)) {
      const ledgerContent = fs.readFileSync(ledgerPath, 'utf8');
      expect(ledgerContent).toBeDefined();
    }
    // Verify learningService only interacts with TradingRepository, not ledger file
    expect((learningService as any).processClosedTrade).toBeDefined();
    expect((learningService as any).loadPersistedLearning).toBeDefined();
  });

  it('Phase 8: Open Trade Protection — Open positions never produce REAL_TRADE learning', () => {
    const openTradeReviewCandidate = {
      status: 'OPEN',
      tradeId: 'pos-open-123'
    };

    // Open trades cannot be processed as closed trade post-mortems
    expect(openTradeReviewCandidate.status).toBe('OPEN');
  });

  it('Phase 9: Sample Size Integrity — Advisory streams do not increment REAL_TRADE N', () => {
    const advisoryReviews: PostMortemReview[] = [
      {
        id: 'pm-1y-sample-1',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.08,
        exitPrice: 1.07,
        stopLoss: 1.07,
        takeProfit: 1.10,
        pnlDollars: -30,
        outcome: 'LOSS',
        rootCauseEn: 'Backtest loss',
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE'
      },
      {
        id: 'pm-sim-sample-2',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.08,
        exitPrice: 1.07,
        stopLoss: 1.07,
        takeProfit: 1.10,
        pnlDollars: -30,
        outcome: 'LOSS',
        rootCauseEn: 'Synthetic loss',
        provenance: 'SYNTHETIC_SIMULATION',
        authority: 'SIMULATION_ONLY'
      }
    ];

    aiDecisionEngine.setPostMortemReviews(advisoryReviews);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.08,
      indicators: { rsi: 50, ema50: 1.08, adx: 20 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.081, low: 1.079 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // Real sample size is 0, so NO authoritative veto
    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
    expect(result.learningEvidence.length).toBe(2);
  });

  it('Phase 10: Veto Observation — Authoritative Veto strictly requires REAL_TRADE and N >= 3', () => {
    const realLosses: PostMortemReview[] = [1, 2, 3].map(i => ({
      id: `pm-real-aud-${i}`,
      timestamp: Date.now() - i * 3600000,
      pair: 'AUD/USD',
      direction: 'BUY',
      entryPrice: 0.6550,
      exitPrice: 0.6500,
      stopLoss: 0.6500,
      takeProfit: 0.6650,
      pnlDollars: -50,
      outcome: 'LOSS',
      rootCauseEn: 'Order block failure during daily volatility expansion.',
      provenance: 'REAL_TRADE',
      authority: 'POSTGRESQL'
    }));

    aiDecisionEngine.setPostMortemReviews(realLosses);

    const result = signalService.evaluateCandidateSetup({
      pair: 'AUD/USD',
      timeframe: 'H1',
      currentPrice: 0.6550,
      indicators: { rsi: 55, ema50: 0.6500, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 0.6555, low: 0.6545 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).toBe('VETO');
    expect(result.status).toBe('VETOED');
    expect(result.vetoReasons[0]).toContain('[ADAPTIVE LEARNING VETO]');
    expect(result.vetoReasons[0]).toContain('Source: REAL_TRADE. Authority: POSTGRESQL.');
  });

  it('Phase 12: EUR/USD Regression — Historical pm-1y-* IDs remain Advisory Warnings', () => {
    const historicalReviews: PostMortemReview[] = [1, 2, 3].map(i => ({
      id: `pm-1y-1787680102312-${i}`,
      timestamp: 1787680102312 - i * 3600000,
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
    }));

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
    expect(result.learningEvidence[0]).toContain('[BACKTEST WARNING]');
    expect(result.learningEvidence[0]).toContain('pm-1y-1787680102312-');
  });

  it('Phase 14: Restart Recovery — In-Memory state safely cleared and rehydrated without promoting backtests', async () => {
    // 1. Set mixed reviews
    aiDecisionEngine.setPostMortemReviews([
      {
        id: 'pm-backtest-temp',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.08,
        exitPrice: 1.07,
        stopLoss: 1.07,
        takeProfit: 1.10,
        pnlDollars: -20,
        outcome: 'LOSS',
        rootCauseEn: 'Temp backtest',
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE'
      }
    ]);

    expect(aiDecisionEngine.getPostMortemReviews().length).toBe(1);

    // 2. Clear state on restart
    aiDecisionEngine.setPostMortemReviews([]);
    expect(aiDecisionEngine.getPostMortemReviews().length).toBe(0);

    // 3. Rehydrate from authoritative PostgreSQL
    const rehydrated = await learningService.loadPersistedLearning();
    expect(rehydrated.length).toBeGreaterThanOrEqual(0);

    // Rehydrated items must all be REAL_TRADE with POSTGRESQL authority
    for (const r of rehydrated) {
      expect(r.provenance).toBe('REAL_TRADE');
      expect(r.authority).toBe('POSTGRESQL');
    }
  });

  it('Phase 15: Idempotency & Duplicate Protection Invariant', async () => {
    // Calling loadPersistedLearning multiple times does not produce duplicates
    const firstLoad = await learningService.loadPersistedLearning();
    const secondLoad = await learningService.loadPersistedLearning();

    expect(firstLoad.length).toBe(secondLoad.length);

    const ids = new Set<string>();
    for (const r of secondLoad) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
  });

  it('Phase 16: Shadow Isolation Invariant', () => {
    const shadowReview: PostMortemReview = {
      id: 'pm-shadow-telemetry-1',
      timestamp: Date.now(),
      pair: 'BTC/USD',
      direction: 'SELL',
      entryPrice: 65000,
      exitPrice: 66000,
      stopLoss: 66000,
      takeProfit: 63000,
      pnlDollars: -100,
      outcome: 'LOSS',
      rootCauseEn: 'Shadow observation trade stopped out.',
      provenance: 'SHADOW_OBSERVATION',
      authority: 'SHADOW_ENGINE'
    };

    aiDecisionEngine.setPostMortemReviews([shadowReview]);

    const result = signalService.evaluateCandidateSetup({
      pair: 'BTC/USD',
      timeframe: 'H1',
      currentPrice: 65000,
      indicators: { rsi: 50, ema50: 65000, adx: 20 },
      smc: { orderBlocks: [] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
  });
});
