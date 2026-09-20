import { describe, it, expect } from 'vitest';
import {
  generateImprovementProposals,
  ImprovementProposalRegistrySummary
} from '../packages/core/src/validatedImprovementProposals';
import { analyzeTradeOutcomes } from '../packages/core/src/tradeOutcomeAnalytics';
import { discoverTradePatterns } from '../packages/core/src/tradePatternDiscovery';
import { TradeObservationRecord } from '../packages/core/src/tradeObservation';

describe('Phase 2C.9 — Validated Improvement Proposals Suite', () => {
  const generateRichObservations = (count: number): TradeObservationRecord[] => {
    const list: TradeObservationRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isWin = i % 2 === 0;
      const pnl = isWin ? 15.0 : -10.0;
      const strategy = i % 3 === 0 ? 'SMC_ORDER_BLOCK' : 'FVG_EXPANSION';
      const macroRisk = i % 2 === 0 ? 'LOW' : 'HIGH';

      list.push({
        observationId: `obs-rich-${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        provenance: 'REAL_BROKER',
        linkageStatus: i % 5 === 0 ? 'UNLINKED' : 'VERIFIED',
        brokerPositionId: `pos-rich-${i}`,
        brokerDealIds: [`deal-rich-${i}`],
        proposal: {
          proposalId: `prop-rich-${i}`,
          symbol: i % 2 === 0 ? 'EURUSD' : 'GBPUSD',
          direction: 'BUY',
          strategy,
          timeframe: 'M15',
          timestamp: new Date().toISOString()
        },
        macroContext: {
          contextId: `ctx-${i}`,
          dataAvailability: i % 4 === 0 ? 'UNAVAILABLE' : 'AVAILABLE',
          macroRisk: macroRisk as any,
          thesisAlignment: 'SUPPORTIVE',
          eventRisk: [],
          assessmentTimestamp: new Date().toISOString()
        },
        outcome: {
          brokerPositionId: `pos-rich-${i}`,
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

  // Test 1: Generates evidence-backed improvement proposals
  it('Test 1: Generates improvement proposals containing sample sizes and supporting metrics', () => {
    const dataset = generateRichObservations(40);
    const analytics = analyzeTradeOutcomes(dataset);
    const patterns = discoverTradePatterns(dataset, { minSampleThreshold: 10 });
    const registry = generateImprovementProposals(analytics, patterns);

    expect(registry.totalProposalsGenerated).toBeGreaterThan(0);
    for (const prop of registry.proposals) {
      expect(prop.observationWindow.sampleSize).toBeGreaterThan(0);
      expect(prop.supportingMetrics).toBeDefined();
      expect(prop.limitations.length).toBeGreaterThan(0);
    }
  });

  // Test 2: Invariant: productionChange is STRICTLY false
  it('Test 2: Strictly enforces productionChange = false on all generated proposals', () => {
    const dataset = generateRichObservations(30);
    const analytics = analyzeTradeOutcomes(dataset);
    const patterns = discoverTradePatterns(dataset);
    const registry = generateImprovementProposals(analytics, patterns);

    for (const prop of registry.proposals) {
      expect(prop.productionChange).toBe(false);
    }
  });

  // Test 3: Invariant: humanReviewStatus defaults to PENDING_HUMAN_REVIEW
  it('Test 3: Human review gate is enforced; all proposals require operator review', () => {
    const dataset = generateRichObservations(30);
    const analytics = analyzeTradeOutcomes(dataset);
    const patterns = discoverTradePatterns(dataset);
    const registry = generateImprovementProposals(analytics, patterns);

    for (const prop of registry.proposals) {
      expect(prop.humanReviewStatus).toBe('PENDING_HUMAN_REVIEW');
    }
    expect(registry.humanReviewRequiredCount).toBe(registry.totalProposalsGenerated);
    expect(registry.safetyContract).toContain('STRICT INVARIANT');
  });

  // Test 4: Generates Data Quality proposal when unlinked or missing records exist
  it('Test 4: Automatically identifies data quality gaps and proposes observation improvements', () => {
    const dataset = generateRichObservations(30);
    const analytics = analyzeTradeOutcomes(dataset);
    const patterns = discoverTradePatterns(dataset);
    const registry = generateImprovementProposals(analytics, patterns);

    const dqProposal = registry.proposals.find(p => p.category === 'DATA_QUALITY_IMPROVEMENT');
    expect(dqProposal).toBeDefined();
    expect(dqProposal?.featureOrFactor).toContain('Linkage & Macro Telemetry Completeness');
    expect(dqProposal?.validationStatus).toBe('HUMAN_REVIEW_REQUIRED');
  });
});
