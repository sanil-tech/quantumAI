import { describe, it, expect } from 'vitest';
import {
  discoverTradePatterns,
  ComprehensivePatternDiscoveryReport
} from '../packages/core/src/tradePatternDiscovery';
import { TradeObservationRecord } from '../packages/core/src/tradeObservation';

describe('Phase 2C.8 — Pattern Discovery & Feature Evaluation Suite', () => {
  const generateMockObservations = (count: number): TradeObservationRecord[] => {
    const list: TradeObservationRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isWin = i % 3 !== 0; // ~66% win rate
      const pnl = isWin ? 10.0 : -8.0;
      const strategy = i % 2 === 0 ? 'SMC_ORDER_BLOCK' : 'FVG_EXPANSION';
      const alignment = i % 4 === 0 ? 'CONFLICTING' : 'SUPPORTIVE';

      list.push({
        observationId: `obs-pat-${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        provenance: 'REAL_BROKER',
        linkageStatus: 'VERIFIED',
        brokerPositionId: `pos-${i}`,
        brokerDealIds: [`deal-${i}`],
        proposal: {
          proposalId: `prop-${i}`,
          symbol: 'EURUSD',
          direction: 'BUY',
          strategy,
          timeframe: 'M15',
          timestamp: new Date().toISOString()
        },
        secondOpinion: {
          opinionId: `op-${i}`,
          executionAuthority: false,
          macroRisk: 'LOW',
          thesisAlignment: alignment,
          eventRisk: [],
          explanation: 'Routine observation.',
          assessmentTimestamp: new Date().toISOString()
        },
        outcome: {
          brokerPositionId: `pos-${i}`,
          closeTimestamp: new Date().toISOString(),
          realizedPnL: pnl,
          netPnL: pnl,
          intratradeHistoryAvailable: true
        },
        shadowDecision: 'SHADOW_ALLOW',
        isCompleteLifecycle: true
      });
    }
    return list;
  };

  // Test 1: Evaluates baseline metrics and feature slices
  it('Test 1: Computes baseline metrics and feature slice evaluations', () => {
    const dataset = generateMockObservations(30);
    const report = discoverTradePatterns(dataset, { minSampleThreshold: 10 });

    expect(report.totalCompletedObservations).toBe(30);
    expect(report.baselineMetrics.winRate).toBeGreaterThan(0.6);
    expect(report.featureEvaluations.length).toBeGreaterThan(0);
    expect(report.featureEvaluations.every(f => f.isExploratory)).toBe(true);
  });

  // Test 2: Sample size guard flags INSUFFICIENT_SAMPLE on small sets
  it('Test 2: Flags INSUFFICIENT_SAMPLE when slice size is below minSampleThreshold', () => {
    const dataset = generateMockObservations(5);
    const report = discoverTradePatterns(dataset, { minSampleThreshold: 15 });

    for (const feat of report.featureEvaluations) {
      expect(feat.status).toBe('INSUFFICIENT_SAMPLE');
      expect(feat.statisticalConfidence).toBe('UNAVAILABLE');
      expect(feat.caveat).toContain('Insufficient sample size');
    }
  });

  // Test 3: Disagreement analysis measures Primary Thesis vs Second Opinion AI
  it('Test 3: Analyzes performance under SUPPORTIVE vs CONFLICTING Second Opinion alignment', () => {
    const dataset = generateMockObservations(30);
    const report = discoverTradePatterns(dataset, { minSampleThreshold: 5 });

    const supportive = report.disagreementAnalysis.find(d => d.thesisAlignment === 'SUPPORTIVE');
    const conflicting = report.disagreementAnalysis.find(d => d.thesisAlignment === 'CONFLICTING');

    expect(supportive).toBeDefined();
    expect(supportive?.sampleSize).toBeGreaterThan(0);
    expect(conflicting).toBeDefined();
    expect(conflicting?.sampleSize).toBeGreaterThan(0);
  });

  // Test 4: Shadow signal pattern correlation is documented as observational
  it('Test 4: Shadow signal evaluation documents observational nature without claiming causal edge', () => {
    const dataset = generateMockObservations(20);
    const report = discoverTradePatterns(dataset);

    const allow = report.shadowSignalPatterns.find(s => s.shadowDecision === 'SHADOW_ALLOW');
    expect(allow).toBeDefined();
    expect(allow?.correlationObservation).toContain('Observation only');
  });

  // Test 5: Strict safety notice invariant
  it('Test 5: Explicitly enforces strict safety notice that no automatic trading changes occur', () => {
    const dataset = generateMockObservations(10);
    const report = discoverTradePatterns(dataset);

    expect(report.strictSafetyNotice).toContain('STRICT INVARIANT');
    expect(report.strictSafetyNotice).toContain('No automatic trading or execution modification');
  });
});
