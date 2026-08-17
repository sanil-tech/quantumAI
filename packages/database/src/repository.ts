import { Pool, PoolClient } from 'pg';
import { getDbPool, checkDbConnection } from './index';
import { logger } from '@iati/core';

export interface SignalRecord {
  id: string;
  symbol: string;
  timeframe: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  setupType?: string;
  confidence?: number;
  reasoning?: string;
  status?: 'ACTIVE' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED' | 'INVALIDATED';
  dataClass?: string;
  provider?: string;
  source?: string;
  marketTimestamp?: number;
  executable?: boolean;
  strategy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrderRecord {
  orderId: string;
  proposalId?: string;
  approvalId?: string;
  accountId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  quantity: number;
  orderType?: 'MARKET' | 'LIMIT' | 'STOP';
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  stopPrice?: number;
  status: 'PENDING' | 'SUBMITTED' | 'FILLED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  broker?: string;
  brokerOrderId?: string;
  createdAt?: Date;
  filledAt?: Date;
}

export interface PositionRecord {
  positionId: string;
  ticketId?: string;
  setupId?: string;
  accountId: string;
  symbol: string;
  timeframe?: string;
  direction: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  closePrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  takeProfit2?: number;
  unrealizedProfit?: number;
  realizedProfit?: number;
  pnlPips?: number;
  commission?: number;
  swap?: number;
  status: 'OPEN' | 'CLOSED';
  closeReason?: string;
  broker?: string;
  environment?: string;
  proposalId?: string;
  approvalId?: string;
  strategyId?: string;
  strategyVersion?: string;
  learningVersion?: string;
  brokerOrderId?: string;
  brokerPositionId?: string;
  brokerDealId?: string;
  reconciliationStatus?: 'MATCHED' | 'MISMATCH' | 'PENDING' | 'UNKNOWN';
  idempotencyKey?: string;
  openedAt?: Date;
  closedAt?: Date;
  updatedAt?: Date;
}

export interface TradeEventRecord {
  id: string;
  tradeId?: string;
  orderId?: string;
  setupId?: string;
  eventType:
    | 'AI_SIGNAL'
    | 'RISK_APPROVED'
    | 'ORDER_CREATED'
    | 'ORDER_QUEUED'
    | 'ORDER_EXECUTED'
    | 'POSITION_OPENED'
    | 'POSITION_UPDATED'
    | 'POSITION_CLOSED'
    | 'SL_HIT'
    | 'TP_HIT'
    | 'MANUAL_CLOSE'
    | 'EXECUTION_REJECTED'
    | 'TRADE_LEARNING_CREATED'
    | 'TRADE_PROPOSED'
    | 'EXECUTION_REQUESTED'
    | 'TRADE_OPENED'
    | 'SL_UPDATED'
    | 'TP_UPDATED'
    | 'TRADE_CLOSED';
  actor?: string;
  details?: any;
  timestamp?: Date;
}

export interface PostMortemReviewRecord {
  id: string;
  tradeId: string;
  learningVersion: string;
  review: any;
  rootCause?: string;
  adaptiveActionRecommended?: string;
  adaptiveRuleCreated?: string;
  createdAt?: Date;
}

export interface OrderFillRecord {
  fillId: string;
  orderId: string;
  filledPrice: number;
  filledQuantity: number;
  slippage?: number;
  latencyMs?: number;
  fee?: number;
  timestamp?: Date;
}

export interface AccountStateRecord {
  accountId: string;
  isAutoEnabled: boolean;
  balance: number;
  initialCapital: number;
  riskPercent: number;
  latestAiRule?: string;
  updatedAt?: Date;
}

export interface PendingCommandRecord {
  id: string;
  setupId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  broker: string;
  accountNumber: string;
  environment: string;
  status: 'PENDING' | 'CLAIMED' | 'SENT' | 'ACKNOWLEDGED' | 'EXECUTED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  dataClass?: string;
  provider?: string;
  timeframe?: string;
  idempotencyKey?: string;
  brokerOrderId?: string;
  claimedBy?: string;
  leaseExpiry?: Date;
  error?: string;
  metadata?: any;
}

export interface OutboxEventRecord {
  id: string;
  eventType: string;
  payload: any;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  retryCount?: number;
  error?: string;
  createdAt?: Date;
  publishedAt?: Date;
}

export interface BrokerWebhookEventRecord {
  eventId: string;
  broker: string;
  eventType: string;
  accountNumber?: string;
  orderId?: string;
  payload: any;
  status: 'RECEIVED' | 'PROCESSED' | 'FAILED';
  error?: string;
  createdAt?: Date;
  processedAt?: Date;
}

export interface ExecutionAuditLogRecord {
  id: string;
  commandId: string;
  setupId?: string;
  fromStatus?: string;
  toStatus: string;
  actor: string;
  details?: any;
  timestamp?: Date;
}

export interface ReconciliationRecord {
  id: string;
  accountId?: string;
  broker: string;
  action: string;
  targetId: string;
  details?: any;
  timestamp?: Date;
}

export interface IdempotencyRecord {
  key: string;
  scope: string;
  result: any;
  createdAt?: Date;
}

export interface TradingLogRecord {
  id: string;
  accountId?: string;
  timestamp?: Date;
  text: string;
  type?: string;
}

export interface RehydratedTradingState {
  accountState: AccountStateRecord;
  openPositions: PositionRecord[];
  closedPositions: PositionRecord[];
  pendingCommands: PendingCommandRecord[];
  activeSignals: SignalRecord[];
  recentLogs: TradingLogRecord[];
  postMortemReviews: any[];
}

export class TradingRepository {
  private pool: Pool;
  constructor(customPool?: Pool) {
    this.pool = customPool || getDbPool();
  }

  /**
   * Helper: execute a database query using client or pool
   */
  private async query(text: string, params?: any[], client?: PoolClient) {
    if (client) {
      return client.query(text, params);
    }
    return this.pool.query(text, params);
  }

  // ==========================================
  // SIGNALS PERSISTENCE
  // ==========================================
  async saveSignal(signal: SignalRecord, client?: PoolClient): Promise<SignalRecord> {
    const text = `
      INSERT INTO signals (
        id, symbol, timeframe, direction, entry_price, stop_loss, take_profit_1, take_profit_2,
        setup_type, confidence, reasoning, status, data_class, provider, source,
        market_timestamp, executable, strategy, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *;
    `;
    const values = [
      signal.id,
      signal.symbol,
      signal.timeframe,
      signal.direction,
      signal.entryPrice,
      signal.stopLoss,
      signal.takeProfit1,
      signal.takeProfit2 || 0,
      signal.setupType || null,
      signal.confidence || null,
      signal.reasoning || null,
      signal.status || 'ACTIVE',
      signal.dataClass || 'UNKNOWN',
      signal.provider || 'UNKNOWN',
      signal.source || 'UNKNOWN',
      signal.marketTimestamp || null,
      signal.executable ?? true,
      signal.strategy || null
    ];

    try {
      const res = await this.query(text, values, client);
      return this.mapSignalRow(res.rows[0]);
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to save signal ${signal.id}: ${err.message}`);
      throw new Error(`DB_SAVE_SIGNAL_FAILED: ${err.message}`);
    }
  }

  async getSignalById(id: string): Promise<SignalRecord | null> {
    const res = await this.query(`SELECT * FROM signals WHERE id = $1`, [id]);
    return res.rows.length ? this.mapSignalRow(res.rows[0]) : null;
  }

  async getActiveSignals(): Promise<SignalRecord[]> {
    const res = await this.query(`SELECT * FROM signals WHERE status = 'ACTIVE' ORDER BY created_at DESC`);
    return res.rows.map(r => this.mapSignalRow(r));
  }

  async updateSignalStatus(id: string, status: string, client?: PoolClient): Promise<void> {
    const text = `UPDATE signals SET status = $1, updated_at = NOW() WHERE id = $2`;
    await this.query(text, [status, id], client);
  }

  // ==========================================
  // ORDERS PERSISTENCE
  // ==========================================
  async saveOrder(order: OrderRecord, client?: PoolClient): Promise<OrderRecord> {
    const text = `
      INSERT INTO orders (
        order_id, proposal_id, approval_id, account_id, symbol, direction,
        quantity, order_type, price, stop_loss, take_profit, stop_price,
        status, broker_id, created_at, filled_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (order_id) DO UPDATE SET
        status = EXCLUDED.status,
        filled_at = EXCLUDED.filled_at
      RETURNING *;
    `;
    const values = [
      order.orderId,
      order.proposalId || null,
      order.approvalId || null,
      order.accountId,
      order.symbol,
      order.direction,
      order.quantity,
      order.orderType || 'MARKET',
      order.price || null,
      order.stopLoss || null,
      order.takeProfit || null,
      order.stopPrice || null,
      order.status,
      order.broker || 'PAPER',
      order.createdAt || new Date(),
      order.filledAt || null
    ];

    try {
      const res = await this.query(text, values, client);
      return this.mapOrderRow(res.rows[0]);
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to save order ${order.orderId}: ${err.message}`);
      throw new Error(`DB_SAVE_ORDER_FAILED: ${err.message}`);
    }
  }

  async getOrderById(orderId: string): Promise<OrderRecord | null> {
    const res = await this.query(`SELECT * FROM orders WHERE order_id = $1`, [orderId]);
    return res.rows.length ? this.mapOrderRow(res.rows[0]) : null;
  }

  // ==========================================
  // POSITIONS PERSISTENCE
  // ==========================================
  async savePosition(pos: PositionRecord, client?: PoolClient): Promise<PositionRecord> {
    const text = `
      INSERT INTO positions (
        position_id, ticket_id, setup_id, account_id, symbol, timeframe, direction, quantity,
        entry_price, current_price, close_price, stop_loss, take_profit, take_profit_2,
        unrealized_profit, realized_profit, pnl_pips, commission, swap, status, close_reason,
        broker, environment, proposal_id, approval_id, strategy_id, strategy_version, learning_version,
        broker_order_id, broker_position_id, broker_deal_id, reconciliation_status,
        idempotency_key, opened_at, closed_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, NOW()
      )
      ON CONFLICT (position_id) DO UPDATE SET
        ticket_id = COALESCE(EXCLUDED.ticket_id, positions.ticket_id),
        current_price = EXCLUDED.current_price,
        close_price = EXCLUDED.close_price,
        unrealized_profit = EXCLUDED.unrealized_profit,
        realized_profit = EXCLUDED.realized_profit,
        pnl_pips = EXCLUDED.pnl_pips,
        commission = EXCLUDED.commission,
        swap = EXCLUDED.swap,
        status = EXCLUDED.status,
        close_reason = EXCLUDED.close_reason,
        broker_order_id = COALESCE(EXCLUDED.broker_order_id, positions.broker_order_id),
        broker_position_id = COALESCE(EXCLUDED.broker_position_id, positions.broker_position_id),
        broker_deal_id = COALESCE(EXCLUDED.broker_deal_id, positions.broker_deal_id),
        reconciliation_status = EXCLUDED.reconciliation_status,
        closed_at = EXCLUDED.closed_at,
        updated_at = NOW()
      RETURNING *;
    `;
    const values = [
      pos.positionId,
      pos.ticketId || null,
      pos.setupId || null,
      pos.accountId,
      pos.symbol,
      pos.timeframe || 'M15',
      pos.direction,
      pos.quantity,
      pos.entryPrice,
      pos.currentPrice,
      pos.closePrice || null,
      pos.stopLoss || null,
      pos.takeProfit || null,
      pos.takeProfit2 || null,
      pos.unrealizedProfit || 0,
      pos.realizedProfit || 0,
      pos.pnlPips || 0,
      pos.commission || 0,
      pos.swap || 0,
      pos.status,
      pos.closeReason || null,
      pos.broker || 'PAPER',
      pos.environment || 'DEMO',
      pos.proposalId || null,
      pos.approvalId || null,
      pos.strategyId || null,
      pos.strategyVersion || null,
      pos.learningVersion || '1.0',
      pos.brokerOrderId || null,
      pos.brokerPositionId || null,
      pos.brokerDealId || null,
      pos.reconciliationStatus || 'MATCHED',
      pos.idempotencyKey || null,
      pos.openedAt || new Date(),
      pos.closedAt || null
    ];

    try {
      const res = await this.query(text, values, client);
      return this.mapPositionRow(res.rows[0]);
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to save position ${pos.positionId}: ${err.message}`);
      throw new Error(`PERSISTENCE_ERROR: Failed to save position: ${err.message}`);
    }
  }

  async getPositionById(positionId: string, client?: PoolClient): Promise<PositionRecord | null> {
    try {
      const res = await this.query(`SELECT * FROM positions WHERE position_id = $1`, [positionId], client);
      if (res && res.rows && res.rows.length) return this.mapPositionRow(res.rows[0]);
      return null;
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to get position by id ${positionId}: ${err.message}`);
      throw new Error(`DATABASE_ERROR: Failed to get position: ${err.message}`);
    }
  }

  async getPositionByIdempotencyKeyOrSetupId(idempotencyKey?: string, setupId?: string): Promise<PositionRecord | null> {
    try {
      if (idempotencyKey) {
        const resKey = await this.query(`SELECT * FROM positions WHERE idempotency_key = $1 LIMIT 1`, [idempotencyKey]);
        if (resKey && resKey.rows && resKey.rows.length) return this.mapPositionRow(resKey.rows[0]);
      }
      if (setupId) {
        const resSetup = await this.query(`SELECT * FROM positions WHERE setup_id = $1 LIMIT 1`, [setupId]);
        if (resSetup && resSetup.rows && resSetup.rows.length) return this.mapPositionRow(resSetup.rows[0]);
      }
      return null;
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to get position by keys: ${err.message}`);
      throw new Error(`DATABASE_ERROR: Failed to get position by keys: ${err.message}`);
    }
  }

  async getOpenPositions(accountId: string = 'DEFAULT'): Promise<PositionRecord[]> {
    const res = await this.query(
      `SELECT * FROM positions WHERE account_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC`,
      [accountId]
    );
    return res.rows.map(r => this.mapPositionRow(r));
  }

  async getClosedPositions(accountId: string = 'DEFAULT', limit: number = 100, offset: number = 0): Promise<PositionRecord[]> {
    const res = await this.query(
      `SELECT * FROM positions WHERE account_id = $1 AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT $2 OFFSET $3`,
      [accountId, limit, offset]
    );
    return res.rows.map(r => this.mapPositionRow(r));
  }

  async getPositions(params: {
    accountId?: string;
    status?: string;
    limit?: number;
    offset?: number;
    symbol?: string;
  }): Promise<{ positions: PositionRecord[]; totalCount: number }> {
    const accountId = params.accountId || 'DEFAULT';
    const limit = Math.min(params.limit || 50, 200);
    const offset = params.offset || 0;

    let whereClause = `WHERE account_id = $1`;
    const values: any[] = [accountId];
    let paramIdx = 2;

    if (params.status && params.status !== 'ALL') {
      whereClause += ` AND status = ${paramIdx++}`;
      values.push(params.status.toUpperCase());
    }

    if (params.symbol) {
      whereClause += ` AND symbol = ${paramIdx++}`;
      values.push(params.symbol);
    }

    try {
      const countRes = await this.query(`SELECT COUNT(*)::int as total FROM positions ${whereClause}`, values);
      const totalCount = countRes.rows[0]?.total || 0;

      const queryText = `
        SELECT * FROM positions
        ${whereClause}
        ORDER BY CASE WHEN status = 'OPEN' THEN opened_at ELSE closed_at END DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}
      `;
      values.push(limit, offset);

      const res = await this.query(queryText, values);
      return {
        positions: res.rows.map(r => this.mapPositionRow(r)),
        totalCount
      };
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to get positions: ${err.message}`);
      throw new Error(`DATABASE_ERROR: Failed to get positions: ${err.message}`);
    }
  }

  async calculatePerformanceMetrics(accountId: string = 'DEFAULT'): Promise<{
    winCount: number;
    lossCount: number;
    winRatePercent: number;
    totalPnlDollars: number;
    totalPnlPips: number;
    totalTrades: number;
  }> {
    const res = await this.query(`
      SELECT
        COUNT(*)::int as total_trades,
        COUNT(CASE WHEN realized_profit >= 0 THEN 1 END)::int as win_count,
        COUNT(CASE WHEN realized_profit < 0 THEN 1 END)::int as loss_count,
        COALESCE(SUM(realized_profit), 0)::float as total_pnl_dollars,
        COALESCE(SUM(pnl_pips), 0)::float as total_pnl_pips
      FROM positions
      WHERE account_id = $1 AND status = 'CLOSED'
    `, [accountId]);

    const row = res.rows[0] || {};
    const totalTrades = row.total_trades || 0;
    const winCount = row.win_count || 0;
    const lossCount = row.loss_count || 0;
    const totalPnlDollars = parseFloat((row.total_pnl_dollars || 0).toFixed(2));
    const totalPnlPips = parseFloat((row.total_pnl_pips || 0).toFixed(2));
    const winRatePercent = totalTrades > 0 ? parseFloat(((winCount / totalTrades) * 100).toFixed(2)) : 0;

    return {
      winCount,
      lossCount,
      winRatePercent,
      totalPnlDollars,
      totalPnlPips,
      totalTrades
    };
  }

  async saveTradeEvent(evt: TradeEventRecord, client?: PoolClient): Promise<TradeEventRecord> {
    const id = evt.id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const text = `
      INSERT INTO trade_events (id, trade_id, order_id, setup_id, event_type, actor, details, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *;
    `;
    const values = [
      id,
      evt.tradeId || null,
      evt.orderId || null,
      evt.setupId || null,
      evt.eventType,
      evt.actor || 'SYSTEM',
      evt.details ? JSON.stringify(evt.details) : null
    ];
    try {
      const res = await this.query(text, values, client);
      const r = res.rows[0];
      return {
        id: r.id,
        tradeId: r.trade_id,
        orderId: r.order_id,
        setupId: r.setup_id,
        eventType: r.event_type,
        actor: r.actor,
        details: r.details ? (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) : null,
        timestamp: r.timestamp ? new Date(r.timestamp) : undefined
      };
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to save trade event: ${err.message}`);
      throw new Error(`PERSISTENCE_ERROR: Failed to save trade event: ${err.message}`);
    }
  }

  async getTradeEvents(tradeId: string): Promise<TradeEventRecord[]> {
    const res = await this.query(
      `SELECT * FROM trade_events WHERE trade_id = $1 OR setup_id = $1 ORDER BY timestamp ASC`,
      [tradeId]
    );
    return res.rows.map(r => ({
      id: r.id,
      tradeId: r.trade_id,
      orderId: r.order_id,
      setupId: r.setup_id,
      eventType: r.event_type,
      actor: r.actor,
      details: r.details ? (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) : null,
      timestamp: r.timestamp ? new Date(r.timestamp) : undefined
    }));
  }

  /**
   * Transactional Position Close:
   * Atomically closes a position record and updates the account balance.
   */
  async closePositionTransaction(params: {
    positionId: string;
    closePrice: number;
    realizedProfit: number;
    pnlPips?: number;
    closeReason: string;
    accountId?: string;
  }): Promise<{ position: PositionRecord; newBalance: number }> {
    const accountId = params.accountId || 'DEFAULT';

    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (connErr: any) {
      logger.error(`[DB-REPOSITORY] DB connection unavailable for closePositionTransaction: ${connErr.message}`);
      throw new Error(`DATABASE_UNAVAILABLE: DB connection unavailable: ${connErr.message}`);
    }

    try {
      await client.query('BEGIN');

      // 1. Fetch position with lock
      const posRes = await client.query(`SELECT * FROM positions WHERE position_id = $1 FOR UPDATE`, [params.positionId]);
      if (!posRes.rows.length) {
        throw new Error(`POSITION_NOT_FOUND: ${params.positionId}`);
      }

      const existingPos = this.mapPositionRow(posRes.rows[0]);
      if (existingPos.status === 'CLOSED') {
        // Idempotent: already closed
        const accStateRes = await client.query(`SELECT balance FROM account_state WHERE account_id = $1`, [accountId]);
        const curBal = accStateRes.rows.length ? parseFloat(accStateRes.rows[0].balance) : 10000;
        await client.query('COMMIT');
        return { position: existingPos, newBalance: curBal };
      }

      const pnlPips = params.pnlPips ?? 0;

      // 2. Update position to CLOSED
      const updatePosRes = await client.query(`
        UPDATE positions
        SET status = 'CLOSED',
            close_price = $1,
            realized_profit = $2,
            pnl_pips = $3,
            close_reason = $4,
            closed_at = NOW(),
            updated_at = NOW()
        WHERE position_id = $5
        RETURNING *;
      `, [params.closePrice, params.realizedProfit, pnlPips, params.closeReason, params.positionId]);

      const updatedPosition = this.mapPositionRow(updatePosRes.rows[0]);

      // 3. Update account_state balance atomically
      const accRes = await client.query(`
        UPDATE account_state
        SET balance = balance + $1,
            updated_at = NOW()
        WHERE account_id = $2
        RETURNING balance;
      `, [params.realizedProfit, accountId]);

      let newBalance = 10000;
      if (accRes.rows.length) {
        newBalance = parseFloat(accRes.rows[0].balance);
      }

      await client.query('COMMIT');
      return { position: updatedPosition, newBalance };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error(`[DB-REPOSITORY] Transaction failed for closePosition ${params.positionId}: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================
  // EXECUTION COMMANDS (Pending Orders Queue & Idempotency)
  // ==========================================
  async enqueueExecutionCommand(cmd: PendingCommandRecord, client?: PoolClient): Promise<PendingCommandRecord> {
    const key = cmd.idempotencyKey || `ik_${cmd.setupId}_${cmd.accountNumber}_${cmd.symbol}_${cmd.side}`;

    const text = `
      INSERT INTO execution_commands (
        id, setup_id, symbol, side, volume, entry_price, stop_loss,
        take_profit_1, take_profit_2, broker, account_number, environment,
        status, data_class, provider, timeframe, idempotency_key,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *;
    `;
    const values = [
      cmd.id,
      cmd.setupId,
      cmd.symbol,
      cmd.side,
      cmd.volume,
      cmd.entryPrice,
      cmd.stopLoss,
      cmd.takeProfit1,
      cmd.takeProfit2 || 0,
      cmd.broker || 'CTRADER',
      cmd.accountNumber,
      cmd.environment || 'DEMO',
      cmd.status || 'PENDING',
      cmd.dataClass || 'UNKNOWN',
      cmd.provider || 'UNKNOWN',
      cmd.timeframe || 'M15',
      key
    ];

    try {
      const res = await this.query(text, values, client);
      return this.mapCommandRow(res.rows[0]);
    } catch (err: any) {
      if (err.message && (err.message.includes('unique constraint') || err.message.includes('idempotency_key') || err.code === '23505')) {
        try {
          const existing = await this.getExecutionCommandByIdempotencyKey(key);
          if (existing) return existing;
        } catch (_) {
          // ignore nested lookup error
        }
      }
      logger.error(`[DB-REPOSITORY] Failed to enqueue execution command ${cmd.id}: ${err.message}`);
      throw new Error(`DB_SAVE_COMMAND_FAILED: ${err.message}`);
    }
  }

  async getExecutionCommandByIdempotencyKey(key: string): Promise<PendingCommandRecord | null> {
    const res = await this.query(`SELECT * FROM execution_commands WHERE idempotency_key = $1`, [key]);
    return res.rows.length ? this.mapCommandRow(res.rows[0]) : null;
  }

  async getExecutionCommandBySetupId(setupId: string): Promise<PendingCommandRecord | null> {
    const res = await this.query(`SELECT * FROM execution_commands WHERE setup_id = $1`, [setupId]);
    return res.rows.length ? this.mapCommandRow(res.rows[0]) : null;
  }

  async getPendingExecutionCommands(accountNumber?: string): Promise<PendingCommandRecord[]> {
    let queryText = `SELECT * FROM execution_commands WHERE status IN ('PENDING', 'CLAIMED', 'SENT', 'ACKNOWLEDGED')`;
    const params: any[] = [];
    if (accountNumber) {
      queryText += ` AND account_number = $1`;
      params.push(accountNumber);
    }
    queryText += ` ORDER BY created_at ASC`;
    const res = await this.query(queryText, params);
    return res.rows.map(r => this.mapCommandRow(r));
  }

  async updateCommandStatus(id: string, status: string, brokerOrderId?: string, error?: string): Promise<void> {
    const text = `
      UPDATE execution_commands
      SET status = $1,
          broker_order_id = COALESCE($2, broker_order_id),
          error = COALESCE($3, error),
          executed_at = CASE WHEN $1 IN ('EXECUTED', 'EXECUTED_IN_MT5') THEN NOW() ELSE executed_at END,
          updated_at = NOW()
      WHERE id = $4
    `;
    await this.query(text, [status, brokerOrderId || null, error || null, id]);
  }

  // ==========================================
  // ACCOUNT STATE
  // ==========================================
  async getAccountState(accountId: string = 'DEFAULT'): Promise<AccountStateRecord | null> {
    const res = await this.query(`SELECT * FROM account_state WHERE account_id = $1`, [accountId]);
    return res.rows.length ? this.mapAccountRow(res.rows[0]) : null;
  }

  async saveAccountState(acc: AccountStateRecord): Promise<AccountStateRecord> {
    const text = `
      INSERT INTO account_state (account_id, is_auto_enabled, balance, initial_capital, risk_percent, latest_ai_rule, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (account_id) DO UPDATE SET
        is_auto_enabled = EXCLUDED.is_auto_enabled,
        balance = EXCLUDED.balance,
        initial_capital = EXCLUDED.initial_capital,
        risk_percent = EXCLUDED.risk_percent,
        latest_ai_rule = COALESCE(EXCLUDED.latest_ai_rule, account_state.latest_ai_rule),
        updated_at = NOW()
      RETURNING *;
    `;
    const values = [
      acc.accountId || 'DEFAULT',
      acc.isAutoEnabled ?? false,
      acc.balance,
      acc.initialCapital,
      acc.riskPercent || 1.0,
      acc.latestAiRule || null
    ];

    try {
      const res = await this.query(text, values);
      return this.mapAccountRow(res.rows[0]);
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to save account state: ${err.message}`);
      throw new Error(`DB_SAVE_ACCOUNT_STATE_FAILED: ${err.message}`);
    }
  }

  // ==========================================
  // POST MORTEM REVIEWS PERSISTENCE
  // ==========================================
  async savePostMortemReview(
    idOrObj: string | { id: string; tradeId: string; learningVersion?: string; review: any },
    tradeIdParam?: string,
    reviewParam?: any,
    learningVersionParam?: string
  ): Promise<any> {
    let id: string;
    let tradeId: string;
    let reviewObj: any;
    let learningVersion: string;

    if (typeof idOrObj === 'object' && idOrObj !== null) {
      id = idOrObj.id;
      tradeId = idOrObj.tradeId;
      reviewObj = idOrObj.review || idOrObj;
      learningVersion = idOrObj.learningVersion || (reviewObj && reviewObj.learningVersion) || '1.0';
    } else {
      id = idOrObj as string;
      tradeId = tradeIdParam || (reviewParam && reviewParam.tradeId) || id;
      reviewObj = reviewParam;
      learningVersion = learningVersionParam || (reviewObj && reviewObj.learningVersion) || '1.0';
    }

    const text = `
      INSERT INTO post_mortem_reviews (id, trade_id, learning_version, review, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (trade_id, learning_version) DO UPDATE SET review = EXCLUDED.review
      RETURNING *;
    `;
    let res: any;
    try {
      res = await this.query(text, [id, tradeId, learningVersion, JSON.stringify(reviewObj)]);
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to save post-mortem review for trade ${tradeId}: ${err.message}`);
      throw new Error(`PERSISTENCE_ERROR: Failed to save post-mortem review: ${err.message}`);
    }
    const row = res.rows[0];
    if (!row) {
      throw new Error(`PERSISTENCE_ERROR: PostgreSQL did not return a row for post_mortem_reviews insert (trade_id=${tradeId})`);
    }
    return typeof row.review === 'string' ? JSON.parse(row.review) : row.review;
  }

  async getPostMortemByTradeAndVersion(tradeId: string, learningVersion: string = '1.0'): Promise<any | null> {
    const res = await this.query(
      `SELECT * FROM post_mortem_reviews WHERE trade_id = $1 AND learning_version = $2 LIMIT 1`,
      [tradeId, learningVersion]
    );
    if (!res.rows.length) return null;
    const r = res.rows[0];
    return typeof r.review === 'string' ? JSON.parse(r.review) : r.review;
  }

  async getPostMortemReviews(limit: number = 50): Promise<any[]> {
    const res = await this.query(`SELECT * FROM post_mortem_reviews ORDER BY created_at DESC LIMIT $1`, [limit]);
    return res.rows.map(r => typeof r.review === 'string' ? JSON.parse(r.review) : r.review);
  }

  // ==========================================
  // AUDIT LOGS
  // ==========================================
  async saveTradingLog(log: TradingLogRecord): Promise<void> {
    const text = `
      INSERT INTO trading_logs (id, account_id, timestamp, text, type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING;
    `;
    const values = [
      log.id,
      log.accountId || 'DEFAULT',
      log.timestamp || new Date(),
      log.text,
      log.type || 'INFO'
    ];
    await this.query(text, values);
  }

  async getRecentLogs(accountId: string = 'DEFAULT', limit: number = 50): Promise<TradingLogRecord[]> {
    const res = await this.query(
      `SELECT * FROM trading_logs WHERE account_id = $1 ORDER BY timestamp DESC LIMIT $2`,
      [accountId, limit]
    );
    return res.rows.map(r => ({
      id: r.id,
      accountId: r.account_id,
      timestamp: new Date(r.timestamp),
      text: r.text,
      type: r.type
    }));
  }

  // ==========================================
  // RESTART RECOVERY / REHYDRATION
  // ==========================================
  async rehydrateTradingState(accountId: string = 'DEFAULT'): Promise<RehydratedTradingState> {
    logger.info(`[DB-REPOSITORY] Rehydrating authoritative trading state from PostgreSQL for account ${accountId}...`);

    let accState = await this.getAccountState(accountId);
    if (!accState) {
      accState = {
        accountId,
        isAutoEnabled: false,
        balance: 10000.00,
        initialCapital: 10000.00,
        riskPercent: 1.00
      };
      await this.saveAccountState(accState);
    }

    const openPositions = await this.getOpenPositions(accountId);
    const closedPositions = await this.getClosedPositions(accountId, 50);
    const pendingCommands = await this.getPendingExecutionCommands();
    const activeSignals = await this.getActiveSignals();
    const recentLogs = await this.getRecentLogs(accountId, 50);
    const pmReviews = await this.getPostMortemReviews(50);

    return {
      accountState: accState,
      openPositions,
      closedPositions,
      pendingCommands,
      activeSignals,
      recentLogs,
      postMortemReviews: pmReviews
    };
  }

  // ==========================================
  // ROW MAPPERS
  // ==========================================
  private mapSignalRow(r: any): SignalRecord {
    return {
      id: r.id,
      symbol: r.symbol,
      timeframe: r.timeframe,
      direction: r.direction,
      entryPrice: parseFloat(r.entry_price),
      stopLoss: parseFloat(r.stop_loss),
      takeProfit1: parseFloat(r.take_profit_1),
      takeProfit2: r.take_profit_2 ? parseFloat(r.take_profit_2) : 0,
      setupType: r.setup_type,
      confidence: r.confidence ? parseFloat(r.confidence) : undefined,
      reasoning: r.reasoning,
      status: r.status,
      dataClass: r.data_class,
      provider: r.provider,
      source: r.source,
      marketTimestamp: r.market_timestamp ? parseInt(r.market_timestamp, 10) : undefined,
      executable: r.executable,
      strategy: r.strategy,
      createdAt: r.created_at ? new Date(r.created_at) : undefined,
      updatedAt: r.updated_at ? new Date(r.updated_at) : undefined
    };
  }

  private mapOrderRow(r: any): OrderRecord {
    return {
      orderId: r.order_id,
      proposalId: r.proposal_id,
      approvalId: r.approval_id,
      accountId: r.account_id,
      symbol: r.symbol,
      direction: r.direction,
      quantity: parseFloat(r.quantity),
      orderType: r.order_type,
      price: r.price ? parseFloat(r.price) : undefined,
      stopLoss: r.stop_loss ? parseFloat(r.stop_loss) : undefined,
      takeProfit: r.take_profit ? parseFloat(r.take_profit) : undefined,
      stopPrice: r.stop_price ? parseFloat(r.stop_price) : undefined,
      status: r.status,
      broker: r.broker_id || r.broker,
      brokerOrderId: r.broker_order_id,
      createdAt: r.created_at ? new Date(r.created_at) : undefined,
      filledAt: r.filled_at ? new Date(r.filled_at) : undefined
    };
  }

  private mapPositionRow(r: any): PositionRecord {
    return {
      positionId: r.position_id,
      ticketId: r.ticket_id,
      setupId: r.setup_id,
      accountId: r.account_id,
      symbol: r.symbol,
      timeframe: r.timeframe || 'M15',
      direction: r.direction,
      quantity: parseFloat(r.quantity),
      entryPrice: parseFloat(r.entry_price),
      currentPrice: parseFloat(r.current_price),
      closePrice: r.close_price ? parseFloat(r.close_price) : undefined,
      stopLoss: r.stop_loss ? parseFloat(r.stop_loss) : undefined,
      takeProfit: r.take_profit ? parseFloat(r.take_profit) : undefined,
      takeProfit2: r.take_profit_2 ? parseFloat(r.take_profit_2) : undefined,
      unrealizedProfit: parseFloat(r.unrealized_profit || '0'),
      realizedProfit: parseFloat(r.realized_profit || '0'),
      pnlPips: r.pnl_pips ? parseFloat(r.pnl_pips) : 0,
      commission: r.commission ? parseFloat(r.commission) : 0,
      swap: r.swap ? parseFloat(r.swap) : 0,
      status: r.status,
      closeReason: r.close_reason,
      broker: r.broker || 'PAPER',
      environment: r.environment || 'DEMO',
      proposalId: r.proposal_id,
      approvalId: r.approval_id,
      strategyId: r.strategy_id,
      strategyVersion: r.strategy_version,
      learningVersion: r.learning_version || '1.0',
      brokerOrderId: r.broker_order_id,
      brokerPositionId: r.broker_position_id,
      brokerDealId: r.broker_deal_id,
      reconciliationStatus: r.reconciliation_status || 'MATCHED',
      idempotencyKey: r.idempotency_key,
      openedAt: r.opened_at ? new Date(r.opened_at) : undefined,
      closedAt: r.closed_at ? new Date(r.closed_at) : undefined,
      updatedAt: r.updated_at ? new Date(r.updated_at) : undefined
    };
  }

  private mapPostMortemRow(r: any): PostMortemReviewRecord {
    const review = typeof r.review === 'string' ? JSON.parse(r.review) : r.review;
    return {
      id: r.id,
      tradeId: r.trade_id,
      learningVersion: r.learning_version || '1.0',
      review,
      rootCause: review?.rootCause || review?.review?.rootCause,
      adaptiveActionRecommended: review?.adaptiveActionRecommended || review?.review?.adaptiveActionRecommended,
      adaptiveRuleCreated: review?.adaptiveRuleCreated || review?.review?.adaptiveRuleCreated,
      createdAt: r.created_at ? new Date(r.created_at) : undefined
    };
  }

  // ==========================================
  // PHASE 5G: OUTBOX PATTERN PERSISTENCE
  // ==========================================
  async saveOutboxEvent(evt: OutboxEventRecord, client?: PoolClient): Promise<OutboxEventRecord> {
    const text = `
      INSERT INTO outbox_events (id, event_type, payload, status, retry_count, error, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, published_at = NOW()
      RETURNING *;
    `;
    const res = await this.query(text, [
      evt.id,
      evt.eventType,
      JSON.stringify(evt.payload),
      evt.status || 'PENDING',
      evt.retryCount || 0,
      evt.error || null
    ], client);
    const r = res.rows[0];
    return {
      id: r.id,
      eventType: r.event_type,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      status: r.status,
      retryCount: r.retry_count,
      error: r.error,
      createdAt: r.created_at ? new Date(r.created_at) : undefined,
      publishedAt: r.published_at ? new Date(r.published_at) : undefined
    };
  }

  async getPendingOutboxEvents(): Promise<OutboxEventRecord[]> {
    const res = await this.query(`SELECT * FROM outbox_events WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 100`);
    return res.rows.map(r => ({
      id: r.id,
      eventType: r.event_type,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      status: r.status,
      retryCount: r.retry_count,
      error: r.error,
      createdAt: r.created_at ? new Date(r.created_at) : undefined,
      publishedAt: r.published_at ? new Date(r.published_at) : undefined
    }));
  }

  async markOutboxEventPublished(id: string, client?: PoolClient): Promise<void> {
    await this.query(`UPDATE outbox_events SET status = 'PUBLISHED', published_at = NOW() WHERE id = $1`, [id], client);
  }

  // ==========================================
  // PHASE 5G: WEBHOOK INBOX PERSISTENCE
  // ==========================================
  async saveBrokerWebhookEvent(evt: BrokerWebhookEventRecord, client?: PoolClient): Promise<{ isDuplicate: boolean; record: BrokerWebhookEventRecord }> {
    const text = `
      INSERT INTO broker_webhook_events (event_id, broker, event_type, account_number, order_id, payload, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (event_id) DO NOTHING
      RETURNING *;
    `;
    const values = [
      evt.eventId,
      evt.broker,
      evt.eventType,
      evt.accountNumber || null,
      evt.orderId || null,
      JSON.stringify(evt.payload),
      evt.status || 'RECEIVED'
    ];
    const res = await this.query(text, values, client);
    if (res.rows.length === 0) {
      // Duplicate event
      const existingRes = await this.query(`SELECT * FROM broker_webhook_events WHERE event_id = $1`, [evt.eventId], client);
      const r = existingRes.rows[0];
      return {
        isDuplicate: true,
        record: {
          eventId: r.event_id,
          broker: r.broker,
          eventType: r.event_type,
          accountNumber: r.account_number,
          orderId: r.order_id,
          payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
          status: r.status,
          error: r.error,
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
          processedAt: r.processed_at ? new Date(r.processed_at) : undefined
        }
      };
    }
    const r = res.rows[0];
    return {
      isDuplicate: false,
      record: {
        eventId: r.event_id,
        broker: r.broker,
        eventType: r.event_type,
        accountNumber: r.account_number,
        orderId: r.order_id,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
        status: r.status,
        error: r.error,
        createdAt: r.created_at ? new Date(r.created_at) : undefined,
        processedAt: r.processed_at ? new Date(r.processed_at) : undefined
      }
    };
  }

  async updateBrokerWebhookStatus(eventId: string, status: 'PROCESSED' | 'FAILED', error?: string, client?: PoolClient): Promise<void> {
    await this.query(
      `UPDATE broker_webhook_events SET status = $1, error = $2, processed_at = NOW() WHERE event_id = $3`,
      [status, error || null, eventId],
      client
    );
  }

  async getUnprocessedWebhookEvents(): Promise<BrokerWebhookEventRecord[]> {
    const res = await this.query(`SELECT * FROM broker_webhook_events WHERE status = 'RECEIVED' ORDER BY created_at ASC LIMIT 100`);
    return res.rows.map(r => ({
      eventId: r.event_id,
      broker: r.broker,
      eventType: r.event_type,
      accountNumber: r.account_number,
      orderId: r.order_id,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      status: r.status,
      error: r.error,
      createdAt: r.created_at ? new Date(r.created_at) : undefined,
      processedAt: r.processed_at ? new Date(r.processed_at) : undefined
    }));
  }

  // ==========================================
  // PHASE 5G: EXECUTION AUDIT TRAIL
  // ==========================================
  async saveExecutionAuditLog(log: ExecutionAuditLogRecord, client?: PoolClient): Promise<void> {
    const text = `
      INSERT INTO execution_audit_logs (id, command_id, setup_id, from_status, to_status, actor, details, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
    await this.query(text, [
      log.id,
      log.commandId,
      log.setupId || null,
      log.fromStatus || null,
      log.toStatus,
      log.actor,
      log.details ? JSON.stringify(log.details) : null
    ], client);
  }

  async getExecutionAuditLogs(commandId: string): Promise<ExecutionAuditLogRecord[]> {
    const res = await this.query(`SELECT * FROM execution_audit_logs WHERE command_id = $1 ORDER BY timestamp ASC`, [commandId]);
    return res.rows.map(r => ({
      id: r.id,
      commandId: r.command_id,
      setupId: r.setup_id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      actor: r.actor,
      details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
      timestamp: r.timestamp ? new Date(r.timestamp) : undefined
    }));
  }

  // ==========================================
  // PHASE 5G: RECONCILIATION RECORDS
  // ==========================================
  async saveReconciliationRecord(rec: ReconciliationRecord, client?: PoolClient): Promise<ReconciliationRecord> {
    const text = `
      INSERT INTO reconciliation_records (id, account_id, broker, action, target_id, details, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO NOTHING
      RETURNING *;
    `;
    let res: any;
    try {
      res = await this.query(text, [
        rec.id,
        rec.accountId || 'DEFAULT',
        rec.broker,
        rec.action,
        rec.targetId,
        rec.details ? JSON.stringify(rec.details) : null
      ], client);
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to save reconciliation record ${rec.id}: ${err.message}`);
      throw new Error(`PERSISTENCE_ERROR: Failed to save reconciliation record: ${err.message}`);
    }
    const r = res.rows[0];
    if (!r) {
      throw new Error(`PERSISTENCE_ERROR: PostgreSQL did not return a row for reconciliation_records insert (id=${rec.id})`);
    }
    return {
      id: r.id,
      accountId: r.account_id,
      broker: r.broker,
      action: r.action,
      targetId: r.target_id,
      details: r.details ? (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) : null,
      timestamp: r.timestamp ? new Date(r.timestamp) : new Date()
    };
  }

  // ==========================================
  // PHASE 5G: DURABLE IDEMPOTENCY
  // ==========================================
  async saveIdempotencyRecord(key: string, scope: string, result: any, client?: PoolClient): Promise<void> {
    const text = `
      INSERT INTO idempotency_records (key, scope, result, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (key) DO NOTHING;
    `;
    await this.query(text, [key, scope, JSON.stringify(result)], client);
  }

  async getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
    const res = await this.query(`SELECT * FROM idempotency_records WHERE key = $1`, [key]);
    if (!res.rows.length) return null;
    const r = res.rows[0];
    return {
      key: r.key,
      scope: r.scope,
      result: typeof r.result === 'string' ? JSON.parse(r.result) : r.result,
      createdAt: r.created_at ? new Date(r.created_at) : undefined
    };
  }

  private mapCommandRow(r: any): PendingCommandRecord {
    return {
      id: r.id,
      setupId: r.setup_id,
      symbol: r.symbol,
      side: r.side,
      volume: parseFloat(r.volume),
      entryPrice: parseFloat(r.entry_price),
      stopLoss: parseFloat(r.stop_loss),
      takeProfit1: parseFloat(r.take_profit_1),
      takeProfit2: r.take_profit_2 ? parseFloat(r.take_profit_2) : 0,
      broker: r.broker,
      accountNumber: r.account_number,
      environment: r.environment,
      status: r.status,
      dataClass: r.data_class,
      provider: r.provider,
      timeframe: r.timeframe,
      idempotencyKey: r.idempotency_key,
      brokerOrderId: r.broker_order_id,
      claimedBy: r.claimed_by,
      leaseExpiry: r.lease_expiry ? new Date(r.lease_expiry) : undefined,
      error: r.error,
      metadata: r.metadata
    };
  }

  private mapAccountRow(r: any): AccountStateRecord {
    return {
      accountId: r.account_id,
      isAutoEnabled: r.is_auto_enabled,
      balance: parseFloat(r.balance),
      initialCapital: parseFloat(r.initial_capital),
      riskPercent: parseFloat(r.risk_percent),
      latestAiRule: r.latest_ai_rule,
      updatedAt: r.updated_at ? new Date(r.updated_at) : undefined
    };
  }

  // ==========================================
  // PHASE 3: ADMIN DATA GOVERNANCE & HEALTH
  // ==========================================

  async getAdminTrades(filters: {
    startDate?: string;
    endDate?: string;
    accountId?: string;
    symbol?: string;
    direction?: string;
    strategy?: string;
    strategyVersion?: string;
    outcome?: 'WIN' | 'LOSS';
    status?: 'OPEN' | 'CLOSED';
    environment?: string;
    broker?: string;
    minPnl?: number;
    maxPnl?: number;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ trades: PositionRecord[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let idx = 1;

    if (filters.accountId) {
      conditions.push(`account_id = ${idx++}`);
      params.push(filters.accountId);
    }
    if (filters.symbol) {
      conditions.push(`symbol = ${idx++}`);
      params.push(filters.symbol);
    }
    if (filters.direction) {
      conditions.push(`direction = ${idx++}`);
      params.push(filters.direction.toUpperCase());
    }
    if (filters.strategy) {
      conditions.push(`(strategy_id = ${idx} OR proposal_id = ${idx})`);
      params.push(filters.strategy);
      idx++;
    }
    if (filters.strategyVersion) {
      conditions.push(`strategy_version = ${idx++}`);
      params.push(filters.strategyVersion);
    }
    if (filters.status) {
      conditions.push(`status = ${idx++}`);
      params.push(filters.status.toUpperCase());
    }
    if (filters.environment) {
      conditions.push(`environment = ${idx++}`);
      params.push(filters.environment.toUpperCase());
    }
    if (filters.broker) {
      conditions.push(`broker = ${idx++}`);
      params.push(filters.broker);
    }
    if (filters.outcome) {
      if (filters.outcome === 'WIN') {
        conditions.push(`realized_profit >= 0 AND status = 'CLOSED'`);
      } else {
        conditions.push(`realized_profit < 0 AND status = 'CLOSED'`);
      }
    }
    if (filters.startDate) {
      conditions.push(`opened_at >= ${idx++}`);
      params.push(new Date(filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(`opened_at <= ${idx++}`);
      params.push(new Date(filters.endDate));
    }
    if (filters.minPnl !== undefined) {
      conditions.push(`realized_profit >= ${idx++}`);
      params.push(filters.minPnl);
    }
    if (filters.maxPnl !== undefined) {
      conditions.push(`realized_profit <= ${idx++}`);
      params.push(filters.maxPnl);
    }
    if (filters.search) {
      conditions.push(`(
        position_id ILIKE ${idx} OR
        symbol ILIKE ${idx} OR
        broker ILIKE ${idx} OR
        strategy_id ILIKE ${idx} OR
        idempotency_key ILIKE ${idx}
      )`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const whereSql = conditions.join(' AND ');

    try {
      const countRes = await this.query(`SELECT COUNT(*)::int as total FROM positions WHERE ${whereSql}`, params);
      const total = countRes.rows[0]?.total || 0;

      const dataParams = [...params, limit, offset];
      const dataRes = await this.query(
        `SELECT * FROM positions WHERE ${whereSql} ORDER BY opened_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        dataParams
      );

      const trades = dataRes.rows.map(r => this.mapPositionRow(r));
      const totalPages = Math.ceil(total / limit) || 1;

      return { trades, total, page, totalPages };
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to get detailed trades: ${err.message}`);
      throw new Error(`DATABASE_ERROR: Failed to get detailed trades: ${err.message}`);
    }
  }

  async getAdminTradeDetail(tradeId: string): Promise<{
    position: PositionRecord | null;
    events: TradeEventRecord[];
    postMortem: PostMortemReviewRecord | null;
  }> {
    const posRes = await this.query(`SELECT * FROM positions WHERE position_id = $1 OR setup_id = $1`, [tradeId]);
    const position = posRes.rows.length ? this.mapPositionRow(posRes.rows[0]) : null;

    const eventsRes = await this.query(
      `SELECT * FROM trade_events WHERE trade_id = $1 OR setup_id = $1 ORDER BY timestamp ASC`,
      [tradeId]
    );
    const events = eventsRes.rows.map(r => ({
      id: r.id,
      tradeId: r.trade_id,
      orderId: r.order_id,
      setupId: r.setup_id,
      eventType: r.event_type,
      actor: r.actor,
      details: r.details ? (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) : null,
      timestamp: r.timestamp ? new Date(r.timestamp) : undefined
    }));

    const pmRes = await this.query(`SELECT * FROM post_mortem_reviews WHERE trade_id = $1`, [tradeId]);
    const postMortem = pmRes.rows.length ? this.mapPostMortemRow(pmRes.rows[0]) : null;

    return { position, events, postMortem };
  }

  async getAdminPerformance(accountId: string = 'DEFAULT'): Promise<{
    totalTrades: number;
    winCount: number;
    lossCount: number;
    winRatePercent: number;
    totalPnlDollars: number;
    totalPnlPips: number;
    profitFactor: number;
    bestPair: { pair: string; winRatePercent: number; netPnlDollars: number };
    worstPair: { pair: string; winRatePercent: number; netPnlDollars: number };
    pairPerformance: Array<{ symbol: string; totalTrades: number; winRatePercent: number; netPnlDollars: number }>;
    strategyPerformance: Array<{ strategyId: string; totalTrades: number; winRatePercent: number; netPnlDollars: number }>;
  }> {
    const summaryRes = await this.query(`
      SELECT
        COUNT(*)::int as total_trades,
        COUNT(CASE WHEN realized_profit >= 0 THEN 1 END)::int as win_count,
        COUNT(CASE WHEN realized_profit < 0 THEN 1 END)::int as loss_count,
        COALESCE(SUM(realized_profit), 0)::float as total_pnl_dollars,
        COALESCE(SUM(pnl_pips), 0)::float as total_pnl_pips,
        COALESCE(SUM(CASE WHEN realized_profit > 0 THEN realized_profit ELSE 0 END), 0)::float as gross_profit,
        COALESCE(ABS(SUM(CASE WHEN realized_profit < 0 THEN realized_profit ELSE 0 END)), 0)::float as gross_loss
      FROM positions
      WHERE status = 'CLOSED' AND (account_id = $1 OR $1 = 'ALL')
    `, [accountId]);

    const s = summaryRes.rows[0] || {};
    const totalTrades = s.total_trades || 0;
    const winCount = s.win_count || 0;
    const lossCount = s.loss_count || 0;
    const totalPnlDollars = parseFloat((s.total_pnl_dollars || 0).toFixed(2));
    const totalPnlPips = parseFloat((s.total_pnl_pips || 0).toFixed(2));
    const winRatePercent = totalTrades > 0 ? parseFloat(((winCount / totalTrades) * 100).toFixed(2)) : 0;
    const grossProfit = s.gross_profit || 0;
    const grossLoss = s.gross_loss || 0;
    const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99.99 : 1.0);

    // Pair breakdown
    const pairsRes = await this.query(`
      SELECT
        symbol,
        COUNT(*)::int as total_trades,
        COUNT(CASE WHEN realized_profit >= 0 THEN 1 END)::int as win_count,
        COALESCE(SUM(realized_profit), 0)::float as net_pnl
      FROM positions
      WHERE status = 'CLOSED' AND (account_id = $1 OR $1 = 'ALL')
      GROUP BY symbol
      ORDER BY net_pnl DESC
    `, [accountId]);

    const pairPerformance = pairsRes.rows.map(r => ({
      symbol: r.symbol,
      totalTrades: r.total_trades,
      winRatePercent: r.total_trades > 0 ? parseFloat(((r.win_count / r.total_trades) * 100).toFixed(2)) : 0,
      netPnlDollars: parseFloat((r.net_pnl || 0).toFixed(2))
    }));

    const bestPair = pairPerformance.length > 0 ? {
      pair: pairPerformance[0].symbol,
      winRatePercent: pairPerformance[0].winRatePercent,
      netPnlDollars: pairPerformance[0].netPnlDollars
    } : { pair: 'N/A', winRatePercent: 0, netPnlDollars: 0 };

    const worstPair = pairPerformance.length > 0 ? {
      pair: pairPerformance[pairPerformance.length - 1].symbol,
      winRatePercent: pairPerformance[pairPerformance.length - 1].winRatePercent,
      netPnlDollars: pairPerformance[pairPerformance.length - 1].netPnlDollars
    } : { pair: 'N/A', winRatePercent: 0, netPnlDollars: 0 };

    // Strategy breakdown
    const stratRes = await this.query(`
      SELECT
        COALESCE(strategy_id, 'QUANTUM_SMC_HYBRID') as strategy_id,
        COUNT(*)::int as total_trades,
        COUNT(CASE WHEN realized_profit >= 0 THEN 1 END)::int as win_count,
        COALESCE(SUM(realized_profit), 0)::float as net_pnl
      FROM positions
      WHERE status = 'CLOSED' AND (account_id = $1 OR $1 = 'ALL')
      GROUP BY COALESCE(strategy_id, 'QUANTUM_SMC_HYBRID')
      ORDER BY net_pnl DESC
    `, [accountId]);

    const strategyPerformance = stratRes.rows.map(r => ({
      strategyId: r.strategy_id,
      totalTrades: r.total_trades,
      winRatePercent: r.total_trades > 0 ? parseFloat(((r.win_count / r.total_trades) * 100).toFixed(2)) : 0,
      netPnlDollars: parseFloat((r.net_pnl || 0).toFixed(2))
    }));

    return {
      totalTrades,
      winCount,
      lossCount,
      winRatePercent,
      totalPnlDollars,
      totalPnlPips,
      profitFactor,
      bestPair,
      worstPair,
      pairPerformance,
      strategyPerformance
    };
  }

  async getAdminLearningRecords(limit: number = 20, offset: number = 0): Promise<{
    learningRecords: PostMortemReviewRecord[];
    total: number;
  }> {
    const countRes = await this.query(`SELECT COUNT(*)::int as total FROM post_mortem_reviews`);
    const total = countRes.rows[0]?.total || 0;

    const dataRes = await this.query(
      `SELECT * FROM post_mortem_reviews ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const learningRecords = dataRes.rows.map(r => this.mapPostMortemRow(r));
    return { learningRecords, total };
  }

  async updateBrokerPositionIds(params: {
    positionId?: string;
    setupId?: string;
    proposalId?: string;
    idempotencyKey?: string;
    ticketId?: string;
    brokerOrderId?: string;
    brokerPositionId?: string;
    brokerDealId?: string;
  }): Promise<{ updated: boolean; position?: PositionRecord }> {
    const isConnected = await checkDbConnection();
    if (!isConnected) return { updated: false };

    const targetId = params.positionId || params.setupId || params.proposalId || params.idempotencyKey || params.ticketId;
    if (!targetId) return { updated: false };

    const text = `
      UPDATE positions
      SET
        broker_order_id = COALESCE($1, broker_order_id),
        broker_position_id = COALESCE($2, broker_position_id),
        broker_deal_id = COALESCE($3, broker_deal_id),
        reconciliation_status = CASE 
          WHEN broker = 'PAPER' THEN 'MATCHED'
          WHEN COALESCE($1, broker_order_id) IS NOT NULL OR COALESCE($2, broker_position_id) IS NOT NULL THEN 'MATCHED'
          ELSE 'MISMATCH'
        END,
        updated_at = NOW()
      WHERE position_id = $4
         OR setup_id = $4
         OR proposal_id = $4
         OR idempotency_key = $4
         OR ticket_id = $4
      RETURNING *;
    `;
    try {
      const res = await this.query(text, [
        params.brokerOrderId || null,
        params.brokerPositionId || null,
        params.brokerDealId || null,
        targetId
      ]);
      if (res.rows.length > 0) {
        return { updated: true, position: this.mapPositionRow(res.rows[0]) };
      }
      // No matching row found — position does not exist
      return { updated: false };
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to update broker position IDs for ${targetId}: ${err.message}`);
      throw new Error(`PERSISTENCE_ERROR: Failed to update broker position IDs: ${err.message}`);
    }
  }

  async getAdminDataHealth(): Promise<any> {
    const isConnected = await checkDbConnection();
    if (!isConnected) {
      return {
        dbConnection: 'DATABASE_UNAVAILABLE',
        persistenceStatus: 'PERSISTENCE_UNAVAILABLE',
        healthStatus: 'DATABASE_UNAVAILABLE',
        latestTrade: null,
        latestTradeEvent: null,
        totalTrades: 0,
        openPositions: 0,
        closedTrades: 0,
        learningRecordsCount: 0,
        lastDatabaseWrite: null,
        anomalies: {
          duplicateTradesCount: 0,
          orphanPositionsCount: 0,
          orphanLearningRecordsCount: 0,
          missingTradeEventsCount: 0,
          missingBrokerIdsCount: 0,
          reconciliationMismatchesCount: 0
        }
      };
    }

    try {
      const posCountRes = await this.query(`
        SELECT
          COUNT(*)::int as total_trades,
          COUNT(CASE WHEN status = 'OPEN' THEN 1 END)::int as open_positions,
          COUNT(CASE WHEN status = 'CLOSED' THEN 1 END)::int as closed_trades
        FROM positions
      `);

      const totalTrades = posCountRes.rows[0]?.total_trades || 0;
      const openPositions = posCountRes.rows[0]?.open_positions || 0;
      const closedTrades = posCountRes.rows[0]?.closed_trades || 0;

      const pmCountRes = await this.query(`SELECT COUNT(*)::int as total FROM post_mortem_reviews`);
      const learningRecordsCount = pmCountRes.rows[0]?.total || 0;

      const latestTradeRes = await this.query(`SELECT * FROM positions ORDER BY updated_at DESC LIMIT 1`);
      const latestTrade = latestTradeRes.rows.length ? this.mapPositionRow(latestTradeRes.rows[0]) : null;

      const latestEventRes = await this.query(`SELECT * FROM trade_events ORDER BY timestamp DESC LIMIT 1`);
      const latestTradeEvent = latestEventRes.rows.length ? {
        id: latestEventRes.rows[0].id,
        tradeId: latestEventRes.rows[0].trade_id,
        orderId: latestEventRes.rows[0].order_id,
        setupId: latestEventRes.rows[0].setup_id,
        eventType: latestEventRes.rows[0].event_type,
        actor: latestEventRes.rows[0].actor,
        details: latestEventRes.rows[0].details,
        timestamp: latestEventRes.rows[0].timestamp ? new Date(latestEventRes.rows[0].timestamp) : undefined
      } : null;

      const lastDatabaseWrite = latestTrade?.updatedAt || latestTradeEvent?.timestamp || new Date();

      // Anomaly checks
      const dupRes = await this.query(`
        SELECT idempotency_key, COUNT(*)::int as cnt
        FROM positions
        WHERE idempotency_key IS NOT NULL
        GROUP BY idempotency_key
        HAVING COUNT(*) > 1
      `);
      const duplicateTradesCount = dupRes.rows.length;

      const orphanPosRes = await this.query(`
        SELECT p.position_id
        FROM positions p
        LEFT JOIN trade_events e ON p.position_id = e.trade_id OR p.setup_id = e.setup_id
        WHERE e.id IS NULL
      `);
      const orphanPositionsCount = orphanPosRes.rows.length;

      const orphanPmRes = await this.query(`
        SELECT pm.id
        FROM post_mortem_reviews pm
        LEFT JOIN positions p ON pm.trade_id = p.position_id OR pm.trade_id = p.setup_id
        WHERE p.position_id IS NULL
      `);
      const orphanLearningRecordsCount = orphanPmRes.rows.length;

      const missingEventsRes = await this.query(`
        SELECT p.position_id
        FROM positions p
        LEFT JOIN trade_events e ON (p.position_id = e.trade_id AND e.event_type IN ('POSITION_OPENED', 'TRADE_OPENED', 'TRADE_CLOSED'))
        WHERE e.id IS NULL
      `);
      const missingTradeEventsCount = missingEventsRes.rows.length;

      const missingBrokerRes = await this.query(`
        SELECT position_id
        FROM positions
        WHERE status = 'CLOSED' AND broker != 'PAPER' AND (broker_order_id IS NULL AND broker_position_id IS NULL)
      `);
      const missingBrokerIdsCount = missingBrokerRes.rows.length;

      const mismatchesRes = await this.query(`
        SELECT COUNT(*)::int as cnt
        FROM positions
        WHERE reconciliation_status = 'MISMATCH'
      `);
      const reconciliationMismatchesCount = mismatchesRes.rows[0]?.cnt || 0;

      const hasAnomalies = duplicateTradesCount > 0 || orphanPositionsCount > 0 || reconciliationMismatchesCount > 0;
      const dbConnection = hasAnomalies ? 'DATA_INTEGRITY_ERROR' : 'DATABASE_CONNECTED';

      return {
        dbConnection,
        latestTrade,
        latestTradeEvent,
        totalTrades,
        openPositions,
        closedTrades,
        learningRecordsCount,
        lastDatabaseWrite,
        persistenceStatus: 'ACTIVE_POSTGRESQL_PERSISTENT',
        anomalies: {
          duplicateTradesCount,
          orphanPositionsCount,
          orphanLearningRecordsCount,
          missingTradeEventsCount,
          missingBrokerIdsCount,
          reconciliationMismatchesCount
        }
      };
    } catch (err: any) {
      return {
        dbConnection: 'DATABASE_UNAVAILABLE',
        persistenceStatus: 'PERSISTENCE_UNAVAILABLE',
        healthStatus: 'DATABASE_UNAVAILABLE',
        error: err.message,
        latestTrade: null,
        latestTradeEvent: null,
        totalTrades: 0,
        openPositions: 0,
        closedTrades: 0,
        learningRecordsCount: 0,
        lastDatabaseWrite: null,
        anomalies: {
          duplicateTradesCount: 0,
          orphanPositionsCount: 0,
          orphanLearningRecordsCount: 0,
          missingTradeEventsCount: 0,
          missingBrokerIdsCount: 0,
          reconciliationMismatchesCount: 0
        }
      };
    }
  }

  async reconcileBrokerPositions(broker: string = 'PAPER'): Promise<{
    reconciledCount: number;
    matchedCount: number;
    mismatchCount: number;
    pendingCount: number;
    unknownCount: number;
  }> {
    const isConnected = await checkDbConnection();
    if (!isConnected) {
      return { reconciledCount: 0, matchedCount: 0, mismatchCount: 0, pendingCount: 0, unknownCount: 0 };
    }

    const openRes = await this.query(`SELECT * FROM positions WHERE status = 'OPEN' AND (broker = $1 OR $1 = 'ALL')`, [broker]);
    let matchedCount = 0;
    let mismatchCount = 0;
    let pendingCount = 0;
    let unknownCount = 0;

    for (const row of openRes.rows) {
      const pos = this.mapPositionRow(row);
      let status: 'MATCHED' | 'MISMATCH' | 'PENDING' | 'UNKNOWN' = 'UNKNOWN';

      if (!pos.positionId || pos.entryPrice <= 0 || pos.quantity <= 0) {
        status = 'MISMATCH';
      } else if (pos.broker === 'PAPER') {
        status = 'MATCHED';
      } else {
        const hasBrokerId = !!(pos.brokerOrderId || pos.brokerPositionId || pos.brokerDealId);
        const ageMs = pos.openedAt ? Date.now() - new Date(pos.openedAt).getTime() : 0;

        if (hasBrokerId) {
          status = 'MATCHED';
        } else if (ageMs < 30000) {
          status = 'PENDING';
        } else {
          status = 'MISMATCH';
        }
      }

      if (status === 'MATCHED') matchedCount++;
      else if (status === 'MISMATCH') mismatchCount++;
      else if (status === 'PENDING') pendingCount++;
      else unknownCount++;

      await this.query(`UPDATE positions SET reconciliation_status = $1, updated_at = NOW() WHERE position_id = $2`, [status, pos.positionId]);

      await this.query(`
        INSERT INTO reconciliation_records (id, account_id, broker, action, target_id, details, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        pos.accountId,
        pos.broker || broker,
        'POSITION_RECONCILED',
        pos.positionId,
        JSON.stringify({ status, symbol: pos.symbol, entryPrice: pos.entryPrice, brokerOrderId: pos.brokerOrderId, brokerPositionId: pos.brokerPositionId })
      ]);
    }

    return {
      reconciledCount: openRes.rows.length,
      matchedCount,
      mismatchCount,
      pendingCount,
      unknownCount
    };
  }

  async exportAdminTradesCsv(filters: any): Promise<string> {
    const { trades } = await this.getAdminTrades({ ...filters, limit: 5000, page: 1 });
    const headers = [
      'Trade ID', 'Account ID', 'Broker', 'Environment', 'Symbol', 'Timeframe',
      'Direction', 'Volume', 'Entry Price', 'Exit Price', 'Stop Loss', 'Take Profit 1',
      'Take Profit 2', 'PnL ($)', 'PnL (pips)', 'Commission', 'Swap', 'Opened At',
      'Closed At', 'Status', 'Proposal ID', 'Approval ID', 'Strategy ID', 'Strategy Version',
      'Learning Version', 'Broker Order ID', 'Broker Position ID', 'Reconciliation Status', 'Idempotency Key'
    ];

    const rows = trades.map(t => [
      t.positionId,
      t.accountId,
      t.broker || 'PAPER',
      t.environment || 'DEMO',
      t.symbol,
      t.timeframe || 'M15',
      t.direction,
      t.quantity,
      t.entryPrice,
      t.closePrice ?? '',
      t.stopLoss ?? '',
      t.takeProfit ?? '',
      t.takeProfit2 ?? '',
      t.realizedProfit ?? 0,
      t.pnlPips ?? 0,
      t.commission ?? 0,
      t.swap ?? 0,
      t.openedAt ? t.openedAt.toISOString() : '',
      t.closedAt ? t.closedAt.toISOString() : '',
      t.status,
      t.proposalId ?? '',
      t.approvalId ?? '',
      t.strategyId ?? '',
      t.strategyVersion ?? '',
      t.learningVersion ?? '1.0',
      t.brokerOrderId ?? '',
      t.brokerPositionId ?? '',
      t.reconciliationStatus ?? 'MATCHED',
      t.idempotencyKey ?? ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    return [headers.join(','), ...rows].join('\n');
  }
}



