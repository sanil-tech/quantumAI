/**
 * QuantumAI IATI OS — Phase 2C.6 - 2C.9: Trade Observation Service & Telemetry Pipeline
 * 
 * INVARIANTS:
 * - Strictly non-blocking and observational.
 * - Zero broker write access (no placeOrder, cancelOrder, modifyPosition, modify SL/TP).
 * - Second Opinion AI executionAuthority = false.
 * - Failure isolation: Persistence/query errors never propagate to execution callers.
 * - Full linkage: Signal -> Thesis -> Proposal -> Risk Reservation -> Execution -> Broker Position -> Close -> Outcome.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  TradeObservationRecord,
  ObservationProvenance,
  LinkageVerificationStatus,
  MacroContextRecord,
  SecondOpinionAdvisoryRecord,
  ProposalObservationData,
  BrokerPositionObservationData,
  OutcomeObservationData,
  createDefaultObservationRecord
} from '../../../../packages/core/src/tradeObservation';
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

export interface ITradeObservationRepository {
  saveObservation(observation: TradeObservationRecord): Promise<void>;
  getObservationById(observationId: string): Promise<TradeObservationRecord | null>;
  getObservationByProposalId(proposalId: string): Promise<TradeObservationRecord | null>;
  getObservationByPositionId(brokerPositionId: string): Promise<TradeObservationRecord | null>;
  getObservations(limit?: number): Promise<TradeObservationRecord[]>;
}

/**
 * In-Memory repository for deterministic local testing and fallback operation.
 */
export class InMemoryTradeObservationRepository implements ITradeObservationRepository {
  private records: Map<string, TradeObservationRecord> = new Map();

  public async saveObservation(observation: TradeObservationRecord): Promise<void> {
    const cloned = JSON.parse(JSON.stringify(observation));
    this.records.set(observation.observationId, cloned);
  }

  public async getObservationById(observationId: string): Promise<TradeObservationRecord | null> {
    return this.records.get(observationId) || null;
  }

  public async getObservationByProposalId(proposalId: string): Promise<TradeObservationRecord | null> {
    for (const r of this.records.values()) {
      if (r.proposalId === proposalId) return r;
    }
    return null;
  }

  public async getObservationByPositionId(brokerPositionId: string): Promise<TradeObservationRecord | null> {
    for (const r of this.records.values()) {
      if (r.brokerPositionId === brokerPositionId) return r;
    }
    return null;
  }

  public async getObservations(limit = 100): Promise<TradeObservationRecord[]> {
    const list = Array.from(this.records.values());
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list.slice(0, limit);
  }

  public clear(): void {
    this.records.clear();
  }
}

/**
 * Durable PostgreSQL repository for persistent trade observation telemetry.
 */
export class PostgresTradeObservationRepository implements ITradeObservationRepository {
  constructor(private readonly pool: Pool) {}

  public async saveObservation(observation: TradeObservationRecord): Promise<void> {
    try {
      const query = `
        INSERT INTO trade_observations (
          observation_id, created_at, updated_at, provenance, linkage_status,
          signal_id, proposal_id, execution_sequence_id, broker_position_id, broker_deal_ids,
          proposal_json, second_opinion_json, macro_context_json,
          broker_position_json, outcome_json, shadow_evaluation_id,
          shadow_decision, shadow_reasons, is_complete_lifecycle
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (observation_id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          linkage_status = EXCLUDED.linkage_status,
          broker_position_id = COALESCE(EXCLUDED.broker_position_id, trade_observations.broker_position_id),
          broker_deal_ids = EXCLUDED.broker_deal_ids,
          proposal_json = COALESCE(EXCLUDED.proposal_json, trade_observations.proposal_json),
          second_opinion_json = COALESCE(EXCLUDED.second_opinion_json, trade_observations.second_opinion_json),
          macro_context_json = COALESCE(EXCLUDED.macro_context_json, trade_observations.macro_context_json),
          broker_position_json = COALESCE(EXCLUDED.broker_position_json, trade_observations.broker_position_json),
          outcome_json = COALESCE(EXCLUDED.outcome_json, trade_observations.outcome_json),
          shadow_evaluation_id = COALESCE(EXCLUDED.shadow_evaluation_id, trade_observations.shadow_evaluation_id),
          shadow_decision = COALESCE(EXCLUDED.shadow_decision, trade_observations.shadow_decision),
          shadow_reasons = COALESCE(EXCLUDED.shadow_reasons, trade_observations.shadow_reasons),
          is_complete_lifecycle = EXCLUDED.is_complete_lifecycle;
      `;

      const values = [
        observation.observationId,
        observation.createdAt,
        observation.updatedAt,
        observation.provenance,
        observation.linkageStatus,
        observation.signalId || null,
        observation.proposalId || null,
        observation.executionSequenceId || null,
        observation.brokerPositionId || null,
        JSON.stringify(observation.brokerDealIds),
        observation.proposal ? JSON.stringify(observation.proposal) : null,
        observation.secondOpinion ? JSON.stringify(observation.secondOpinion) : null,
        observation.macroContext ? JSON.stringify(observation.macroContext) : null,
        observation.brokerPosition ? JSON.stringify(observation.brokerPosition) : null,
        observation.outcome ? JSON.stringify(observation.outcome) : null,
        observation.shadowEvaluationId || null,
        observation.shadowDecision || null,
        observation.shadowReasons ? JSON.stringify(observation.shadowReasons) : null,
        observation.isCompleteLifecycle
      ];

      await this.pool.query(query, values);
    } catch (err: any) {
      console.warn(`[TRADE-OBSERVATION-PERSISTENCE-WARN] Save failed for ${observation.observationId}:`, err?.message);
    }
  }

  public async getObservationById(observationId: string): Promise<TradeObservationRecord | null> {
    try {
      const res = await this.pool.query('SELECT * FROM trade_observations WHERE observation_id = $1', [observationId]);
      if (res.rows.length === 0) return null;
      return this.mapRow(res.rows[0]);
    } catch (err: any) {
      console.warn(`[TRADE-OBSERVATION-QUERY-WARN] Query by ID failed:`, err?.message);
      return null;
    }
  }

  public async getObservationByProposalId(proposalId: string): Promise<TradeObservationRecord | null> {
    try {
      const res = await this.pool.query('SELECT * FROM trade_observations WHERE proposal_id = $1', [proposalId]);
      if (res.rows.length === 0) return null;
      return this.mapRow(res.rows[0]);
    } catch (err: any) {
      console.warn(`[TRADE-OBSERVATION-QUERY-WARN] Query by proposalId failed:`, err?.message);
      return null;
    }
  }

  public async getObservationByPositionId(brokerPositionId: string): Promise<TradeObservationRecord | null> {
    try {
      const res = await this.pool.query('SELECT * FROM trade_observations WHERE broker_position_id = $1', [brokerPositionId]);
      if (res.rows.length === 0) return null;
      return this.mapRow(res.rows[0]);
    } catch (err: any) {
      console.warn(`[TRADE-OBSERVATION-QUERY-WARN] Query by positionId failed:`, err?.message);
      return null;
    }
  }

  public async getObservations(limit = 100): Promise<TradeObservationRecord[]> {
    try {
      const res = await this.pool.query('SELECT * FROM trade_observations ORDER BY created_at DESC LIMIT $1', [limit]);
      return res.rows.map(r => this.mapRow(r));
    } catch (err: any) {
      console.warn(`[TRADE-OBSERVATION-QUERY-WARN] Query observations failed:`, err?.message);
      return [];
    }
  }

  private mapRow(row: any): TradeObservationRecord {
    return {
      observationId: row.observation_id,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      provenance: row.provenance as ObservationProvenance,
      linkageStatus: row.linkage_status as LinkageVerificationStatus,
      signalId: row.signal_id || undefined,
      proposalId: row.proposal_id || undefined,
      executionSequenceId: row.execution_sequence_id || undefined,
      brokerPositionId: row.broker_position_id || undefined,
      brokerDealIds: typeof row.broker_deal_ids === 'string' ? JSON.parse(row.broker_deal_ids) : row.broker_deal_ids || [],
      proposal: row.proposal_json ? (typeof row.proposal_json === 'string' ? JSON.parse(row.proposal_json) : row.proposal_json) : undefined,
      secondOpinion: row.second_opinion_json ? (typeof row.second_opinion_json === 'string' ? JSON.parse(row.second_opinion_json) : row.second_opinion_json) : undefined,
      macroContext: row.macro_context_json ? (typeof row.macro_context_json === 'string' ? JSON.parse(row.macro_context_json) : row.macro_context_json) : undefined,
      brokerPosition: row.broker_position_json ? (typeof row.broker_position_json === 'string' ? JSON.parse(row.broker_position_json) : row.broker_position_json) : undefined,
      outcome: row.outcome_json ? (typeof row.outcome_json === 'string' ? JSON.parse(row.outcome_json) : row.outcome_json) : undefined,
      shadowEvaluationId: row.shadow_evaluation_id || undefined,
      shadowDecision: row.shadow_decision || undefined,
      shadowReasons: row.shadow_reasons ? (typeof row.shadow_reasons === 'string' ? JSON.parse(row.shadow_reasons) : row.shadow_reasons) : undefined,
      isCompleteLifecycle: !!row.is_complete_lifecycle
    };
  }
}

/**
 * Application-level Trade Observation Service coordinating Phases 2C.6 through 2C.9.
 */
export class TradeObservationService {
  constructor(private readonly repository: ITradeObservationRepository) {}

  /**
   * Phase 2C.6: Records incoming trade proposal / scanner intent.
   */
  public async recordProposal(proposalData: ProposalObservationData & {
    provenance?: ObservationProvenance;
    executionSequenceId?: string;
  }): Promise<TradeObservationRecord> {
    const existing = await this.repository.getObservationByProposalId(proposalData.proposalId);
    const observation: TradeObservationRecord = existing || createDefaultObservationRecord({
      observationId: `obs-prop-${proposalData.proposalId}`,
      provenance: proposalData.provenance || 'REAL_QUANTUMAI',
      proposalId: proposalData.proposalId
    });

    observation.updatedAt = new Date().toISOString();
    observation.signalId = proposalData.signalId || observation.signalId;
    observation.proposal = proposalData;
    observation.executionSequenceId = proposalData.executionSequenceId || observation.executionSequenceId;
    observation.linkageStatus = observation.signalId ? 'VERIFIED' : 'UNVERIFIED';

    await this.repository.saveObservation(observation);
    return observation;
  }

  /**
   * Phase 2C.6: Records advisory Second Opinion AI assessment.
   * STRICT INVARIANT: executionAuthority is always false.
   */
  public async recordSecondOpinion(params: {
    proposalId: string;
    secondOpinion: Omit<SecondOpinionAdvisoryRecord, 'executionAuthority'>;
  }): Promise<TradeObservationRecord | null> {
    const observation = await this.repository.getObservationByProposalId(params.proposalId);
    if (!observation) return null;

    observation.secondOpinion = {
      ...params.secondOpinion,
      executionAuthority: false // FORCED STRICT SAFETY INVARIANT
    };
    observation.updatedAt = new Date().toISOString();

    await this.repository.saveObservation(observation);
    return observation;
  }

  /**
   * Phase 2C.6: Records macro and economic event context.
   */
  public async recordMacroContext(params: {
    proposalId: string;
    macroContext: MacroContextRecord;
  }): Promise<TradeObservationRecord | null> {
    const observation = await this.repository.getObservationByProposalId(params.proposalId);
    if (!observation) return null;

    observation.macroContext = params.macroContext;
    observation.updatedAt = new Date().toISOString();

    await this.repository.saveObservation(observation);
    return observation;
  }

  /**
   * Phase 2C.6: Records broker position open event (Level 1 Authority).
   */
  public async recordBrokerPositionOpened(params: {
    brokerPositionId: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    volumeLots: number;
    openTimestamp?: string;
    proposalId?: string;
    provenance?: ObservationProvenance;
  }): Promise<TradeObservationRecord> {
    let observation: TradeObservationRecord | null = null;
    if (params.proposalId) {
      observation = await this.repository.getObservationByProposalId(params.proposalId);
    }
    if (!observation) {
      observation = await this.repository.getObservationByPositionId(params.brokerPositionId);
    }

    if (!observation) {
      observation = createDefaultObservationRecord({
        observationId: `obs-pos-${params.brokerPositionId}`,
        provenance: params.provenance || 'REAL_BROKER',
        brokerPositionId: params.brokerPositionId
      });
    }

    observation.brokerPositionId = params.brokerPositionId;
    observation.brokerPosition = {
      brokerPositionId: params.brokerPositionId,
      symbol: params.symbol,
      direction: params.direction,
      volumeLots: params.volumeLots,
      openTimestamp: params.openTimestamp || new Date().toISOString()
    };
    observation.updatedAt = new Date().toISOString();
    observation.linkageStatus = observation.proposalId ? 'VERIFIED' : 'UNLINKED';

    await this.repository.saveObservation(observation);
    return observation;
  }

  /**
   * Phase 2C.6: Records broker position closed & outcome event (Level 1 Authority).
   */
  public async recordBrokerPositionClosed(params: {
    brokerPositionId: string;
    brokerDealId?: string;
    realizedPnL: number;
    grossPnL?: number;
    closeReason?: string;
    closeTimestamp?: string;
    mfePips?: number;
    maePips?: number;
    intratradeHistoryAvailable?: boolean;
  }): Promise<TradeObservationRecord | null> {
    let observation = await this.repository.getObservationByPositionId(params.brokerPositionId);
    if (!observation) {
      observation = createDefaultObservationRecord({
        observationId: `obs-pos-close-${params.brokerPositionId}`,
        provenance: 'REAL_BROKER',
        brokerPositionId: params.brokerPositionId
      });
    }

    if (params.brokerDealId && !observation.brokerDealIds.includes(params.brokerDealId)) {
      observation.brokerDealIds.push(params.brokerDealId);
    }

    observation.outcome = {
      brokerPositionId: params.brokerPositionId,
      brokerDealId: params.brokerDealId,
      closeTimestamp: params.closeTimestamp || new Date().toISOString(),
      closeReason: params.closeReason || 'CLOSED_AT_BROKER',
      realizedPnL: params.realizedPnL,
      grossPnL: params.grossPnL ?? params.realizedPnL,
      netPnL: params.realizedPnL,
      mfePips: params.mfePips !== undefined ? params.mfePips : 'UNKNOWN',
      maePips: params.maePips !== undefined ? params.maePips : 'UNKNOWN',
      intratradeHistoryAvailable: !!params.intratradeHistoryAvailable
    };

    observation.isCompleteLifecycle = true;
    observation.updatedAt = new Date().toISOString();

    await this.repository.saveObservation(observation);
    return observation;
  }

  /**
   * Phase 2C.6: Links currency shadow evaluation.
   */
  public async linkShadowEvaluation(params: {
    proposalId?: string;
    brokerPositionId?: string;
    evaluationId: string;
    decision: 'SHADOW_ALLOW' | 'SHADOW_REVIEW' | 'SHADOW_WOULD_BLOCK' | 'SHADOW_UNKNOWN';
    reasons?: string[];
  }): Promise<void> {
    let observation: TradeObservationRecord | null = null;
    if (params.proposalId) {
      observation = await this.repository.getObservationByProposalId(params.proposalId);
    }
    if (!observation && params.brokerPositionId) {
      observation = await this.repository.getObservationByPositionId(params.brokerPositionId);
    }

    if (observation) {
      observation.shadowEvaluationId = params.evaluationId;
      observation.shadowDecision = params.decision;
      observation.shadowReasons = params.reasons;
      observation.updatedAt = new Date().toISOString();
      await this.repository.saveObservation(observation);
    }
  }

  /**
   * Phase 2C.7: Generates evidence-driven outcome analytics report.
   */
  public async generateOutcomeAnalytics(options?: {
    filterProvenance?: ObservationProvenance[];
    limit?: number;
  }): Promise<ComprehensiveOutcomeAnalysisReport> {
    const observations = await this.repository.getObservations(options?.limit ?? 500);
    return analyzeTradeOutcomes(observations, {
      filterProvenance: options?.filterProvenance
    });
  }

  /**
   * Phase 2C.8: Generates exploratory feature and pattern discovery report.
   */
  public async discoverPatterns(options?: {
    minSampleThreshold?: number;
    limit?: number;
  }): Promise<ComprehensivePatternDiscoveryReport> {
    const observations = await this.repository.getObservations(options?.limit ?? 500);
    return discoverTradePatterns(observations, {
      minSampleThreshold: options?.minSampleThreshold
    });
  }

  /**
   * Phase 2C.9: Generates validated improvement proposals with human review gate.
   */
  public async generateImprovementProposals(options?: {
    minSampleThreshold?: number;
    limit?: number;
  }): Promise<ImprovementProposalRegistrySummary> {
    const observations = await this.repository.getObservations(options?.limit ?? 500);
    const analytics = analyzeTradeOutcomes(observations);
    const patterns = discoverTradePatterns(observations, {
      minSampleThreshold: options?.minSampleThreshold
    });
    return generateImprovementProposals(analytics, patterns);
  }
}

import { getDbPool } from '@iati/database';

/**
 * Global default instance for application-wide telemetry capture.
 */
export const defaultTradeObservationService = new TradeObservationService(
  new PostgresTradeObservationRepository(getDbPool())
);
