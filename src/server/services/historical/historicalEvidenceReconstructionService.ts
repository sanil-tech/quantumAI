/**
 * QuantumAI IATI OS — Phase 2C.10: Historical Evidence Reconstruction Application Service
 * 
 * INVARIANTS:
 * - Strictly read-only against broker and execution systems.
 * - Population separation (ALL_REAL_BROKER, VERIFIED_QUANTUMAI, VERIFIED_MANUAL_EXTERNAL, UNKNOWN_ORIGIN).
 * - Integrates with tradeOutcomeAnalytics, tradePatternDiscovery, and validatedImprovementProposals.
 * - Idempotent dataset compilation.
 */

import {
  RawBrokerPositionRecord,
  RawBrokerDealRecord,
  ApplicationExecutionEvidence,
  HistoricalReconstructionRecord,
  HistoricalReconstructionSummary,
  HistoricalDatasetPopulation,
  reconstructHistoricalEvidence,
  filterHistoricalPopulation,
  mapHistoricalToObservationRecords
} from '../../../../packages/core/src/historicalEvidenceReconstruction';
import {
  analyzeTradeOutcomes,
  ComprehensiveOutcomeAnalysisReport
} from '../../../../packages/core/src/tradeOutcomeAnalytics';
import {
  discoverTradePatterns,
  ComprehensivePatternDiscoveryReport
} from '../../../../packages/core/src/tradePatternDiscovery';
import {
  generateImprovementProposals,
  ImprovementProposalRegistrySummary
} from '../../../../packages/core/src/validatedImprovementProposals';
import { TradeObservationService } from '../observation/tradeObservationService';

export class HistoricalEvidenceReconstructionService {
  private reconstructedSummary: HistoricalReconstructionSummary | null = null;

  constructor(
    private readonly observationService?: TradeObservationService
  ) {}

  /**
   * Compiles and reconstructs raw broker positions, deals, and evidence into an auditable dataset.
   */
  public reconstructDataset(params: {
    rawPositions: RawBrokerPositionRecord[];
    rawDeals: RawBrokerDealRecord[];
    evidenceMap?: Map<string, ApplicationExecutionEvidence>;
  }): HistoricalReconstructionSummary {
    const summary = reconstructHistoricalEvidence(params);
    this.reconstructedSummary = summary;
    return summary;
  }

  /**
   * Retrieves the current reconstructed dataset.
   */
  public getReconstructedSummary(): HistoricalReconstructionSummary | null {
    return this.reconstructedSummary;
  }

  /**
   * Filters the reconstructed records by explicit population selector.
   */
  public getPopulationRecords(population: HistoricalDatasetPopulation): HistoricalReconstructionRecord[] {
    if (!this.reconstructedSummary) return [];
    return filterHistoricalPopulation(this.reconstructedSummary.records, population);
  }

  /**
   * Runs Phase 2C.7 outcome analytics for a specific historical population.
   */
  public analyzePopulationOutcomes(population: HistoricalDatasetPopulation): ComprehensiveOutcomeAnalysisReport {
    const records = this.getPopulationRecords(population);
    const observationRecords = mapHistoricalToObservationRecords(records);
    return analyzeTradeOutcomes(observationRecords);
  }

  /**
   * Runs Phase 2C.8 pattern discovery for a specific historical population.
   */
  public discoverPopulationPatterns(
    population: HistoricalDatasetPopulation,
    options?: { minSampleThreshold?: number }
  ): ComprehensivePatternDiscoveryReport {
    const records = this.getPopulationRecords(population);
    const observationRecords = mapHistoricalToObservationRecords(records);
    return discoverTradePatterns(observationRecords, options);
  }

  /**
   * Generates Phase 2C.9 improvement proposals from a specific historical population.
   */
  public generatePopulationProposals(
    population: HistoricalDatasetPopulation,
    options?: { minSampleThreshold?: number }
  ): ImprovementProposalRegistrySummary {
    const analytics = this.analyzePopulationOutcomes(population);
    const patterns = this.discoverPopulationPatterns(population, options);
    return generateImprovementProposals(analytics, patterns);
  }

  /**
   * Ingests the reconstructed historical records into the main observation repository idempotently.
   */
  public async ingestIntoObservationRepository(population: HistoricalDatasetPopulation): Promise<number> {
    if (!this.observationService) return 0;
    const records = this.getPopulationRecords(population);
    let ingestedCount = 0;

    for (const r of records) {
      if (r.proposalId) {
        await this.observationService.recordProposal({
          proposalId: r.proposalId,
          signalId: r.signalId,
          symbol: r.symbol,
          direction: r.direction,
          volumeLots: r.volumeLots,
          confidence: r.confidence,
          strategy: r.strategy,
          method: r.method,
          timeframe: r.timeframe,
          timestamp: r.openTime,
          provenance: r.attributionStatus === 'VERIFIED_QUANTUMAI' ? 'REAL_QUANTUMAI' : r.attributionStatus === 'VERIFIED_MANUAL_EXTERNAL' ? 'MANUAL_EXTERNAL' : 'REAL_BROKER'
        });
      }

      await this.observationService.recordBrokerPositionOpened({
        brokerPositionId: r.brokerPositionId,
        symbol: r.symbol,
        direction: r.direction,
        volumeLots: r.volumeLots,
        openTimestamp: r.openTime,
        proposalId: r.proposalId,
        provenance: 'REAL_BROKER'
      });

      if (r.closeTime) {
        await this.observationService.recordBrokerPositionClosed({
          brokerPositionId: r.brokerPositionId,
          brokerDealId: r.brokerDealIds[0],
          realizedPnL: r.brokerPnL.netPnL,
          grossPnL: r.brokerPnL.grossPnL,
          closeTimestamp: r.closeTime,
          closeReason: 'HISTORICAL_CLOSE',
          intratradeHistoryAvailable: false
        });
      }
      ingestedCount++;
    }

    return ingestedCount;
  }
}

/**
 * Global default instance for historical research.
 */
export const defaultHistoricalEvidenceReconstructionService = new HistoricalEvidenceReconstructionService();
