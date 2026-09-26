/**
 * QuantumAI IATI OS — Phase 2C.12: Live Attribution Integrity Application Service
 * 
 * INVARIANTS:
 * - Real-time evidence preservation for all future QuantumAI executions.
 * - Fail-closed deterministic attribution engine.
 * - Zero execution dependency: ATTRIBUTION_TO_EXECUTION_DEPENDENCY = NONE.
 * - Second Opinion AI is strictly advisory: SECOND_OPINION_EXECUTION_AUTHORITY = FALSE.
 * - Zero broker write access, zero execution side effects.
 * - Full restart recovery and idempotency.
 * - Strict performance dataset boundary: Only VERIFIED_QUANTUMAI + BROKER_AUTHORITATIVE + CLOSED + OUTCOME_CONFIRMED.
 */

import {
  LiveAttributionStatus,
  LiveAttributionProvenance,
  DataAuthority,
  SecondOpinionAssessment,
  BrokerPnLRecord,
  MfeMaeRecord,
  QuantumAIExecutionAttributionRecord,
  InitialAttributionInput,
  createInitialAttributionRecord,
  recordOrderSubmission,
  recordBrokerAcknowledgement,
  bindBrokerPosition,
  recordBrokerDeals,
  recordPositionClosed,
  recordOutcomeConfirmed,
  recordAttributionConflict,
  recordExecutionFailure,
  filterPerformanceEligibleDataset,
  computeAttributionQualityMetrics,
  AttributionQualityMetrics
} from '../../../../packages/core/src/liveAttributionIntegrity';
import { getDbPool, checkDbConnection } from '@iati/database';

export interface ILiveAttributionRepository {
  saveAttribution(record: QuantumAIExecutionAttributionRecord): Promise<void>;
  getAttributionById(attributionId: string): Promise<QuantumAIExecutionAttributionRecord | null>;
  getAttributionByProposalId(proposalId: string): Promise<QuantumAIExecutionAttributionRecord[]>;
  getAttributionByExecutionSeqId(executionSeqId: string): Promise<QuantumAIExecutionAttributionRecord | null>;
  getAttributionByBrokerPositionId(brokerPositionId: string): Promise<QuantumAIExecutionAttributionRecord | null>;
  getAllAttributions(): Promise<QuantumAIExecutionAttributionRecord[]>;
}

export class InMemoryLiveAttributionRepository implements ILiveAttributionRepository {
  private records: Map<string, QuantumAIExecutionAttributionRecord> = new Map();

  async saveAttribution(record: QuantumAIExecutionAttributionRecord): Promise<void> {
    this.records.set(record.attributionId, JSON.parse(JSON.stringify(record)));
  }

  async getAttributionById(attributionId: string): Promise<QuantumAIExecutionAttributionRecord | null> {
    const rec = this.records.get(attributionId);
    return rec ? JSON.parse(JSON.stringify(rec)) : null;
  }

  async getAttributionByProposalId(proposalId: string): Promise<QuantumAIExecutionAttributionRecord[]> {
    const matches: QuantumAIExecutionAttributionRecord[] = [];
    for (const rec of this.records.values()) {
      if (rec.proposalId === proposalId) {
        matches.push(JSON.parse(JSON.stringify(rec)));
      }
    }
    return matches;
  }

  async getAttributionByExecutionSeqId(executionSeqId: string): Promise<QuantumAIExecutionAttributionRecord | null> {
    for (const rec of this.records.values()) {
      if (rec.executionSequenceId === executionSeqId) {
        return JSON.parse(JSON.stringify(rec));
      }
    }
    return null;
  }

  async getAttributionByBrokerPositionId(brokerPositionId: string): Promise<QuantumAIExecutionAttributionRecord | null> {
    for (const rec of this.records.values()) {
      if (rec.brokerPositionId === brokerPositionId) {
        return JSON.parse(JSON.stringify(rec));
      }
    }
    return null;
  }

  async getAllAttributions(): Promise<QuantumAIExecutionAttributionRecord[]> {
    return Array.from(this.records.values()).map(r => JSON.parse(JSON.stringify(r)));
  }
}

export class PostgresLiveAttributionRepository implements ILiveAttributionRepository {
  async saveAttribution(record: QuantumAIExecutionAttributionRecord): Promise<void> {
    const isConnected = await checkDbConnection();
    if (!isConnected) return;

    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO quantumai_execution_attributions (
          attribution_id, created_at, updated_at, schema_version,
          provenance, data_authority, execution_status, attribution_status,
          is_verified_quantumai, is_performance_eligible,
          signal_id, thesis_id, proposal_id, risk_reservation_id, execution_sequence_id,
          broker_order_ids, broker_deal_ids, broker_position_id,
          symbol, direction, requested_volume, filled_volume,
          order_submitted_at, broker_acknowledged_at, position_confirmed_at, position_closed_at,
          outcome_id, post_mortem_id,
          second_opinion_assessment, broker_pnl, mfe_mae, conflict_reason
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18,
          $19, $20, $21, $22,
          $23, $24, $25, $26,
          $27, $28,
          $29, $30, $31, $32
        )
        ON CONFLICT (attribution_id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          execution_status = EXCLUDED.execution_status,
          attribution_status = EXCLUDED.attribution_status,
          is_verified_quantumai = EXCLUDED.is_verified_quantumai,
          is_performance_eligible = EXCLUDED.is_performance_eligible,
          broker_order_ids = EXCLUDED.broker_order_ids,
          broker_deal_ids = EXCLUDED.broker_deal_ids,
          broker_position_id = EXCLUDED.broker_position_id,
          filled_volume = EXCLUDED.filled_volume,
          order_submitted_at = EXCLUDED.order_submitted_at,
          broker_acknowledged_at = EXCLUDED.broker_acknowledged_at,
          position_confirmed_at = EXCLUDED.position_confirmed_at,
          position_closed_at = EXCLUDED.position_closed_at,
          outcome_id = EXCLUDED.outcome_id,
          post_mortem_id = EXCLUDED.post_mortem_id,
          broker_pnl = EXCLUDED.broker_pnl,
          mfe_mae = EXCLUDED.mfe_mae,
          conflict_reason = EXCLUDED.conflict_reason`,
        [
          record.attributionId,
          record.createdAt,
          record.updatedAt,
          record.schemaVersion,
          record.provenance,
          record.dataAuthority,
          record.executionStatus,
          record.attributionStatus,
          record.isVerifiedQuantumAI,
          record.isPerformanceEligible,
          record.signalId || null,
          record.thesisId || null,
          record.proposalId || null,
          record.riskReservationId || null,
          record.executionSequenceId || null,
          JSON.stringify(record.brokerOrderIds || []),
          JSON.stringify(record.brokerDealIds || []),
          record.brokerPositionId || null,
          record.symbol,
          record.direction,
          record.requestedVolume,
          record.filledVolume || null,
          record.orderSubmittedAt || null,
          record.brokerAcknowledgedAt || null,
          record.positionConfirmedAt || null,
          record.positionClosedAt || null,
          record.outcomeId || null,
          record.postMortemId || null,
          record.secondOpinionAssessment ? JSON.stringify(record.secondOpinionAssessment) : null,
          record.brokerPnL ? JSON.stringify(record.brokerPnL) : null,
          record.mfeMae ? JSON.stringify(record.mfeMae) : null,
          record.conflictReason || null
        ]
      );
    } catch (err) {
      console.error('[LIVE-ATTRIBUTION-DB-ERROR] Failed to save execution attribution:', err);
    }
  }

  async getAttributionById(attributionId: string): Promise<QuantumAIExecutionAttributionRecord | null> {
    const isConnected = await checkDbConnection();
    if (!isConnected) return null;

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT * FROM quantumai_execution_attributions WHERE attribution_id = $1`,
        [attributionId]
      );
      if (res.rows.length === 0) return null;
      return this.mapRow(res.rows[0]);
    } catch (err) {
      return null;
    }
  }

  async getAttributionByProposalId(proposalId: string): Promise<QuantumAIExecutionAttributionRecord[]> {
    const isConnected = await checkDbConnection();
    if (!isConnected) return [];

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT * FROM quantumai_execution_attributions WHERE proposal_id = $1`,
        [proposalId]
      );
      return res.rows.map(r => this.mapRow(r));
    } catch (err) {
      return [];
    }
  }

  async getAttributionByExecutionSeqId(executionSeqId: string): Promise<QuantumAIExecutionAttributionRecord | null> {
    const isConnected = await checkDbConnection();
    if (!isConnected) return null;

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT * FROM quantumai_execution_attributions WHERE execution_sequence_id = $1`,
        [executionSeqId]
      );
      if (res.rows.length === 0) return null;
      return this.mapRow(res.rows[0]);
    } catch (err) {
      return null;
    }
  }

  async getAttributionByBrokerPositionId(brokerPositionId: string): Promise<QuantumAIExecutionAttributionRecord | null> {
    const isConnected = await checkDbConnection();
    if (!isConnected) return null;

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT * FROM quantumai_execution_attributions WHERE broker_position_id = $1`,
        [brokerPositionId]
      );
      if (res.rows.length === 0) return null;
      return this.mapRow(res.rows[0]);
    } catch (err) {
      return null;
    }
  }

  async getAllAttributions(): Promise<QuantumAIExecutionAttributionRecord[]> {
    const isConnected = await checkDbConnection();
    if (!isConnected) return [];

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT * FROM quantumai_execution_attributions ORDER BY created_at DESC LIMIT 5000`
      );
      return res.rows.map(r => this.mapRow(r));
    } catch (err) {
      return [];
    }
  }

  private mapRow(row: any): QuantumAIExecutionAttributionRecord {
    return {
      attributionId: row.attribution_id,
      schemaVersion: row.schema_version,
      createdAt: row.created_at?.toISOString ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at?.toISOString ? row.updated_at.toISOString() : String(row.updated_at),
      signalId: row.signal_id || undefined,
      thesisId: row.thesis_id || undefined,
      proposalId: row.proposal_id || undefined,
      riskReservationId: row.risk_reservation_id || undefined,
      executionSequenceId: row.execution_sequence_id || undefined,
      brokerOrderIds: typeof row.broker_order_ids === 'string' ? JSON.parse(row.broker_order_ids) : (row.broker_order_ids || []),
      brokerDealIds: typeof row.broker_deal_ids === 'string' ? JSON.parse(row.broker_deal_ids) : (row.broker_deal_ids || []),
      brokerPositionId: row.broker_position_id || undefined,
      symbol: row.symbol,
      direction: row.direction,
      requestedVolume: Number(row.requested_volume),
      filledVolume: row.filled_volume ? Number(row.filled_volume) : undefined,
      executionStatus: row.execution_status,
      attributionStatus: row.attribution_status,
      provenance: row.provenance,
      dataAuthority: row.data_authority,
      isVerifiedQuantumAI: row.is_verified_quantumai ?? false,
      isPerformanceEligible: row.is_performance_eligible ?? false,
      orderSubmittedAt: row.order_submitted_at ? (row.order_submitted_at.toISOString ? row.order_submitted_at.toISOString() : String(row.order_submitted_at)) : undefined,
      brokerAcknowledgedAt: row.broker_acknowledged_at ? (row.broker_acknowledged_at.toISOString ? row.broker_acknowledged_at.toISOString() : String(row.broker_acknowledged_at)) : undefined,
      positionConfirmedAt: row.position_confirmed_at ? (row.position_confirmed_at.toISOString ? row.position_confirmed_at.toISOString() : String(row.position_confirmed_at)) : undefined,
      positionClosedAt: row.position_closed_at ? (row.position_closed_at.toISOString ? row.position_closed_at.toISOString() : String(row.position_closed_at)) : undefined,
      outcomeId: row.outcome_id || undefined,
      postMortemId: row.post_mortem_id || undefined,
      secondOpinionAssessment: row.second_opinion_assessment ? (typeof row.second_opinion_assessment === 'string' ? JSON.parse(row.second_opinion_assessment) : row.second_opinion_assessment) : undefined,
      brokerPnL: row.broker_pnl ? (typeof row.broker_pnl === 'string' ? JSON.parse(row.broker_pnl) : row.broker_pnl) : undefined,
      mfeMae: row.mfe_mae ? (typeof row.mfe_mae === 'string' ? JSON.parse(row.mfe_mae) : row.mfe_mae) : undefined,
      conflictReason: row.conflict_reason || undefined
    };
  }
}

export class LiveAttributionIntegrityService {
  private static instance: LiveAttributionIntegrityService;
  private readonly repository: ILiveAttributionRepository;
  private memoryCache: Map<string, QuantumAIExecutionAttributionRecord> = new Map();
  private totalEventsProcessed: number = 0;
  private duplicateEventsCount: number = 0;
  private isHydrated: boolean = false;

  constructor(repository?: ILiveAttributionRepository) {
    this.repository = repository || new PostgresLiveAttributionRepository();
  }

  public static getInstance(repository?: ILiveAttributionRepository): LiveAttributionIntegrityService {
    if (!LiveAttributionIntegrityService.instance) {
      LiveAttributionIntegrityService.instance = new LiveAttributionIntegrityService(repository);
    }
    return LiveAttributionIntegrityService.instance;
  }

  /**
   * Hydrates state from durable storage upon restart.
   */
  public async hydrateFromStorage(): Promise<number> {
    try {
      const persisted = await this.repository.getAllAttributions();
      for (const rec of persisted) {
        this.memoryCache.set(rec.attributionId, rec);
      }
      this.isHydrated = true;
      return persisted.length;
    } catch (err) {
      return 0;
    }
  }

  /**
   * Registers a new QuantumAI execution dispatch or proposal.
   */
  public async registerExecutionDispatch(input: InitialAttributionInput): Promise<QuantumAIExecutionAttributionRecord> {
    this.totalEventsProcessed++;

    // Idempotency check: if executionSequenceId already registered, return existing
    if (input.executionSequenceId) {
      for (const rec of this.memoryCache.values()) {
        if (rec.executionSequenceId === input.executionSequenceId) {
          this.duplicateEventsCount++;
          return rec;
        }
      }
    }

    const record = createInitialAttributionRecord(input);
    this.memoryCache.set(record.attributionId, record);
    await this.repository.saveAttribution(record);
    return record;
  }

  /**
   * Handles order submission event.
   */
  public async handleOrderSubmitted(params: {
    executionSequenceId?: string;
    proposalId?: string;
    brokerOrderId: string | number;
    submittedAt?: string | number;
  }): Promise<QuantumAIExecutionAttributionRecord | null> {
    this.totalEventsProcessed++;
    let target = this.findRecord(params.executionSequenceId, params.proposalId);
    if (!target) return null;

    // Idempotency check
    if (target.brokerOrderIds.includes(String(params.brokerOrderId))) {
      this.duplicateEventsCount++;
      return target;
    }

    const updated = recordOrderSubmission(target, {
      brokerOrderId: params.brokerOrderId,
      submittedAt: params.submittedAt
    });

    this.memoryCache.set(updated.attributionId, updated);
    await this.repository.saveAttribution(updated);
    return updated;
  }

  /**
   * Handles authoritative broker acknowledgement.
   */
  public async handleBrokerAcknowledgement(params: {
    executionSequenceId?: string;
    proposalId?: string;
    brokerOrderId?: string | number;
    brokerDealId?: string | number;
    acknowledgedAt?: string | number;
  }): Promise<QuantumAIExecutionAttributionRecord | null> {
    this.totalEventsProcessed++;
    let target = this.findRecord(params.executionSequenceId, params.proposalId, params.brokerOrderId);
    if (!target) return null;

    const updated = recordBrokerAcknowledgement(target, {
      brokerOrderId: params.brokerOrderId,
      brokerDealId: params.brokerDealId,
      acknowledgedAt: params.acknowledgedAt
    });

    this.memoryCache.set(updated.attributionId, updated);
    await this.repository.saveAttribution(updated);
    return updated;
  }

  /**
   * Binds authoritative broker position ID to the execution record.
   */
  public async handleBrokerPositionConfirmed(params: {
    executionSequenceId?: string;
    proposalId?: string;
    brokerOrderId?: string | number;
    brokerPositionId: string | number;
    filledVolume?: number;
    confirmedAt?: string | number;
  }): Promise<QuantumAIExecutionAttributionRecord | null> {
    this.totalEventsProcessed++;
    const posIdStr = String(params.brokerPositionId).trim();

    // Check for conflicting attribution: Is this positionId already bound to a different execution?
    for (const rec of this.memoryCache.values()) {
      if (rec.brokerPositionId === posIdStr) {
        // If it belongs to same execution sequence, idempotent update
        if (params.executionSequenceId && rec.executionSequenceId === params.executionSequenceId) {
          this.duplicateEventsCount++;
          return rec;
        }
        // Conflict: Different execution claims same position without split ticket proof
        if (params.executionSequenceId && rec.executionSequenceId !== params.executionSequenceId) {
          const conflicted = recordAttributionConflict(
            rec,
            `CONFLICT: Broker position ${posIdStr} already bound to execution ${rec.executionSequenceId}, second execution ${params.executionSequenceId} attempted binding.`
          );
          this.memoryCache.set(conflicted.attributionId, conflicted);
          await this.repository.saveAttribution(conflicted);
          return conflicted;
        }
      }
    }

    let target = this.findRecord(params.executionSequenceId, params.proposalId, params.brokerOrderId);
    if (!target) return null;

    const updated = bindBrokerPosition(target, {
      brokerPositionId: posIdStr,
      filledVolume: params.filledVolume,
      confirmedAt: params.confirmedAt
    });

    this.memoryCache.set(updated.attributionId, updated);
    await this.repository.saveAttribution(updated);
    return updated;
  }

  /**
   * Appends broker deal IDs (partial fills, scale outs, multi-deals).
   */
  public async handleBrokerDealsUpdated(params: {
    brokerPositionId: string | number;
    dealIds: (string | number)[];
  }): Promise<QuantumAIExecutionAttributionRecord | null> {
    this.totalEventsProcessed++;
    const posIdStr = String(params.brokerPositionId).trim();
    let target = this.findByBrokerPositionId(posIdStr);
    if (!target) return null;

    const updated = recordBrokerDeals(target, params.dealIds);
    this.memoryCache.set(updated.attributionId, updated);
    await this.repository.saveAttribution(updated);
    return updated;
  }

  /**
   * Handles position closed event with Level 1 broker authoritative P/L.
   */
  public async handlePositionClosed(params: {
    brokerPositionId: string | number;
    closedAt?: string | number;
    brokerPnL: {
      grossPnL: number;
      commission: number;
      swap: number;
      netPnL: number;
    };
    closeDealIds?: (string | number)[];
    mfeMae?: Partial<MfeMaeRecord>;
  }): Promise<QuantumAIExecutionAttributionRecord | null> {
    this.totalEventsProcessed++;
    const posIdStr = String(params.brokerPositionId).trim();
    let target = this.findByBrokerPositionId(posIdStr);
    if (!target) return null;

    const updated = recordPositionClosed(target, {
      closedAt: params.closedAt,
      brokerPnL: params.brokerPnL,
      closeDealIds: params.closeDealIds,
      mfeMae: params.mfeMae
    });

    this.memoryCache.set(updated.attributionId, updated);
    await this.repository.saveAttribution(updated);
    return updated;
  }

  /**
   * Links post-execution outcome and post-mortem review.
   */
  public async handleOutcomeConfirmed(params: {
    brokerPositionId?: string | number;
    executionSequenceId?: string;
    outcomeId: string;
    postMortemId?: string;
  }): Promise<QuantumAIExecutionAttributionRecord | null> {
    this.totalEventsProcessed++;
    let target: QuantumAIExecutionAttributionRecord | null = null;
    if (params.brokerPositionId) {
      target = this.findByBrokerPositionId(String(params.brokerPositionId).trim());
    }
    if (!target && params.executionSequenceId) {
      target = this.findByExecutionSeqId(params.executionSequenceId);
    }
    if (!target) return null;

    const updated = recordOutcomeConfirmed(target, {
      outcomeId: params.outcomeId,
      postMortemId: params.postMortemId
    });

    this.memoryCache.set(updated.attributionId, updated);
    await this.repository.saveAttribution(updated);
    return updated;
  }

  /**
   * Retrieves all verified performance-eligible dataset records.
   */
  public getPerformanceDataset(): QuantumAIExecutionAttributionRecord[] {
    const all = Array.from(this.memoryCache.values());
    return filterPerformanceEligibleDataset(all);
  }

  /**
   * Computes current attribution quality & integrity metrics.
   */
  public getQualityMetrics(): AttributionQualityMetrics {
    const all = Array.from(this.memoryCache.values());
    return computeAttributionQualityMetrics(
      all,
      this.totalEventsProcessed,
      this.duplicateEventsCount
    );
  }

  /**
   * Retrieves all cached records.
   */
  public getAllRecords(): QuantumAIExecutionAttributionRecord[] {
    return Array.from(this.memoryCache.values());
  }

  private findRecord(
    executionSeqId?: string,
    proposalId?: string,
    brokerOrderId?: string | number
  ): QuantumAIExecutionAttributionRecord | null {
    if (executionSeqId) {
      const found = this.findByExecutionSeqId(executionSeqId);
      if (found) return found;
    }
    if (brokerOrderId) {
      const oIdStr = String(brokerOrderId).trim();
      for (const rec of this.memoryCache.values()) {
        if (rec.brokerOrderIds.includes(oIdStr)) return rec;
      }
    }
    if (proposalId) {
      for (const rec of this.memoryCache.values()) {
        if (rec.proposalId === proposalId) return rec;
      }
    }
    return null;
  }

  private findByExecutionSeqId(seqId: string): QuantumAIExecutionAttributionRecord | null {
    for (const rec of this.memoryCache.values()) {
      if (rec.executionSequenceId === seqId) return rec;
    }
    return null;
  }

  private findByBrokerPositionId(posId: string): QuantumAIExecutionAttributionRecord | null {
    for (const rec of this.memoryCache.values()) {
      if (rec.brokerPositionId === posId) return rec;
    }
    return null;
  }
}

export const defaultLiveAttributionService = LiveAttributionIntegrityService.getInstance();
