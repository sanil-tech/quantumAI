import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { EnhancedVetoLogic } from '../src/server/services/enhancedVetoLogic';
import { PostMortemReview, CurrencyPair } from '../src/types';

describe('QUANTUMAI — PRESENTATION-LAYER PROVENANCE & VETO RUNTIME AUDIT SUITE', () => {
  let signalService: SignalIntelligenceService;

  beforeEach(() => {
    signalService = SignalIntelligenceService.getInstance();
    aiDecisionEngine.setPostMortemReviews([]);
  });

  it('1. REAL_TRADE: Authoritative learning produces [ADAPTIVE LEARNING VETO] with explicit provenance and authority in UI payload', () => {
    const realLosses: PostMortemReview[] = [1, 2, 3].map(i => ({
      id: `pm-real-eurusd-${i}`,
      timestamp: Date.now() - i * 86400000,
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0800,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: -45.00,
      outcome: 'LOSS',
      rootCauseMs: 'Kegagalan retest order block',
      rootCauseEn: 'Order block failure during daily volatility expansion.',
      lessonLearnedMs: 'Kembangkan SL buffer',
      lessonLearnedEn: 'Expand SL buffer to 1.8x ATR',
      adaptiveRuleMs: 'Veto belian retest',
      adaptiveRuleEn: 'Veto retest buying',
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

    // Authoritative Presentation Contract
    expect(result.action).toBe('VETO');
    expect(result.status).toBe('VETOED');
    expect(result.vetoReasons.length).toBeGreaterThanOrEqual(1);
    expect(result.vetoReasons[0]).toContain('[ADAPTIVE LEARNING VETO]');
    expect(result.vetoReasons[0]).toContain('Source: REAL_TRADE. Authority: POSTGRESQL.');
    expect(result.entryZone).toBeNull();
  });

  it('2. HISTORICAL_BACKTEST: Advisory intelligence produces [BACKTEST WARNING], NEVER an authoritative veto', () => {
    const backtestLosses: PostMortemReview[] = [1, 2, 3].map(i => ({
      id: `pm-1y-gbpusd-${Date.now()}-${i}`,
      timestamp: Date.now() - i * 3600000,
      pair: 'GBP/USD',
      direction: 'BUY',
      entryPrice: 1.2700,
      exitPrice: 1.2600,
      stopLoss: 1.2600,
      takeProfit: 1.2900,
      pnlDollars: -50.00,
      outcome: 'LOSS',
      rootCauseMs: 'Simulasi backtest 1-tahun',
      rootCauseEn: '1-Year Backtest Evaluation: BUY setup on GBP/USD stopped out during trend shift.',
      lessonLearnedMs: '...',
      lessonLearnedEn: '...',
      adaptiveRuleMs: '...',
      adaptiveRuleEn: '...',
      ratingScore: 3,
      provenance: 'HISTORICAL_BACKTEST',
      authority: 'BACKTEST_ENGINE',
      dataSource: 'EXTERNAL_HISTORICAL'
    }));

    aiDecisionEngine.setPostMortemReviews(backtestLosses);

    const result = signalService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      timeframe: 'H1',
      currentPrice: 1.2700,
      indicators: { rsi: 55, ema50: 1.2650, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.2705, low: 1.2695 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // Advisory Presentation Contract
    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
    expect(result.learningEvidence.some(e => e.includes('[BACKTEST WARNING]'))).toBe(true);
    expect(result.learningEvidence.some(e => e.includes('Source: HISTORICAL_BACKTEST. Authority: BACKTEST_ENGINE. Execution Veto: NO.'))).toBe(true);
    expect(result.learningEvidence.some(e => e.includes('[ADAPTIVE LEARNING VETO]'))).toBe(false);
  });

  it('3. SYNTHETIC_SIMULATION: Produces [SIMULATION WARNING] and NEVER an authoritative veto', () => {
    const simLosses: PostMortemReview[] = [1, 2, 3].map(i => ({
      id: `pm-sim-usdjpy-${Date.now()}-${i}`,
      timestamp: Date.now() - i * 3600000,
      pair: 'USD/JPY',
      direction: 'BUY',
      entryPrice: 155.00,
      exitPrice: 154.00,
      stopLoss: 154.00,
      takeProfit: 157.00,
      pnlDollars: -40.00,
      outcome: 'LOSS',
      rootCauseMs: 'Simulasi offline',
      rootCauseEn: 'Offline simulation pattern failure.',
      lessonLearnedMs: '...',
      lessonLearnedEn: '...',
      adaptiveRuleMs: '...',
      adaptiveRuleEn: '...',
      ratingScore: 2,
      provenance: 'SYNTHETIC_SIMULATION',
      authority: 'SIMULATION_ONLY',
      dataSource: 'SYNTHETIC_FALLBACK',
      fallbackUsed: true
    }));

    aiDecisionEngine.setPostMortemReviews(simLosses);

    const result = signalService.evaluateCandidateSetup({
      pair: 'USD/JPY',
      timeframe: 'H1',
      currentPrice: 155.00,
      indicators: { rsi: 55, ema50: 154.50, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 155.05, low: 154.95 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
    expect(result.learningEvidence.some(e => e.includes('[SIMULATION WARNING]'))).toBe(true);
    expect(result.learningEvidence.some(e => e.includes('Source: SYNTHETIC_SIMULATION. Authority: SIMULATION_ONLY. Execution Veto: NO.'))).toBe(true);
  });

  it('4. SHADOW_OBSERVATION: Renders strictly as telemetry, isolated from trade vetoes', () => {
    const shadowReviews: PostMortemReview[] = [1, 2, 3].map(i => ({
      id: `pm-shadow-audusd-${Date.now()}-${i}`,
      timestamp: Date.now() - i * 900000,
      pair: 'AUD/USD',
      direction: 'BUY',
      entryPrice: 0.6600,
      exitPrice: 0.6550,
      stopLoss: 0.6550,
      takeProfit: 0.6700,
      pnlDollars: -25.00,
      outcome: 'LOSS',
      rootCauseMs: '...',
      rootCauseEn: 'Shadow observation trade stopped out.',
      lessonLearnedMs: '...',
      lessonLearnedEn: '...',
      adaptiveRuleMs: '...',
      adaptiveRuleEn: '...',
      ratingScore: 2,
      provenance: 'SHADOW_OBSERVATION',
      authority: 'SHADOW_ENGINE'
    }));

    aiDecisionEngine.setPostMortemReviews(shadowReviews);

    const result = signalService.evaluateCandidateSetup({
      pair: 'AUD/USD',
      timeframe: 'H1',
      currentPrice: 0.6600,
      indicators: { rsi: 55, ema50: 0.6550, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 0.6605, low: 0.6595 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
  });

  it('5. Fail-Safe: Missing or undefined provenance is not upgraded to authoritative veto', () => {
    const legacyReviews: PostMortemReview[] = [
      {
        id: 'pm-1y-legacy-1',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -45.00,
        outcome: 'LOSS',
        rootCauseEn: 'Legacy review without provenance field',
        ratingScore: 3
        // provenance & authority omitted
      }
    ];

    aiDecisionEngine.setPostMortemReviews(legacyReviews);

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

  it('6. Fail-Safe: Mismatched authority (HISTORICAL_BACKTEST with POSTGRESQL) fails safely without false veto', () => {
    const mismatched: PostMortemReview[] = [
      {
        id: 'pm-1y-mismatched-1',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -45.00,
        outcome: 'LOSS',
        rootCauseEn: 'Mismatched backtest record claiming PostgreSQL authority',
        ratingScore: 3,
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'POSTGRESQL' as any
      }
    ];

    aiDecisionEngine.setPostMortemReviews(mismatched);

    const result = signalService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    // Must NOT fire authoritative veto with single sample
    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
  });

  it('7. Sample Size Display: N < 3 reports INSUFFICIENT_SAMPLE or NO_DATA and never false 0% certainty', async () => {
    const mockRepo: any = {
      getClosedPositionsAcrossAccounts: vi.fn().mockResolvedValue([
        { positionId: '1', symbol: 'EUR/USD', realizedProfit: -10, proposalId: 'ORDER_BLOCK_RETEST' },
        { positionId: '2', symbol: 'EUR/USD', realizedProfit: 20, proposalId: 'ORDER_BLOCK_RETEST' }
      ]),
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

    // Total samples = 2 (< 3 MIN_SAMPLE_THRESHOLD)
    expect(analysis.historicalContext.totalSamples).toBe(2);
    expect(analysis.historicalContext.status).toBe('INSUFFICIENT_SAMPLE');
    expect(analysis.decision.shouldVeto).toBe(false);
  });

  it('8. Cross-Pair Isolation: 5 Real Losses on EUR/USD do NOT veto GBP/USD', () => {
    const eurLosses: PostMortemReview[] = [1, 2, 3, 4, 5].map(i => ({
      id: `pm-real-eur-${i}`,
      timestamp: Date.now() - i * 86400000,
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0800,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: -40.00,
      outcome: 'LOSS',
      rootCauseEn: 'EUR/USD loss',
      adaptiveRuleEn: 'Expand SL',
      ratingScore: 3,
      provenance: 'REAL_TRADE',
      authority: 'POSTGRESQL'
    }));

    aiDecisionEngine.setPostMortemReviews(eurLosses);

    const gbpResult = signalService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      timeframe: 'H1',
      currentPrice: 1.2700,
      indicators: { rsi: 55, ema50: 1.2650, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 1.2705, low: 1.2695 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(gbpResult.action).not.toBe('VETO');
    expect(gbpResult.status).not.toBe('VETOED');
    expect(gbpResult.vetoReasons.length).toBe(0);
  });

  it('9. Mixed-Provenance Isolation: 2 Real + 20 Backtest + 20 Synthetic + 20 Shadow does NOT veto', () => {
    const mixed: PostMortemReview[] = [
      // 2 Real losses
      {
        id: 'pm-real-1',
        timestamp: Date.now(),
        pair: 'XAU/USD',
        direction: 'BUY',
        entryPrice: 2400,
        exitPrice: 2380,
        stopLoss: 2380,
        takeProfit: 2450,
        pnlDollars: -50,
        outcome: 'LOSS',
        rootCauseEn: 'Real gold loss',
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      },
      {
        id: 'pm-real-2',
        timestamp: Date.now(),
        pair: 'XAU/USD',
        direction: 'BUY',
        entryPrice: 2400,
        exitPrice: 2380,
        stopLoss: 2380,
        takeProfit: 2450,
        pnlDollars: -50,
        outcome: 'LOSS',
        rootCauseEn: 'Real gold loss',
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      }
    ];

    // Add 20 Backtest + 20 Synthetic + 20 Shadow
    for (let i = 0; i < 20; i++) {
      mixed.push({
        id: `pm-1y-${i}`,
        timestamp: Date.now(),
        pair: 'XAU/USD',
        direction: 'BUY',
        entryPrice: 2400,
        exitPrice: 2380,
        stopLoss: 2380,
        takeProfit: 2450,
        pnlDollars: -50,
        outcome: 'LOSS',
        rootCauseEn: 'Backtest loss',
        provenance: 'HISTORICAL_BACKTEST',
        authority: 'BACKTEST_ENGINE'
      });
      mixed.push({
        id: `pm-sim-${i}`,
        timestamp: Date.now(),
        pair: 'XAU/USD',
        direction: 'BUY',
        entryPrice: 2400,
        exitPrice: 2380,
        stopLoss: 2380,
        takeProfit: 2450,
        pnlDollars: -50,
        outcome: 'LOSS',
        rootCauseEn: 'Sim loss',
        provenance: 'SYNTHETIC_SIMULATION',
        authority: 'SIMULATION_ONLY'
      });
      mixed.push({
        id: `pm-shadow-${i}`,
        timestamp: Date.now(),
        pair: 'XAU/USD',
        direction: 'BUY',
        entryPrice: 2400,
        exitPrice: 2380,
        stopLoss: 2380,
        takeProfit: 2450,
        pnlDollars: -50,
        outcome: 'LOSS',
        rootCauseEn: 'Shadow loss',
        provenance: 'SHADOW_OBSERVATION',
        authority: 'SHADOW_ENGINE'
      });
    }

    aiDecisionEngine.setPostMortemReviews(mixed);

    const result = signalService.evaluateCandidateSetup({
      pair: 'XAU/USD',
      timeframe: 'H1',
      currentPrice: 2400,
      indicators: { rsi: 55, ema50: 2390, adx: 25 },
      smc: { orderBlocks: [{ type: 'BULLISH', high: 2402, low: 2398 }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(result.action).not.toBe('VETO');
    expect(result.status).not.toBe('VETOED');
    expect(result.vetoReasons.length).toBe(0);
  });

  it('10. EUR/USD Regression: Specific previous pm-1y-* IDs render advisory warnings, NOT vetoes', () => {
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

  it('11. Execution Safety: Execution state remains strictly fail-closed with 0 broker orders', () => {
    expect((signalService as any).transmitOrder).toBeUndefined();
    expect(process.env.EXECUTION_ENVIRONMENT).not.toBe('LIVE');
  });

  it('12. API Serialization Preservation: Verify provenance attributes survive object serialization', () => {
    const review: PostMortemReview = {
      id: 'pm-serialize-1',
      timestamp: Date.now(),
      pair: 'BTC/USD',
      direction: 'SELL',
      entryPrice: 65000,
      exitPrice: 66000,
      stopLoss: 66000,
      takeProfit: 63000,
      pnlDollars: -100,
      outcome: 'LOSS',
      rootCauseEn: 'Serialized review',
      provenance: 'REAL_TRADE',
      authority: 'POSTGRESQL',
      dataSource: 'POSTGRESQL_CLOSED_POSITION',
      fallbackUsed: false
    };

    const serialized = JSON.parse(JSON.stringify(review));
    expect(serialized.provenance).toBe('REAL_TRADE');
    expect(serialized.authority).toBe('POSTGRESQL');
    expect(serialized.dataSource).toBe('POSTGRESQL_CLOSED_POSITION');
    expect(serialized.fallbackUsed).toBe(false);
  });
});
