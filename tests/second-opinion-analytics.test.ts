import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  secondOpinionObservationService,
  SecondOpinionObservation
} from '../apps/decision-agent/src/services/secondOpinionObservationService';
import {
  secondOpinionAnalyticsService,
  SecondOpinionAnalyticsService
} from '../apps/decision-agent/src/services/secondOpinionAnalyticsService';
import { executionEligibilityGate } from '../src/server/services/validation/executionEligibilityGate';
import { signalValidationGate } from '../src/server/services/validation/signalValidationGate';

describe('Phase 1.3 — Second Opinion Evidence Analytics Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    secondOpinionObservationService.clearObservations();
    process.env.OPENAI_SECOND_OPINION_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-mock-openai-key-never-exposed';
    process.env.OPENAI_SECOND_OPINION_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_SECOND_OPINION_MODE = 'OBSERVATION';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  const createSampleObs = (
    signalId: string,
    overrides: Partial<SecondOpinionObservation> = {}
  ): SecondOpinionObservation => {
    const input = {
      signalId,
      pair: overrides.symbol || 'EUR/USD',
      timeframe: overrides.timeframe || 'M15',
      candidateDirection: (overrides.quantumAiDirection as any) || 'BUY',
      candidateConfidence: overrides.quantumAiConfidence !== undefined ? overrides.quantumAiConfidence : 85,
      entry: overrides.entry || 1.0850,
      stopLoss: overrides.stopLoss || 1.0800,
      takeProfit1: overrides.takeProfit || 1.0950,
      dataMode: (overrides.dataMode as any) || 'LIVE'
    };

    const result = {
      signalId,
      review: overrides.openAiReview || 'PASS',
      candidateDirectionSupported: overrides.openAiReview !== 'REJECT',
      independentBias: overrides.openAiBias || 'BULLISH',
      confidence: overrides.openAiConfidence !== undefined ? overrides.openAiConfidence : 80,
      agreement: overrides.agreement || 'AGREE',
      contradictionLevel: overrides.contradictionLevel || 'LOW',
      riskFlags: overrides.riskFlags || [],
      keyConcerns: overrides.keyConcerns || [],
      invalidationConcerns: overrides.invalidationConcerns || [],
      economicRisk: (overrides.economicRisk as any) || 'LOW',
      summary: 'Test summary.',
      model: overrides.model || 'gpt-4o-mini',
      latencyMs: overrides.latencyMs || 10,
      reviewedAt: overrides.secondOpinionAt || new Date().toISOString()
    };

    const obs = secondOpinionObservationService.recordObservation(input, result, {
      executionEligibilityAtReview: overrides.executionEligibilityAtReview || 'WAITING_FOR_ENTRY',
      brokerOrderId: overrides.brokerOrderId,
      brokerPositionId: overrides.brokerPositionId
    });

    if (overrides.outcomeStatus && overrides.outcomeStatus !== 'OPEN') {
      obs.outcomeStatus = overrides.outcomeStatus;
      obs.outcomePnl = overrides.outcomePnl;
      obs.outcomePips = overrides.outcomePips;
      obs.outcomeDirection = overrides.outcomeDirection || 'BUY';
      obs.outcomeRecordedAt = overrides.outcomeRecordedAt || new Date().toISOString();
      obs.correlationMethod = overrides.correlationMethod || 'CANONICAL_BROKER_ORDER_ID';
    }

    return obs;
  };

  // =========================================================================
  // TEST 1: LIVE-only filtering default
  // =========================================================================
  it('1. LIVE-only filtering default: returns only LIVE observations when no lineage filter is passed', () => {
    createSampleObs('sig_live_1', { dataMode: 'LIVE' });
    createSampleObs('sig_shadow_1', { dataMode: 'SHADOW' });
    createSampleObs('sig_synth_1', { dataMode: 'SYNTHETIC' });

    const filtered = secondOpinionAnalyticsService.getFilteredObservations();
    expect(filtered.length).toBe(1);
    expect(filtered[0].signalId).toBe('sig_live_1');
    expect(filtered[0].dataMode).toBe('LIVE');
  });

  // =========================================================================
  // TEST 2: Synthetic observations excluded from LIVE statistics
  // =========================================================================
  it('2. Synthetic observations excluded from LIVE statistics', () => {
    createSampleObs('sig_synth_win', {
      dataMode: 'SYNTHETIC',
      outcomeStatus: 'CLOSED_WIN',
      outcomePnl: 500.00,
      outcomePips: 50.0
    });
    createSampleObs('sig_live_win', {
      dataMode: 'LIVE',
      outcomeStatus: 'CLOSED_WIN',
      outcomePnl: 100.00,
      outcomePips: 10.0
    });

    const report = secondOpinionAnalyticsService.getAnalyticsReport();
    expect(report.dataset.dataLineage).toBe('LIVE');
    expect(report.observations.total).toBe(1);
    expect(report.outcomes.totalClosedTrades).toBe(1);
    expect(report.outcomes.totalPnl).toBe(100.00);
  });

  // =========================================================================
  // TEST 3: Backtest observations excluded from LIVE statistics
  // =========================================================================
  it('3. Backtest observations excluded from LIVE statistics', () => {
    createSampleObs('sig_bt_1', {
      dataMode: 'BACKTEST',
      outcomeStatus: 'CLOSED_WIN',
      outcomePnl: 300.00
    });

    const report = secondOpinionAnalyticsService.getAnalyticsReport();
    expect(report.observations.total).toBe(0);
    expect(report.outcomes.totalClosedTrades).toBe(0);

    // Filterable explicitly when requested
    const btReport = secondOpinionAnalyticsService.getAnalyticsReport({ dataLineage: 'BACKTEST' });
    expect(btReport.observations.total).toBe(1);
    expect(btReport.outcomes.totalPnl).toBe(300.00);
  });

  // =========================================================================
  // TEST 4: UNKNOWN lineage excluded from LIVE statistics
  // =========================================================================
  it('4. UNKNOWN lineage excluded from LIVE statistics without upgrading', () => {
    createSampleObs('sig_unk_1', {
      dataMode: 'UNKNOWN',
      outcomeStatus: 'CLOSED_WIN',
      outcomePnl: 150.00
    });

    const report = secondOpinionAnalyticsService.getAnalyticsReport();
    expect(report.observations.total).toBe(0);
  });

  // =========================================================================
  // TEST 5, 6, 7: Agreement Grouping (AGREE, PARTIAL, DISAGREE)
  // =========================================================================
  it('5-7. Agreement Grouping: Categorizes outcomes by AGREE, PARTIAL, and DISAGREE accurately', () => {
    createSampleObs('sig_agree_1', {
      agreement: 'AGREE',
      outcomeStatus: 'CLOSED_WIN',
      outcomePnl: 80.00,
      outcomePips: 16.0
    });
    createSampleObs('sig_partial_1', {
      agreement: 'PARTIAL',
      outcomeStatus: 'CLOSED_BREAKEVEN',
      outcomePnl: 0.00,
      outcomePips: 0.0
    });
    createSampleObs('sig_disagree_1', {
      agreement: 'DISAGREE',
      outcomeStatus: 'CLOSED_LOSS',
      outcomePnl: -50.00,
      outcomePips: -10.0
    });

    const report = secondOpinionAnalyticsService.getAnalyticsReport();
    expect(report.agreement.AGREE.tradeCount).toBe(1);
    expect(report.agreement.AGREE.winCount).toBe(1);
    expect(report.agreement.AGREE.totalPnl).toBe(80.00);

    expect(report.agreement.PARTIAL.tradeCount).toBe(1);
    expect(report.agreement.PARTIAL.breakevenCount).toBe(1);
    expect(report.agreement.PARTIAL.totalPnl).toBe(0.00);

    expect(report.agreement.DISAGREE.tradeCount).toBe(1);
    expect(report.agreement.DISAGREE.lossCount).toBe(1);
    expect(report.agreement.DISAGREE.totalPnl).toBe(-50.00);
  });

  // =========================================================================
  // TEST 8, 9, 10, 11: Review Grouping (PASS, REVIEW, REJECT, UNAVAILABLE)
  // =========================================================================
  it('8-11. Review Grouping: Correctly segments outcomes by OpenAI review verdict', () => {
    createSampleObs('sig_pass_1', { openAiReview: 'PASS', outcomeStatus: 'CLOSED_WIN', outcomePnl: 100 });
    createSampleObs('sig_rev_1', { openAiReview: 'REVIEW', outcomeStatus: 'CLOSED_LOSS', outcomePnl: -40 });
    createSampleObs('sig_rej_1', { openAiReview: 'REJECT', outcomeStatus: 'CLOSED_LOSS', outcomePnl: -60 });
    createSampleObs('sig_unavail_1', { openAiReview: 'UNAVAILABLE', outcomeStatus: 'CLOSED_WIN', outcomePnl: 50 });

    const report = secondOpinionAnalyticsService.getAnalyticsReport();
    expect(report.review.PASS.tradeCount).toBe(1);
    expect(report.review.PASS.winCount).toBe(1);

    expect(report.review.REVIEW.tradeCount).toBe(1);
    expect(report.review.REVIEW.lossCount).toBe(1);

    expect(report.review.REJECT.tradeCount).toBe(1);
    expect(report.review.REJECT.lossCount).toBe(1);

    expect(report.review.UNAVAILABLE.tradeCount).toBe(1);
    expect(report.review.UNAVAILABLE.winCount).toBe(1);
  });

  // =========================================================================
  // TEST 12: Economic Risk Grouping (LOW, MEDIUM, HIGH, UNKNOWN)
  // =========================================================================
  it('12. Economic-Risk Grouping: Correctly aggregates outcomes across all 4 risk tiers', () => {
    createSampleObs('sig_econ_low', { economicRisk: 'LOW', outcomeStatus: 'CLOSED_WIN', outcomePnl: 120 });
    createSampleObs('sig_econ_med', { economicRisk: 'MEDIUM', outcomeStatus: 'CLOSED_LOSS', outcomePnl: -30 });
    createSampleObs('sig_econ_high', { economicRisk: 'HIGH', outcomeStatus: 'CLOSED_LOSS', outcomePnl: -90 });
    createSampleObs('sig_econ_unk', { economicRisk: 'UNKNOWN', outcomeStatus: 'CLOSED_BREAKEVEN', outcomePnl: 0 });

    const econReport = secondOpinionAnalyticsService.getEconomicRiskAnalytics();
    expect(econReport.categories.LOW.winCount).toBe(1);
    expect(econReport.categories.MEDIUM.lossCount).toBe(1);
    expect(econReport.categories.HIGH.lossCount).toBe(1);
    expect(econReport.categories.HIGH.totalPnl).toBe(-90);
    expect(econReport.categories.UNKNOWN.breakevenCount).toBe(1);
  });

  // =========================================================================
  // TEST 13: Confidence Buckets (0-59, 60-69, 70-79, 80-89, 90-100)
  // =========================================================================
  it('13. Confidence Buckets: Distributes QuantumAI & OpenAI confidence across standard tiers', () => {
    createSampleObs('sig_c1', { quantumAiConfidence: 55, openAiConfidence: 65, outcomeStatus: 'CLOSED_LOSS', outcomePnl: -20 });
    createSampleObs('sig_c2', { quantumAiConfidence: 75, openAiConfidence: 85, outcomeStatus: 'CLOSED_WIN', outcomePnl: 40 });
    createSampleObs('sig_c3', { quantumAiConfidence: 95, openAiConfidence: 92, outcomeStatus: 'CLOSED_WIN', outcomePnl: 80 });

    const confReport = secondOpinionAnalyticsService.getConfidenceAnalytics();
    const qBuckets = confReport.quantumAiConfidenceBuckets;
    const aiBuckets = confReport.openAiConfidenceBuckets;

    expect(qBuckets.find(b => b.bucket === '0-59')?.observationCount).toBe(1);
    expect(qBuckets.find(b => b.bucket === '70-79')?.observationCount).toBe(1);
    expect(qBuckets.find(b => b.bucket === '90-100')?.observationCount).toBe(1);

    expect(aiBuckets.find(b => b.bucket === '60-69')?.observationCount).toBe(1);
    expect(aiBuckets.find(b => b.bucket === '80-89')?.observationCount).toBe(1);
    expect(aiBuckets.find(b => b.bucket === '90-100')?.observationCount).toBe(1);
  });

  // =========================================================================
  // TEST 14: Sample Size Protection (sampleSize < 10 -> null percentage, sampleStatus = INSUFFICIENT_SAMPLE)
  // =========================================================================
  it('14. Sample Size Protection: Masks percentages when sampleSize < 10 and unmasks when >= 10', () => {
    // 3 trades (sample < 10)
    for (let i = 1; i <= 3; i++) {
      createSampleObs(`sig_small_${i}`, {
        outcomeStatus: 'CLOSED_WIN',
        outcomePnl: 10.00
      });
    }

    const smallMetrics = secondOpinionAnalyticsService.calculateDescriptiveMetrics(
      secondOpinionObservationService.queryObservations().observations
    );
    expect(smallMetrics.sampleSize).toBe(3);
    expect(smallMetrics.winRate).toBeNull();
    expect(smallMetrics.lossRate).toBeNull();
    expect(smallMetrics.sampleStatus).toBe('INSUFFICIENT_SAMPLE');

    // Add 7 more trades (sampleSize = 10)
    for (let i = 4; i <= 10; i++) {
      createSampleObs(`sig_valid_${i}`, {
        outcomeStatus: i <= 8 ? 'CLOSED_WIN' : 'CLOSED_LOSS',
        outcomePnl: i <= 8 ? 10.00 : -10.00
      });
    }

    const validMetrics = secondOpinionAnalyticsService.calculateDescriptiveMetrics(
      secondOpinionObservationService.queryObservations().observations
    );
    expect(validMetrics.sampleSize).toBe(10);
    expect(validMetrics.winRate).toBe(80.0); // 8 wins out of 10
    expect(validMetrics.lossRate).toBe(20.0); // 2 losses out of 10
    expect(validMetrics.sampleStatus).toBe('VALID');
  });

  // =========================================================================
  // TEST 15 & 16: OPEN and UNMATCHED not counted in closed trade stats
  // =========================================================================
  it('15-16. Excludes OPEN and UNMATCHED from closed outcome calculations', () => {
    createSampleObs('sig_open_1', { outcomeStatus: 'OPEN' });
    createSampleObs('sig_unmatched_1', { outcomeStatus: 'UNMATCHED' });
    createSampleObs('sig_closed_1', { outcomeStatus: 'CLOSED_WIN', outcomePnl: 75.00 });

    const report = secondOpinionAnalyticsService.getAnalyticsReport();
    expect(report.observations.total).toBe(3);
    expect(report.outcomes.totalClosedTrades).toBe(1);
    expect(report.outcomes.openCount).toBe(1);
    expect(report.outcomes.unmatchedCount).toBe(1);
    expect(report.outcomes.winCount).toBe(1);
  });

  // =========================================================================
  // TEST 17, 18, 19: CLOSED_WIN, CLOSED_LOSS, CLOSED_BREAKEVEN
  // =========================================================================
  it('17-19. Outcome Status Breakdown: Correctly computes win, loss, and breakeven totals', () => {
    createSampleObs('sig_w1', { outcomeStatus: 'CLOSED_WIN', outcomePnl: 50.0 });
    createSampleObs('sig_w2', { outcomeStatus: 'CLOSED_WIN', outcomePnl: 70.0 });
    createSampleObs('sig_l1', { outcomeStatus: 'CLOSED_LOSS', outcomePnl: -40.0 });
    createSampleObs('sig_be1', { outcomeStatus: 'CLOSED_BREAKEVEN', outcomePnl: 0.0 });

    const report = secondOpinionAnalyticsService.getAnalyticsReport();
    expect(report.outcomes.totalClosedTrades).toBe(4);
    expect(report.outcomes.winCount).toBe(2);
    expect(report.outcomes.lossCount).toBe(1);
    expect(report.outcomes.breakevenCount).toBe(1);
  });

  // =========================================================================
  // TEST 20 & 21: P/L and Pips Aggregation
  // =========================================================================
  it('20-21. P/L and Pips Aggregation: Accurately calculates total and average P/L and pips', () => {
    createSampleObs('sig_p1', { outcomeStatus: 'CLOSED_WIN', outcomePnl: 100.0, outcomePips: 20.0 });
    createSampleObs('sig_p2', { outcomeStatus: 'CLOSED_LOSS', outcomePnl: -40.0, outcomePips: -8.0 });

    const report = secondOpinionAnalyticsService.getAnalyticsReport();
    expect(report.outcomes.totalPnl).toBe(60.00);
    expect(report.outcomes.averagePnl).toBe(30.00);
    expect(report.outcomes.totalPips).toBe(12.0);
    expect(report.outcomes.averagePips).toBe(6.0);
  });

  // =========================================================================
  // TEST 22: Duplicate observations do not double-count
  // =========================================================================
  it('22. Idempotency: Re-recording the same signalId updates in-place without double counting', () => {
    createSampleObs('sig_dup_1', { outcomeStatus: 'OPEN' });
    createSampleObs('sig_dup_1', { outcomeStatus: 'CLOSED_WIN', outcomePnl: 50.0 });

    const report = secondOpinionAnalyticsService.getAnalyticsReport();
    expect(report.observations.total).toBe(1);
    expect(report.outcomes.totalClosedTrades).toBe(1);
    expect(report.outcomes.totalPnl).toBe(50.00);
  });

  // =========================================================================
  // TEST 23: Disagreement Detail Report
  // =========================================================================
  it('23. Disagreement Detail Report: Reports directional pairings under disagreement', () => {
    createSampleObs('sig_dis_buy_bear', {
      quantumAiDirection: 'BUY',
      openAiBias: 'BEARISH',
      agreement: 'DISAGREE',
      outcomeStatus: 'CLOSED_LOSS',
      outcomePnl: -35.0
    });

    const disReport = secondOpinionAnalyticsService.getDisagreementAnalytics();
    expect(disReport.summary.tradeCount).toBe(1);
    expect(disReport.summary.totalPnl).toBe(-35.0);

    const buyBearBreakdown = disReport.directionalBreakdowns.find(
      b => b.quantumAiDirection === 'BUY' && b.openAiBias === 'BEARISH'
    );
    expect(buyBearBreakdown?.count).toBe(1);
    expect(buyBearBreakdown?.outcomes.lossCount).toBe(1);
  });

  // =========================================================================
  // TEST 24: Security: No API key or secret leakage in reports
  // =========================================================================
  it('24. Security: No API keys, broker tokens, or secrets leaked in analytics reports', () => {
    createSampleObs('sig_sec_test', { outcomeStatus: 'CLOSED_WIN', outcomePnl: 100.0 });

    const mainReport = JSON.stringify(secondOpinionAnalyticsService.getAnalyticsReport());
    const disReport = JSON.stringify(secondOpinionAnalyticsService.getDisagreementAnalytics());
    const econReport = JSON.stringify(secondOpinionAnalyticsService.getEconomicRiskAnalytics());
    const confReport = JSON.stringify(secondOpinionAnalyticsService.getConfidenceAnalytics());

    expect(mainReport).not.toContain('test-mock-openai-key-never-exposed');
    expect(disReport).not.toContain('test-mock-openai-key-never-exposed');
    expect(econReport).not.toContain('test-mock-openai-key-never-exposed');
    expect(confReport).not.toContain('test-mock-openai-key-never-exposed');
  });

  // =========================================================================
  // TEST 25: Execution Isolation: Analytics calls cannot modify execution eligibility
  // =========================================================================
  it('25. Execution Isolation: Analytics calls do not alter ExecutionEligibilityState or broker state', () => {
    createSampleObs('sig_iso_1', { outcomeStatus: 'CLOSED_WIN', outcomePnl: 50.0 });

    // Calling all analytics methods
    secondOpinionAnalyticsService.getAnalyticsReport();
    secondOpinionAnalyticsService.getDisagreementAnalytics();
    secondOpinionAnalyticsService.getEconomicRiskAnalytics();
    secondOpinionAnalyticsService.getConfidenceAnalytics();

    // Verify invariant assertion is intact
    const { canonicalSignal } = signalValidationGate.validateSignal({
      symbol: 'EURUSD',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice: 1.08500,
      entryPrice: 1.08300,
      stopLoss: 1.08000,
      takeProfit1: 1.08900,
      indicators: {
        ema50: 1.08200,
        ema200: 1.07900,
        rsi14: 60.0,
        adx: 22,
        plusDI: 26.0,
        minusDI: 14.0,
        superTrendDirection: 'BULLISH'
      }
    });

    expect(() => {
      executionEligibilityGate.assertExecutionInvariant(canonicalSignal, 'WAITING_FOR_ENTRY', 'MARKET');
    }).toThrow(/EXECUTION_INVARIANT_VIOLATION/);
  });
});
