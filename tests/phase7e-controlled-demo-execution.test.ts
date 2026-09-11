import { describe, it, expect, beforeEach } from 'vitest';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { shadowAnalyticsService } from '../src/server/services/shadowAnalyticsService';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import { PostMortemReview } from '../src/types';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI ? Phase 7E Controlled cTrader DEMO Execution Activation', () => {

  beforeEach(() => {
    controlledDemoExecutionService.clearRecords();
    shadowAnalyticsService.clearRecords();
    aiDecisionEngine.setPostMortemReviews([]);
  });

  // --- PART 1: ARMING GATES & LIVE SAFETY (Scenarios 1?4) ---

  it('1. Unarmed DEMO execution is rejected by default', () => {
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(res.success).toBe(false);
    expect(res.code).toBe('DEMO_DISARMED');
  });

  it('2. DEMO execution is allowed when explicitly armed', () => {
    controlledDemoExecutionService.armDemoExecution();
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(true);

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(res.success).toBe(true);
    expect(res.code).toBe('DEMO_ORDER_EXECUTED');
    expect(res.record?.phase).toBe('POSITION_CONFIRMED');
  });

  it('3. LIVE execution is unconditionally rejected and forbidden', () => {
    const liveSafety = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });

    expect(liveSafety.allowed).toBe(false);
    expect(liveSafety.code).toBe('LIVE_EXECUTION_DISARMED');
  });

  it('4. Wrong broker account environment is rejected', () => {
    const wrongEnvSafety = validateExecutionEnvironmentSafety({
      environment: 'PAPER',
      brokerId: 'ctrader-broker-01', // cTrader broker cannot trade in PAPER mode
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });

    expect(wrongEnvSafety.allowed).toBe(false);
    expect(wrongEnvSafety.code).toBe('PAPER_ENVIRONMENT_VIOLATION');
  });

  // --- PART 2: SIGNAL PRE-ORDER GATES (Scenarios 5?11) ---

  it('5. NO_SETUP action is rejected from DEMO execution', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 50, ema50: 1.0850, adx: { adx: 10 } }
    });

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(res.success).toBe(false);
    expect(res.code).toBe('NO_SETUP_REJECTED');
  });

  it('6. WAIT_FOR_CONFIRMATION action is rejected from DEMO execution', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'XAU/USD',
      currentPrice: 2400.00,
      indicators: { rsi: 58, ema20: 2398.00, ema50: 2395.00, superTrend: { trend: 'BULLISH' }, adx: { adx: 19 }, atr: 4.5 }
    });

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 2400.00);
    expect(res.success).toBe(false);
    expect(res.code).toBe('WAIT_REJECTED');
  });

  it('7. VETO action is rejected from DEMO execution', () => {
    controlledDemoExecutionService.armDemoExecution();
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

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(res.success).toBe(false);
    expect(res.code).toBe('VETO_REJECTED');
  });

  it('8. Stale signal is rejected from DEMO execution', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    opp.timestamp = Date.now() - 120000;

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(res.success).toBe(false);
    expect(res.code).toBe('STALE_SIGNAL');
  });

  it('9. Invalid geometry is rejected from DEMO execution', () => {
    controlledDemoExecutionService.armDemoExecution();
    const badGeometryOpp = {
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      status: 'VALID_PROPOSAL' as const,
      timestamp: Date.now(),
      entryZone: { min: 1.0850, max: 1.0860 },
      stopLoss: 1.0890, // Inverted SL
      takeProfit1: 1.0820,
      confidence: 70
    };

    const res = controlledDemoExecutionService.executeControlledDemoOrder(badGeometryOpp as any, 0.01, 1.0850);
    expect(res.success).toBe(false);
    expect(res.code).toBe('INVALID_GEOMETRY');
  });

  it('10. Enforces single-trade limit (MAX_CONCURRENT_DEMO_POSITIONS = 1)', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp1 = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const opp2 = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      currentPrice: 1.2700,
      indicators: { rsi: 38, ema20: 1.2710, ema50: 1.2730, superTrend: { trend: 'BEARISH' }, adx: { adx: 30 }, atr: 0.0025 },
      smc: { orderBlocks: [{ type: 'BEARISH' }] }
    });

    const res1 = controlledDemoExecutionService.executeControlledDemoOrder(opp1, 0.01, 1.0850);
    expect(res1.success).toBe(true);

    // Attempt second concurrent trade
    const res2 = controlledDemoExecutionService.executeControlledDemoOrder(opp2, 0.01, 1.2700);
    expect(res2.success).toBe(false);
    expect(res2.code).toBe('MAX_CONCURRENT_LIMIT_EXCEEDED');
  });

  it('11. Duplicate signal submission is rejected', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res1 = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(res1.success).toBe(true);

    // Close position so concurrent limit isn't hit
    controlledDemoExecutionService.closeDemoPosition(res1.record!.id, 1.0890, 'TAKE_PROFIT_1');

    // Attempt to re-submit exact same signal proposal
    const resDup = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(resDup.success).toBe(false);
    expect(resDup.code).toBe('DUPLICATE_SIGNAL');
  });

  // --- PART 3: BROKER RECONCILIATION & CLOSURE (Scenarios 12?16) ---

  it('12. Reconciles authoritative broker position ID and actual executed price', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const brokerAck = {
      brokerOrderId: 'ctrader-order-9881',
      brokerPositionId: 'ctrader-pos-4412',
      executedPrice: 1.0852 // Slight slippage
    };

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850, brokerAck);
    expect(res.success).toBe(true);
    expect(res.record?.brokerOrderId).toBe('ctrader-order-9881');
    expect(res.record?.brokerPositionId).toBe('ctrader-pos-4412');
    expect(res.record?.acknowledgedEntryPrice).toBe(1.0852);
  });

  it('13. Price hitting Stop Loss closes DEMO position with STOP_LOSS reason', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    const posId = res.record!.id;

    // Market moves below SL (1.0820)
    controlledDemoExecutionService.updatePositionsWithMarketPrice('EUR/USD', 1.0818, 1.0830, 1.0815);

    const closed = controlledDemoExecutionService.getRecordById(posId)!;
    expect(closed.phase).toBe('POSITION_CLOSED');
    expect(closed.closeReason).toBe('STOP_LOSS');
    expect(closed.realizedR).toBeLessThan(0);
  });

  it('14. Closed DEMO trade dispatches TradeClosed event exactly once', async () => {
    let closedCount = 0;
    globalEventBus.subscribe(EventTypes.TradeClosed, async () => {
      closedCount++;
    });

    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    controlledDemoExecutionService.closeDemoPosition(res.record!.id, 1.0820, 'STOP_LOSS');
    controlledDemoExecutionService.closeDemoPosition(res.record!.id, 1.0820, 'STOP_LOSS'); // Redundant close attempt

    await new Promise(r => setTimeout(r, 20));
    expect(closedCount).toBe(1);
  });

  // --- PART 4: LEARNING REHYDRATION & IMMUTABILITY (Scenarios 15?18) ---

  it('15. Post-mortem is generated from DEMO loss', async () => {
    const postMortem = await aiDecisionEngine.createPostMortemFromCanonicalData({
      tradeId: 'demo-pos-01',
      positionId: 'ctrader-pos-4412',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0852,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -32.00,
      pnlPips: -32,
      outcome: 'LOSS',
      cleanNotes: 'Stop loss hit on news spike'
    });

    expect(postMortem.rootCauseEn).toBeDefined();
    expect(postMortem.adaptiveRuleEn).toBeDefined();
  });

  it('16. Future signal receives learning adjustment from DEMO loss memory', () => {
    const review: PostMortemReview = {
      id: 'pm-demo-loss-1',
      pair: 'EUR/USD',
      direction: 'BUY',
      outcome: 'LOSS',
      entryPrice: 1.0852,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -32,
      rootCauseEn: 'News volatility',
      rootCauseMs: 'Kemeruapan berita',
      lessonLearnedEn: 'Penalize high volatility entry',
      lessonLearnedMs: 'Penalti kemeruapan tinggi',
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

  it('17. Historical DEMO trade snapshot remains strictly immutable', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: []
    });

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    const initialAdjustment = res.record!.signalSnapshot.confidenceBreakdown?.learningAdjustment;

    // Subsequent learning review added
    const review: PostMortemReview = { id: 'pm-later', pair: 'EUR/USD', outcome: 'LOSS' } as any;
    aiDecisionEngine.addPostMortemReview(review);

    // Historical DEMO trade signalSnapshot is completely unchanged
    expect(res.record!.signalSnapshot.confidenceBreakdown?.learningAdjustment).toBe(initialAdjustment);
  });

  it('18. DEMO broker execution is clearly separated from REAL_MARKET shadow observations', () => {
    controlledDemoExecutionService.armDemoExecution();
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoExecutionService.executeControlledDemoOrder(opp, 0.01, 1.0850);
    expect(res.record?.executionEnvironment).toBe('DEMO');
  });
});
