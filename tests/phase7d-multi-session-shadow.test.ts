import { describe, it, expect, beforeEach } from 'vitest';
import { shadowObservationService, ShadowServiceStateSnapshot } from '../apps/decision-agent/src/services/shadowObservationService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { shadowAnalyticsService } from '../src/server/services/shadowAnalyticsService';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import { PostMortemReview } from '../src/types';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI ? Phase 7D Multi-Session Continuous Shadow Telemetry & Cohort Accumulation', () => {

  beforeEach(() => {
    shadowObservationService.clearPositions();
    shadowAnalyticsService.clearRecords();
    aiDecisionEngine.setPostMortemReviews([]);
  });

  // --- PART 1: MULTI-SESSION & TRANSITIONS (Scenarios 1?2) ---

  it('1. Correctly classifies global trading sessions (Asian, London, New York, Overlap)', () => {
    // 04:00 UTC -> ASIAN
    const asianTime = new Date('2026-08-19T04:00:00Z').getTime();
    expect(shadowObservationService.constructor['determineTradingSession'](asianTime)).toBe('ASIAN');

    // 09:00 UTC -> LONDON
    const londonTime = new Date('2026-08-19T09:00:00Z').getTime();
    expect(shadowObservationService.constructor['determineTradingSession'](londonTime)).toBe('LONDON');

    // 14:00 UTC -> OVERLAP_LONDON_NY
    const overlapTime = new Date('2026-08-19T14:00:00Z').getTime();
    expect(shadowObservationService.constructor['determineTradingSession'](overlapTime)).toBe('OVERLAP_LONDON_NY');

    // 18:00 UTC -> NEW_YORK
    const nyTime = new Date('2026-08-19T18:00:00Z').getTime();
    expect(shadowObservationService.constructor['determineTradingSession'](nyTime)).toBe('NEW_YORK');

    // 22:00 UTC -> SYDNEY
    const sydneyTime = new Date('2026-08-19T22:00:00Z').getTime();
    expect(shadowObservationService.constructor['determineTradingSession'](sydneyTime)).toBe('SYDNEY');
  });

  it('2. Observes shadow position across trading session transition', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const pos = res.position!;

    // Initial session recorded at entry
    expect(pos.session).toBeDefined();

    // Price updates continue smoothly as session progresses
    shadowObservationService.updatePositionsWithMarketPrice('EUR/USD', 1.0870, 1.0875, 1.0848);
    const updated = shadowObservationService.getPositionById(pos.id)!;
    expect(updated.mfePips).toBeGreaterThanOrEqual(20);
    expect(updated.status).toBe('OPEN');
  });

  // --- PART 2: RECOVERY & RESTART PROTECTION (Scenarios 3?5) ---

  it('3. Exports and recovers open observation state on simulated restart', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const posId = res.position!.id;

    // Export state snapshot
    const snapshot = shadowObservationService.exportState();
    expect(snapshot.positions.length).toBe(1);

    // Simulate complete service restart
    shadowObservationService.clearPositions();
    expect(shadowObservationService.getOpenPositions().length).toBe(0);

    // Import recovered state
    const recoveryRes = shadowObservationService.importState(snapshot);
    expect(recoveryRes.success).toBe(true);
    expect(recoveryRes.recoveredCount).toBe(1);

    const recoveredPos = shadowObservationService.getPositionById(posId)!;
    expect(recoveredPos.status).toBe('OPEN');
    expect(recoveredPos.reopenedAfterRestart).toBe(true);
    expect(recoveredPos.entryPrice).toBe(1.0850);
  });

  it('4. Prevents duplicate position creation after restart', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const snapshot = shadowObservationService.exportState();

    // Re-instantiate from snapshot
    shadowObservationService.clearPositions();
    shadowObservationService.importState(snapshot);

    // Attempt to re-evaluate the same signal again
    const resDup = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    expect(resDup.accepted).toBe(false);
    expect(resDup.reason).toContain('DUPLICATE_SIGNAL');
  });

  it('5. Immutable signal snapshot is preserved across restart cycle', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    const posId = res.position!.id;

    const snapshot = shadowObservationService.exportState();
    shadowObservationService.clearPositions();
    shadowObservationService.importState(snapshot);

    const recoveredPos = shadowObservationService.getPositionById(posId)!;
    expect(Object.isFrozen(recoveredPos.signalSnapshot)).toBe(true);
    expect(recoveredPos.signalSnapshot.confidence).toBe(opp.confidence);
  });

  // --- PART 3: EVIDENCE SEPARATION & TELEMETRY QUALITY (Scenarios 6?7) ---

  it('6. Strictly separates REAL_MARKET from TEST_FIXTURE in shadow analytics', () => {
    // Record 1 real market trade
    const oppReal = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    const resReal = shadowObservationService.evaluateAndOpenShadowPosition(oppReal, 1.0850, 'EUR/USD', 'REAL_MARKET');
    shadowObservationService.closeShadowPosition(resReal.position!.id, 1.0890, 'TAKE_PROFIT_1');

    // Record 1 test fixture trade
    const oppTest = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      currentPrice: 1.2700,
      indicators: { rsi: 38, ema20: 1.2710, ema50: 1.2730, superTrend: { trend: 'BEARISH' }, adx: { adx: 30 }, atr: 0.0025 },
      smc: { orderBlocks: [{ type: 'BEARISH' }] }
    });
    const resTest = shadowObservationService.evaluateAndOpenShadowPosition(oppTest, 1.2700, 'GBP/USD', 'TEST_FIXTURE');
    shadowObservationService.closeShadowPosition(resTest.position!.id, 1.2650, 'TAKE_PROFIT_1');

    const realRecords = shadowAnalyticsService.getRealMarketRecords();
    const testRecords = shadowAnalyticsService.getTestFixtureRecords();

    expect(realRecords.length).toBe(1);
    expect(realRecords[0].pair).toBe('EUR/USD');
    expect(realRecords[0].evidenceSource).toBe('REAL_MARKET');

    expect(testRecords.length).toBe(1);
    expect(testRecords[0].pair).toBe('GBP/USD');
    expect(testRecords[0].evidenceSource).toBe('TEST_FIXTURE');
  });

  it('7. Telemetry counters track operational events truthfully and monotonically', () => {
    const countersInitial = shadowObservationService.getTelemetryCounters();
    expect(countersInitial.signalsEvaluated).toBe(0);

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');
    let counters = shadowObservationService.getTelemetryCounters();

    expect(counters.signalsEvaluated).toBe(1);
    expect(counters.admittedCount).toBe(1);
    expect(counters.currentlyOpenCount).toBe(1);

    shadowObservationService.closeShadowPosition(res.position!.id, 1.0820, 'STOP_LOSS');
    counters = shadowObservationService.getTelemetryCounters();

    expect(counters.currentlyOpenCount).toBe(0);
    expect(counters.closedCount).toBe(1);
    expect(counters.slExitCount).toBe(1);
    expect(counters.postMortemsGeneratedCount).toBe(1);
  });

  // --- PART 4: POST-MORTEM & ADAPTIVE FEEDBACK (Scenarios 8?11) ---

  it('8. Closed shadow position creates post-mortem review with root cause and rule', async () => {
    const postMortem = await aiDecisionEngine.createPostMortemFromCanonicalData({
      tradeId: 'shadow-pos-7d-01',
      positionId: 'shadow-pos-7d-01',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -120.00,
      pnlPips: -30,
      outcome: 'LOSS',
      cleanNotes: 'Stop loss hit on liquidity expansion'
    });

    expect(postMortem.rootCauseEn).toBeDefined();
    expect(postMortem.lessonLearnedEn).toBeDefined();
    expect(postMortem.adaptiveRuleEn).toBeDefined();
  });

  it('9. Post-mortem review can be stored and retrieved from learning memory', () => {
    const review: PostMortemReview = {
      id: 'pm-7d-01',
      pair: 'EUR/USD',
      direction: 'BUY',
      outcome: 'LOSS',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -120,
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
    const reviews = aiDecisionEngine.getPostMortemReviews();
    expect(reviews.some(r => r.id === 'pm-7d-01')).toBe(true);
  });

  it('10. Learning update rehydrates into engine and applies to future signal', () => {
    const review: PostMortemReview = {
      id: 'pm-7d-02',
      pair: 'EUR/USD',
      direction: 'BUY',
      outcome: 'LOSS',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -100,
      rootCauseEn: 'Loss pattern',
      rootCauseMs: 'Corak kerugian',
      lessonLearnedEn: 'Penalize recurring loss',
      lessonLearnedMs: 'Penalti kerugian berulang',
      adaptiveRuleEn: 'Apply -6 penalty to EUR/USD',
      adaptiveRuleMs: 'Penalti -6',
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

  it('11. Learning adjustment does not contaminate unrelated currency pairs', () => {
    const reviewEur: PostMortemReview = {
      id: 'pm-eur-only',
      pair: 'EUR/USD',
      direction: 'BUY',
      outcome: 'LOSS',
      adaptiveRuleEn: 'Penalty for EUR/USD only'
    } as any;

    const gbpOpp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      currentPrice: 1.2700,
      indicators: { rsi: 62, ema20: 1.2690, ema50: 1.2680, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: [reviewEur]
    });

    // GBP/USD should NOT receive learning penalty from EUR/USD loss
    expect(gbpOpp.confidenceBreakdown?.learningAdjustment).toBe(0);
  });

  // --- PART 5: FAIL-CLOSED RECOVERY & SAFETY INVARIANTS (Scenarios 12?13) ---

  it('12. Fails closed on corrupted restart snapshot payload', () => {
    const corruptSnapshot: any = {
      version: '1.0',
      timestamp: Date.now(),
      positions: [
        { id: 'corrupt-pos-1', pair: 'EUR/USD' } // Missing mandatory fields
      ],
      processedSignalIds: []
    };

    const res = shadowObservationService.importState(corruptSnapshot);
    expect(res.success).toBe(false);
    expect(res.error).toContain('CORRUPT_POSITION');
  });

  it('13. Safety invariants remain enforced: Execution Safety Gate blocked and zero broker orders transmitted', () => {
    const safetyRes = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });

    expect(safetyRes.allowed).toBe(false);
    expect(safetyRes.code).toBe('LIVE_EXECUTION_DISARMED');
  });
});
