/**
 * QuantumAI IATI OS — Phase 2C.9: Validated Improvement Proposals Engine
 * 
 * INVARIANTS:
 * - Evidence-driven: Generates structured proposals for human review.
 * - STRICT INVARIANT: productionChange = false (No direct automated modifications).
 * - Requires explicit human review before any future consideration.
 * - Validation levels: EXPLORATORY, OBSERVATION_SUPPORTED, OUT_OF_SAMPLE_SUPPORTED, REQUIRES_MORE_DATA, REJECTED, HUMAN_REVIEW_REQUIRED.
 */

import { ComprehensiveOutcomeAnalysisReport } from './tradeOutcomeAnalytics';
import { ComprehensivePatternDiscoveryReport, FeatureEvaluationResult } from './tradePatternDiscovery';
import { ObservationProvenance } from './tradeObservation';

export type ImprovementProposalCategory =
  | 'DATA_QUALITY_IMPROVEMENT'
  | 'OBSERVATION_IMPROVEMENT'
  | 'FEATURE_CANDIDATE'
  | 'RISK_GOVERNANCE_CANDIDATE'
  | 'MACRO_CONTEXT_CANDIDATE'
  | 'SECOND_OPINION_EVALUATION'
  | 'STRATEGY_RESEARCH_CANDIDATE';

export type ProposalValidationLevel =
  | 'EXPLORATORY'
  | 'OBSERVATION_SUPPORTED'
  | 'OUT_OF_SAMPLE_SUPPORTED'
  | 'REQUIRES_MORE_DATA'
  | 'REJECTED'
  | 'HUMAN_REVIEW_REQUIRED';

export interface ValidatedImprovementProposal {
  proposalId: string;
  generatedAt: string;
  category: ImprovementProposalCategory;
  featureOrFactor: string;
  observationWindow: {
    totalTrades: number;
    sampleSize: number;
  };
  affectedPairs: string[];
  affectedDirections: string[];
  observedRelationship: string;
  supportingMetrics: {
    winRate: number;
    baselineWinRate: number;
    winRateDelta: number;
    averagePnL: number;
    profitFactor: number;
  };
  uncertainty: 'LOW' | 'MEDIUM' | 'HIGH';
  limitations: string[];
  provenance: ObservationProvenance[];
  validationStatus: ProposalValidationLevel;
  recommendedNextValidationStep: string;
  productionChange: false; // STRICT INVARIANT: Always false
  humanReviewStatus: 'PENDING_HUMAN_REVIEW' | 'ACCEPTED_FOR_RESEARCH' | 'REJECTED_BY_OPERATOR';
}

export interface ImprovementProposalRegistrySummary {
  generatedAt: string;
  totalProposalsGenerated: number;
  byCategory: Record<ImprovementProposalCategory, number>;
  byValidationLevel: Record<ProposalValidationLevel, number>;
  proposals: ValidatedImprovementProposal[];
  humanReviewRequiredCount: number;
  safetyContract: string;
}

/**
 * Generates structured, evidence-backed improvement proposals from analytics and pattern discovery outputs.
 */
export function generateImprovementProposals(
  analytics: ComprehensiveOutcomeAnalysisReport,
  patternReport: ComprehensivePatternDiscoveryReport
): ImprovementProposalRegistrySummary {
  const proposals: ValidatedImprovementProposal[] = [];
  const now = new Date().toISOString();

  // 1. Data Quality Proposals
  if (analytics.dataQuality.unlinkedRecords > 0 || analytics.dataQuality.missingMacroRecords > 0) {
    proposals.push({
      proposalId: `prop-dq-${Date.now()}-1`,
      generatedAt: now,
      category: 'DATA_QUALITY_IMPROVEMENT',
      featureOrFactor: 'Linkage & Macro Telemetry Completeness',
      observationWindow: {
        totalTrades: analytics.totalObservationsAnalyzed,
        sampleSize: analytics.totalObservationsAnalyzed
      },
      affectedPairs: Object.keys(analytics.byPair),
      affectedDirections: ['BUY', 'SELL'],
      observedRelationship: `Identified ${analytics.dataQuality.unlinkedRecords} unlinked and ${analytics.dataQuality.missingMacroRecords} missing-macro records out of ${analytics.totalObservationsAnalyzed} total observations.`,
      supportingMetrics: {
        winRate: analytics.overallMetrics.winRate,
        baselineWinRate: analytics.overallMetrics.winRate,
        winRateDelta: 0,
        averagePnL: analytics.overallMetrics.averagePnL,
        profitFactor: analytics.overallMetrics.profitFactor
      },
      uncertainty: 'LOW',
      limitations: ['Data quality metrics reflect existing telemetry capture coverage.'],
      provenance: ['REAL_BROKER', 'UNKNOWN'],
      validationStatus: 'HUMAN_REVIEW_REQUIRED',
      recommendedNextValidationStep: 'Ensure market data feed service and broker reconciliation capture complete macro metadata.',
      productionChange: false,
      humanReviewStatus: 'PENDING_HUMAN_REVIEW'
    });
  }

  // 2. Feature Candidate Proposals from Pattern Discovery
  for (const feat of patternReport.featureEvaluations) {
    if (feat.status === 'EXPLORATORY_CANDIDATE') {
      const isMacro = feat.featureName === 'macroRisk';
      const isSecondOp = feat.featureName === 'thesisAlignment';
      const isShadow = feat.featureName === 'shadowDecision';

      let cat: ImprovementProposalCategory = 'FEATURE_CANDIDATE';
      if (isMacro) cat = 'MACRO_CONTEXT_CANDIDATE';
      else if (isSecondOp) cat = 'SECOND_OPINION_EVALUATION';
      else if (isShadow) cat = 'RISK_GOVERNANCE_CANDIDATE';
      else if (feat.featureName === 'strategy') cat = 'STRATEGY_RESEARCH_CANDIDATE';

      proposals.push({
        proposalId: `prop-feat-${feat.featureName}-${feat.featureValue.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}`,
        generatedAt: now,
        category: cat,
        featureOrFactor: `${feat.featureName}=${feat.featureValue}`,
        observationWindow: {
          totalTrades: patternReport.baselineMetrics.totalTrades,
          sampleSize: feat.sampleSize
        },
        affectedPairs: Object.keys(analytics.byPair),
        affectedDirections: ['BUY', 'SELL'],
        observedRelationship: `Feature slice exhibited observed win rate of ${feat.winRate * 100}% vs baseline ${feat.baselineWinRate * 100}% (Delta: +${(feat.winRateDelta * 100).toFixed(1)}%).`,
        supportingMetrics: {
          winRate: feat.winRate,
          baselineWinRate: feat.baselineWinRate,
          winRateDelta: feat.winRateDelta,
          averagePnL: feat.averagePnL,
          profitFactor: feat.profitFactor
        },
        uncertainty: feat.sampleSize > 50 ? 'LOW' : feat.sampleSize > 25 ? 'MEDIUM' : 'HIGH',
        limitations: [
          `Sample size is ${feat.sampleSize} completed trades.`,
          'Correlation does not prove causal market edge.',
          'Requires out-of-sample forward test verification before consideration.'
        ],
        provenance: ['REAL_BROKER', 'REAL_QUANTUMAI'],
        validationStatus: feat.sampleSize >= 30 ? 'OBSERVATION_SUPPORTED' : 'EXPLORATORY',
        recommendedNextValidationStep: 'Run holdout validation across subsequent 50 live observations without altering execution.',
        productionChange: false,
        humanReviewStatus: 'PENDING_HUMAN_REVIEW'
      });
    }
  }

  // Count by categories and levels
  const byCategory: Record<ImprovementProposalCategory, number> = {
    DATA_QUALITY_IMPROVEMENT: 0,
    OBSERVATION_IMPROVEMENT: 0,
    FEATURE_CANDIDATE: 0,
    RISK_GOVERNANCE_CANDIDATE: 0,
    MACRO_CONTEXT_CANDIDATE: 0,
    SECOND_OPINION_EVALUATION: 0,
    STRATEGY_RESEARCH_CANDIDATE: 0
  };

  const byValidationLevel: Record<ProposalValidationLevel, number> = {
    EXPLORATORY: 0,
    OBSERVATION_SUPPORTED: 0,
    OUT_OF_SAMPLE_SUPPORTED: 0,
    REQUIRES_MORE_DATA: 0,
    REJECTED: 0,
    HUMAN_REVIEW_REQUIRED: 0
  };

  for (const p of proposals) {
    byCategory[p.category]++;
    byValidationLevel[p.validationStatus]++;
  }

  return {
    generatedAt: now,
    totalProposalsGenerated: proposals.length,
    byCategory,
    byValidationLevel,
    proposals,
    humanReviewRequiredCount: proposals.length,
    safetyContract: 'STRICT INVARIANT: No automated system may execute or apply these proposals without explicit operator approval and human review.'
  };
}
