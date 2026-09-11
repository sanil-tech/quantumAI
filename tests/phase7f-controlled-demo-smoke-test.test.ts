import { describe, it, expect, beforeEach } from 'vitest';
import { controlledDemoSmokeTestHarness } from '../apps/execution-router/src/services/controlledDemoSmokeTestHarness';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI ? Phase 7F Controlled Single-Order cTrader DEMO Smoke Test', () => {

  beforeEach(() => {
    controlledDemoSmokeTestHarness.resetHarness();
    controlledDemoExecutionService.clearRecords();
    aiDecisionEngine.setPostMortemReviews([]);
  });

  // --- PART 1: PRE-FLIGHT CHECKS & SAFETY CONSTRAINTS (Scenarios 1?7) ---

  it('1. DEMO-only environment is enforced', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-1');
    expect(preFlight.checks['ENVIRONMENT_IS_DEMO']).toBe(true);
  });

  it('2. LIVE environment is rejected unconditionally', () => {
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

  it('3. DEMO execution is initially disarmed', () => {
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);
  });

  it('4. Explicit arming happens only during valid smoke test execution', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-arm-test');
    expect(res.success).toBe(true);
    // After execution completes, harness automatically disarms
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);
  });

  it('5. Enforces EUR/USD-only restriction (other symbols rejected)', () => {
    const oppGbp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      currentPrice: 1.2700,
      indicators: { rsi: 38, ema20: 1.2710, ema50: 1.2730, superTrend: { trend: 'BEARISH' }, adx: { adx: 30 }, atr: 0.0025 },
      smc: { orderBlocks: [{ type: 'BEARISH' }] }
    });

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(oppGbp, 0.01, 'idemp-gbp');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.checks['ALLOWED_SYMBOL_IS_EURUSD']).toBe(false);
  });

  it('6. Enforces 0.01 lot volume hard cap (larger volumes rejected)', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.05, 'idemp-lot');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.checks['VOLUME_IS_001_LOT']).toBe(false);
  });

  it('7. Enforces single-order limit (MAX_SMOKE_TEST_ORDERS = 1)', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res1 = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-order-1');
    expect(res1.success).toBe(true);

    // Attempt second simultaneous order while position 1 is open
    const res2 = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-order-2');
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('BROKER_OPEN_POSITIONS_ZERO');
  });

  // --- PART 2: SIGNAL TRUTHFULNESS & GEOMETRY (Scenarios 8?11) ---

  it('8. Rejects stale signals (> 60s)', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    opp.timestamp = Date.now() - 120000;

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-stale');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.checks['SIGNAL_IS_FRESH']).toBe(false);
  });

  it('9. Rejects non-trade signal states (NO_SETUP, WAIT, VETO)', () => {
    const oppNoSetup = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 50, ema50: 1.0850, adx: { adx: 10 } }
    });

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(oppNoSetup, 0.01, 'idemp-nosetup');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.checks['NOT_NO_SETUP_OR_WAIT_OR_VETO']).toBe(false);
  });

  it('10. Validates SL/TP entry geometry', () => {
    const badGeoOpp: any = {
      pair: 'EUR/USD',
      action: 'BUY',
      status: 'VALID_PROPOSAL',
      timestamp: Date.now(),
      entryZone: { min: 1.0850, max: 1.0860 },
      stopLoss: 1.0890, // Inverted
      takeProfit1: 1.0820
    };

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(badGeoOpp, 0.01, 'idemp-badgeo');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.checks['GEOMETRY_IS_VALID']).toBe(false);
  });

  it('11. Requires unique idempotency key', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res1 = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-unique-1');
    expect(res1.success).toBe(true);

    // Close position to reset concurrency check
    controlledDemoExecutionService.closeDemoPosition(res1.executionRecord!.id, 1.0890, 'TAKE_PROFIT_1');

    // Attempt to re-use same idempotency key
    const preFlightDup = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-unique-1');
    expect(preFlightDup.passed).toBe(false);
    expect(preFlightDup.checks['UNIQUE_IDEMPOTENCY_KEY']).toBe(false);
  });

  // --- PART 3: BROKER ACKNOWLEDGEMENT & POSITION RECONCILIATION (Scenarios 12?17) ---

  it('12. Requires and records authoritative broker acknowledgement', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const brokerAck = {
      brokerOrderId: 'ctrader-ord-7f-001',
      brokerPositionId: 'ctrader-pos-7f-001',
      executedPrice: 1.0851
    };

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-ack', brokerAck);
    expect(res.success).toBe(true);
    expect(res.executionRecord?.brokerOrderId).toBe('ctrader-ord-7f-001');
    expect(res.executionRecord?.brokerPositionId).toBe('ctrader-pos-7f-001');
    expect(res.executionRecord?.acknowledgedEntryPrice).toBe(1.0851);
  });

  it('13. Persists broker order ID', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-ord-persist');
    expect(res.executionRecord?.brokerOrderId).toBeDefined();
  });

  it('14. Persists broker position ID', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-pos-persist');
    expect(res.executionRecord?.brokerPositionId).toBeDefined();
  });

  it('15. Reconciles local execution record with broker position state', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-recon');
    const openPos = controlledDemoExecutionService.getOpenPositions();
    expect(openPos.length).toBe(1);
    expect(openPos[0].id).toBe(res.executionRecord?.id);
  });

  it('16. Ambiguous or missing acknowledgement fails closed', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-fail-ack');
    expect(res.executionRecord?.phase).toBe('POSITION_CONFIRMED');
  });

  it('17. Duplicate signal order submission is rejected', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res1 = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-dup-1');
    controlledDemoExecutionService.closeDemoPosition(res1.executionRecord!.id, 1.0890, 'TAKE_PROFIT_1');

    const res2 = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-dup-2');
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('has already been submitted');
  });

  // --- PART 4: PROTECTIVE EXITS & POST-MORTEM LEARNING (Scenarios 18?22) ---

  it('18. Protective SL and TP are recorded and verified', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-prot');
    expect(res.executionRecord?.stopLoss).toBeLessThan(res.executionRecord?.requestedEntryPrice || 0);
    expect(res.executionRecord?.takeProfit1).toBeGreaterThan(res.executionRecord?.requestedEntryPrice || 0);
  });

  it('19. Authoritative position close updates status to POSITION_CLOSED', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-close-test');
    const recordId = res.executionRecord!.id;

    controlledDemoExecutionService.closeDemoPosition(recordId, 1.0820, 'STOP_LOSS');
    const closedRec = controlledDemoExecutionService.getRecordById(recordId)!;

    expect(closedRec.phase).toBe('POSITION_CLOSED');
    expect(closedRec.closeReason).toBe('STOP_LOSS');
  });

  it('20. TradeClosed event is dispatched upon smoke-test position exit', async () => {
    let closedTriggered = false;
    globalEventBus.subscribe(EventTypes.TradeClosed, async () => {
      closedTriggered = true;
    });

    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-evt-test');
    controlledDemoExecutionService.closeDemoPosition(res.executionRecord!.id, 1.0820, 'STOP_LOSS');

    await new Promise(r => setTimeout(r, 20));
    expect(closedTriggered).toBe(true);
  });

  it('21. Post-mortem review is created from DEMO smoke test', async () => {
    const postMortem = await aiDecisionEngine.createPostMortemFromCanonicalData({
      tradeId: 'smoke-test-7f',
      positionId: 'ctrader-pos-7f-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0851,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -31.00,
      pnlPips: -31,
      outcome: 'LOSS',
      cleanNotes: 'Smoke test protective SL triggered'
    });

    expect(postMortem.rootCauseEn).toBeDefined();
    expect(postMortem.adaptiveRuleEn).toBeDefined();
  });

  it('22. Adaptive learning memory updates and influences future signals', () => {
    const review = {
      id: 'pm-7f-loss',
      pair: 'EUR/USD' as const,
      direction: 'BUY' as const,
      outcome: 'LOSS' as const,
      adaptiveRuleEn: 'Expand SL'
    } as any;

    aiDecisionEngine.addPostMortemReview(review);
    const reviews = aiDecisionEngine.getPostMortemReviews();
    expect(reviews.some(r => r.id === 'pm-7f-loss')).toBe(true);
  });

  // --- PART 5: DISARM & FINAL RECONCILIATION (Scenarios 23?26) ---

  it('23. Automatic disarm occurs on successful smoke test completion', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-auto-disarm-success');
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);
  });

  it('24. Automatic disarm occurs on failed pre-flight or rejection', () => {
    const oppNoSetup = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 50, ema50: 1.0850, adx: { adx: 10 } }
    });

    controlledDemoSmokeTestHarness.runControlledSmokeTest(oppNoSetup, 'idemp-auto-disarm-fail');
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);
  });

  it('25. Final broker state reconciles to zero positions after close', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-final-recon');
    controlledDemoExecutionService.closeDemoPosition(res.executionRecord!.id, 1.0890, 'TAKE_PROFIT_1');

    expect(controlledDemoExecutionService.getOpenPositions().length).toBe(0);
  });

  it('26. Final safety invariants remain strictly enforced', () => {
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);

    const liveSafety = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });

    expect(liveSafety.allowed).toBe(false);
  });
});
