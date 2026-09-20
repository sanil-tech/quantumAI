/**
 * QuantumAI IATI OS — Phase 2C.7: Outcome Analysis & Learning Dataset Engine
 * 
 * INVARIANTS:
 * - Evidence-driven: Answers "What actually happened?".
 * - Every metric slice MUST include explicit sample size.
 * - Counterfactual separation: Distinct separation between observed outcome and hypothetical block.
 * - Zero automatic execution/strategy alterations.
 * - Provenance separation (real broker vs synthetic vs unknown).
 */

import {
  TradeObservationRecord,
  ObservationProvenance,
  MacroRiskLevel,
  ThesisAlignment
} from './tradeObservation';
import { buildCurrencyExposureSnapshot, CurrencyExposureSnapshot } from './currencyShadowGovernance';

export interface OutcomeMetricsSlice {
  sliceKey: string;
  dimension: string;
  sampleSize: number; // MANDATORY SAMPLE SIZE
  tradeCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number;
  grossPnL: number;
  netPnL: number;
  averagePnL: number;
  medianPnL: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  maxDrawdown: number;
  mfeStats?: {
    availableSamples: number;
    averageMfePips: number;
    maxMfePips: number;
  };
  maeStats?: {
    availableSamples: number;
    averageMaePips: number;
    maxMaePips: number;
  };
  provenanceBreakdown: Record<ObservationProvenance, number>;
}

export interface ShadowDecisionOutcomeAnalysis {
  decision: 'SHADOW_ALLOW' | 'SHADOW_REVIEW' | 'SHADOW_WOULD_BLOCK' | 'SHADOW_UNKNOWN';
  sampleSize: number;
  tradeCount: number;
  winRate: number;
  netPnL: number;
  averagePnL: number;
  profitFactor: number;
  // Explicit counterfactual disclaimer
  counterfactualNote: string;
}

export interface ConfidenceCalibrationBucket {
  bucketRange: string; // e.g. "80-84%", "85-89%", "90-94%", "95%+"
  minConfidence: number;
  maxConfidence: number;
  sampleSize: number;
  observedWinRate: number;
  averagePnL: number;
  uncertaintyScore: 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT_SAMPLE';
}

export interface MacroRelationshipSlice {
  macroRisk: MacroRiskLevel;
  thesisAlignment: ThesisAlignment;
  sampleSize: number;
  observedWinRate: number;
  netPnL: number;
  averagePnL: number;
}

export interface DataQualityReport {
  totalRecords: number;
  verifiedRecords: number;
  unlinkedRecords: number;
  unknownOriginRecords: number;
  missingMacroRecords: number;
  missingMfeMaeRecords: number;
  incompleteLifecycleRecords: number;
  dataQualityScore: number; // 0 to 100%
}

export interface ComprehensiveOutcomeAnalysisReport {
  generatedAt: string;
  totalObservationsAnalyzed: number;
  overallMetrics: OutcomeMetricsSlice;
  byPair: Record<string, OutcomeMetricsSlice>;
  byDirection: Record<string, OutcomeMetricsSlice>;
  byTimeframe: Record<string, OutcomeMetricsSlice>;
  byStrategy: Record<string, OutcomeMetricsSlice>;
  byShadowDecision: Record<string, ShadowDecisionOutcomeAnalysis>;
  confidenceCalibration: ConfidenceCalibrationBucket[];
  macroRelationships: MacroRelationshipSlice[];
  dataQuality: DataQualityReport;
}

/**
 * Pure deterministic outcome analytics calculation.
 */
export function analyzeTradeOutcomes(
  observations: TradeObservationRecord[],
  options?: {
    filterProvenance?: ObservationProvenance[];
    excludeIncomplete?: boolean;
  }
): ComprehensiveOutcomeAnalysisReport {
  let filtered = observations;
  if (options?.filterProvenance && options.filterProvenance.length > 0) {
    filtered = filtered.filter(o => options.filterProvenance!.includes(o.provenance));
  }
  if (options?.excludeIncomplete) {
    filtered = filtered.filter(o => o.isCompleteLifecycle && o.outcome !== undefined);
  }

  const completed = filtered.filter(o => o.outcome !== undefined);

  // Overall metrics
  const overallMetrics = computeSliceMetrics('OVERALL', 'ALL', completed);

  // By Pair
  const byPair: Record<string, OutcomeMetricsSlice> = {};
  const pairGroups = groupBy(completed, o => o.proposal?.symbol || o.brokerPosition?.symbol || 'UNKNOWN');
  for (const [pair, records] of Object.entries(pairGroups)) {
    byPair[pair] = computeSliceMetrics('pair', pair, records);
  }

  // By Direction
  const byDirection: Record<string, OutcomeMetricsSlice> = {};
  const dirGroups = groupBy(completed, o => o.proposal?.direction || o.brokerPosition?.direction || 'UNKNOWN');
  for (const [dir, records] of Object.entries(dirGroups)) {
    byDirection[dir] = computeSliceMetrics('direction', dir, records);
  }

  // By Timeframe
  const byTimeframe: Record<string, OutcomeMetricsSlice> = {};
  const tfGroups = groupBy(completed, o => o.proposal?.timeframe || 'UNKNOWN');
  for (const [tf, records] of Object.entries(tfGroups)) {
    byTimeframe[tf] = computeSliceMetrics('timeframe', tf, records);
  }

  // By Strategy
  const byStrategy: Record<string, OutcomeMetricsSlice> = {};
  const stratGroups = groupBy(completed, o => o.proposal?.strategy || 'UNKNOWN');
  for (const [strat, records] of Object.entries(stratGroups)) {
    byStrategy[strat] = computeSliceMetrics('strategy', strat, records);
  }

  // By Shadow Decision
  const byShadowDecision: Record<string, ShadowDecisionOutcomeAnalysis> = {
    SHADOW_ALLOW: computeShadowDecisionSlice('SHADOW_ALLOW', completed),
    SHADOW_REVIEW: computeShadowDecisionSlice('SHADOW_REVIEW', completed),
    SHADOW_WOULD_BLOCK: computeShadowDecisionSlice('SHADOW_WOULD_BLOCK', completed),
    SHADOW_UNKNOWN: computeShadowDecisionSlice('SHADOW_UNKNOWN', completed)
  };

  // Confidence Calibration
  const confidenceCalibration = computeConfidenceCalibration(completed);

  // Macro Relationships
  const macroRelationships = computeMacroRelationships(completed);

  // Data Quality
  const dataQuality = computeDataQualityReport(filtered);

  return {
    generatedAt: new Date().toISOString(),
    totalObservationsAnalyzed: filtered.length,
    overallMetrics,
    byPair,
    byDirection,
    byTimeframe,
    byStrategy,
    byShadowDecision,
    confidenceCalibration,
    macroRelationships,
    dataQuality
  };
}

function computeSliceMetrics(
  dimension: string,
  sliceKey: string,
  records: TradeObservationRecord[]
): OutcomeMetricsSlice {
  const sampleSize = records.length;
  if (sampleSize === 0) {
    return {
      sliceKey,
      dimension,
      sampleSize: 0,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      breakevenCount: 0,
      winRate: 0,
      grossPnL: 0,
      netPnL: 0,
      averagePnL: 0,
      medianPnL: 0,
      profitFactor: 0,
      averageWin: 0,
      averageLoss: 0,
      maxDrawdown: 0,
      provenanceBreakdown: {
        REAL_BROKER: 0,
        REAL_QUANTUMAI: 0,
        MANUAL_EXTERNAL: 0,
        BACKTEST: 0,
        SYNTHETIC: 0,
        UNKNOWN: 0
      }
    };
  }

  let winCount = 0;
  let lossCount = 0;
  let beCount = 0;
  let totalGross = 0;
  let totalNet = 0;
  let totalWinPnL = 0;
  let totalLossPnL = 0;

  const pnls: number[] = [];
  const mfeList: number[] = [];
  const maeList: number[] = [];

  const provMap: Record<ObservationProvenance, number> = {
    REAL_BROKER: 0,
    REAL_QUANTUMAI: 0,
    MANUAL_EXTERNAL: 0,
    BACKTEST: 0,
    SYNTHETIC: 0,
    UNKNOWN: 0
  };

  for (const r of records) {
    provMap[r.provenance] = (provMap[r.provenance] || 0) + 1;
    const pnl = r.outcome?.netPnL ?? 0;
    const gross = r.outcome?.grossPnL ?? pnl;
    pnls.push(pnl);
    totalNet += pnl;
    totalGross += gross;

    if (pnl > 0.001) {
      winCount++;
      totalWinPnL += pnl;
    } else if (pnl < -0.001) {
      lossCount++;
      totalLossPnL += Math.abs(pnl);
    } else {
      beCount++;
    }

    if (typeof r.outcome?.mfePips === 'number') {
      mfeList.push(r.outcome.mfePips);
    }
    if (typeof r.outcome?.maePips === 'number') {
      maeList.push(r.outcome.maePips);
    }
  }

  pnls.sort((a, b) => a - b);
  const medianPnL = pnls.length % 2 === 0
    ? (pnls[pnls.length / 2 - 1] + pnls[pnls.length / 2]) / 2
    : pnls[Math.floor(pnls.length / 2)];

  const winRate = sampleSize > 0 ? Number((winCount / sampleSize).toFixed(4)) : 0;
  const averagePnL = sampleSize > 0 ? Number((totalNet / sampleSize).toFixed(4)) : 0;
  const averageWin = winCount > 0 ? Number((totalWinPnL / winCount).toFixed(4)) : 0;
  const averageLoss = lossCount > 0 ? Number((totalLossPnL / lossCount).toFixed(4)) : 0;
  const profitFactor = totalLossPnL > 0
    ? Number((totalWinPnL / totalLossPnL).toFixed(4))
    : totalWinPnL > 0 ? 999.0 : 0.0;

  // Simple peak-to-trough max drawdown calculation
  let running = 0;
  let peak = 0;
  let maxDd = 0;
  for (const p of pnls) {
    running += p;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    sliceKey,
    dimension,
    sampleSize,
    tradeCount: sampleSize,
    winCount,
    lossCount,
    breakevenCount: beCount,
    winRate,
    grossPnL: Number(totalGross.toFixed(2)),
    netPnL: Number(totalNet.toFixed(2)),
    averagePnL,
    medianPnL: Number(medianPnL.toFixed(4)),
    profitFactor,
    averageWin,
    averageLoss,
    maxDrawdown: Number(maxDd.toFixed(2)),
    mfeStats: mfeList.length > 0 ? {
      availableSamples: mfeList.length,
      averageMfePips: Number((mfeList.reduce((a, b) => a + b, 0) / mfeList.length).toFixed(1)),
      maxMfePips: Math.max(...mfeList)
    } : undefined,
    maeStats: maeList.length > 0 ? {
      availableSamples: maeList.length,
      averageMaePips: Number((maeList.reduce((a, b) => a + b, 0) / maeList.length).toFixed(1)),
      maxMaePips: Math.max(...maeList)
    } : undefined,
    provenanceBreakdown: provMap
  };
}

function computeShadowDecisionSlice(
  decision: 'SHADOW_ALLOW' | 'SHADOW_REVIEW' | 'SHADOW_WOULD_BLOCK' | 'SHADOW_UNKNOWN',
  records: TradeObservationRecord[]
): ShadowDecisionOutcomeAnalysis {
  const matching = records.filter(r => (r.shadowDecision || 'SHADOW_UNKNOWN') === decision);
  const slice = computeSliceMetrics('shadowDecision', decision, matching);

  return {
    decision,
    sampleSize: slice.sampleSize,
    tradeCount: slice.tradeCount,
    winRate: slice.winRate,
    netPnL: slice.netPnL,
    averagePnL: slice.averagePnL,
    profitFactor: slice.profitFactor,
    counterfactualNote: decision === 'SHADOW_WOULD_BLOCK'
      ? 'COUNTERFACTUAL: These trades executed in production while shadow policy marked them as WOULD_BLOCK. Demonstrates empirical difference without claiming guaranteed causal prevention.'
      : 'OBSERVED: Trades evaluated under shadow mode with non-blocking status.'
  };
}

function computeConfidenceCalibration(records: TradeObservationRecord[]): ConfidenceCalibrationBucket[] {
  const buckets: { range: string; min: number; max: number }[] = [
    { range: '< 80%', min: 0, max: 0.7999 },
    { range: '80-84%', min: 0.80, max: 0.8499 },
    { range: '85-89%', min: 0.85, max: 0.8999 },
    { range: '90-94%', min: 0.90, max: 0.9499 },
    { range: '95%+', min: 0.95, max: 1.00 }
  ];

  return buckets.map(b => {
    const inBucket = records.filter(r => {
      const conf = r.proposal?.confidence ?? 0;
      const normalizedConf = conf > 1 ? conf / 100 : conf;
      return normalizedConf >= b.min && normalizedConf <= b.max;
    });

    const sampleSize = inBucket.length;
    const wins = inBucket.filter(r => (r.outcome?.netPnL ?? 0) > 0.001).length;
    const totalPnl = inBucket.reduce((acc, r) => acc + (r.outcome?.netPnL ?? 0), 0);

    let uncertainty: ConfidenceCalibrationBucket['uncertaintyScore'] = 'LOW';
    if (sampleSize < 10) uncertainty = 'INSUFFICIENT_SAMPLE';
    else if (sampleSize < 30) uncertainty = 'HIGH';
    else if (sampleSize < 100) uncertainty = 'MEDIUM';

    return {
      bucketRange: b.range,
      minConfidence: b.min,
      maxConfidence: b.max,
      sampleSize,
      observedWinRate: sampleSize > 0 ? Number((wins / sampleSize).toFixed(4)) : 0,
      averagePnL: sampleSize > 0 ? Number((totalPnl / sampleSize).toFixed(4)) : 0,
      uncertaintyScore: uncertainty
    };
  });
}

function computeMacroRelationships(records: TradeObservationRecord[]): MacroRelationshipSlice[] {
  const groups = groupBy(records, r => {
    const risk = r.macroContext?.macroRisk || r.secondOpinion?.macroRisk || 'UNKNOWN';
    const align = r.macroContext?.thesisAlignment || r.secondOpinion?.thesisAlignment || 'UNKNOWN';
    return `${risk}_${align}`;
  });

  const slices: MacroRelationshipSlice[] = [];
  for (const [key, list] of Object.entries(groups)) {
    const [risk, align] = key.split('_') as [MacroRiskLevel, ThesisAlignment];
    const wins = list.filter(r => (r.outcome?.netPnL ?? 0) > 0.001).length;
    const totalPnl = list.reduce((acc, r) => acc + (r.outcome?.netPnL ?? 0), 0);

    slices.push({
      macroRisk: risk,
      thesisAlignment: align,
      sampleSize: list.length,
      observedWinRate: list.length > 0 ? Number((wins / list.length).toFixed(4)) : 0,
      netPnL: Number(totalPnl.toFixed(2)),
      averagePnL: list.length > 0 ? Number((totalPnl / list.length).toFixed(4)) : 0
    });
  }

  return slices;
}

function computeDataQualityReport(records: TradeObservationRecord[]): DataQualityReport {
  const totalRecords = records.length;
  if (totalRecords === 0) {
    return {
      totalRecords: 0,
      verifiedRecords: 0,
      unlinkedRecords: 0,
      unknownOriginRecords: 0,
      missingMacroRecords: 0,
      missingMfeMaeRecords: 0,
      incompleteLifecycleRecords: 0,
      dataQualityScore: 100
    };
  }

  let verified = 0;
  let unlinked = 0;
  let unknownOrigin = 0;
  let missingMacro = 0;
  let missingMfeMae = 0;
  let incomplete = 0;

  for (const r of records) {
    if (r.linkageStatus === 'VERIFIED') verified++;
    if (r.linkageStatus === 'UNLINKED') unlinked++;
    if (r.provenance === 'UNKNOWN') unknownOrigin++;
    if (!r.macroContext || r.macroContext.dataAvailability === 'UNAVAILABLE') missingMacro++;
    if (!r.outcome || !r.outcome.intratradeHistoryAvailable) missingMfeMae++;
    if (!r.isCompleteLifecycle) incomplete++;
  }

  const score = Math.max(0, Math.round(
    ((verified / totalRecords) * 0.4 +
     (1 - unlinked / totalRecords) * 0.2 +
     (1 - unknownOrigin / totalRecords) * 0.2 +
     (1 - incomplete / totalRecords) * 0.2) * 100
  ));

  return {
    totalRecords,
    verifiedRecords: verified,
    unlinkedRecords: unlinked,
    unknownOriginRecords: unknownOrigin,
    missingMacroRecords: missingMacro,
    missingMfeMaeRecords: missingMfeMae,
    incompleteLifecycleRecords: incomplete,
    dataQualityScore: score
  };
}

function groupBy<T>(list: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of list) {
    const k = keyFn(item);
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}
