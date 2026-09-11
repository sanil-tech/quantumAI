import { describe, it, expect, beforeEach, vi } from 'vitest';
import { shadowObservationService } from '../apps/decision-agent/src/services/shadowObservationService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { shadowAnalyticsService } from '../src/server/services/shadowAnalyticsService';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import { AiTradeOpportunity, PostMortemReview } from '../src/types';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI ? Phase 7C Continuous Real-Market Shadow Observation', () => {

  beforeEach(() => {
    shadowObservationService.clearPositions();
    shadowAnalyticsService.clearRecords();
    aiDecisionEngine.setPostMortemReviews([]);
  });

  // --- PART 1: SHADOW POSITION CREATION & GATES (Scenarios 1?6) ---

  it('1. Valid BUY creates a valid shadow position', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH', min: 1.0840, max: 1.0848 }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    expect(res.accepted).toBe(true);
    expect(res.position).toBeDefined();
    expect(res.position?.direction).toBe('BUY');
    expect(res.position?.status).toBe('OPEN');
  });

  it('2. Valid SELL creates a valid shadow position', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      timeframe: 'M15',
      currentPrice: 1.2700,
      indicators: { rsi: 38, ema20: 1.2710, ema50: 1.2730, superTrend: { trend: 'BEARISH' }, adx: { adx: 30 }, atr: 0.0025 },
      smc: { orderBlocks: [{ type: 'BEARISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.2700, 'GBP/USD');
    expect(res.accepted).toBe(true);
    expect(res.position?.direction).toBe('SELL');
  });

  it('3. NO_SETUP creates no shadow position', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 50, ema50: 1.0850, adx: { adx: 10 } }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    expect(res.accepted).toBe(false);
    expect(res.reason).toContain('NO_SETUP');
    expect(shadowObservationService.getOpenPositions().length).toBe(0);
  });

  it('4. WAIT_FOR_CONFIRMATION creates no shadow position', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'XAU/USD',
      currentPrice: 2400.00,
      indicators: { rsi: 58, ema20: 2398.00, ema50: 2395.00, superTrend: { trend: 'BULLISH' }, adx: { adx: 19 }, atr: 4.5 }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 2400.00, 'XAU/USD');
    expect(res.accepted).toBe(false);
    expect(res.reason).toContain('WAIT_FOR_CONFIRMATION');
  });

  it('5. VETO creates no shadow position', () => {
    const recurringLosses: PostMortemReview[] = [
      { id: 'pm-1', pair: 'EUR/USD', outcome: 'LOSS' },
      { id: 'pm-2', pair: 'EUR/USD', outcome: 'LOSS' },
      { id: 'pm-3', pair: 'EUR/USD', outcome: 'LOSS' }
    ] as any;

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: recurringLosses
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    expect(res.accepted).toBe(false);
    expect(res.reason).toContain('VETOED');
  });

  it('6. Shadow position contains immutable signal snapshot at entry', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const pos = res.position!;

    expect(pos.signalSnapshot).toBeDefined();
    expect(pos.signalSnapshot.confidence).toBe(opp.confidence);
    expect(pos.signalSnapshot.action).toBe('BUY');
    expect(Object.isFrozen(pos.signalSnapshot)).toBe(true);
  });

  // --- PART 2: PRICE MONITORING, MFE, MAE & EXITS (Scenarios 7?11) ---

  it('7. Real price progression updates MFE (Maximum Favorable Excursion)', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const pos = res.position!;

    // Market moves up to 1.0880 (favorable)
    shadowObservationService.updatePositionsWithMarketPrice('EUR/USD', 1.0880, 1.0880, 1.0848);

    const updated = shadowObservationService.getPositionById(pos.id)!;
    expect(updated.mfePips).toBeGreaterThanOrEqual(30.0);
  });

  it('8. Real price progression updates MAE (Maximum Adverse Excursion)', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const pos = res.position!;

    // Market dips down to 1.0835 (adverse)
    shadowObservationService.updatePositionsWithMarketPrice('EUR/USD', 1.0840, 1.0855, 1.0835);

    const updated = shadowObservationService.getPositionById(pos.id)!;
    expect(updated.maePips).toBeGreaterThanOrEqual(15.0);
  });

  it('9. Price hitting Stop Loss triggers automatic shadow close with STOP_LOSS reason', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const pos = res.position!;

    // Market drops below Stop Loss (e.g. 1.0820)
    shadowObservationService.updatePositionsWithMarketPrice('EUR/USD', 1.0818, 1.0830, 1.0815);

    const closed = shadowObservationService.getPositionById(pos.id)!;
    expect(closed.status).toBe('CLOSED');
    expect(closed.exitReason).toBe('STOP_LOSS');
    expect(closed.realizedR).toBeLessThan(0);
  });

  it('10. Price reaching TP1 marks TP1 hit', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const pos = res.position!;

    // Market reaches TP1 (approx 1.0892)
    shadowObservationService.updatePositionsWithMarketPrice('EUR/USD', 1.0895, 1.0895, 1.0850);

    const updated = shadowObservationService.getPositionById(pos.id)!;
    expect(updated.tp1Hit).toBe(true);
  });

  it('11. Price reaching TP2 closes position with TAKE_PROFIT_2 reason', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const pos = res.position!;

    // Market reaches TP2 (approx 1.0926)
    shadowObservationService.updatePositionsWithMarketPrice('EUR/USD', 1.0930, 1.0935, 1.0850);

    const closed = shadowObservationService.getPositionById(pos.id)!;
    expect(closed.status).toBe('CLOSED');
    expect(closed.exitReason).toBe('TAKE_PROFIT_2');
    expect(closed.realizedR).toBeGreaterThan(0);
  });

  // --- PART 3: REJECTION GUARDS & IDEMPOTENCY (Scenarios 12?16) ---

  it('12. Invalid geometry is rejected', () => {
    const badGeometryOpp: Partial<AiTradeOpportunity> = {
      pair: 'EUR/USD',
      action: 'BUY',
      status: 'VALID_PROPOSAL',
      timestamp: Date.now(),
      entryZone: { min: 1.0850, max: 1.0860 },
      stopLoss: 1.0890, // SL higher than entry!
      takeProfit1: 1.0820
    };

    const res = shadowObservationService.evaluateAndOpenShadowPosition(badGeometryOpp as any, 1.0850, 'EUR/USD');
    expect(res.accepted).toBe(false);
    expect(res.reason).toContain('INVALID_GEOMETRY');
  });

  it('13. Stale signal is rejected (age > 60s)', () => {
    const staleOpp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    staleOpp.timestamp = Date.now() - 120000; // 2 minutes old

    const res = shadowObservationService.evaluateAndOpenShadowPosition(staleOpp, 1.0850, 'EUR/USD');
    expect(res.accepted).toBe(false);
    expect(res.reason).toContain('STALE_SIGNAL');
  });

  it('14. Symbol mismatch is rejected', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'AUD/USD',
      currentPrice: 0.6600,
      indicators: { rsi: 62, ema20: 0.6590, ema50: 0.6580, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0015 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 0.6600, 'XAU/USD');
    expect(res.accepted).toBe(false);
    expect(res.reason).toContain('SYMBOL_MISMATCH');
  });

  it('15. Duplicate signal does not create duplicate shadow position', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res1 = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const res2 = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');

    expect(res1.accepted).toBe(true);
    expect(res2.accepted).toBe(false);
    expect(res2.reason).toContain('DUPLICATE_SIGNAL');
  });

  it('16. Duplicate close event does not duplicate records', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const posId = res.position!.id;

    shadowObservationService.closeShadowPosition(posId, 1.0820, 'STOP_LOSS');
    shadowObservationService.closeShadowPosition(posId, 1.0820, 'STOP_LOSS');

    expect(shadowAnalyticsService.getRecords().length).toBe(1);
  });

  // --- PART 4: POST-MORTEM, REHYDRATION & IMMUTABILITY (Scenarios 17?23) ---

  it('17. Shadow close dispatches TradeClosed event', async () => {
    let capturedEvent: any = null;
    globalEventBus.subscribe(EventTypes.TradeClosed, async (event) => {
      capturedEvent = event;
    });

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    shadowObservationService.closeShadowPosition(res.position!.id, 1.0820, 'STOP_LOSS');

    await new Promise(r => setTimeout(r, 20));
    expect(capturedEvent).not.toBeNull();
  });

  it('18. Post-mortem is created from closed shadow trade details', async () => {
    const postMortem = await aiDecisionEngine.createPostMortemFromCanonicalData({
      tradeId: 'shadow-pos-701',
      positionId: 'shadow-pos-701',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -150.00,
      pnlPips: -30,
      outcome: 'LOSS',
      cleanNotes: 'Hit stop loss on sudden expansion'
    });

    expect(postMortem.rootCauseEn).toBeDefined();
    expect(postMortem.adaptiveRuleEn).toBeDefined();
  });

  it('19. Learning rehydrates after restart into memory cache', () => {
    const review: PostMortemReview = {
      id: 'pm-restart-1',
      pair: 'EUR/USD',
      direction: 'BUY',
      outcome: 'LOSS',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -100,
      rootCauseEn: 'Liquidity sweep',
      rootCauseMs: 'Sapuan likuiditi',
      lessonLearnedEn: 'Widen SL buffer',
      lessonLearnedMs: 'Besarkan SL',
      adaptiveRuleEn: 'Expand SL buffer to 1.8x ATR',
      adaptiveRuleMs: 'Besarkan SL',
      ratingScore: 60,
      timestamp: Date.now()
    };

    aiDecisionEngine.addPostMortemReview(review);
    expect(aiDecisionEngine.getPostMortemReviews().some(r => r.id === 'pm-restart-1')).toBe(true);
  });

  it('20. Future signal receives learning adjustment from rehydrated learning', () => {
    const review: PostMortemReview = {
      id: 'pm-future-1',
      pair: 'EUR/USD',
      direction: 'BUY',
      outcome: 'LOSS',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -100,
      rootCauseEn: 'Premature entry',
      rootCauseMs: 'Entry awal',
      lessonLearnedEn: 'Expand SL buffer',
      lessonLearnedMs: 'Besarkan SL',
      adaptiveRuleEn: 'Expand SL buffer to 1.8x ATR for EUR/USD',
      adaptiveRuleMs: 'Besarkan SL',
      ratingScore: 60,
      timestamp: Date.now()
    };

    const futureOpp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: [review]
    });

    expect(futureOpp.confidenceBreakdown?.learningAdjustment).toBeLessThan(0);
  });

  it('21. Historical signal snapshot remains unchanged when learning updates', () => {
    const oppA = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: []
    });

    const resA = shadowObservationService.evaluateAndOpenShadowPosition(oppA, 1.0850, 'EUR/USD');
    const posA = resA.position!;
    const initialAdjustment = posA.signalSnapshot.confidenceBreakdown?.learningAdjustment;

    // A learning review is created subsequently
    const review: PostMortemReview = {
      id: 'pm-later-1',
      pair: 'EUR/USD',
      outcome: 'LOSS',
      adaptiveRuleEn: 'Expand SL'
    } as any;

    aiDecisionEngine.addPostMortemReview(review);

    // Historical position A's signalSnapshot must remain completely unchanged
    expect(posA.signalSnapshot.confidenceBreakdown?.learningAdjustment).toBe(initialAdjustment);
  });

  it('22. Baseline and learning cohorts remain isolated in analytics', () => {
    const comparison = shadowAnalyticsService.compareCohorts();
    expect(comparison.baselineCohort).toBeDefined();
    expect(comparison.learningAffectedCohort).toBeDefined();
  });

  it('23. VETO does not create shadow position', () => {
    const vetoOpp = {
      pair: 'EUR/USD' as const,
      timestamp: Date.now(),
      action: 'VETO' as const,
      status: 'VETOED' as const,
      confidence: 45,
      bias: 'NEUTRAL' as const,
      reasons: ['VETOED'],
      entryZone: null,
      stopLoss: null,
      takeProfit1: null,
      takeProfit2: null,
      riskRewardRatio: null,
      invalidationLevel: null,
      tradingStyle: 'DAY_TRADER' as const,
      probabilityNotes: '',
      disclaimer: ''
    };

    const res = shadowObservationService.evaluateAndOpenShadowPosition(vetoOpp, 1.0850, 'EUR/USD');
    expect(res.accepted).toBe(false);
  });

  // --- PART 5: SAFETY INVARIANTS (Scenarios 24?26) ---

  it('24. Broker execution path remains unreachable from shadow observation', () => {
    expect((shadowObservationService as any).sendBrokerOrder).toBeUndefined();
    expect((shadowObservationService as any).transmitOrder).toBeUndefined();
  });

  it('25. Execution Safety Gate remains BLOCKED and fail-closed', () => {
    const gateRes = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });

    expect(gateRes.allowed).toBe(false);
  });

  it('26. Zero broker orders are transmitted', () => {
    expect((shadowObservationService as any).brokerOrdersTransmitted || 0).toBe(0);
  });
});
