import { Pool } from 'pg';
import { getDbPool, checkDbConnection } from './index';
import { logger } from '@iati/core';
import { ActiveShadowObservation, LearningJournalEvent, CurrencyPair, TradingSession, ObservationType, ResearchEvidenceTier } from '../../types';
import { ShadowWriteAheadLog, shadowWriteAheadLog } from './shadowWal';

export type ShadowPersistenceHealth = 'HEALTHY' | 'WAL_PENDING' | 'DEGRADED' | 'RECOVERING';

export class ShadowObservationRepository {
  private static instance: ShadowObservationRepository;
  private pool: Pool | null = null;
  private persistenceHealth: ShadowPersistenceHealth = 'HEALTHY';
  private lastError: string | null = null;
  private wal: ShadowWriteAheadLog = shadowWriteAheadLog;

  private constructor() {}

  public static getInstance(): ShadowObservationRepository {
    if (!ShadowObservationRepository.instance) {
      ShadowObservationRepository.instance = new ShadowObservationRepository();
    }
    return ShadowObservationRepository.instance;
  }

  public setWalInstance(walInstance: ShadowWriteAheadLog): void {
    this.wal = walInstance;
  }

  public getWalInstance(): ShadowWriteAheadLog {
    return this.wal;
  }

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = getDbPool();
    }
    return this.pool;
  }

  public getPersistenceHealth(): ShadowPersistenceHealth {
    if (this.wal.getPendingCount() > 0) {
      return 'WAL_PENDING';
    }
    if (this.persistenceHealth === 'WAL_PENDING' && this.wal.getPendingCount() === 0) {
      this.persistenceHealth = 'HEALTHY';
    }
    return this.persistenceHealth;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Save a newly opened shadow observation (SHADOW_OPENED -> INSERT)
   * Idempotent: uses ON CONFLICT (id) DO NOTHING
   */
  public async saveShadowObservation(obs: ActiveShadowObservation): Promise<boolean> {
    try {
      const pool = this.getPool();
      const query = `
        INSERT INTO shadow_observations (
          id, signal_id, symbol, direction, setup_type, setup_fingerprint,
          session, market_regime, entry_price, stop_loss, initial_stop_loss,
          take_profit_1, take_profit_2, is_multi_target, tp1_hit, status,
          close_reason, exit_price, realized_r, mfe_pips, mae_pips,
          highest_price_seen, lowest_price_seen, monitoring_state,
          observation_type, execution_quality_assumptions, immutable_signal_snapshot,
          opened_at, closed_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24,
          $25, $26, $27,
          $28, $29, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          stop_loss = EXCLUDED.stop_loss,
          tp1_hit = EXCLUDED.tp1_hit,
          status = EXCLUDED.status,
          close_reason = EXCLUDED.close_reason,
          exit_price = EXCLUDED.exit_price,
          realized_r = EXCLUDED.realized_r,
          mfe_pips = EXCLUDED.mfe_pips,
          mae_pips = EXCLUDED.mae_pips,
          highest_price_seen = EXCLUDED.highest_price_seen,
          lowest_price_seen = EXCLUDED.lowest_price_seen,
          monitoring_state = EXCLUDED.monitoring_state,
          closed_at = EXCLUDED.closed_at,
          updated_at = NOW()
      `;

      const values = [
        obs.id,
        obs.signalId,
        obs.symbol,
        obs.direction,
        obs.setupType,
        obs.setupFingerprint,
        obs.session,
        obs.marketRegime,
        obs.entryPrice,
        obs.stopLoss,
        obs.initialStopLoss,
        obs.takeProfit1,
        obs.takeProfit2 ?? null,
        obs.isMultiTarget ?? false,
        obs.tp1Hit ?? false,
        obs.status,
        obs.closeReason ?? null,
        obs.exitPrice ?? null,
        obs.realizedR ?? null,
        obs.mfePips ?? 0.0,
        obs.maePips ?? 0.0,
        obs.highestPriceSeen,
        obs.lowestPriceSeen,
        obs.monitoringState ?? 'LIVE_MONITORING',
        obs.observationType ?? 'SHADOW_OBSERVATION',
        JSON.stringify(obs.executionQualityAssumptions ?? {}),
        JSON.stringify(obs.immutableSignalSnapshot ?? {}),
        new Date(obs.openedAt),
        obs.closedAt ? new Date(obs.closedAt) : null
      ];

      await pool.query(query, values);
      this.persistenceHealth = this.wal.getPendingCount() > 0 ? 'WAL_PENDING' : 'HEALTHY';
      this.lastError = null;
      return true;
    } catch (err: any) {
      this.persistenceHealth = 'WAL_PENDING';
      this.lastError = err?.message || 'Database write error';
      logger.warn(`[ShadowObservationRepository] Failed to save shadow observation ${obs.id} to PostgreSQL: ${err.message} - buffering to WAL.`);
      const walId = this.wal.writeEntry({
        operationType: 'SAVE_OBSERVATION',
        entityType: 'SHADOW_OBSERVATION',
        entityId: obs.id,
        symbol: obs.symbol,
        payload: obs
      });
      return walId !== null;
    }
  }

  /**
   * Update an existing shadow observation (TP1 adaptation or SHADOW_CLOSED)
   */
  public async updateShadowObservation(obs: Partial<ActiveShadowObservation> & { id: string }): Promise<boolean> {
    try {
      const pool = this.getPool();
      const updates: string[] = [];
      const values: any[] = [obs.id];
      let paramIdx = 2;

      if (obs.stopLoss !== undefined) {
        updates.push(`stop_loss = $${paramIdx++}`);
        values.push(obs.stopLoss);
      }
      if (obs.tp1Hit !== undefined) {
        updates.push(`tp1_hit = $${paramIdx++}`);
        values.push(obs.tp1Hit);
      }
      if (obs.status !== undefined) {
        updates.push(`status = $${paramIdx++}`);
        values.push(obs.status);
      }
      if (obs.closeReason !== undefined) {
        updates.push(`close_reason = $${paramIdx++}`);
        values.push(obs.closeReason);
      }
      if (obs.exitPrice !== undefined) {
        updates.push(`exit_price = $${paramIdx++}`);
        values.push(obs.exitPrice);
      }
      if (obs.realizedR !== undefined) {
        updates.push(`realized_r = $${paramIdx++}`);
        values.push(obs.realizedR);
      }
      if (obs.mfePips !== undefined) {
        updates.push(`mfe_pips = $${paramIdx++}`);
        values.push(obs.mfePips);
      }
      if (obs.maePips !== undefined) {
        updates.push(`mae_pips = $${paramIdx++}`);
        values.push(obs.maePips);
      }
      if (obs.highestPriceSeen !== undefined) {
        updates.push(`highest_price_seen = $${paramIdx++}`);
        values.push(obs.highestPriceSeen);
      }
      if (obs.lowestPriceSeen !== undefined) {
        updates.push(`lowest_price_seen = $${paramIdx++}`);
        values.push(obs.lowestPriceSeen);
      }
      if (obs.monitoringState !== undefined) {
        updates.push(`monitoring_state = $${paramIdx++}`);
        values.push(obs.monitoringState);
      }
      if (obs.closedAt !== undefined) {
        updates.push(`closed_at = $${paramIdx++}`);
        values.push(obs.closedAt ? new Date(obs.closedAt) : null);
      }

      if (updates.length === 0) return true;

      updates.push(`updated_at = NOW()`);
      const query = `UPDATE shadow_observations SET ${updates.join(', ')} WHERE id = $1`;
      await pool.query(query, values);

      this.persistenceHealth = this.wal.getPendingCount() > 0 ? 'WAL_PENDING' : 'HEALTHY';
      this.lastError = null;
      return true;
    } catch (err: any) {
      this.persistenceHealth = 'WAL_PENDING';
      this.lastError = err?.message || 'Database update error';
      logger.warn(`[ShadowObservationRepository] Failed to update shadow observation ${obs.id} in PostgreSQL: ${err.message} - buffering to WAL.`);
      const walId = this.wal.writeEntry({
        operationType: 'UPDATE_OBSERVATION',
        entityType: 'SHADOW_OBSERVATION',
        entityId: obs.id,
        payload: obs
      });
      return walId !== null;
    }
  }

  /**
   * Fetch all ACTIVE shadow observations for boot hydration
   */
  public async getActiveShadowObservations(): Promise<ActiveShadowObservation[]> {
    try {
      const pool = this.getPool();
      const query = `
        SELECT * FROM shadow_observations 
        WHERE status = 'ACTIVE' 
        ORDER BY opened_at ASC
      `;
      const res = await pool.query(query);
      this.persistenceHealth = this.wal.getPendingCount() > 0 ? 'WAL_PENDING' : 'HEALTHY';
      this.lastError = null;
      return res.rows.map(this.mapRowToObservation);
    } catch (err: any) {
      this.persistenceHealth = this.wal.getPendingCount() > 0 ? 'WAL_PENDING' : 'DEGRADED';
      this.lastError = err?.message || 'Database query error';
      logger.warn(`[ShadowObservationRepository] Failed to load active shadow observations: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch recent COMPLETED shadow observations for boot hydration & history
   */
  public async getCompletedShadowObservations(limit = 100): Promise<ActiveShadowObservation[]> {
    try {
      const pool = this.getPool();
      const query = `
        SELECT * FROM shadow_observations 
        WHERE status = 'CLOSED' 
        ORDER BY closed_at DESC NULLS LAST, opened_at DESC 
        LIMIT $1
      `;
      const res = await pool.query(query, [limit]);
      this.persistenceHealth = this.wal.getPendingCount() > 0 ? 'WAL_PENDING' : 'HEALTHY';
      this.lastError = null;
      return res.rows.map(this.mapRowToObservation);
    } catch (err: any) {
      this.persistenceHealth = this.wal.getPendingCount() > 0 ? 'WAL_PENDING' : 'DEGRADED';
      this.lastError = err?.message || 'Database query error';
      logger.warn(`[ShadowObservationRepository] Failed to load completed shadow observations: ${err.message}`);
      return [];
    }
  }

  /**
   * Authoritative PostgreSQL Aggregate Statistics for Observatory & Learning Engine
   */
  public async getAuthoritativeDatabaseStatistics(): Promise<{
    totalClosed: number;
    winCount: number;
    lossCount: number;
    breakevenCount: number;
    winRate: number;
    totalRealizedR: number;
    totalRealizedUSD: number;
    profitFactor: string;
    pairBreakdown: { symbol: string; total: number; wins: number; winRate: number; netUSD: number; netR: number }[];
  }> {
    try {
      const pool = this.getPool();
      const totalsRes = await pool.query(`
        SELECT 
          COUNT(*) as total_closed,
          SUM(CASE WHEN close_reason LIKE '%TAKE_PROFIT%' OR realized_r > 0 THEN 1 ELSE 0 END) as total_wins,
          SUM(CASE WHEN close_reason = 'STOP_LOSS' OR (realized_r < 0 AND close_reason != 'BREAKEVEN') THEN 1 ELSE 0 END) as total_losses,
          SUM(CASE WHEN close_reason = 'BREAKEVEN' OR realized_r = 0 THEN 1 ELSE 0 END) as total_be,
          SUM(realized_r) as net_realized_r,
          SUM(CASE WHEN realized_r > 0 THEN realized_r ELSE 0 END) as gross_win_r,
          SUM(CASE WHEN realized_r < 0 THEN ABS(realized_r) ELSE 0 END) as gross_loss_r
        FROM shadow_observations
        WHERE status = 'CLOSED';
      `);

      const row = totalsRes.rows[0] || {};
      const totalClosed = parseInt(row.total_closed || '0', 10);
      const winCount = parseInt(row.total_wins || '0', 10);
      const lossCount = parseInt(row.total_losses || '0', 10);
      const breakevenCount = parseInt(row.total_be || '0', 10);
      const totalRealizedR = parseFloat(parseFloat(row.net_realized_r || '0').toFixed(2));
      const winRate = totalClosed > 0 ? parseFloat(((winCount / totalClosed) * 100).toFixed(1)) : 0;
      const totalRealizedUSD = parseFloat((totalRealizedR * 10).toFixed(2));
      const grossWinR = parseFloat(row.gross_win_r || '0');
      const grossLossR = parseFloat(row.gross_loss_r || '0');
      const profitFactor = grossLossR > 0 ? (grossWinR / grossLossR).toFixed(2) : (grossWinR > 0 ? '∞' : '1.00');

      const pairRes = await pool.query(`
        SELECT 
          symbol,
          COUNT(*) as total,
          SUM(CASE WHEN close_reason LIKE '%TAKE_PROFIT%' OR realized_r > 0 THEN 1 ELSE 0 END) as wins,
          SUM(realized_r) as net_r
        FROM shadow_observations
        WHERE status = 'CLOSED'
        GROUP BY symbol
        ORDER BY total DESC;
      `);

      const pairBreakdown = pairRes.rows.map(p => {
        const pTotal = parseInt(p.total || '0', 10);
        const pWins = parseInt(p.wins || '0', 10);
        const pNetR = parseFloat(parseFloat(p.net_r || '0').toFixed(2));
        const pWinRate = pTotal > 0 ? parseFloat(((pWins / pTotal) * 100).toFixed(1)) : 0;
        return {
          symbol: p.symbol,
          total: pTotal,
          wins: pWins,
          winRate: pWinRate,
          netUSD: parseFloat((pNetR * 10).toFixed(2)),
          netR: pNetR
        };
      });

      return {
        totalClosed,
        winCount,
        lossCount,
        breakevenCount,
        winRate,
        totalRealizedR,
        totalRealizedUSD,
        profitFactor,
        pairBreakdown
      };
    } catch (err: any) {
      logger.warn(`[ShadowObservationRepository] Failed to query aggregate stats: ${err.message}`);
      return {
        totalClosed: 0,
        winCount: 0,
        lossCount: 0,
        breakevenCount: 0,
        winRate: 0,
        totalRealizedR: 0,
        totalRealizedUSD: 0,
        profitFactor: '1.00',
        pairBreakdown: []
      };
    }
  }

  /**
   * Save a learning journal event
   */
  public async saveJournalEvent(event: LearningJournalEvent): Promise<boolean> {
    try {
      const pool = this.getPool();
      const query = `
        INSERT INTO learning_journal_events (
          id, event_type, setup_fingerprint, symbol, direction,
          session, observation_type, observation_id, trade_id,
          outcome, realized_r, mfe_pips, mae_pips, sample_count,
          evidence_tier, previous_learning_weight, new_learning_weight,
          previous_parameter, proposed_parameter, applied_parameter,
          bounded_adjustment, reason, confidence_basis,
          affected_future_setup_fingerprint, payload, timestamp, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17,
          $18, $19, $20,
          $21, $22, $23,
          $24, $25, $26, NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `;

      const values = [
        event.id,
        event.eventType,
        event.setupFingerprint ?? null,
        event.symbol ?? null,
        event.direction ?? null,
        event.session ?? null,
        event.observationType ?? null,
        event.observationId ?? null,
        event.tradeId ?? null,
        event.outcome ?? null,
        event.realizedR ?? null,
        event.mfePips ?? null,
        event.maePips ?? null,
        event.sampleCount ?? 0,
        event.evidenceTier ?? null,
        event.previousLearningWeight ?? null,
        event.newLearningWeight ?? null,
        event.previousParameter ?? null,
        event.proposedParameter ?? null,
        event.appliedParameter ?? null,
        event.boundedAdjustment ?? null,
        event.reason,
        event.confidenceBasis ?? null,
        event.affectedFutureSetupFingerprint ?? null,
        JSON.stringify(event),
        event.timestamp
      ];

      await pool.query(query, values);
      this.persistenceHealth = this.wal.getPendingCount() > 0 ? 'WAL_PENDING' : 'HEALTHY';
      this.lastError = null;
      return true;
    } catch (err: any) {
      this.persistenceHealth = 'WAL_PENDING';
      this.lastError = err?.message || 'Database write error';
      logger.warn(`[ShadowObservationRepository] Failed to save journal event ${event.id} to PostgreSQL: ${err.message} - buffering to WAL.`);
      const walId = this.wal.writeEntry({
        operationType: 'SAVE_JOURNAL_EVENT',
        entityType: 'JOURNAL_EVENT',
        entityId: event.id,
        symbol: event.symbol,
        payload: event
      });
      return walId !== null;
    }
  }

  /**
   * Replays pending WAL entries to PostgreSQL in chronological order.
   * Drains successfully written records and clears persistence health to HEALTHY.
   */
  public async replayWal(): Promise<{ replayed: number; failed: number }> {
    const entries = this.wal.getPendingEntries();
    if (entries.length === 0) {
      this.persistenceHealth = 'HEALTHY';
      return { replayed: 0, failed: 0 };
    }

    this.persistenceHealth = 'RECOVERING';
    let replayed = 0;
    let failed = 0;

    for (const entry of entries) {
      try {
        let success = false;
        if (entry.operationType === 'SAVE_OBSERVATION') {
          // Direct SQL insert without triggering another WAL loop
          const pool = this.getPool();
          const obs = entry.payload as ActiveShadowObservation;
          const query = `
            INSERT INTO shadow_observations (
              id, signal_id, symbol, direction, setup_type, setup_fingerprint,
              session, market_regime, entry_price, stop_loss, initial_stop_loss,
              take_profit_1, take_profit_2, is_multi_target, tp1_hit, status,
              close_reason, exit_price, realized_r, mfe_pips, mae_pips,
              highest_price_seen, lowest_price_seen, monitoring_state,
              observation_type, execution_quality_assumptions, immutable_signal_snapshot,
              opened_at, closed_at, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11,
              $12, $13, $14, $15, $16,
              $17, $18, $19, $20, $21,
              $22, $23, $24,
              $25, $26, $27,
              $28, $29, NOW(), NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              stop_loss = EXCLUDED.stop_loss,
              tp1_hit = EXCLUDED.tp1_hit,
              status = EXCLUDED.status,
              close_reason = EXCLUDED.close_reason,
              exit_price = EXCLUDED.exit_price,
              realized_r = EXCLUDED.realized_r,
              mfe_pips = EXCLUDED.mfe_pips,
              mae_pips = EXCLUDED.mae_pips,
              highest_price_seen = EXCLUDED.highest_price_seen,
              lowest_price_seen = EXCLUDED.lowest_price_seen,
              monitoring_state = EXCLUDED.monitoring_state,
              closed_at = EXCLUDED.closed_at,
              updated_at = NOW()
          `;
          const values = [
            obs.id,
            obs.signalId,
            obs.symbol,
            obs.direction,
            obs.setupType,
            obs.setupFingerprint,
            obs.session,
            obs.marketRegime,
            obs.entryPrice,
            obs.stopLoss,
            obs.initialStopLoss,
            obs.takeProfit1,
            obs.takeProfit2 ?? null,
            obs.isMultiTarget ?? false,
            obs.tp1Hit ?? false,
            obs.status,
            obs.closeReason ?? null,
            obs.exitPrice ?? null,
            obs.realizedR ?? null,
            obs.mfePips ?? 0.0,
            obs.maePips ?? 0.0,
            obs.highestPriceSeen,
            obs.lowestPriceSeen,
            obs.monitoringState ?? 'LIVE_MONITORING',
            obs.observationType ?? 'SHADOW_OBSERVATION',
            JSON.stringify(obs.executionQualityAssumptions ?? {}),
            JSON.stringify(obs.immutableSignalSnapshot ?? {}),
            new Date(obs.openedAt),
            obs.closedAt ? new Date(obs.closedAt) : null
          ];
          await pool.query(query, values);
          success = true;
        } else if (entry.operationType === 'UPDATE_OBSERVATION') {
          const pool = this.getPool();
          const obs = entry.payload as Partial<ActiveShadowObservation> & { id: string };
          const updates: string[] = [];
          const values: any[] = [obs.id];
          let paramIdx = 2;

          if (obs.stopLoss !== undefined) {
            updates.push(`stop_loss = $${paramIdx++}`);
            values.push(obs.stopLoss);
          }
          if (obs.tp1Hit !== undefined) {
            updates.push(`tp1_hit = $${paramIdx++}`);
            values.push(obs.tp1Hit);
          }
          if (obs.status !== undefined) {
            updates.push(`status = $${paramIdx++}`);
            values.push(obs.status);
          }
          if (obs.closeReason !== undefined) {
            updates.push(`close_reason = $${paramIdx++}`);
            values.push(obs.closeReason);
          }
          if (obs.exitPrice !== undefined) {
            updates.push(`exit_price = $${paramIdx++}`);
            values.push(obs.exitPrice);
          }
          if (obs.realizedR !== undefined) {
            updates.push(`realized_r = $${paramIdx++}`);
            values.push(obs.realizedR);
          }
          if (obs.mfePips !== undefined) {
            updates.push(`mfe_pips = $${paramIdx++}`);
            values.push(obs.mfePips);
          }
          if (obs.maePips !== undefined) {
            updates.push(`mae_pips = $${paramIdx++}`);
            values.push(obs.maePips);
          }
          if (obs.highestPriceSeen !== undefined) {
            updates.push(`highest_price_seen = $${paramIdx++}`);
            values.push(obs.highestPriceSeen);
          }
          if (obs.lowestPriceSeen !== undefined) {
            updates.push(`lowest_price_seen = $${paramIdx++}`);
            values.push(obs.lowestPriceSeen);
          }
          if (obs.monitoringState !== undefined) {
            updates.push(`monitoring_state = $${paramIdx++}`);
            values.push(obs.monitoringState);
          }
          if (obs.closedAt !== undefined) {
            updates.push(`closed_at = $${paramIdx++}`);
            values.push(obs.closedAt ? new Date(obs.closedAt) : null);
          }

          if (updates.length > 0) {
            updates.push(`updated_at = NOW()`);
            const query = `UPDATE shadow_observations SET ${updates.join(', ')} WHERE id = $1`;
            await pool.query(query, values);
          }
          success = true;
        } else if (entry.operationType === 'SAVE_JOURNAL_EVENT') {
          const pool = this.getPool();
          const event = entry.payload as LearningJournalEvent;
          const query = `
            INSERT INTO learning_journal_events (
              id, event_type, setup_fingerprint, symbol, direction,
              session, observation_type, observation_id, trade_id,
              outcome, realized_r, mfe_pips, mae_pips, sample_count,
              evidence_tier, previous_learning_weight, new_learning_weight,
              previous_parameter, proposed_parameter, applied_parameter,
              bounded_adjustment, reason, confidence_basis,
              affected_future_setup_fingerprint, payload, timestamp, created_at
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9,
              $10, $11, $12, $13, $14,
              $15, $16, $17,
              $18, $19, $20,
              $21, $22, $23,
              $24, $25, $26, NOW()
            )
            ON CONFLICT (id) DO NOTHING
          `;
          const values = [
            event.id,
            event.eventType,
            event.setupFingerprint ?? null,
            event.symbol ?? null,
            event.direction ?? null,
            event.session ?? null,
            event.observationType ?? null,
            event.observationId ?? null,
            event.tradeId ?? null,
            event.outcome ?? null,
            event.realizedR ?? null,
            event.mfePips ?? null,
            event.maePips ?? null,
            event.sampleCount ?? 0,
            event.evidenceTier ?? null,
            event.previousLearningWeight ?? null,
            event.newLearningWeight ?? null,
            event.previousParameter ?? null,
            event.proposedParameter ?? null,
            event.appliedParameter ?? null,
            event.boundedAdjustment ?? null,
            event.reason,
            event.confidenceBasis ?? null,
            event.affectedFutureSetupFingerprint ?? null,
            JSON.stringify(event),
            event.timestamp
          ];
          await pool.query(query, values);
          success = true;
        }

        if (success) {
          this.wal.removeEntry(entry.id);
          replayed++;
        }
      } catch (err: any) {
        failed++;
        logger.warn(`[ShadowObservationRepository] WAL replay failed for ${entry.id} (${entry.entityId}): ${err?.message}`);
      }
    }

    if (failed === 0 && this.wal.getPendingCount() === 0) {
      this.persistenceHealth = 'HEALTHY';
      this.lastError = null;
    } else {
      this.persistenceHealth = 'WAL_PENDING';
    }

    return { replayed, failed };
  }

  /**
   * Fetch recent learning journal events
   */
  public async getJournalEvents(filter?: {
    setupFingerprint?: string;
    eventType?: string;
    observationType?: string;
    limit?: number;
  }): Promise<LearningJournalEvent[]> {
    try {
      const pool = this.getPool();
      const conditions: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (filter?.setupFingerprint) {
        conditions.push(`setup_fingerprint = $${idx++}`);
        values.push(filter.setupFingerprint);
      }
      if (filter?.eventType) {
        conditions.push(`event_type = $${idx++}`);
        values.push(filter.eventType);
      }
      if (filter?.observationType) {
        conditions.push(`observation_type = $${idx++}`);
        values.push(filter.observationType);
      }

      const limit = filter?.limit && filter.limit > 0 ? filter.limit : 500;
      values.push(limit);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const query = `
        SELECT * FROM learning_journal_events 
        ${whereClause} 
        ORDER BY timestamp DESC 
        LIMIT $${idx}
      `;

      const res = await pool.query(query, values);
      this.persistenceHealth = 'HEALTHY';
      this.lastError = null;
      return res.rows.map(this.mapRowToJournalEvent);
    } catch (err: any) {
      this.persistenceHealth = 'DEGRADED';
      this.lastError = err?.message || 'Database query error';
      logger.warn(`[ShadowObservationRepository] Failed to load journal events: ${err.message}`);
      return [];
    }
  }

  private mapRowToObservation(row: any): ActiveShadowObservation {
    return {
      id: row.id,
      signalId: row.signal_id,
      symbol: row.symbol as CurrencyPair,
      direction: row.direction as 'BUY' | 'SELL',
      setupType: row.setup_type,
      setupFingerprint: row.setup_fingerprint,
      session: row.session as TradingSession,
      marketRegime: row.market_regime,
      entryPrice: Number(row.entry_price),
      stopLoss: Number(row.stop_loss),
      initialStopLoss: Number(row.initial_stop_loss),
      takeProfit1: Number(row.take_profit_1),
      takeProfit2: row.take_profit_2 ? Number(row.take_profit_2) : undefined,
      isMultiTarget: Boolean(row.is_multi_target),
      tp1Hit: Boolean(row.tp1_hit),
      status: row.status as 'ACTIVE' | 'CLOSED',
      closeReason: row.close_reason || undefined,
      exitPrice: row.exit_price ? Number(row.exit_price) : undefined,
      realizedR: row.realized_r !== null && row.realized_r !== undefined ? Number(row.realized_r) : undefined,
      mfePips: Number(row.mfe_pips || 0),
      maePips: Number(row.mae_pips || 0),
      highestPriceSeen: Number(row.highest_price_seen),
      lowestPriceSeen: Number(row.lowest_price_seen),
      monitoringState: row.monitoring_state || 'LIVE_MONITORING',
      observationType: row.observation_type || 'SHADOW_OBSERVATION',
      executionQualityAssumptions: typeof row.execution_quality_assumptions === 'string'
        ? JSON.parse(row.execution_quality_assumptions)
        : (row.execution_quality_assumptions || {}),
      immutableSignalSnapshot: typeof row.immutable_signal_snapshot === 'string'
        ? JSON.parse(row.immutable_signal_snapshot)
        : (row.immutable_signal_snapshot || {}),
      openedAt: new Date(row.opened_at).getTime(),
      closedAt: row.closed_at ? new Date(row.closed_at).getTime() : undefined
    };
  }

  private mapRowToJournalEvent(row: any): LearningJournalEvent {
    if (row.payload) {
      try {
        const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        return {
          id: row.id,
          timestamp: Number(row.timestamp),
          ...parsed
        };
      } catch (e) {
        // Fallback to row fields
      }
    }

    return {
      id: row.id,
      timestamp: Number(row.timestamp),
      eventType: row.event_type,
      setupFingerprint: row.setup_fingerprint,
      symbol: row.symbol,
      direction: row.direction,
      session: row.session,
      observationType: row.observation_type,
      observationId: row.observation_id || undefined,
      tradeId: row.trade_id || undefined,
      outcome: row.outcome || undefined,
      realizedR: row.realized_r !== null && row.realized_r !== undefined ? Number(row.realized_r) : undefined,
      mfePips: row.mfe_pips !== null && row.mfe_pips !== undefined ? Number(row.mfe_pips) : undefined,
      maePips: row.mae_pips !== null && row.mae_pips !== undefined ? Number(row.mae_pips) : undefined,
      sampleCount: Number(row.sample_count || 0),
      evidenceTier: row.evidence_tier as ResearchEvidenceTier,
      previousLearningWeight: Number(row.previous_learning_weight || 1.0),
      newLearningWeight: Number(row.new_learning_weight || 1.0),
      previousParameter: row.previous_parameter || undefined,
      proposedParameter: row.proposed_parameter || undefined,
      appliedParameter: row.applied_parameter || undefined,
      boundedAdjustment: row.bounded_adjustment || undefined,
      reason: row.reason,
      confidenceBasis: row.confidence_basis || undefined,
      affectedFutureSetupFingerprint: row.affected_future_setup_fingerprint || ''
    };
  }
}

export const shadowObservationRepository = ShadowObservationRepository.getInstance();
