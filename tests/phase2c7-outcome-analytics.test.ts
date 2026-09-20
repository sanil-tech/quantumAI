import { describe, it, expect } from 'vitest';
import {
  analyzeTradeOutcomes,
  ComprehensiveOutcomeAnalysisReport
} from '../packages/core/src/tradeOutcomeAnalytics';
import { TradeObservationRecord } from '../packages/core/src/tradeObservation';

describe('Phase 2C.7 — Outcome Analysis & Learning Dataset Suite', () => {
  const mockObservations: TradeObservationRecord[] = [
    {
      observationId: 'obs-1',
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T12:00:00Z',
      provenance: 'REAL_BROKER',
      linkageStatus: 'VERIFIED',
      brokerPositionId: 'pos-101',
      brokerDealIds: ['deal-101'],
      proposal: {
        proposalId: 'prop-1',
        symbol: 'EURUSD',
        direction: 'BUY',
        timeframe: 'H1',
        confidence: 0.85,
        strategy: 'SMC_ORDER_BLOCK',
        timestamp: '2026-09-01T10:00:00Z'
      },
      brokerPosition: {
        brokerPositionId: 'pos-101',
        symbol: 'EURUSD',
        direction: 'BUY',
        volumeLots: 0.02,
        openTimestamp: '2026-09-01T10:05:00Z'
      },
      secondOpinion: {
        opinionId: 'op-1',
        executionAuthority: false,
        macroRisk: 'LOW',
        thesisAlignment: 'SUPPORTIVE',
        eventRisk: [],
        explanation: 'Low macro risk.',
        assessmentTimestamp: '2026-09-01T10:01:00Z'
      },
      outcome: {
        brokerPositionId: 'pos-101',
        brokerDealId: 'deal-101',
        closeTimestamp: '2026-09-01T12:00:00Z',
        realizedPnL: 15.50,
        grossPnL: 15.50,
        netPnL: 15.50,
        mfePips: 22.0,
        maePips: 4.5,
        intratradeHistoryAvailable: true
      },
      shadowDecision: 'SHADOW_ALLOW',
      isCompleteLifecycle: true
    },
    {
      observationId: 'obs-2',
      createdAt: '2026-09-02T10:00:00Z',
      updatedAt: '2026-09-02T14:00:00Z',
      provenance: 'REAL_BROKER',
      linkageStatus: 'VERIFIED',
      brokerPositionId: 'pos-102',
      brokerDealIds: ['deal-102'],
      proposal: {
        proposalId: 'prop-2',
        symbol: 'GBPUSD',
        direction: 'SELL',
        timeframe: 'M15',
        confidence: 0.92,
        strategy: 'FVG_LIQUIDITY_SWEEP',
        timestamp: '2026-09-02T10:00:00Z'
      },
      brokerPosition: {
        brokerPositionId: 'pos-102',
        symbol: 'GBPUSD',
        direction: 'SELL',
        volumeLots: 0.01,
        openTimestamp: '2026-09-02T10:05:00Z'
      },
      secondOpinion: {
        opinionId: 'op-2',
        executionAuthority: false,
        macroRisk: 'HIGH',
        thesisAlignment: 'CONFLICTING',
        eventRisk: ['BOE_SPEECH'],
        explanation: 'Conflicting interest rate trajectory.',
        assessmentTimestamp: '2026-09-02T10:01:00Z'
      },
      outcome: {
        brokerPositionId: 'pos-102',
        brokerDealId: 'deal-102',
        closeTimestamp: '2026-09-02T14:00:00Z',
        realizedPnL: -8.20,
        grossPnL: -8.20,
        netPnL: -8.20,
        mfePips: 5.0,
        maePips: 18.0,
        intratradeHistoryAvailable: true
      },
      shadowDecision: 'SHADOW_WOULD_BLOCK',
      shadowReasons: ['MAX_CURRENCY_EXPOSURE_EXCEEDED: GBP'],
      isCompleteLifecycle: true
    }
  ];

  // Test 1: Overall metrics calculation with mandatory sample size
  it('Test 1: Computes overall metrics including sample size, win rate, and P&L', () => {
    const report = analyzeTradeOutcomes(mockObservations);

    expect(report.totalObservationsAnalyzed).toBe(2);
    expect(report.overallMetrics.sampleSize).toBe(2);
    expect(report.overallMetrics.tradeCount).toBe(2);
    expect(report.overallMetrics.winCount).toBe(1);
    expect(report.overallMetrics.lossCount).toBe(1);
    expect(report.overallMetrics.winRate).toBe(0.5);
    expect(report.overallMetrics.netPnL).toBe(7.30);
    expect(report.overallMetrics.profitFactor).toBeCloseTo(1.89, 2);
  });

  // Test 2: Dimensional breakdowns (by pair, direction, strategy)
  it('Test 2: Breaks down outcomes by pair and direction with explicit sample sizes', () => {
    const report = analyzeTradeOutcomes(mockObservations);

    expect(report.byPair['EURUSD']).toBeDefined();
    expect(report.byPair['EURUSD'].sampleSize).toBe(1);
    expect(report.byPair['EURUSD'].winRate).toBe(1.0);
    expect(report.byPair['EURUSD'].netPnL).toBe(15.50);

    expect(report.byPair['GBPUSD']).toBeDefined();
    expect(report.byPair['GBPUSD'].sampleSize).toBe(1);
    expect(report.byPair['GBPUSD'].winRate).toBe(0.0);
    expect(report.byPair['GBPUSD'].netPnL).toBe(-8.20);
  });

  // Test 3: Shadow decision analysis with counterfactual separation
  it('Test 3: Evaluates outcomes grouped by shadow decision with counterfactual note', () => {
    const report = analyzeTradeOutcomes(mockObservations);

    expect(report.byShadowDecision['SHADOW_ALLOW'].sampleSize).toBe(1);
    expect(report.byShadowDecision['SHADOW_ALLOW'].winRate).toBe(1.0);

    expect(report.byShadowDecision['SHADOW_WOULD_BLOCK'].sampleSize).toBe(1);
    expect(report.byShadowDecision['SHADOW_WOULD_BLOCK'].winRate).toBe(0.0);
    expect(report.byShadowDecision['SHADOW_WOULD_BLOCK'].counterfactualNote).toContain('COUNTERFACTUAL');
  });

  // Test 4: Confidence calibration buckets with sample size and uncertainty
  it('Test 4: Calibrates confidence buckets and marks low samples with uncertainty', () => {
    const report = analyzeTradeOutcomes(mockObservations);

    const b85_89 = report.confidenceCalibration.find(b => b.bucketRange === '85-89%');
    expect(b85_89).toBeDefined();
    expect(b85_89?.sampleSize).toBe(1);
    expect(b85_89?.uncertaintyScore).toBe('INSUFFICIENT_SAMPLE');

    const b90_94 = report.confidenceCalibration.find(b => b.bucketRange === '90-94%');
    expect(b90_94?.sampleSize).toBe(1);
    expect(b90_94?.observedWinRate).toBe(0.0);
  });

  // Test 5: Macro risk relationship slice
  it('Test 5: Measures empirical relationship between macroRisk + thesisAlignment and outcome', () => {
    const report = analyzeTradeOutcomes(mockObservations);

    expect(report.macroRelationships.length).toBeGreaterThan(0);
    const highConflicting = report.macroRelationships.find(m => m.macroRisk === 'HIGH' && m.thesisAlignment === 'CONFLICTING');
    expect(highConflicting).toBeDefined();
    expect(highConflicting?.sampleSize).toBe(1);
    expect(highConflicting?.observedWinRate).toBe(0.0);
    expect(highConflicting?.netPnL).toBe(-8.20);
  });

  // Test 6: Data quality report
  it('Test 6: Exposes unlinked, unknown origin, and missing data metrics', () => {
    const report = analyzeTradeOutcomes(mockObservations);

    expect(report.dataQuality.totalRecords).toBe(2);
    expect(report.dataQuality.verifiedRecords).toBe(2);
    expect(report.dataQuality.unlinkedRecords).toBe(0);
    expect(report.dataQuality.dataQualityScore).toBeGreaterThanOrEqual(80);
  });
});
