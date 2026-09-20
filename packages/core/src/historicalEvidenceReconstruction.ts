/**
 * QuantumAI IATI OS — Phase 2C.10: Historical Evidence Reconstruction Engine
 * 
 * INVARIANTS:
 * - Strictly read-only forensic reconstruction.
 * - DO NOT assume broker trade = QuantumAI trade.
 * - Authoritative broker Level 1 data for position/deal outcome (P/L, commission, swap, volume).
 * - Independent Attribution: VERIFIED_QUANTUMAI, VERIFIED_MANUAL_EXTERNAL, UNKNOWN_ORIGIN.
 * - Heuristic evidence stored as heuristicAttribution without promoting to verified attribution.
 * - No look-ahead bias: Decision-time context partitioned from post-decision context.
 * - MFE/MAE: ONLY when real price history exists, otherwise UNKNOWN.
 * - Currency exposure uses canonical currencyExposureNormalizer.
 */

import {
  TradeObservationRecord,
  ObservationProvenance,
  LinkageVerificationStatus,
  MacroRiskLevel,
  ThesisAlignment,
  createDefaultObservationRecord
} from './tradeObservation';
import {
  decomposeFxSymbol,
  aggregateCurrencyFactors,
  CurrencyLeg
} from './currencyExposureNormalizer';

export type HistoricalAttributionStatus =
  | 'VERIFIED_QUANTUMAI'
  | 'VERIFIED_MANUAL_EXTERNAL'
  | 'UNKNOWN_ORIGIN';

export type HeuristicAttribution =
  | 'QUANTUMAI_PROBABLE'
  | 'MANUAL_PROBABLE'
  | 'AMBIGUOUS'
  | 'NONE';

export type HistoricalDatasetPopulation =
  | 'ALL_REAL_BROKER'
  | 'VERIFIED_QUANTUMAI'
  | 'VERIFIED_MANUAL_EXTERNAL'
  | 'UNKNOWN_ORIGIN';

export interface RawBrokerPositionRecord {
  positionId: number | string;
  symbol: string;
  tradeSide: 'BUY' | 'SELL' | number | string;
  volumeLots: number;
  openPrice?: number;
  openTimestamp: number | string;
  closeTimestamp?: number | string;
  grossPnL?: number;
  commission?: number;
  swap?: number;
  netPnL?: number;
  dealIds?: (number | string)[];
  comment?: string;
  label?: string;
}

export interface RawBrokerDealRecord {
  dealId: number | string;
  positionId: number | string;
  symbol: string;
  tradeSide: 'BUY' | 'SELL' | number | string;
  volumeLots: number;
  executionPrice?: number;
  executionTimestamp: number | string;
  grossProfit?: number;
  commission?: number;
  swap?: number;
  dealType?: string; // ENTRY, CLOSE, etc.
}

export interface ApplicationExecutionEvidence {
  executionSequenceId?: string;
  proposalId?: string;
  signalId?: string;
  strategy?: string;
  method?: string;
  timeframe?: string;
  confidence?: number;
  brokerPositionId?: string;
  brokerOrderId?: string;
  brokerDealId?: string;
  clientType?: string;
  sourceFile?: string;
  authoritativeProof: boolean; // Must be true for VERIFIED_QUANTUMAI
  secondOpinion?: {
    opinionId?: string;
    macroRisk?: MacroRiskLevel;
    thesisAlignment?: ThesisAlignment;
    eventRisk?: string[];
    explanation?: string;
    isRetrospective?: boolean;
  };
  macroContext?: {
    event?: string;
    macroRisk?: MacroRiskLevel;
    publicationTimestamp?: string;
    decisionTimestamp?: string;
  };
}

export interface HistoricalReconstructionRecord {
  reconstructionId: string;
  brokerPositionId: string;
  brokerDealIds: string[];
  source: 'REAL_BROKER';
  attributionStatus: HistoricalAttributionStatus;
  heuristicAttribution?: HeuristicAttribution;
  provenance: ObservationProvenance;
  linkageVerification: LinkageVerificationStatus;

  // Timestamps
  openTime: string;
  closeTime?: string;
  durationSeconds?: number;

  // Asset details
  symbol: string;
  canonicalSymbol: string;
  direction: 'BUY' | 'SELL';
  volumeLots: number;

  // Broker Authoritative Financial Outcome
  brokerPnL: {
    grossPnL: number;
    commission: number;
    swap: number;
    netPnL: number;
  };

  // Intratrade excursions
  mfePips: number | 'UNKNOWN';
  maePips: number | 'UNKNOWN';
  intratradeHistoryAvailable: boolean;

  // QuantumAI Linked Fields (where evidenced)
  signalId?: string;
  proposalId?: string;
  executionSequenceId?: string;
  strategy?: string;
  method?: string;
  timeframe?: string;
  confidence?: number;

  // Macro context partitioned to eliminate lookahead bias
  decisionTimeMacroContext?: {
    macroRisk: MacroRiskLevel;
    event?: string;
    publicationTimestamp?: string;
    isVerifiedPreDecision: boolean;
  };
  postDecisionContext?: {
    event?: string;
    realizedMacroOutcome?: string;
  };

  // Second Opinion AI partitioned
  secondOpinion?: {
    opinionId?: string;
    macroRisk: MacroRiskLevel;
    thesisAlignment: ThesisAlignment;
    eventRisk: string[];
    explanation: string;
    isOriginalHistory: boolean;
    isRetrospectiveAnalysis: boolean;
    executionAuthority: false;
  };

  // Currency factor snapshot at open
  currencyExposureAtOpen?: {
    totalGrossLots: number;
    netUnitsByCurrency: Record<string, number>;
  };
}

export interface HistoricalReconstructionSummary {
  generatedAt: string;
  totalBrokerDeals: number;
  totalBrokerPositions: number;
  closedPositionsCount: number;
  openPositionsCount: number;

  attributionBreakdown: {
    verifiedQuantumAiPositions: number;
    verifiedManualExternalPositions: number;
    unknownOriginPositions: number;
    verifiedQuantumAiDeals: number;
    verifiedManualExternalDeals: number;
    unknownOriginDeals: number;
  };

  financialTotals: {
    totalGrossPnL: number;
    totalCommission: number;
    totalSwap: number;
    totalNetPnL: number;
  };

  records: HistoricalReconstructionRecord[];
}

/**
 * Reconstructs canonical historical observations from raw broker records and evidence mappings.
 */
export function reconstructHistoricalEvidence(params: {
  rawPositions: RawBrokerPositionRecord[];
  rawDeals: RawBrokerDealRecord[];
  evidenceMap?: Map<string, ApplicationExecutionEvidence>; // Keyed by brokerPositionId or dealId
}): HistoricalReconstructionSummary {
  const dealsByPosition = new Map<string, RawBrokerDealRecord[]>();
  for (const deal of params.rawDeals) {
    const posKey = String(deal.positionId);
    if (!dealsByPosition.has(posKey)) {
      dealsByPosition.set(posKey, []);
    }
    dealsByPosition.get(posKey)!.push(deal);
  }

  const records: HistoricalReconstructionRecord[] = [];

  let verifiedQPositions = 0;
  let verifiedManualPositions = 0;
  let unknownOriginPositions = 0;

  let verifiedQDeals = 0;
  let verifiedManualDeals = 0;
  let unknownOriginDeals = 0;

  let totalGross = 0;
  let totalComm = 0;
  let totalSwap = 0;
  let totalNet = 0;

  let closedCount = 0;
  let openCount = 0;

  for (const pos of params.rawPositions) {
    const posIdStr = String(pos.positionId);
    const posDeals = dealsByPosition.get(posIdStr) || [];
    const dealIds = posDeals.map(d => String(d.dealId));

    // Normalize Direction
    const rawSide = String(pos.tradeSide).toUpperCase();
    const direction: 'BUY' | 'SELL' = (rawSide === 'BUY' || rawSide === '1') ? 'BUY' : 'SELL';

    // Normalize Financials from Broker Level 1
    let gross = pos.grossPnL || 0;
    let comm = pos.commission || 0;
    let swap = pos.swap || 0;

    if (posDeals.length > 0) {
      gross = posDeals.reduce((acc, d) => acc + (d.grossProfit || 0), 0);
      comm = posDeals.reduce((acc, d) => acc + (d.commission || 0), 0);
      swap = posDeals.reduce((acc, d) => acc + (d.swap || 0), 0);
    }
    const net = Number((gross + comm + swap).toFixed(2));

    totalGross += gross;
    totalComm += comm;
    totalSwap += swap;
    totalNet += net;

    // Check Open vs Closed
    const isClosed = !!pos.closeTimestamp || (posDeals.length > 0 && posDeals.some(d => d.dealType === 'CLOSE' || (d.grossProfit !== undefined && d.grossProfit !== 0)));
    if (isClosed) closedCount++;
    else openCount++;

    // Attribution Logic: Strict & Deterministic
    const evidence = params.evidenceMap?.get(posIdStr) || (dealIds.length > 0 ? params.evidenceMap?.get(dealIds[0]) : undefined);

    let attributionStatus: HistoricalAttributionStatus = 'UNKNOWN_ORIGIN';
    let heuristicAttribution: HeuristicAttribution = 'NONE';
    let linkageVerification: LinkageVerificationStatus = 'UNLINKED';

    if (evidence && evidence.authoritativeProof && (evidence.proposalId || evidence.signalId || evidence.executionSequenceId)) {
      attributionStatus = 'VERIFIED_QUANTUMAI';
      linkageVerification = 'VERIFIED';
      verifiedQPositions++;
      verifiedQDeals += Math.max(1, dealIds.length);
    } else if (evidence && evidence.clientType === 'MANUAL_EXTERNAL') {
      attributionStatus = 'VERIFIED_MANUAL_EXTERNAL';
      linkageVerification = 'VERIFIED';
      verifiedManualPositions++;
      verifiedManualDeals += Math.max(1, dealIds.length);
    } else {
      attributionStatus = 'UNKNOWN_ORIGIN';
      linkageVerification = 'UNKNOWN';
      unknownOriginPositions++;
      unknownOriginDeals += Math.max(1, dealIds.length);

      // Heuristic metadata only (never promoted to attributionStatus)
      if (pos.comment?.includes('QuantumAI') || pos.label?.includes('QuantumAI')) {
        heuristicAttribution = 'QUANTUMAI_PROBABLE';
      } else if (pos.comment?.includes('Manual') || pos.label?.includes('cTrader Mobile')) {
        heuristicAttribution = 'MANUAL_PROBABLE';
      }
    }

    // Currency Exposure Decomposition using Canonical Normalizer
    const cleanSym = pos.symbol.replace(/[\/\-_]/g, '').toUpperCase();
    const decomp = decomposeFxSymbol(cleanSym, direction, pos.volumeLots, 1.0);
    let exposureSummary: HistoricalReconstructionRecord['currencyExposureAtOpen'];
    if (decomp.success && decomp.baseLeg && decomp.quoteLeg) {
      const agg = aggregateCurrencyFactors([decomp.baseLeg, decomp.quoteLeg]);
      const netMap: Record<string, number> = {};
      for (const [c, f] of Object.entries(agg.currencies)) {
        netMap[c] = Number(f.netUnits.toFixed(4));
      }
      exposureSummary = {
        totalGrossLots: agg.totalGrossLots,
        netUnitsByCurrency: netMap
      };
    }

    // Macro context partitioning
    let decisionTimeMacro: HistoricalReconstructionRecord['decisionTimeMacroContext'];
    if (evidence?.macroContext) {
      decisionTimeMacro = {
        macroRisk: evidence.macroContext.macroRisk || 'UNKNOWN',
        event: evidence.macroContext.event,
        publicationTimestamp: evidence.macroContext.publicationTimestamp,
        isVerifiedPreDecision: true
      };
    }

    // Second Opinion AI history
    let secondOp: HistoricalReconstructionRecord['secondOpinion'];
    if (evidence?.secondOpinion) {
      secondOp = {
        opinionId: evidence.secondOpinion.opinionId || `so-hist-${posIdStr}`,
        macroRisk: evidence.secondOpinion.macroRisk || 'UNKNOWN',
        thesisAlignment: evidence.secondOpinion.thesisAlignment || 'UNKNOWN',
        eventRisk: evidence.secondOpinion.eventRisk || [],
        explanation: evidence.secondOpinion.explanation || 'Historical recorded assessment.',
        isOriginalHistory: !evidence.secondOpinion.isRetrospective,
        isRetrospectiveAnalysis: !!evidence.secondOpinion.isRetrospective,
        executionAuthority: false
      };
    }

    const openTimeIso = typeof pos.openTimestamp === 'number'
      ? new Date(pos.openTimestamp).toISOString()
      : new Date(pos.openTimestamp).toISOString();

    const closeTimeIso = pos.closeTimestamp
      ? (typeof pos.closeTimestamp === 'number' ? new Date(pos.closeTimestamp).toISOString() : new Date(pos.closeTimestamp).toISOString())
      : undefined;

    records.push({
      reconstructionId: `recon-pos-${posIdStr}`,
      brokerPositionId: posIdStr,
      brokerDealIds: dealIds,
      source: 'REAL_BROKER',
      attributionStatus,
      heuristicAttribution,
      provenance: 'REAL_BROKER',
      linkageVerification,
      openTime: openTimeIso,
      closeTime: closeTimeIso,
      durationSeconds: closeTimeIso ? Math.round((new Date(closeTimeIso).getTime() - new Date(openTimeIso).getTime()) / 1000) : undefined,
      symbol: pos.symbol,
      canonicalSymbol: cleanSym,
      direction,
      volumeLots: pos.volumeLots,
      brokerPnL: {
        grossPnL: Number(gross.toFixed(2)),
        commission: Number(comm.toFixed(2)),
        swap: Number(swap.toFixed(2)),
        netPnL: net
      },
      mfePips: 'UNKNOWN', // Missing intratrade tick history defaults to UNKNOWN
      maePips: 'UNKNOWN',
      intratradeHistoryAvailable: false,
      signalId: evidence?.signalId,
      proposalId: evidence?.proposalId,
      executionSequenceId: evidence?.executionSequenceId,
      strategy: evidence?.strategy,
      method: evidence?.method,
      timeframe: evidence?.timeframe,
      confidence: evidence?.confidence,
      decisionTimeMacroContext: decisionTimeMacro,
      secondOpinion: secondOp,
      currencyExposureAtOpen: exposureSummary
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    totalBrokerDeals: params.rawDeals.length,
    totalBrokerPositions: params.rawPositions.length,
    closedPositionsCount: closedCount,
    openPositionsCount: openCount,
    attributionBreakdown: {
      verifiedQuantumAiPositions: verifiedQPositions,
      verifiedManualExternalPositions: verifiedManualPositions,
      unknownOriginPositions: unknownOriginPositions,
      verifiedQuantumAiDeals: verifiedQDeals,
      verifiedManualExternalDeals: verifiedManualDeals,
      unknownOriginDeals: unknownOriginDeals
    },
    financialTotals: {
      totalGrossPnL: Number(totalGross.toFixed(2)),
      totalCommission: Number(totalComm.toFixed(2)),
      totalSwap: Number(totalSwap.toFixed(2)),
      totalNetPnL: Number(totalNet.toFixed(2))
    },
    records
  };
}

/**
 * Filter historical records by explicit population selector.
 */
export function filterHistoricalPopulation(
  records: HistoricalReconstructionRecord[],
  population: HistoricalDatasetPopulation
): HistoricalReconstructionRecord[] {
  switch (population) {
    case 'VERIFIED_QUANTUMAI':
      return records.filter(r => r.attributionStatus === 'VERIFIED_QUANTUMAI');
    case 'VERIFIED_MANUAL_EXTERNAL':
      return records.filter(r => r.attributionStatus === 'VERIFIED_MANUAL_EXTERNAL');
    case 'UNKNOWN_ORIGIN':
      return records.filter(r => r.attributionStatus === 'UNKNOWN_ORIGIN');
    case 'ALL_REAL_BROKER':
    default:
      return records.filter(r => r.source === 'REAL_BROKER');
  }
}

/**
 * Adapts HistoricalReconstructionRecord[] into TradeObservationRecord[] for seamless analytics ingestion.
 */
export function mapHistoricalToObservationRecords(
  records: HistoricalReconstructionRecord[]
): TradeObservationRecord[] {
  return records.map(r => {
    const obs = createDefaultObservationRecord({
      observationId: r.reconstructionId,
      provenance: r.attributionStatus === 'VERIFIED_QUANTUMAI' ? 'REAL_QUANTUMAI' : r.attributionStatus === 'VERIFIED_MANUAL_EXTERNAL' ? 'MANUAL_EXTERNAL' : 'REAL_BROKER',
      proposalId: r.proposalId,
      brokerPositionId: r.brokerPositionId
    });

    obs.signalId = r.signalId;
    obs.executionSequenceId = r.executionSequenceId;
    obs.brokerDealIds = r.brokerDealIds;
    obs.linkageStatus = r.linkageVerification;
    obs.createdAt = r.openTime;
    obs.updatedAt = r.closeTime || r.openTime;

    if (r.proposalId || r.strategy) {
      obs.proposal = {
        proposalId: r.proposalId || `hist-prop-${r.brokerPositionId}`,
        signalId: r.signalId,
        symbol: r.symbol,
        direction: r.direction,
        timeframe: r.timeframe,
        confidence: r.confidence,
        strategy: r.strategy,
        method: r.method,
        timestamp: r.openTime
      };
    }

    obs.brokerPosition = {
      brokerPositionId: r.brokerPositionId,
      symbol: r.symbol,
      direction: r.direction,
      volumeLots: r.volumeLots,
      openTimestamp: r.openTime,
      currencyExposureSummary: r.currencyExposureAtOpen
    };

    if (r.secondOpinion) {
      obs.secondOpinion = {
        opinionId: r.secondOpinion.opinionId || `so-${r.brokerPositionId}`,
        executionAuthority: false,
        macroRisk: r.secondOpinion.macroRisk,
        thesisAlignment: r.secondOpinion.thesisAlignment,
        eventRisk: r.secondOpinion.eventRisk,
        explanation: r.secondOpinion.explanation,
        assessmentTimestamp: r.openTime
      };
    }

    if (r.decisionTimeMacroContext) {
      obs.macroContext = {
        contextId: `macro-${r.brokerPositionId}`,
        dataAvailability: 'AVAILABLE',
        macroRisk: r.decisionTimeMacroContext.macroRisk,
        thesisAlignment: 'UNKNOWN',
        eventRisk: r.decisionTimeMacroContext.event ? [r.decisionTimeMacroContext.event] : [],
        assessmentTimestamp: r.decisionTimeMacroContext.publicationTimestamp || r.openTime
      };
    }

    if (r.closeTime) {
      obs.outcome = {
        brokerPositionId: r.brokerPositionId,
        brokerDealId: r.brokerDealIds[0],
        closeTimestamp: r.closeTime,
        realizedPnL: r.brokerPnL.netPnL,
        grossPnL: r.brokerPnL.grossPnL,
        commission: r.brokerPnL.commission,
        swap: r.brokerPnL.swap,
        netPnL: r.brokerPnL.netPnL,
        mfePips: r.mfePips,
        maePips: r.maePips,
        intratradeHistoryAvailable: r.intratradeHistoryAvailable
      };
      obs.isCompleteLifecycle = true;
    }

    return obs;
  });
}
