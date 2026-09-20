/**
 * QuantumAI IATI OS — Phase 2C.11: Historical QuantumAI Attribution Recovery Application Service
 * 
 * INVARIANTS:
 * - Strictly read-only against broker and execution systems.
 * - Deterministic forensic investigation of historical broker positions.
 * - Level 1-4 evidence hierarchy evaluation.
 * - Zero broker write access, zero execution side effects.
 * - Fully idempotent execution.
 */

import {
  RawForensicCandidate,
  HistoricalAttributionEvidence,
  ForensicTableEntry,
  ForensicAttributionSummary,
  evaluateAttributionEvidence,
  runForensicAttributionRecovery
} from '../../../../packages/core/src/historicalQuantumAIAttribution';
import {
  RawBrokerPositionRecord,
  RawBrokerDealRecord,
  ApplicationExecutionEvidence
} from '../../../../packages/core/src/historicalEvidenceReconstruction';
import { HistoricalEvidenceReconstructionService } from './historicalEvidenceReconstructionService';

export class HistoricalQuantumAIAttributionService {
  private lastSummary: ForensicAttributionSummary | null = null;

  constructor(
    private readonly reconstructionService?: HistoricalEvidenceReconstructionService
  ) {}

  /**
   * Deterministically evaluates single candidate evidence.
   */
  public evaluateCandidate(candidate: RawForensicCandidate): HistoricalAttributionEvidence {
    return evaluateAttributionEvidence(candidate);
  }

  /**
   * Runs forensic attribution recovery over candidates.
   */
  public runForensicRecovery(params: {
    candidates: RawForensicCandidate[];
    baselineMetrics?: {
      historicalBrokerDeals?: number;
      historicalBrokerPositions?: number;
      verifiedQuantumAIBefore?: number;
      verifiedManualExternalBefore?: number;
      unknownOriginBefore?: number;
    };
  }): ForensicAttributionSummary {
    const summary = runForensicAttributionRecovery(params);
    this.lastSummary = summary;
    return summary;
  }

  /**
   * Translates raw broker positions and evidence into forensic candidates and executes recovery.
   */
  public runForensicRecoveryFromRaw(params: {
    rawPositions: RawBrokerPositionRecord[];
    rawDeals: RawBrokerDealRecord[];
    evidenceMap?: Map<string, ApplicationExecutionEvidence>;
    baselineMetrics?: {
      historicalBrokerDeals?: number;
      historicalBrokerPositions?: number;
      verifiedQuantumAIBefore?: number;
      verifiedManualExternalBefore?: number;
      unknownOriginBefore?: number;
    };
  }): ForensicAttributionSummary {
    const { rawPositions, rawDeals, evidenceMap, baselineMetrics } = params;

    // Group deals by positionId
    const dealsByPos = new Map<string, (string | number)[]>();
    for (const d of rawDeals) {
      const posKey = String(d.positionId);
      const existing = dealsByPos.get(posKey) || [];
      existing.push(d.dealId);
      dealsByPos.set(posKey, existing);
    }

    const candidates: RawForensicCandidate[] = rawPositions.map(pos => {
      const posIdStr = String(pos.positionId);
      const matchedEvidence = evidenceMap?.get(posIdStr);
      const posDeals = dealsByPos.get(posIdStr) || pos.dealIds || [];

      const candidate: RawForensicCandidate = {
        brokerPositionId: pos.positionId,
        symbol: pos.symbol,
        direction: typeof pos.tradeSide === 'string' ? pos.tradeSide : (pos.tradeSide === 0 ? 'BUY' : 'SELL'),
        volume: pos.volumeLots,
        openTime: pos.openTimestamp,
        closeTime: pos.closeTimestamp,
        brokerPnL: {
          grossPnL: pos.grossPnL ?? 0,
          commission: pos.commission ?? 0,
          swap: pos.swap ?? 0,
          netPnL: pos.netPnL ?? (pos.grossPnL ?? 0) + (pos.commission ?? 0) + (pos.swap ?? 0)
        },
        dealIds: posDeals,
        comment: pos.comment,
        label: pos.label,
        originBefore: 'UNKNOWN_ORIGIN'
      };

      if (matchedEvidence) {
        if (matchedEvidence.clientType === 'MANUAL_EXTERNAL') {
          candidate.candidateManualEvidence = {
            clientType: 'MANUAL_EXTERNAL',
            isConfirmedManual: true,
            sourceFile: matchedEvidence.sourceFile
          };
          candidate.originBefore = 'VERIFIED_MANUAL_EXTERNAL';
        } else if (matchedEvidence.authoritativeProof) {
          candidate.candidateExecution = {
            executionSequenceId: matchedEvidence.executionSequenceId,
            brokerPositionId: matchedEvidence.brokerPositionId || pos.positionId,
            brokerOrderId: matchedEvidence.brokerOrderId,
            brokerDealId: matchedEvidence.brokerDealId,
            authoritativeBrokerLink: true,
            sourceFile: matchedEvidence.sourceFile
          };
          candidate.candidateProposal = {
            proposalId: matchedEvidence.proposalId,
            signalId: matchedEvidence.signalId,
            strategy: matchedEvidence.strategy,
            timeframe: matchedEvidence.timeframe,
            confidence: matchedEvidence.confidence,
            sourceFile: matchedEvidence.sourceFile
          };
        } else if (matchedEvidence.proposalId || matchedEvidence.signalId) {
          candidate.candidateProposal = {
            proposalId: matchedEvidence.proposalId,
            signalId: matchedEvidence.signalId,
            strategy: matchedEvidence.strategy,
            timeframe: matchedEvidence.timeframe,
            confidence: matchedEvidence.confidence,
            sourceFile: matchedEvidence.sourceFile
          };
        }

        if (matchedEvidence.secondOpinion?.isRetrospective) {
          candidate.candidateRetrospectiveAi = {
            opinionId: matchedEvidence.secondOpinion.opinionId,
            isRetrospective: true,
            notes: matchedEvidence.secondOpinion.explanation
          };
        }
      }

      return candidate;
    });

    return this.runForensicRecovery({ candidates, baselineMetrics });
  }

  /**
   * Retrieves the last computed forensic attribution summary.
   */
  public getLastSummary(): ForensicAttributionSummary | null {
    return this.lastSummary;
  }
}
