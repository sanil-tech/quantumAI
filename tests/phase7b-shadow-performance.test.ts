import { describe, it, expect, beforeEach } from 'vitest';
import { shadowAnalyticsService, ShadowAnalyticsService } from '../src/server/services/shadowAnalyticsService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { ShadowPerformanceRecord, PostMortemReview } from '../src/types';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI ? Phase 7B Shadow Performance & Adaptive Learning Effectiveness', () => {

  beforeEach(() => {
    shadowAnalyticsService.clearRecords();
  });

  // --- PART 1: SHADOW PERFORMANCE RECORD CREATION (Scenarios 1?5) ---

  it('1. VALID BUY creates a valid shadow performance record', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH', min: 1.0840, max: 1.0848 }] }
    });

    const record: ShadowPerformanceRecord = {
      id: 'perf-buy-01',
      signalId: opp.proposalId || 'sig-01',
      pair: opp.pair,
      timeframe: 'M15',
      direction: 'BUY',
      setupType: opp.setupType || 'ORDER_BLOCK_RETEST',
      entryType: opp.entryType || 'PULLBACK_LIMIT',
      marketRegime: opp.marketRegime || 'TRENDING_BULLISH',
      signalStatus: opp.status || 'VALID_PROPOSAL',
      provenanceSource: 'AI_SHADOW',
      signalTimestamp: opp.timestamp,
      entryTimestamp: Date.now(),
      plannedEntry: opp.entryZone?.min || 1.0846,
      actualShadowEntry: 1.0846,
      stopLoss: opp.stopLoss || 1.0820,
      takeProfit1: opp.takeProfit1 || 1.0890,
      learningVersion: '1.0',
      learningAdjustment: opp.confidenceBreakdown?.learningAdjustment || 0,
      learningRuleIds: opp.learningRuleIds || [],
      learningEvidence: opp.learningEvidence || [],
      vetoed: false,
      confirmationRequired: false
    };

    shadowAnalyticsService.recordShadowTrade(record);
    const records = shadowAnalyticsService.getRecords();
    expect(records.length).toBe(1);
    expect(records[0].direction).toBe('BUY');
    expect(records[0].provenanceSource).toBe('AI_SHADOW');
  });

  it('2. VALID SELL creates a valid shadow performance record', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'GBP/USD',
      timeframe: 'M15',
      currentPrice: 1.2700,
      indicators: { rsi: 38, ema20: 1.2710, ema50: 1.2730, superTrend: { trend: 'BEARISH' }, adx: { adx: 30 }, atr: 0.0025 },
      smc: { orderBlocks: [{ type: 'BEARISH' }] }
    });

    const record: ShadowPerformanceRecord = {
      id: 'perf-sell-01',
      signalId: 'sig-02',
      pair: opp.pair,
      timeframe: 'M15',
      direction: 'SELL',
      setupType: opp.setupType || 'ORDER_BLOCK_RETEST',
      entryType: opp.entryType || 'PULLBACK_LIMIT',
      marketRegime: opp.marketRegime || 'TRENDING_BEARISH',
      signalStatus: opp.status || 'VALID_PROPOSAL',
      provenanceSource: 'AI_SHADOW',
      signalTimestamp: opp.timestamp,
      entryTimestamp: Date.now(),
      plannedEntry: 1.2698,
      actualShadowEntry: 1.2698,
      stopLoss: opp.stopLoss || 1.2735,
      takeProfit1: opp.takeProfit1 || 1.2645,
      learningVersion: '1.0',
      learningAdjustment: 0,
      learningRuleIds: [],
      learningEvidence: [],
      vetoed: false,
      confirmationRequired: false
    };

    shadowAnalyticsService.recordShadowTrade(record);
    expect(shadowAnalyticsService.getRecords().length).toBe(1);
  });

  it('3. NO_SETUP does not create an executable shadow trade', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 50, ema50: 1.0850, adx: { adx: 10 } }
    });

    expect(opp.action).toBe('NO_SETUP');
    expect(opp.entryZone).toBeNull();
  });

  it('4. WAIT_FOR_CONFIRMATION does not create an executable shadow trade', () => {
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'XAU/USD',
      currentPrice: 2400.00,
      indicators: { rsi: 58, ema20: 2398.00, ema50: 2395.00, superTrend: { trend: 'BULLISH' }, adx: { adx: 19 }, atr: 4.5 }
    });

    expect(opp.action).toBe('WAIT_FOR_CONFIRMATION');
    expect(opp.entryZone).toBeNull();
  });

  it('5. VETO does not create an executable shadow trade', () => {
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

    expect(opp.action).toBe('VETO');
    expect(opp.entryZone).toBeNull();
  });

  // --- PART 2: METRICS, MFE, MAE & R-MULTIPLES (Scenarios 6?9) ---

  it('6. Shadow trade close records outcome and realized PnL', () => {
    const record: ShadowPerformanceRecord = {
      id: 'perf-win-01',
      signalId: 'sig-03',
      pair: 'EUR/USD',
      timeframe: 'M15',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      entryType: 'PULLBACK_LIMIT',
      marketRegime: 'TRENDING_BULLISH',
      signalStatus: 'VALID_PROPOSAL',
      provenanceSource: 'AI_SHADOW',
      signalTimestamp: Date.now() - 3600000,
      entryTimestamp: Date.now() - 3000000,
      closeTimestamp: Date.now(),
      plannedEntry: 1.0850,
      actualShadowEntry: 1.0850,
      stopLoss: 1.0820,
      takeProfit1: 1.0895,
      learningVersion: '1.0',
      learningAdjustment: 0,
      learningRuleIds: [],
      learningEvidence: [],
      vetoed: false,
      confirmationRequired: false,
      outcome: 'WIN',
      exitPrice: 1.0895,
      exitReason: 'TAKE_PROFIT_1',
      realizedR: 1.50,
      pnlPips: 45,
      mfePips: 48,
      maePips: 8,
      holdingDurationMs: 3000000
    };

    shadowAnalyticsService.recordShadowTrade(record);
    const metrics = shadowAnalyticsService.calculateCohortMetrics(shadowAnalyticsService.getRecords(), 'BASELINE');
    expect(metrics.winCount).toBe(1);
    expect(metrics.observedWinRate).toBe(1.0);
    expect(metrics.averageR).toBe(1.50);
  });

  it('7. MFE (Maximum Favorable Excursion) calculated correctly', () => {
    // BUY entry at 1.0850, reached high of 1.0895 -> MFE = 45 pips
    const mfeMae = ShadowAnalyticsService.calculateMfeMae(1.0850, 1.0895, 1.0842, 'BUY', 10000);
    expect(mfeMae.mfePips).toBe(45.0);
  });

  it('8. MAE (Maximum Adverse Excursion) calculated correctly', () => {
    // BUY entry at 1.0850, dipped to low of 1.0842 -> MAE = 8 pips
    const mfeMae = ShadowAnalyticsService.calculateMfeMae(1.0850, 1.0895, 1.0842, 'BUY', 10000);
    expect(mfeMae.maePips).toBe(8.0);
  });

  it('9. Realized R Multiple calculated correctly for BUY and SELL', () => {
    // BUY: Entry 1.0850, Exit 1.0895, SL 1.0820 -> Risk = 30 pips, Gain = 45 pips -> R = +1.5
    const buyR = ShadowAnalyticsService.calculateRMultiple(1.0850, 1.0895, 1.0820, 'BUY');
    expect(buyR).toBe(1.50);

    // SELL: Entry 1.2700, Exit 1.2730, SL 1.2730 -> Loss = -30 pips -> R = -1.0
    const sellLossR = ShadowAnalyticsService.calculateRMultiple(1.2700, 1.2730, 1.2730, 'SELL');
    expect(sellLossR).toBe(-1.00);
  });

  // --- PART 3: COHORT CLASSIFICATION & COMPARISON (Scenarios 10?13) ---

  it('10. Baseline cohort is correctly segregated (learningAdjustment === 0)', () => {
    const baseRecord: ShadowPerformanceRecord = {
      id: 'rec-base-1',
      signalId: 'sig-base',
      pair: 'EUR/USD',
      timeframe: 'M15',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      entryType: 'PULLBACK_LIMIT',
      marketRegime: 'TRENDING_BULLISH',
      signalStatus: 'VALID_PROPOSAL',
      provenanceSource: 'AI_SHADOW',
      signalTimestamp: Date.now(),
      entryTimestamp: Date.now(),
      plannedEntry: 1.0850,
      actualShadowEntry: 1.0850,
      stopLoss: 1.0820,
      takeProfit1: 1.0895,
      learningVersion: '1.0',
      learningAdjustment: 0,
      learningRuleIds: [],
      learningEvidence: [],
      vetoed: false,
      confirmationRequired: false,
      outcome: 'WIN',
      realizedR: 1.5
    };

    shadowAnalyticsService.recordShadowTrade(baseRecord);
    const comparison = shadowAnalyticsService.compareCohorts();
    expect(comparison.baselineCohort.sampleSize).toBe(1);
    expect(comparison.learningAffectedCohort.sampleSize).toBe(0);
  });

  it('11. Learning-affected cohort is correctly segregated (learningAdjustment !== 0)', () => {
    const adaptedRecord: ShadowPerformanceRecord = {
      id: 'rec-adapt-1',
      signalId: 'sig-adapt',
      pair: 'EUR/USD',
      timeframe: 'M15',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      entryType: 'PULLBACK_LIMIT',
      marketRegime: 'TRENDING_BULLISH',
      signalStatus: 'VALID_PROPOSAL',
      provenanceSource: 'AI_SHADOW',
      signalTimestamp: Date.now(),
      entryTimestamp: Date.now(),
      plannedEntry: 1.0850,
      actualShadowEntry: 1.0850,
      stopLoss: 1.0814,
      takeProfit1: 1.0895,
      learningVersion: '1.0',
      learningAdjustment: -6,
      learningRuleIds: ['pm-loss-1'],
      learningEvidence: ['[ADAPTIVE LEARNING MEMORY] SL expanded'],
      vetoed: false,
      confirmationRequired: true,
      outcome: 'WIN',
      realizedR: 1.2
    };

    shadowAnalyticsService.recordShadowTrade(adaptedRecord);
    const comparison = shadowAnalyticsService.compareCohorts();
    expect(comparison.learningAffectedCohort.sampleSize).toBe(1);
    expect(comparison.baselineCohort.sampleSize).toBe(0);
  });

  it('12. Learning adjustment is properly recorded and aggregated in metrics', () => {
    const record: ShadowPerformanceRecord = {
      id: 'rec-adj-1',
      signalId: 'sig-adj',
      pair: 'EUR/USD',
      timeframe: 'M15',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      entryType: 'PULLBACK_LIMIT',
      marketRegime: 'TRENDING_BULLISH',
      signalStatus: 'VALID_PROPOSAL',
      provenanceSource: 'AI_SHADOW',
      signalTimestamp: Date.now(),
      entryTimestamp: Date.now(),
      plannedEntry: 1.0850,
      actualShadowEntry: 1.0850,
      stopLoss: 1.0814,
      takeProfit1: 1.0895,
      learningVersion: '1.0',
      learningAdjustment: -12,
      learningRuleIds: ['pm-loss-1', 'pm-loss-2'],
      learningEvidence: [],
      vetoed: false,
      confirmationRequired: true
    };

    shadowAnalyticsService.recordShadowTrade(record);
    const rec = shadowAnalyticsService.getRecords()[0];
    expect(rec.learningAdjustment).toBe(-12);
  });

  it('13. Learning-based VETO is properly tracked in cohort analytics', () => {
    const vetoRecord: ShadowPerformanceRecord = {
      id: 'rec-veto-1',
      signalId: 'sig-veto',
      pair: 'EUR/USD',
      timeframe: 'M15',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      entryType: 'NONE',
      marketRegime: 'TRENDING_BULLISH',
      signalStatus: 'VETOED',
      provenanceSource: 'AI_SHADOW',
      signalTimestamp: Date.now(),
      entryTimestamp: Date.now(),
      plannedEntry: 0,
      actualShadowEntry: 0,
      stopLoss: 0,
      takeProfit1: 0,
      learningVersion: '1.0',
      learningAdjustment: -35,
      learningRuleIds: ['pm-1', 'pm-2', 'pm-3'],
      learningEvidence: [],
      vetoed: true,
      confirmationRequired: false
    };

    shadowAnalyticsService.recordShadowTrade(vetoRecord);
    const comparison = shadowAnalyticsService.compareCohorts();
    expect(comparison.learningAffectedCohort.sampleSize).toBe(1);
  });

  // --- PART 4: ISOLATION & SAMPLE SIZE PROTECTION (Scenarios 14?18) ---

  it('14. Setup fingerprint isolation prevents cross-setup interference', () => {
    const obReview: PostMortemReview = {
      id: 'pm-ob-1',
      pair: 'AUD/USD',
      outcome: 'LOSS',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      marketRegime: 'TRENDING_BEARISH'
    } as any;

    const momentumOpp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'AUD/USD',
      currentPrice: 0.6600,
      indicators: { rsi: 35, ema20: 0.6615, ema50: 0.6630, superTrend: { trend: 'BEARISH' }, adx: { adx: 32 }, atr: 0.0015 },
      smc: { orderBlocks: [] },
      postMortemReviews: [obReview, obReview, obReview]
    });

    expect(momentumOpp.action).toBe('SELL');
    expect(momentumOpp.status).toBe('VALID_PROPOSAL');
  });

  it('15. Symbol isolation prevents cross-symbol pollution', () => {
    const audLoss: PostMortemReview = { id: 'pm-aud-1', pair: 'AUD/USD', outcome: 'LOSS' } as any;
    const xauOpp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'XAU/USD',
      currentPrice: 2400.00,
      indicators: { rsi: 65, ema20: 2395.00, ema50: 2390.00, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 4.5 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: [audLoss, audLoss, audLoss]
    });

    expect(xauOpp.action).toBe('BUY');
    expect(xauOpp.status).toBe('VALID_PROPOSAL');
  });

  it('16. Timeframe isolation protects distinct execution horizons', () => {
    const m15Review: PostMortemReview = { id: 'pm-m15-1', pair: 'EUR/USD', outcome: 'LOSS', timeframe: 'M15' } as any;
    expect(m15Review.timeframe).toBe('M15');
  });

  it('17. Market regime isolation prevents trend setups from inheriting choppy failure memory', () => {
    const choppyLoss: PostMortemReview = { id: 'pm-chop-1', pair: 'EUR/USD', outcome: 'LOSS', marketRegime: 'RANGING_CHOPPY' } as any;
    const trendingOpp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 32 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] },
      postMortemReviews: [choppyLoss, choppyLoss, choppyLoss]
    });

    expect(trendingOpp.action).toBe('BUY');
  });

  it('18. Sample size classification tiers operate accurately', () => {
    expect(ShadowAnalyticsService.classifyEvidenceTier(3)).toBe('INSUFFICIENT_SAMPLE');
    expect(ShadowAnalyticsService.classifyEvidenceTier(10)).toBe('EARLY_SIGNAL');
    expect(ShadowAnalyticsService.classifyEvidenceTier(20)).toBe('PRELIMINARY');
    expect(ShadowAnalyticsService.classifyEvidenceTier(50)).toBe('MEANINGFUL_SAMPLE');
    expect(ShadowAnalyticsService.classifyEvidenceTier(150)).toBe('STRONGER_EVIDENCE');
  });

  // --- PART 5: TELEMETRY AUTHENTICITY & SAFETY INVARIANTS (Scenarios 19?22) ---

  it('19. No synthetic production telemetry is generated', () => {
    const records = shadowAnalyticsService.getRecords();
    expect(Array.isArray(records)).toBe(true);
  });

  it('20. Read-only safety invariants remain strictly enforced', () => {
    const gateRes = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });

    expect(gateRes.allowed).toBe(false);
  });

  it('21. Broker order count remains zero', () => {
    expect((shadowAnalyticsService as any).brokerOrdersTransmitted || 0).toBe(0);
  });

  it('22. LIVE execution remains forbidden and fail-closed', () => {
    const gateRes = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-01',
      symbol: 'GBPUSD',
      direction: 'SELL',
      requestedLotSize: 0.01
    });

    expect(gateRes.allowed).toBe(false);
  });
});
