/**
 * QuantumAI IATI OS — Phase 2C.8: Pattern Discovery & Feature Evaluation Engine
 * 
 * INVARIANTS:
 * - Exploratory only: Evaluates whether additional information appears useful.
 * - All findings MUST be labeled EXPLORATORY.
 * - Strict sample-size guards: Slices with small samples are flagged INSUFFICIENT_SAMPLE.
 * - Disagreement analysis: Explicitly compares Primary Thesis vs Second Opinion AI.
 * - STRICTLY NO automatic optimization or production configuration changes.
 */

import { TradeObservationRecord } from './tradeObservation';

export type FeatureEvaluationStatus =
  | 'EXPLORATORY_CANDIDATE'
  | 'NEUTRAL'
  | 'NO_OBSERVED_EDGE'
  | 'INSUFFICIENT_SAMPLE';

export interface FeatureEvaluationResult {
  featureName: string;
  featureValue: string;
  sampleSize: number;
  minSampleThreshold: number;
  status: FeatureEvaluationStatus;
  isExploratory: true; // STRICT INVARIANT: Always true
  winRate: number;
  baselineWinRate: number;
  winRateDelta: number;
  averagePnL: number;
  baselineAveragePnL: number;
  averagePnLDelta: number;
  profitFactor: number;
  statisticalConfidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNAVAILABLE';
  caveat: string;
}

export interface DisagreementAnalysisResult {
  thesisAlignment: 'SUPPORTIVE' | 'MIXED' | 'CONFLICTING' | 'UNKNOWN';
  sampleSize: number;
  status: FeatureEvaluationStatus;
  winRate: number;
  averagePnL: number;
  profitFactor: number;
  disagreementEffectNote: string;
}

export interface ShadowSignalPatternResult {
  shadowDecision: 'SHADOW_ALLOW' | 'SHADOW_REVIEW' | 'SHADOW_WOULD_BLOCK' | 'SHADOW_UNKNOWN';
  sampleSize: number;
  winRate: number;
  averagePnL: number;
  lossRate: number;
  correlationObservation: string;
}

export interface ComprehensivePatternDiscoveryReport {
  generatedAt: string;
  totalCompletedObservations: number;
  baselineMetrics: {
    totalTrades: number;
    winRate: number;
    averagePnL: number;
    profitFactor: number;
  };
  featureEvaluations: FeatureEvaluationResult[];
  disagreementAnalysis: DisagreementAnalysisResult[];
  shadowSignalPatterns: ShadowSignalPatternResult[];
  exploratoryFindings: string[];
  strictSafetyNotice: string;
}

/**
 * Pure deterministic pattern discovery and feature evaluation calculation.
 */
export function discoverTradePatterns(
  observations: TradeObservationRecord[],
  options?: {
    minSampleThreshold?: number;
  }
): ComprehensivePatternDiscoveryReport {
  const minSample = options?.minSampleThreshold ?? 15;
  const completed = observations.filter(o => o.outcome !== undefined);

  const baselineTrades = completed.length;
  const baselineWins = completed.filter(o => (o.outcome?.netPnL ?? 0) > 0.001).length;
  const baselineNetPnL = completed.reduce((acc, o) => acc + (o.outcome?.netPnL ?? 0), 0);
  const baselineWinPnL = completed.filter(o => (o.outcome?.netPnL ?? 0) > 0.001).reduce((acc, o) => acc + (o.outcome?.netPnL ?? 0), 0);
  const baselineLossPnL = completed.filter(o => (o.outcome?.netPnL ?? 0) < -0.001).reduce((acc, o) => acc + Math.abs(o.outcome?.netPnL ?? 0), 0);

  const baselineWinRate = baselineTrades > 0 ? Number((baselineWins / baselineTrades).toFixed(4)) : 0;
  const baselineAvgPnL = baselineTrades > 0 ? Number((baselineNetPnL / baselineTrades).toFixed(4)) : 0;
  const baselinePF = baselineLossPnL > 0 ? Number((baselineWinPnL / baselineLossPnL).toFixed(4)) : baselineWinPnL > 0 ? 999 : 0;

  const featureEvaluations: FeatureEvaluationResult[] = [];

  // 1. Evaluate Technical Strategy Features
  const strategyGroups = groupCompleted(completed, o => o.proposal?.strategy || 'UNKNOWN');
  for (const [val, list] of Object.entries(strategyGroups)) {
    featureEvaluations.push(evaluateFeatureSlice('strategy', val, list, baselineWinRate, baselineAvgPnL, minSample));
  }

  // 2. Evaluate Timeframe Features
  const tfGroups = groupCompleted(completed, o => o.proposal?.timeframe || 'UNKNOWN');
  for (const [val, list] of Object.entries(tfGroups)) {
    featureEvaluations.push(evaluateFeatureSlice('timeframe', val, list, baselineWinRate, baselineAvgPnL, minSample));
  }

  // 3. Evaluate Macro Risk Features
  const macroGroups = groupCompleted(completed, o => o.macroContext?.macroRisk || o.secondOpinion?.macroRisk || 'UNKNOWN');
  for (const [val, list] of Object.entries(macroGroups)) {
    featureEvaluations.push(evaluateFeatureSlice('macroRisk', val, list, baselineWinRate, baselineAvgPnL, minSample));
  }

  // 4. Evaluate Second Opinion Thesis Alignment
  const alignGroups = groupCompleted(completed, o => o.secondOpinion?.thesisAlignment || 'UNKNOWN');
  for (const [val, list] of Object.entries(alignGroups)) {
    featureEvaluations.push(evaluateFeatureSlice('thesisAlignment', val, list, baselineWinRate, baselineAvgPnL, minSample));
  }

  // 5. Evaluate Shadow Governance Decision
  const shadowGroups = groupCompleted(completed, o => o.shadowDecision || 'SHADOW_UNKNOWN');
  for (const [val, list] of Object.entries(shadowGroups)) {
    featureEvaluations.push(evaluateFeatureSlice('shadowDecision', val, list, baselineWinRate, baselineAvgPnL, minSample));
  }

  // Disagreement Analysis: Primary Thesis vs Second Opinion AI
  const disagreementAnalysis: DisagreementAnalysisResult[] = ['SUPPORTIVE', 'MIXED', 'CONFLICTING', 'UNKNOWN'].map(align => {
    const matching = completed.filter(o => (o.secondOpinion?.thesisAlignment || 'UNKNOWN') === align);
    const n = matching.length;
    const wins = matching.filter(o => (o.outcome?.netPnL ?? 0) > 0.001).length;
    const net = matching.reduce((acc, o) => acc + (o.outcome?.netPnL ?? 0), 0);
    const winPnL = matching.filter(o => (o.outcome?.netPnL ?? 0) > 0.001).reduce((acc, o) => acc + (o.outcome?.netPnL ?? 0), 0);
    const lossPnL = matching.filter(o => (o.outcome?.netPnL ?? 0) < -0.001).reduce((acc, o) => acc + Math.abs(o.outcome?.netPnL ?? 0), 0);

    const wr = n > 0 ? Number((wins / n).toFixed(4)) : 0;
    const avg = n > 0 ? Number((net / n).toFixed(4)) : 0;
    const pf = lossPnL > 0 ? Number((winPnL / lossPnL).toFixed(4)) : winPnL > 0 ? 999 : 0;

    let status: FeatureEvaluationStatus = 'NEUTRAL';
    if (n < minSample) status = 'INSUFFICIENT_SAMPLE';
    else if (wr > baselineWinRate + 0.05) status = 'EXPLORATORY_CANDIDATE';
    else if (wr < baselineWinRate - 0.05) status = 'NO_OBSERVED_EDGE';

    return {
      thesisAlignment: align as any,
      sampleSize: n,
      status,
      winRate: wr,
      averagePnL: avg,
      profitFactor: pf,
      disagreementEffectNote: `Observed performance when Second Opinion alignment was ${align}. (Sample: ${n})`
    };
  });

  // Shadow Signal Patterns
  const shadowSignalPatterns: ShadowSignalPatternResult[] = ['SHADOW_ALLOW', 'SHADOW_REVIEW', 'SHADOW_WOULD_BLOCK', 'SHADOW_UNKNOWN'].map(dec => {
    const list = completed.filter(o => (o.shadowDecision || 'SHADOW_UNKNOWN') === dec);
    const n = list.length;
    const wins = list.filter(o => (o.outcome?.netPnL ?? 0) > 0.001).length;
    const losses = list.filter(o => (o.outcome?.netPnL ?? 0) < -0.001).length;
    const net = list.reduce((acc, o) => acc + (o.outcome?.netPnL ?? 0), 0);

    return {
      shadowDecision: dec as any,
      sampleSize: n,
      winRate: n > 0 ? Number((wins / n).toFixed(4)) : 0,
      lossRate: n > 0 ? Number((losses / n).toFixed(4)) : 0,
      averagePnL: n > 0 ? Number((net / n).toFixed(4)) : 0,
      correlationObservation: `Observation only. Correlation under decision ${dec} does not establish causal prevention.`
    };
  });

  // Compile Exploratory Findings
  const exploratoryFindings: string[] = [];
  for (const ev of featureEvaluations) {
    if (ev.status === 'EXPLORATORY_CANDIDATE') {
      exploratoryFindings.push(
        `[EXPLORATORY CANDIDATE] Feature ${ev.featureName}=${ev.featureValue} showed win rate ${ev.winRate * 100}% vs baseline ${ev.baselineWinRate * 100}% (N=${ev.sampleSize}).`
      );
    }
  }
  if (exploratoryFindings.length === 0) {
    exploratoryFindings.push('No features currently meet exploratory threshold with sufficient sample size.');
  }

  return {
    generatedAt: new Date().toISOString(),
    totalCompletedObservations: baselineTrades,
    baselineMetrics: {
      totalTrades: baselineTrades,
      winRate: baselineWinRate,
      averagePnL: baselineAvgPnL,
      profitFactor: baselinePF
    },
    featureEvaluations,
    disagreementAnalysis,
    shadowSignalPatterns,
    exploratoryFindings,
    strictSafetyNotice: 'STRICT INVARIANT: All findings are exploratory research only. No automatic trading or execution modification is permitted.'
  };
}

function evaluateFeatureSlice(
  featureName: string,
  featureValue: string,
  records: TradeObservationRecord[],
  baselineWinRate: number,
  baselineAvgPnL: number,
  minSample: number
): FeatureEvaluationResult {
  const sampleSize = records.length;
  const wins = records.filter(o => (o.outcome?.netPnL ?? 0) > 0.001).length;
  const netPnL = records.reduce((acc, o) => acc + (o.outcome?.netPnL ?? 0), 0);
  const winPnL = records.filter(o => (o.outcome?.netPnL ?? 0) > 0.001).reduce((acc, o) => acc + (o.outcome?.netPnL ?? 0), 0);
  const lossPnL = records.filter(o => (o.outcome?.netPnL ?? 0) < -0.001).reduce((acc, o) => acc + Math.abs(o.outcome?.netPnL ?? 0), 0);

  const winRate = sampleSize > 0 ? Number((wins / sampleSize).toFixed(4)) : 0;
  const averagePnL = sampleSize > 0 ? Number((netPnL / sampleSize).toFixed(4)) : 0;
  const profitFactor = lossPnL > 0 ? Number((winPnL / lossPnL).toFixed(4)) : winPnL > 0 ? 999 : 0;

  const winRateDelta = Number((winRate - baselineWinRate).toFixed(4));
  const averagePnLDelta = Number((averagePnL - baselineAvgPnL).toFixed(4));

  let status: FeatureEvaluationStatus = 'NEUTRAL';
  let conf: FeatureEvaluationResult['statisticalConfidence'] = 'LOW';

  if (sampleSize < minSample) {
    status = 'INSUFFICIENT_SAMPLE';
    conf = 'UNAVAILABLE';
  } else if (winRateDelta > 0.05 && averagePnLDelta > 0) {
    status = 'EXPLORATORY_CANDIDATE';
    conf = sampleSize > 50 ? 'HIGH' : sampleSize > 25 ? 'MEDIUM' : 'LOW';
  } else if (winRateDelta < -0.05) {
    status = 'NO_OBSERVED_EDGE';
    conf = sampleSize > 50 ? 'HIGH' : sampleSize > 25 ? 'MEDIUM' : 'LOW';
  }

  return {
    featureName,
    featureValue,
    sampleSize,
    minSampleThreshold: minSample,
    status,
    isExploratory: true,
    winRate,
    baselineWinRate,
    winRateDelta,
    averagePnL,
    baselineAveragePnL: baselineAvgPnL,
    averagePnLDelta,
    profitFactor,
    statisticalConfidence: conf,
    caveat: sampleSize < minSample
      ? `Insufficient sample size (${sampleSize} < ${minSample}). No statistical inference valid.`
      : `Exploratory observation based on ${sampleSize} historical samples.`
  };
}

function groupCompleted(records: TradeObservationRecord[], keyFn: (r: TradeObservationRecord) => string): Record<string, TradeObservationRecord[]> {
  const map: Record<string, TradeObservationRecord[]> = {};
  for (const r of records) {
    const k = keyFn(r);
    if (!map[k]) map[k] = [];
    map[k].push(r);
  }
  return map;
}
