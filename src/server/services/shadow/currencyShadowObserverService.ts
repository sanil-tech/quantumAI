import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  CurrencyShadowEvaluation,
  PositionInput,
  ProposalInput,
  ShadowCurrencyPolicy,
  SecondOpinionAssessment,
  evaluateShadowCurrencyGovernance,
  buildCurrencyExposureSnapshot,
  ShadowTelemetryDashboardSummary
} from '../../../../packages/core/src/currencyShadowGovernance';

/**
 * Narrow, read-only interface for querying broker position truth.
 * FORBIDDEN: Any write, order placement, cancellation, or modification method.
 */
export interface IBrokerReadOnlyProvider {
  getOpenPositions(): Promise<PositionInput[]>;
}

/**
 * Storage interface for persistent, append-only shadow telemetry.
 */
export interface ICurrencyShadowRepository {
  saveEvaluation(evaluation: CurrencyShadowEvaluation): Promise<void>;
  getEvaluations(limit?: number): Promise<CurrencyShadowEvaluation[]>;
  getEvaluationById(evaluationId: string): Promise<CurrencyShadowEvaluation | null>;
  getEvaluationsByPositionId(brokerPositionId: string): Promise<CurrencyShadowEvaluation[]>;
}

/**
 * In-Memory repository implementation for local testing and decoupled operation.
 */
export class InMemoryCurrencyShadowRepository implements ICurrencyShadowRepository {
  private records: Map<string, CurrencyShadowEvaluation> = new Map();

  public async saveEvaluation(evaluation: CurrencyShadowEvaluation): Promise<void> {
    if (this.records.has(evaluation.evaluationId)) {
      // Idempotency: Ignore duplicate evaluationId
      return;
    }
    this.records.set(evaluation.evaluationId, JSON.parse(JSON.stringify(evaluation)));
  }

  public async getEvaluations(limit = 100): Promise<CurrencyShadowEvaluation[]> {
    const list = Array.from(this.records.values());
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list.slice(0, limit);
  }

  public async getEvaluationById(evaluationId: string): Promise<CurrencyShadowEvaluation | null> {
    return this.records.get(evaluationId) || null;
  }

  public async getEvaluationsByPositionId(brokerPositionId: string): Promise<CurrencyShadowEvaluation[]> {
    return Array.from(this.records.values()).filter(e => e.brokerPositionId === brokerPositionId);
  }

  public clear(): void {
    this.records.clear();
  }
}

/**
 * Durable PostgreSQL repository for persistent shadow evaluations.
 */
export class PostgresCurrencyShadowRepository implements ICurrencyShadowRepository {
  constructor(private readonly pool: Pool) {}

  public async saveEvaluation(evaluation: CurrencyShadowEvaluation): Promise<void> {
    try {
      const query = `
        INSERT INTO currency_shadow_evaluations (
          id, evaluation_id, timestamp, event_type,
          signal_id, proposal_id, execution_sequence_id,
          broker_order_id, broker_deal_id, broker_position_id,
          symbol, direction, volume_lots, risk_percent,
          actual_exposure_json, hypothetical_exposure_json,
          decision, reasons_json, policy_version,
          data_authority, second_opinion_json, execution_authority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        ON CONFLICT (evaluation_id) DO NOTHING;
      `;

      const values = [
        uuidv4(),
        evaluation.evaluationId,
        evaluation.timestamp,
        evaluation.eventType,
        evaluation.signalId || null,
        evaluation.proposalId || null,
        evaluation.executionSequenceId || null,
        null, // broker_order_id
        null, // broker_deal_id
        evaluation.brokerPositionId || null,
        evaluation.symbol || null,
        evaluation.direction || null,
        evaluation.volumeLots ?? null,
        evaluation.riskPercent ?? null,
        JSON.stringify(evaluation.actualBrokerExposure),
        evaluation.hypotheticalExposure ? JSON.stringify(evaluation.hypotheticalExposure) : null,
        evaluation.decision,
        JSON.stringify(evaluation.reasons),
        evaluation.policyVersion || 'UNCONFIGURED',
        evaluation.dataAuthority || 'BROKER',
        evaluation.secondOpinion ? JSON.stringify(evaluation.secondOpinion) : null,
        false // execution_authority is strictly FALSE
      ];

      await this.pool.query(query, values);
    } catch (err: any) {
      // Failure Isolation: Database persistence errors are logged but never thrown to execution path
      console.error(`[SHADOW-PERSISTENCE-ERROR] Failed to persist shadow evaluation ${evaluation.evaluationId}:`, err?.message);
    }
  }

  public async getEvaluations(limit = 100): Promise<CurrencyShadowEvaluation[]> {
    try {
      const res = await this.pool.query(
        'SELECT * FROM currency_shadow_evaluations ORDER BY timestamp DESC LIMIT $1',
        [limit]
      );
      return res.rows.map(row => this.mapRowToEvaluation(row));
    } catch (err: any) {
      console.error('[SHADOW-QUERY-ERROR] Failed to query shadow evaluations:', err?.message);
      return [];
    }
  }

  public async getEvaluationById(evaluationId: string): Promise<CurrencyShadowEvaluation | null> {
    try {
      const res = await this.pool.query(
        'SELECT * FROM currency_shadow_evaluations WHERE evaluation_id = $1',
        [evaluationId]
      );
      if (res.rows.length === 0) return null;
      return this.mapRowToEvaluation(res.rows[0]);
    } catch (err: any) {
      console.error(`[SHADOW-QUERY-ERROR] Failed to get evaluation ${evaluationId}:`, err?.message);
      return null;
    }
  }

  public async getEvaluationsByPositionId(brokerPositionId: string): Promise<CurrencyShadowEvaluation[]> {
    try {
      const res = await this.pool.query(
        'SELECT * FROM currency_shadow_evaluations WHERE broker_position_id = $1 ORDER BY timestamp ASC',
        [brokerPositionId]
      );
      return res.rows.map(row => this.mapRowToEvaluation(row));
    } catch (err: any) {
      console.error(`[SHADOW-QUERY-ERROR] Failed to get evaluations for pos ${brokerPositionId}:`, err?.message);
      return [];
    }
  }

  private mapRowToEvaluation(row: any): CurrencyShadowEvaluation {
    return {
      evaluationId: row.evaluation_id,
      timestamp: new Date(row.timestamp).toISOString(),
      eventType: row.event_type,
      signalId: row.signal_id || undefined,
      proposalId: row.proposal_id || undefined,
      executionSequenceId: row.execution_sequence_id || undefined,
      brokerPositionId: row.broker_position_id || undefined,
      symbol: row.symbol || undefined,
      direction: row.direction || undefined,
      volumeLots: row.volume_lots ? Number(row.volume_lots) : undefined,
      riskPercent: row.risk_percent ? Number(row.risk_percent) : undefined,
      actualBrokerExposure: typeof row.actual_exposure_json === 'string' ? JSON.parse(row.actual_exposure_json) : row.actual_exposure_json,
      hypotheticalExposure: row.hypothetical_exposure_json ? (typeof row.hypothetical_exposure_json === 'string' ? JSON.parse(row.hypothetical_exposure_json) : row.hypothetical_exposure_json) : undefined,
      decision: row.decision,
      reasons: typeof row.reasons_json === 'string' ? JSON.parse(row.reasons_json) : row.reasons_json,
      policyVersion: row.policy_version,
      dataAuthority: row.data_authority,
      secondOpinion: row.second_opinion_json ? (typeof row.second_opinion_json === 'string' ? JSON.parse(row.second_opinion_json) : row.second_opinion_json) : undefined,
      executionAuthority: false
    };
  }
}

/**
 * Dedicated Application-Level Shadow Observer Service.
 * Strictly non-blocking and observational.
 */
export class CurrencyShadowObserverService {
  private candidatePolicy: ShadowCurrencyPolicy = {
    mode: 'SHADOW',
    policyVersion: 'UNCONFIGURED'
  };

  constructor(
    private readonly repository: ICurrencyShadowRepository,
    private readonly brokerReadOnlyProvider?: IBrokerReadOnlyProvider
  ) {}

  /**
   * Set candidate policy for shadow-only experimentation.
   * NOTE: Does not affect live execution.
   */
  public setCandidatePolicy(policy: ShadowCurrencyPolicy): void {
    this.candidatePolicy = { ...policy, mode: 'SHADOW' };
  }

  public getCandidatePolicy(): ShadowCurrencyPolicy {
    return { ...this.candidatePolicy };
  }

  /**
   * Observes a newly generated trade proposal and records hypothetical shadow governance telemetry.
   * GUARANTEE: Never throws; never modifies the proposal; returns observational result only.
   */
  public async observeProposalCreated(params: {
    proposalId: string;
    signalId?: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    volumeLots: number;
    riskPercent?: number;
    secondOpinion?: SecondOpinionAssessment;
    evaluationId?: string;
    actualPositionsOverride?: PositionInput[];
  }): Promise<CurrencyShadowEvaluation> {
    const evalId = params.evaluationId || `eval-prop-${params.proposalId}-${Date.now()}`;

    try {
      let actualPositions: PositionInput[] | null = null;

      if (params.actualPositionsOverride) {
        actualPositions = params.actualPositionsOverride;
      } else if (this.brokerReadOnlyProvider) {
        try {
          actualPositions = await this.brokerReadOnlyProvider.getOpenPositions();
        } catch (err: any) {
          console.warn('[SHADOW-BROKER-READ-WARN] Broker snapshot read failed:', err?.message);
          actualPositions = null;
        }
      } else {
        actualPositions = [];
      }

      const proposal: ProposalInput = {
        proposalId: params.proposalId,
        signalId: params.signalId,
        symbol: params.symbol,
        direction: params.direction,
        volumeLots: params.volumeLots,
        riskPercent: params.riskPercent
      };

      const evalResult = evaluateShadowCurrencyGovernance({
        evaluationId: evalId,
        eventType: 'PROPOSAL_CREATED',
        actualPositions,
        hypotheticalProposal: proposal,
        candidatePolicy: this.candidatePolicy,
        secondOpinion: params.secondOpinion,
        signalId: params.signalId,
        proposalId: params.proposalId,
        dataAuthority: actualPositions ? 'BROKER' : 'INTERNAL'
      });

      // Persist to durable storage (isolated try/catch inside repo)
      await this.repository.saveEvaluation(evalResult);

      return evalResult;
    } catch (fatalErr: any) {
      // Extreme fallback safety: Returns SHADOW_UNKNOWN without throwing to caller
      console.error('[SHADOW-OBSERVER-CRITICAL-FALLBACK]', fatalErr);
      return {
        evaluationId: evalId,
        timestamp: new Date().toISOString(),
        eventType: 'PROPOSAL_CREATED',
        proposalId: params.proposalId,
        signalId: params.signalId,
        symbol: params.symbol,
        direction: params.direction,
        volumeLots: params.volumeLots,
        actualBrokerExposure: {
          currencies: {},
          totalGrossLots: 0,
          totalActiveLegs: 0,
          activeSymbols: [],
          positionsCount: 0,
          dataQuality: 'UNAVAILABLE'
        },
        decision: 'SHADOW_UNKNOWN',
        reasons: [`OBSERVER_EXCEPTION: ${fatalErr?.message}`],
        policyVersion: this.candidatePolicy.policyVersion,
        dataAuthority: 'INTERNAL',
        executionAuthority: false
      };
    }
  }

  /**
   * Observes broker position lifecycle state transitions (e.g. POSITION_OPENED, PARTIAL_CLOSE, POSITION_CLOSED).
   */
  public async observePositionLifecycle(params: {
    eventType: 'POSITION_OPENED' | 'PARTIAL_CLOSE' | 'POSITION_CLOSED';
    brokerPositionId: string;
    brokerOrderId?: string;
    brokerDealId?: string;
    symbol?: string;
    direction?: 'BUY' | 'SELL';
    volumeLots?: number;
    evaluationId?: string;
    actualPositionsOverride?: PositionInput[];
  }): Promise<CurrencyShadowEvaluation> {
    const evalId = params.evaluationId || `eval-pos-${params.brokerPositionId}-${params.eventType}-${Date.now()}`;

    try {
      let actualPositions: PositionInput[] | null = null;

      if (params.actualPositionsOverride) {
        actualPositions = params.actualPositionsOverride;
      } else if (this.brokerReadOnlyProvider) {
        try {
          actualPositions = await this.brokerReadOnlyProvider.getOpenPositions();
        } catch (err: any) {
          console.warn('[SHADOW-BROKER-READ-WARN] Broker snapshot read failed:', err?.message);
          actualPositions = null;
        }
      } else {
        actualPositions = [];
      }

      const evalResult = evaluateShadowCurrencyGovernance({
        evaluationId: evalId,
        eventType: params.eventType,
        actualPositions,
        brokerPositionId: params.brokerPositionId,
        dataAuthority: actualPositions ? 'BROKER' : 'INTERNAL',
        candidatePolicy: this.candidatePolicy
      });

      await this.repository.saveEvaluation(evalResult);

      return evalResult;
    } catch (fatalErr: any) {
      console.error('[SHADOW-OBSERVER-CRITICAL-FALLBACK]', fatalErr);
      return {
        evaluationId: evalId,
        timestamp: new Date().toISOString(),
        eventType: params.eventType,
        brokerPositionId: params.brokerPositionId,
        actualBrokerExposure: {
          currencies: {},
          totalGrossLots: 0,
          totalActiveLegs: 0,
          activeSymbols: [],
          positionsCount: 0,
          dataQuality: 'UNAVAILABLE'
        },
        decision: 'SHADOW_UNKNOWN',
        reasons: [`OBSERVER_EXCEPTION: ${fatalErr?.message}`],
        policyVersion: this.candidatePolicy.policyVersion,
        dataAuthority: 'INTERNAL',
        executionAuthority: false
      };
    }
  }

  /**
   * Produces an observational dashboard summary from persisted evaluations.
   */
  public async getObservabilitySummary(currentPositionsOverride?: PositionInput[]): Promise<ShadowTelemetryDashboardSummary> {
    let currentPositions: PositionInput[] = [];

    if (currentPositionsOverride) {
      currentPositions = currentPositionsOverride;
    } else if (this.brokerReadOnlyProvider) {
      try {
        currentPositions = await this.brokerReadOnlyProvider.getOpenPositions();
      } catch (err) {
        currentPositions = [];
      }
    }

    const currentSnap = buildCurrencyExposureSnapshot(currentPositions);
    const netMap: Record<string, number> = {};
    for (const [c, f] of Object.entries(currentSnap.currencies)) {
      netMap[c] = Number(f.netUnits.toFixed(4));
    }

    const evaluations = await this.repository.getEvaluations(500);

    const counts = {
      SHADOW_ALLOW: 0,
      SHADOW_WOULD_BLOCK: 0,
      SHADOW_REVIEW: 0,
      SHADOW_UNKNOWN: 0
    };

    const counterfactuals: ShadowTelemetryDashboardSummary['counterfactualBlocks'] = [];

    for (const ev of evaluations) {
      counts[ev.decision]++;
      if (ev.decision === 'SHADOW_WOULD_BLOCK') {
        counterfactuals.push({
          evaluationId: ev.evaluationId,
          timestamp: ev.timestamp,
          proposedSymbol: ev.symbol || 'UNKNOWN',
          proposedDirection: ev.direction || 'BUY',
          proposedVolumeLots: ev.volumeLots || 0,
          conflictingReasons: ev.reasons,
          actualExecutionStatus: 'EXECUTED_BY_PRODUCTION'
        });
      }
    }

    return {
      totalEvaluations: evaluations.length,
      decisionsCount: counts,
      currentLivePortfolio: {
        openPositionsCount: currentPositions.length,
        totalGrossLots: currentSnap.totalGrossLots,
        netCurrencyDispositions: netMap
      },
      counterfactualBlocks: counterfactuals
    };
  }
}
