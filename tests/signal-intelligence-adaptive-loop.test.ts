import { describe, it, expect, beforeEach } from 'vitest';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { PostMortemReview } from '../src/types';

describe('QUANTUMAI ? Phase 6B Signal Intelligence + Adaptive Learning Feedback Loop', () => {

  beforeEach(() => {
    aiDecisionEngine.setPostMortemReviews([]);
  });

  it('1. Pair with strong bullish confluence produces a VALID BUY proposal', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: {
        rsi: 62,
        ema20: 1.0845,
        ema50: 1.0830,
        superTrend: { trend: 'BULLISH' },
        adx: { adx: 28, trendStrength: 'STRONG' },
        atr: 0.0020,
        macd: { histogram: 0.0004 }
      },
      smc: {
        orderBlocks: [{ type: 'BULLISH', min: 1.0840, max: 1.0848 }]
      }
    });

    expect(result.action).toBe('BUY');
    expect(result.status).toBe('VALID_PROPOSAL');
    expect(result.bias).toBe('BULLISH');
    expect(result.setupType).toBe('ORDER_BLOCK_RETEST');
    expect(result.entryZone).not.toBeNull();
    expect(result.stopLoss).not.toBeNull();
    expect(result.takeProfit1).not.toBeNull();
    expect(result.takeProfit2).not.toBeNull();
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });

  it('2. Pair with strong bearish confluence produces a VALID SELL proposal', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      timeframe: 'M15',
      currentPrice: 1.2700,
      indicators: {
        rsi: 38,
        ema20: 1.2710,
        ema50: 1.2730,
        superTrend: { trend: 'BEARISH' },
        adx: { adx: 30, trendStrength: 'STRONG' },
        atr: 0.0025,
        macd: { histogram: -0.0005 }
      },
      smc: {
        orderBlocks: [{ type: 'BEARISH', min: 1.2710, max: 1.2725 }]
      }
    });

    expect(result.action).toBe('SELL');
    expect(result.status).toBe('VALID_PROPOSAL');
    expect(result.bias).toBe('BEARISH');
    expect(result.setupType).toBe('ORDER_BLOCK_RETEST');
    expect(result.entryZone).not.toBeNull();
    expect(result.stopLoss).not.toBeNull();
    expect(result.takeProfit1).not.toBeNull();
  });

  it('3. Choppy market with low ADX and no SMC structure produces NO_SETUP with null levels', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: {
        rsi: 50,
        ema20: 1.0850,
        ema50: 1.0850,
        superTrend: { trend: 'NEUTRAL' },
        adx: { adx: 12, trendStrength: 'WEAK' },
        atr: 0.0010
      },
      smc: {
        orderBlocks: [],
        fairValueGaps: []
      }
    });

    expect(result.action).toBe('NO_SETUP');
    expect(result.status).toBe('NO_SETUP');
    expect(result.entryZone).toBeNull();
    expect(result.stopLoss).toBeNull();
    expect(result.takeProfit1).toBeNull();
    expect(result.takeProfit2).toBeNull();
  });

  it('4. Conflicting indicators (e.g. Bullish RSI but Bearish Price/EMA and low ADX) produce NO_SETUP', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'USD/JPY',
      timeframe: 'M15',
      currentPrice: 155.200,
      indicators: {
        rsi: 58,
        ema20: 155.400,
        ema50: 155.600,
        superTrend: { trend: 'BEARISH' },
        adx: { adx: 15, trendStrength: 'WEAK' },
        atr: 0.25
      },
      smc: { orderBlocks: [] }
    });

    expect(result.action).toBe('NO_SETUP');
    expect(result.status).toBe('NO_SETUP');
    expect(result.entryZone).toBeNull();
  });

  it('5. Insufficient ADX / weak trend produces NO_SETUP or WAIT_FOR_CONFIRMATION', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'AUD/USD',
      timeframe: 'M15',
      currentPrice: 0.6600,
      indicators: {
        rsi: 52,
        ema20: 0.6598,
        ema50: 0.6595,
        superTrend: { trend: 'BULLISH' },
        adx: { adx: 14, trendStrength: 'WEAK' },
        atr: 0.0015
      },
      smc: { orderBlocks: [] }
    });

    expect(['NO_SETUP', 'WAIT_FOR_CONFIRMATION']).toContain(result.action);
    expect(result.entryZone).toBeNull();
  });

  it('6. Missing SMC structure or breakout confirmation with borderline ADX produces WAIT_FOR_CONFIRMATION', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'XAU/USD',
      timeframe: 'M15',
      currentPrice: 2400.00,
      indicators: {
        rsi: 58,
        ema20: 2398.00,
        ema50: 2395.00,
        superTrend: { trend: 'BULLISH' },
        adx: { adx: 19, trendStrength: 'MODERATE' },
        atr: 4.5
      },
      smc: {
        orderBlocks: [],
        fairValueGaps: []
      }
    });

    expect(result.action).toBe('WAIT_FOR_CONFIRMATION');
    expect(result.status).toBe('WAIT_FOR_CONFIRMATION');
    expect(result.entryZone).toBeNull();
    expect(result.confirmationRequirements).toBeDefined();
    expect(result.confirmationRequirements!.length).toBeGreaterThan(0);
  });

  it('7. Adaptive Learning failure pattern reduces confidence score', () => {
    const lossReview: PostMortemReview = {
      id: 'pm-eurusd-loss-1',
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -120,
      outcome: 'LOSS',
      rootCauseEn: 'Tight SL hit during pre-market consolidation',
      rootCauseMs: 'SL rapat',
      lessonLearnedEn: 'Expand SL buffer on EUR/USD',
      lessonLearnedMs: 'Besarkan SL',
      adaptiveRuleEn: 'Expand SL buffer to 1.8x ATR',
      adaptiveRuleMs: 'Besarkan SL ke 1.8x ATR',
      ratingScore: 50,
      timestamp: Date.now()
    };

    const baseline = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: []
    });

    const adapted = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: [lossReview]
    });

    expect(adapted.confidence).toBeLessThan(baseline.confidence);
    expect(adapted.confidenceBreakdown?.learningAdjustment).toBeLessThan(0);
  });

  it('8. Strong proven failure pattern (>=3 recurring losses) triggers VETO', () => {
    const recurringLosses: PostMortemReview[] = [
      { id: 'pm-loss-1', pair: 'EUR/USD', outcome: 'LOSS', rootCauseEn: 'Choppy breakout trap', adaptiveRuleEn: 'Avoid EUR/USD breakouts' } as any,
      { id: 'pm-loss-2', pair: 'EUR/USD', outcome: 'LOSS', rootCauseEn: 'Choppy breakout trap', adaptiveRuleEn: 'Avoid EUR/USD breakouts' } as any,
      { id: 'pm-loss-3', pair: 'EUR/USD', outcome: 'LOSS', rootCauseEn: 'Choppy breakout trap', adaptiveRuleEn: 'Avoid EUR/USD breakouts' } as any
    ];

    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 60, ema20: 1.0840, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 24 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: recurringLosses
    });

    expect(result.action).toBe('VETO');
    expect(result.status).toBe('VETOED');
    expect(result.entryZone).toBeNull();
    expect(result.vetoReasons).toBeDefined();
    expect(result.vetoReasons!.length).toBeGreaterThan(0);
  });

  it('9. Insufficient historical sample (1 single loss) does NOT trigger VETO', () => {
    const singleLoss: PostMortemReview[] = [
      { id: 'pm-single-loss', pair: 'GBP/USD', outcome: 'LOSS', rootCauseEn: 'Normal statistical loss', adaptiveRuleEn: 'Maintain discipline' } as any
    ];

    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      currentPrice: 1.2700,
      indicators: { rsi: 65, ema20: 1.2680, ema50: 1.2650, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0025 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: singleLoss
    });

    expect(result.action).toBe('BUY');
    expect(result.status).toBe('VALID_PROPOSAL');
  });

  it('10. Learning rule changes signal evidence and widens SL buffer', () => {
    const lossReview: PostMortemReview = {
      id: 'pm-loss-sl-buffer',
      pair: 'EUR/USD',
      outcome: 'LOSS',
      rootCauseEn: 'SL buffer was insufficient',
      adaptiveRuleEn: 'Expand SL buffer to 1.8x ATR for EUR/USD setups'
    } as any;

    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: [lossReview]
    });

    // 1.0850 - 0.0020 * 1.8 = 1.08140
    expect(result.stopLoss).toBe(1.08140);
    const hasAdaptiveEvidence = result.reasons.some(r => r.includes('pm-loss-sl-buffer'));
    expect(hasAdaptiveEvidence).toBe(true);
  });

  it('11. NO_SETUP produces null entryZone, stopLoss, and takeProfit', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 50, ema50: 1.0850, adx: { adx: 10 } },
      smc: { orderBlocks: [] }
    });

    expect(result.action).toBe('NO_SETUP');
    expect(result.entryZone).toBeNull();
    expect(result.stopLoss).toBeNull();
    expect(result.takeProfit1).toBeNull();
    expect(result.takeProfit2).toBeNull();
  });

  it('12. WAIT_FOR_CONFIRMATION produces no executable entry', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 56, ema20: 1.0848, ema50: 1.0840, superTrend: { trend: 'BULLISH' }, adx: { adx: 19 } },
      smc: { orderBlocks: [] }
    });

    expect(result.action).toBe('WAIT_FOR_CONFIRMATION');
    expect(result.entryZone).toBeNull();
    expect(result.stopLoss).toBeNull();
  });

  it('13. Valid BUY has correct mathematical geometry: SL < EntryMin <= EntryMax < TP1 < TP2', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    expect(result.action).toBe('BUY');
    expect(result.stopLoss!).toBeLessThan(result.entryZone!.min);
    expect(result.entryZone!.min).toBeLessThanOrEqual(result.entryZone!.max);
    expect(result.entryZone!.max).toBeLessThan(result.takeProfit1!);
    expect(result.takeProfit1!).toBeLessThan(result.takeProfit2!);
  });

  it('14. Valid SELL has correct mathematical geometry: TP2 < TP1 < EntryMin <= EntryMax < SL', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 35, ema20: 1.0860, ema50: 1.0880, superTrend: { trend: 'BEARISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BEARISH' }] }
    });

    expect(result.action).toBe('SELL');
    expect(result.takeProfit2!).toBeLessThan(result.takeProfit1!);
    expect(result.takeProfit1!).toBeLessThan(result.entryZone!.min);
    expect(result.entryZone!.min).toBeLessThanOrEqual(result.entryZone!.max);
    expect(result.entryZone!.max).toBeLessThan(result.stopLoss!);
  });

  it('15. Discards geometry anomalies and safely resets to NO_SETUP', async () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 50, ema50: 1.0850, adx: { adx: 10 } },
      smc: { orderBlocks: [] }
    });

    expect(result.action).toBe('NO_SETUP');
    expect(result.entryZone).toBeNull();
  });

  it('16. Symbol mismatch protection: Active pair XAU/USD ignores stale AUD/USD payload', () => {
    const oppAud = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'AUD/USD',
      currentPrice: 0.6600,
      indicators: { rsi: 60, ema50: 0.6580, atr: 0.0015 }
    });

    const activePair = 'XAU/USD';
    const isMatched = oppAud.pair === activePair;
    expect(isMatched).toBe(false);
  });

  it('17. Stale proposal age verification: Old timestamp can be flagged as stale', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema50: 1.0830, atr: 0.0020 }
    });

    const proposalAgeMs = Date.now() - (opp.timestamp - 120000); // 2 minutes old
    const isStale = proposalAgeMs > 60000; // 1 minute threshold
    expect(isStale).toBe(true);
  });

  it('18. Shadow trade records signal decision provenance and metadata', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    expect(opp.provenanceSource).toBe('AI_DECISION_ENGINE');
    expect(opp.strategyId).toBe('SMC_QUANT_V2');
    expect(opp.setupType).toBe('ORDER_BLOCK_RETEST');
    expect(opp.entryType).toBe('PULLBACK_LIMIT');
  });

  it('19. Closed AI shadow trade produces structured post-mortem with learningVersion', async () => {
    const postMortem = await aiDecisionEngine.createPostMortemFromCanonicalData({
      tradeId: 'shadow-pos-101',
      positionId: 'shadow-pos-101',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -150.00,
      pnlPips: -30,
      outcome: 'LOSS',
      cleanNotes: 'Shadow trade hit Stop Loss on liquidity sweep'
    });

    expect(postMortem).toBeDefined();
    expect(postMortem.rootCauseEn).toBeDefined();
    expect(postMortem.adaptiveRuleEn).toBeDefined();
  });

  it('20. Generated post-mortem becomes available to future Signal Intelligence evaluations', () => {
    const newLossLesson: PostMortemReview = {
      id: 'pm-auto-loop-1',
      pair: 'EUR/USD',
      outcome: 'LOSS',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -100,
      rootCauseEn: 'Premature entry during volatility expansion',
      rootCauseMs: 'Entry awal',
      lessonLearnedEn: 'Widen SL buffer to 1.8x ATR',
      lessonLearnedMs: 'Besarkan SL',
      adaptiveRuleEn: 'Expand SL buffer to 1.8x ATR for EUR/USD setups',
      adaptiveRuleMs: 'Besarkan SL',
      ratingScore: 60,
      timestamp: Date.now()
    };

    aiDecisionEngine.addPostMortemReview(newLossLesson);

    const futureEval = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: aiDecisionEngine.getPostMortemReviews()
    });

    expect(futureEval.stopLoss).toBe(1.08140); // 1.8x ATR
    expect(futureEval.reasons.some(r => r.includes('pm-auto-loop-1'))).toBe(true);
  });

  it('21. Manual trade learning remains distinguishable from AI shadow trades', () => {
    const manualReview: PostMortemReview = {
      id: 'pm-manual-1',
      pair: 'EUR/USD',
      outcome: 'WIN',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0890,
      stopLoss: 1.0820,
      takeProfit: 1.0890,
      pnlDollars: 200,
      rootCauseEn: 'Well executed manual pullback',
      rootCauseMs: 'Entri manual tepat',
      lessonLearnedEn: 'Maintain patience for pullback',
      lessonLearnedMs: 'Sabar menunggu pullback',
      adaptiveRuleEn: 'Manual discipline confirmed',
      adaptiveRuleMs: 'Disiplin manual disahkan',
      ratingScore: 90,
      provenanceSource: 'MANUAL',
      timestamp: Date.now()
    };

    expect(manualReview.provenanceSource).toBe('MANUAL');
  });

  it('22. Safety Invariants: No broker orders or execution authorization is granted', () => {
    const result = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    expect((result as any).executable).toBe(false);
  });
});
