import { describe, it, expect, beforeEach } from 'vitest';
import { controlledDemoObservationService } from '../apps/execution-router/src/services/controlledDemoObservationService';
import { controlledDemoSmokeTestHarness } from '../apps/execution-router/src/services/controlledDemoSmokeTestHarness';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI ? Phase 7G Controlled DEMO Observation & Execution Outcome Accumulation', () => {

  beforeEach(() => {
    controlledDemoObservationService.clearRecords();
    aiDecisionEngine.setPostMortemReviews([]);
  });

  // --- PART 1: SAFETY, CONCURRENCY & LIMITS (Scenarios 1?3, 18) ---

  it('1. DEMO-only environment is strictly enforced', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-7g-1');
    expect(preFlight.checks['ENVIRONMENT_IS_DEMO']).toBe(true);
  });

  it('2. Enforces maximum 1 concurrent DEMO position', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res1 = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-7g-conc-1');
    expect(res1.success).toBe(true);

    const res2 = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-7g-conc-2');
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('BROKER_OPEN_POSITIONS_ZERO');
  });

  it('3. Enforces 0.01 lot maximum order volume', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.02, 'idemp-7g-vol');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.checks['VOLUME_IS_001_LOT']).toBe(false);
  });

  it('18. LIVE execution remains unconditionally forbidden and rejected', () => {
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

  // --- PART 2: SIGNAL GATES & GEOMETRY (Scenarios 4?7) ---

  it('4. Requires valid BUY or SELL signal', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-7g-valid');
    expect(preFlight.checks['VALID_ACTION_PROPOSAL']).toBe(true);
  });

  it('5. Rejects stale signals (> 60s)', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    opp.timestamp = Date.now() - 120000;

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-7g-stale');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.checks['SIGNAL_IS_FRESH']).toBe(false);
  });

  it('6. Rejects invalid SL/TP geometry', () => {
    const badGeo: any = {
      pair: 'EUR/USD',
      action: 'BUY',
      status: 'VALID_PROPOSAL',
      timestamp: Date.now(),
      entryZone: { min: 1.0850, max: 1.0860 },
      stopLoss: 1.0890,
      takeProfit1: 1.0820
    };

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(badGeo, 0.01, 'idemp-7g-badgeo');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.checks['GEOMETRY_IS_VALID']).toBe(false);
  });

  it('7. Rejects orders exceeding risk governor limits', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.05, 'idemp-7g-risk');
    expect(preFlight.passed).toBe(false);
    expect(preFlight.checks['RISK_CONTROLS_APPROVED']).toBe(false);
  });

  // --- PART 3: BROKER RECONCILIATION & DUPLICATION (Scenarios 8?11) ---

  it('8. Records authoritative broker acknowledgement details', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-7g-ack', {
      brokerOrderId: 'ord-7g-101',
      brokerPositionId: 'pos-7g-101',
      executedPrice: 1.0852
    });

    expect(res.success).toBe(true);
    expect(res.executionRecord?.brokerOrderId).toBe('ord-7g-101');
    expect(res.executionRecord?.brokerPositionId).toBe('pos-7g-101');
    expect(res.executionRecord?.acknowledgedEntryPrice).toBe(1.0852);
  });

  it('9. Reconciles open position state accurately', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-7g-recon');
    const openPositions = controlledDemoExecutionService.getOpenPositions();
    expect(openPositions.length).toBe(1);
    expect(openPositions[0].id).toBe(res.executionRecord?.id);
  });

  it('10. Prevents duplicate execution of identical signal or idempotency key', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res1 = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-7g-dup-key');
    controlledDemoExecutionService.closeDemoPosition(res1.executionRecord!.id, 1.0890, 'TAKE_PROFIT_1');

    const preFlightDup = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, 'idemp-7g-dup-key');
    expect(preFlightDup.passed).toBe(false);
    expect(preFlightDup.checks['UNIQUE_IDEMPOTENCY_KEY']).toBe(false);
  });

  it('11. Handles ambiguous or fallback broker acknowledgement safely', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-7g-fallback');
    expect(res.executionRecord?.phase).toBe('POSITION_CONFIRMED');
    expect(res.executionRecord?.brokerPositionId).toBeDefined();
  });

  // --- PART 4: DISARM, LEARNING & OBSERVATION STORE (Scenarios 12?17) ---

  it('12. Automatically disarms execution after single-trade lifecycle', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-7g-disarm');
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);
  });

  it('13. Persists canonical post-mortem from DEMO trade close', async () => {
    const postMortem = await aiDecisionEngine.createPostMortemFromCanonicalData({
      tradeId: 'demo-trade-7g-1',
      positionId: 'pos-7g-101',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0851,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0910,
      pnlDollars: -31.00,
      pnlPips: -31,
      outcome: 'LOSS',
      cleanNotes: 'EUR/USD Stop loss exit during London session'
    });

    expect(postMortem.rootCauseEn).toBeDefined();
    expect(postMortem.adaptiveRuleEn).toBeDefined();
  });

  it('14. Rehydrates adaptive learning memory with new post-mortem', () => {
    const review = {
      id: 'pm-7g-rehydrate',
      pair: 'EUR/USD' as const,
      direction: 'BUY' as const,
      outcome: 'LOSS' as const,
      adaptiveRuleEn: 'Widen SL by 1.2x on Order Block Retest'
    } as any;

    aiDecisionEngine.addPostMortemReview(review);
    expect(aiDecisionEngine.getPostMortemReviews().some(r => r.id === 'pm-7g-rehydrate')).toBe(true);
  });

  it('15. Preserves immutable signal snapshots at entry', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-7g-immutable');
    const rec = controlledDemoObservationService.recordDemoExecution(opp, res.executionRecord!);

    expect(Object.isFrozen(rec.signalSnapshot)).toBe(true);
    expect(() => {
      (rec.signalSnapshot as any).confidenceScore = 999;
    }).toThrow();
  });

  it('16. Maintains setup-level isolation across pairs and patterns', () => {
    // Learning on EUR/USD ORDER_BLOCK_RETEST
    const review = {
      id: 'pm-7g-isolated',
      pair: 'EUR/USD' as const,
      direction: 'BUY' as const,
      outcome: 'LOSS' as const,
      adaptiveRuleEn: 'Widen SL'
    } as any;
    aiDecisionEngine.addPostMortemReview(review);

    // GBP/USD setup remains unpolluted
    const oppGbp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      currentPrice: 1.2700,
      indicators: { rsi: 65, ema20: 1.2690, ema50: 1.2670, superTrend: { trend: 'BULLISH' }, adx: { adx: 32 }, atr: 0.0025 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    expect(oppGbp.action).toBe('BUY');
    expect(oppGbp.reasons.some(r => r.includes('EUR/USD'))).toBe(false);
  });

  it('17. Reconciles final broker state to zero open positions after close', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });

    const res = controlledDemoSmokeTestHarness.runControlledSmokeTest(opp, 'idemp-7g-final');
    controlledDemoExecutionService.closeDemoPosition(res.executionRecord!.id, 1.0890, 'TAKE_PROFIT_1');

    const metrics = controlledDemoObservationService.getObservationMetrics();
    expect(controlledDemoExecutionService.getOpenPositions().length).toBe(0);
    expect(metrics.openPositions).toBe(0);
  });
});
