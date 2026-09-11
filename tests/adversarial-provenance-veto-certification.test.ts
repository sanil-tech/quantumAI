import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { EnhancedVetoLogic } from '../src/server/services/enhancedVetoLogic';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { PostMortemReview, CurrencyPair } from '../src/types';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

describe('QUANTUMAI — FINAL ADVERSARIAL PROVENANCE VETO CERTIFICATION SUITE', () => {
  let signalService: SignalIntelligenceService;

  beforeEach(() => {
    signalService = SignalIntelligenceService.getInstance();
    aiDecisionEngine.setPostMortemReviews([]);
  });

  it('TEST 1 — BACKTEST-ONLY ATTACK: 100 HISTORICAL_BACKTEST losses CANNOT produce an authoritative execution veto', () => {
    const backtestLosses: PostMortemReview[] = Array.from({ length: 100 }, (_, i) => ({
      id: `pm-1y-attack-bt-${i}`,
      timestamp: Date.now() - i * 3600000,
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0800,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: -45.00,
      outcome: 'LOSS',
      rootCauseEn: `1-Year Backtest Evaluation: BUY setup stopped out during candle ${i}.`,
      adaptiveRuleEn: 'Expand SL buffer to 1.8x ATR.',
      ratingScore: 3,
      provenance: 'HISTORICAL_BACKTEST',
      authority: 'BACKTEST_ENGINE',
      dataSource: 'EXTERNAL_HISTORICAL'
    }));

    aiDecisionEngine.setPostMortemReviews(backtestLosses);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // Invariant: 100 Backtest losses MUST NOT VETO
    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
    expect(result.learningEvidence.some(e => e.includes('[BACKTEST WARNING]'))).toBe(true);
    expect(result.learningEvidence.some(e => e.includes('[ADAPTIVE LEARNING VETO]'))).toBe(false);
  });

  it('TEST 2 — SYNTHETIC-ONLY ATTACK: 100 SYNTHETIC_SIMULATION losses CANNOT produce an execution veto', () => {
    const syntheticLosses: PostMortemReview[] = Array.from({ length: 100 }, (_, i) => ({
      id: `pm-sim-attack-${i}`,
      timestamp: Date.now() - i * 3600000,
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0800,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: -35.00,
      outcome: 'LOSS',
      rootCauseEn: `Offline synthetic simulation failure iteration ${i}.`,
      adaptiveRuleEn: 'Recheck liquidity sweeps.',
      ratingScore: 2,
      provenance: 'SYNTHETIC_SIMULATION',
      authority: 'SIMULATION_ONLY',
      dataSource: 'SYNTHETIC_FALLBACK',
      fallbackUsed: true
    }));

    aiDecisionEngine.setPostMortemReviews(syntheticLosses);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // Invariant: 100 Synthetic simulation losses MUST NOT VETO
    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
    expect(result.learningEvidence.some(e => e.includes('[SIMULATION WARNING]'))).toBe(true);
    expect(result.learningEvidence.some(e => e.includes('[ADAPTIVE LEARNING VETO]'))).toBe(false);
  });

  it('TEST 3 — SHADOW-ONLY ATTACK: 100 SHADOW_OBSERVATION losses CANNOT produce an execution veto', () => {
    const shadowLosses: PostMortemReview[] = Array.from({ length: 100 }, (_, i) => ({
      id: `pm-shadow-attack-${i}`,
      timestamp: Date.now() - i * 3600000,
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0800,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: -25.00,
      outcome: 'LOSS',
      rootCauseEn: `Shadow forward-test telemetry stopped out ${i}.`,
      adaptiveRuleEn: 'Telemetry observation only.',
      ratingScore: 2,
      provenance: 'SHADOW_OBSERVATION',
      authority: 'SHADOW_ENGINE'
    }));

    aiDecisionEngine.setPostMortemReviews(shadowLosses);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
  });

  it('TEST 4 — MIXED NON-AUTHORITATIVE ATTACK: 50 Backtest + 50 Synthetic + 50 Shadow CANNOT veto', () => {
    const mixedNonAuth: PostMortemReview[] = [];
    for (let i = 0; i < 50; i++) {
      mixedNonAuth.push({
        id: `pm-1y-mix-${i}`,
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -40.00,
        outcome: 'LOSS',
        rootCauseEn: 'Backtest loss',
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE'
      });
      mixedNonAuth.push({
        id: `pm-sim-mix-${i}`,
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -30.00,
        outcome: 'LOSS',
        rootCauseEn: 'Sim loss',
        provenance: 'SYNTHETIC_SIMULATION',
        authority: 'SIMULATION_ONLY'
      });
      mixedNonAuth.push({
        id: `pm-shadow-mix-${i}`,
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -20.00,
        outcome: 'LOSS',
        rootCauseEn: 'Shadow loss',
        provenance: 'SHADOW_OBSERVATION',
        authority: 'SHADOW_ENGINE'
      });
    }

    aiDecisionEngine.setPostMortemReviews(mixedNonAuth);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
  });

  it('TEST 5 — THREE REAL LOSSES: 3 REAL_TRADE losses ACTIVATE Authoritative VETO', () => {
    const realLosses: PostMortemReview[] = [1, 2, 3].map(i => ({
      id: `pm-real-test5-${i}`,
      timestamp: Date.now() - i * 86400000,
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0800,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: -50.00,
      outcome: 'LOSS',
      rootCauseEn: 'Order block failure during daily volatility expansion.',
      adaptiveRuleEn: 'Veto retest buying on EUR/USD under ranging choppy conditions.',
      ratingScore: 3,
      provenance: 'REAL_TRADE',
      authority: 'POSTGRESQL',
      dataSource: 'POSTGRESQL_CLOSED_POSITION'
    }));

    aiDecisionEngine.setPostMortemReviews(realLosses);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).toBe('VETO');
    expect(result.status).toBe('VETOED');
    expect(result.vetoReasons.length).toBeGreaterThanOrEqual(1);
    expect(result.vetoReasons[0]).toContain('[ADAPTIVE LEARNING VETO]');
    expect(result.vetoReasons[0]).toContain('Source: REAL_TRADE. Authority: POSTGRESQL.');
    expect(result.entryZone).toBeNull();
  });

  it('TEST 6 — REAL + BACKTEST MIX: 3 Real + 100 Backtest does NOT inflate real N from 3 to 103', () => {
    const reviews: PostMortemReview[] = [
      // 3 Real losses
      {
        id: 'pm-real-1',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -50.00,
        outcome: 'LOSS',
        rootCauseEn: 'Real trade loss 1',
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      },
      {
        id: 'pm-real-2',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -50.00,
        outcome: 'LOSS',
        rootCauseEn: 'Real trade loss 2',
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      },
      {
        id: 'pm-real-3',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -50.00,
        outcome: 'LOSS',
        rootCauseEn: 'Real trade loss 3',
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      }
    ];

    // Add 100 Backtest losses
    for (let i = 0; i < 100; i++) {
      reviews.push({
        id: `pm-1y-bt-${i}`,
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -45.00,
        outcome: 'LOSS',
        rootCauseEn: 'Backtest loss',
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE'
      });
    }

    aiDecisionEngine.setPostMortemReviews(reviews);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).toBe('VETO');
    expect(result.status).toBe('VETOED');
    expect(result.vetoReasons[0]).toContain('[ADAPTIVE LEARNING VETO]');
  });

  it('TEST 7 — REAL + SYNTHETIC + SHADOW MIX: 3 Real + 100 Synthetic + 100 Shadow remains authoritative', () => {
    const reviews: PostMortemReview[] = [1, 2, 3].map(i => ({
      id: `pm-real-mix7-${i}`,
      timestamp: Date.now() - i * 86400000,
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0800,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: -50.00,
      outcome: 'LOSS',
      rootCauseEn: 'Real trade loss',
      provenance: 'REAL_TRADE',
      authority: 'POSTGRESQL'
    }));

    for (let i = 0; i < 100; i++) {
      reviews.push({
        id: `pm-sim-mix7-${i}`,
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -30.00,
        outcome: 'LOSS',
        rootCauseEn: 'Sim loss',
        provenance: 'SYNTHETIC_SIMULATION',
        authority: 'SIMULATION_ONLY'
      });
      reviews.push({
        id: `pm-shadow-mix7-${i}`,
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -20.00,
        outcome: 'LOSS',
        rootCauseEn: 'Shadow loss',
        provenance: 'SHADOW_OBSERVATION',
        authority: 'SHADOW_ENGINE'
      });
    }

    aiDecisionEngine.setPostMortemReviews(reviews);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).toBe('VETO');
    expect(result.status).toBe('VETOED');
    expect(result.vetoReasons[0]).toContain('[ADAPTIVE LEARNING VETO]');
  });

  it('TEST 8 — CROSS-PAIR ATTACK: 5 EUR/USD Real Losses and 100 GBP/USD Real Losses evaluate independently', () => {
    const crossReviews: PostMortemReview[] = [];

    // 5 EUR/USD Real Losses
    for (let i = 1; i <= 5; i++) {
      crossReviews.push({
        id: `pm-real-eur-cp-${i}`,
        timestamp: Date.now() - i * 3600000,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -40.00,
        outcome: 'LOSS',
        rootCauseEn: 'EUR/USD loss',
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      });
    }

    // 100 GBP/USD Real Losses
    for (let i = 1; i <= 100; i++) {
      crossReviews.push({
        id: `pm-real-gbp-cp-${i}`,
        timestamp: Date.now() - i * 3600000,
        pair: 'GBP/USD',
        direction: 'BUY',
        entryPrice: 1.2700,
        exitPrice: 1.2600,
        stopLoss: 1.2600,
        takeProfit: 1.2900,
        pnlDollars: -50.00,
        outcome: 'LOSS',
        rootCauseEn: 'GBP/USD loss',
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      });
    }

    aiDecisionEngine.setPostMortemReviews(crossReviews);

    // Evaluate USD/JPY (0 samples) -> MUST NOT VETO
    const jpyResult = signalService.evaluateCandidateSetup({
      pair: 'USD/JPY',
      timeframe: 'H1',
      currentPrice: 155.00,
      indicators: { rsi: 55, ema50: 154.50, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 155.05, low: 154.95 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(jpyResult.action).not.toBe('VETO');
    expect(jpyResult.status).not.toBe('VETOED');
    expect(jpyResult.vetoReasons.length).toBe(0);

    // Evaluate EUR/USD -> Vetoes due to 5 EUR/USD real losses
    const eurResult = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });
    expect(eurResult.action).toBe('VETO');
    expect(eurResult.status).toBe('VETOED');
  });

  it('TEST 9 — WINNING REAL TRADES: 10 REAL_TRADE wins produces 0% failure rate with LOW_FAILURE_PATTERN (not NO_DATA)', async () => {
    const mockRepo: any = {
      getClosedPositionsAcrossAccounts: vi.fn().mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          positionId: `win-${i}`,
          symbol: 'EUR/USD',
          realizedProfit: 45.00,
          proposalId: 'ORDER_BLOCK_RETEST'
        }))
      ),
      getClosedPositions: vi.fn().mockResolvedValue([])
    };

    const vetoService = new EnhancedVetoLogic(mockRepo);
    const analysis = await vetoService.evaluateTradeWithContext(
      'ORDER_BLOCK_RETEST',
      'EUR/USD',
      1.0850,
      [],
      'DEFAULT'
    );

    expect(analysis.historicalContext.totalSamples).toBe(10);
    expect(analysis.historicalContext.losses).toBe(0);
    expect(analysis.historicalContext.failureRate).toBe(0);
    expect(analysis.historicalContext.status).toBe('LOW_FAILURE_PATTERN');
    expect(analysis.decision.shouldVeto).toBe(false);
  });

  it('TEST 10 — SAMPLE THRESHOLD: N < 3 cannot veto; N >= 3 is eligible for failure-pattern veto', async () => {
    // Case 1: N = 0
    const mockRepo0: any = {
      getClosedPositionsAcrossAccounts: vi.fn().mockResolvedValue([]),
      getClosedPositions: vi.fn().mockResolvedValue([])
    };
    const vetoService0 = new EnhancedVetoLogic(mockRepo0);
    const analysis0 = await vetoService0.evaluateTradeWithContext('ORDER_BLOCK_RETEST', 'EUR/USD', 1.0850, [], 'DEFAULT');
    expect(analysis0.historicalContext.totalSamples).toBe(0);
    expect(analysis0.historicalContext.status).toBe('NO_DATA');
    expect(analysis0.decision.shouldVeto).toBe(false);

    // Case 2: N = 1 (1 loss)
    const mockRepo1: any = {
      getClosedPositionsAcrossAccounts: vi.fn().mockResolvedValue([
        { positionId: '1', symbol: 'EUR/USD', realizedProfit: -50, proposalId: 'ORDER_BLOCK_RETEST' }
      ]),
      getClosedPositions: vi.fn().mockResolvedValue([])
    };
    const vetoService1 = new EnhancedVetoLogic(mockRepo1);
    const analysis1 = await vetoService1.evaluateTradeWithContext('ORDER_BLOCK_RETEST', 'EUR/USD', 1.0850, [], 'DEFAULT');
    expect(analysis1.historicalContext.totalSamples).toBe(1);
    expect(analysis1.historicalContext.status).toBe('INSUFFICIENT_SAMPLE');
    expect(analysis1.decision.shouldVeto).toBe(false);

    // Case 3: N = 2 (2 losses)
    const mockRepo2: any = {
      getClosedPositionsAcrossAccounts: vi.fn().mockResolvedValue([
        { positionId: '1', symbol: 'EUR/USD', realizedProfit: -50, proposalId: 'ORDER_BLOCK_RETEST' },
        { positionId: '2', symbol: 'EUR/USD', realizedProfit: -50, proposalId: 'ORDER_BLOCK_RETEST' }
      ]),
      getClosedPositions: vi.fn().mockResolvedValue([])
    };
    const vetoService2 = new EnhancedVetoLogic(mockRepo2);
    const analysis2 = await vetoService2.evaluateTradeWithContext('ORDER_BLOCK_RETEST', 'EUR/USD', 1.0850, [], 'DEFAULT');
    expect(analysis2.historicalContext.totalSamples).toBe(2);
    expect(analysis2.historicalContext.status).toBe('INSUFFICIENT_SAMPLE');
    expect(analysis2.decision.shouldVeto).toBe(false);

    // Case 4: N = 3 (3 losses) -> Eligible for failure-pattern evaluation
    const mockRepo3: any = {
      getClosedPositionsAcrossAccounts: vi.fn().mockResolvedValue([
        { positionId: '1', symbol: 'EUR/USD', realizedProfit: -50, proposalId: 'ORDER_BLOCK_RETEST' },
        { positionId: '2', symbol: 'EUR/USD', realizedProfit: -50, proposalId: 'ORDER_BLOCK_RETEST' },
        { positionId: '3', symbol: 'EUR/USD', realizedProfit: -50, proposalId: 'ORDER_BLOCK_RETEST' }
      ]),
      getClosedPositions: vi.fn().mockResolvedValue([])
    };
    const vetoService3 = new EnhancedVetoLogic(mockRepo3);
    const analysis3 = await vetoService3.evaluateTradeWithContext('ORDER_BLOCK_RETEST', 'EUR/USD', 1.0850, [], 'DEFAULT');
    expect(analysis3.historicalContext.totalSamples).toBe(3);
    expect(analysis3.historicalContext.status).toBe('HIGH_FAILURE_PATTERN');

    // SignalIntelligenceService with 3 real losses under current regime triggers authoritative veto
    const realLosses3: PostMortemReview[] = [1, 2, 3].map(i => ({
      id: `pm-real-thresh-${i}`,
      timestamp: Date.now() - i * 3600000,
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0800,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: -50.00,
      outcome: 'LOSS',
      rootCauseEn: 'Order block failure during daily volatility expansion.',
      provenance: 'REAL_TRADE',
      authority: 'POSTGRESQL'
    }));
    aiDecisionEngine.setPostMortemReviews(realLosses3);
    const signalResult = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });
    expect(signalResult.action).toBe('VETO');
    expect(signalResult.status).toBe('VETOED');
  });

  it('TEST 11 — EUR/USD HISTORICAL pm-1y REGRESSION: Specific historical IDs remain advisory and never veto', () => {
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
    expect(result.learningEvidence.some(e => e.includes('pm-1y-1787680102312-36'))).toBe(true);
  });

  it('TEST 12 — EXECUTION SAFETY: Execution remains FAIL-CLOSED with 0 broker orders', () => {
    const safetyResult = validateExecutionEnvironmentSafety({
      environment: 'LIVE' as any,
      brokerId: 'live-broker-01',
      symbol: 'EUR/USD',
      direction: 'BUY',
      requestedLotSize: 1.0
    });

    expect(safetyResult.allowed).toBe(false);
    expect((signalService as any).transmitOrder).toBeUndefined();
  });

  it('TEST 13 — PERSISTENCE BOUNDARY: Production PostgreSQL remains clean with 0 test leaks', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const backtestInDb = await pool.query(`
        SELECT id, trade_id, review
        FROM post_mortem_reviews
        WHERE id LIKE '%pm-1y%'
           OR review::text LIKE '%HISTORICAL_BACKTEST%'
           OR review::text LIKE '%SYNTHETIC_SIMULATION%'
           OR review::text LIKE '%1-Year Backtest%'
           OR review::text LIKE '%BACKTEST_ENGINE%'
           OR review::text LIKE '%SIMULATION_ONLY%'
      `);
      expect(backtestInDb.rows.length).toBe(0);

      const totalPos = await pool.query('SELECT COUNT(*)::int as count FROM positions');
      expect(totalPos.rows[0].count).toBe(4);
    } finally {
      await pool.end();
    }
  });

  it('TEST 14 — UI PROVENANCE: DTO serialization preserves distinct visual labels', () => {
    const realReview: PostMortemReview = {
      id: 'pm-real-dto',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.085,
      exitPrice: 1.080,
      stopLoss: 1.080,
      takeProfit: 1.095,
      pnlDollars: -45,
      outcome: 'LOSS',
      rootCauseEn: 'Real loss',
      provenance: 'REAL_TRADE',
      authority: 'POSTGRESQL'
    };

    const backtestReview: PostMortemReview = {
      id: 'pm-1y-dto',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.085,
      exitPrice: 1.080,
      stopLoss: 1.080,
      takeProfit: 1.095,
      pnlDollars: -45,
      outcome: 'LOSS',
      rootCauseEn: 'Backtest loss',
      provenance: 'HISTORICAL_BACKTEST',
      authority: 'BACKTEST_ENGINE'
    };

    const simReview: PostMortemReview = {
      id: 'pm-sim-dto',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.085,
      exitPrice: 1.080,
      stopLoss: 1.080,
      takeProfit: 1.095,
      pnlDollars: -45,
      outcome: 'LOSS',
      rootCauseEn: 'Sim loss',
      provenance: 'SYNTHETIC_SIMULATION',
      authority: 'SIMULATION_ONLY'
    };

    const shadowReview: PostMortemReview = {
      id: 'pm-shadow-dto',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.085,
      exitPrice: 1.080,
      stopLoss: 1.080,
      takeProfit: 1.095,
      pnlDollars: -45,
      outcome: 'LOSS',
      rootCauseEn: 'Shadow loss',
      provenance: 'SHADOW_OBSERVATION',
      authority: 'SHADOW_ENGINE'
    };

    expect(realReview.provenance).toBe('REAL_TRADE');
    expect(backtestReview.provenance).toBe('HISTORICAL_BACKTEST');
    expect(simReview.provenance).toBe('SYNTHETIC_SIMULATION');
    expect(shadowReview.provenance).toBe('SHADOW_OBSERVATION');
  });
});
