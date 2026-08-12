import { Pool, PoolClient } from 'pg';
import { getDbPool } from './index';
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
  direction: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  closePrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  unrealizedProfit?: number;
  realizedProfit?: number;
  status: 'OPEN' | 'CLOSED';
  closeReason?: string;
  broker?: string;
  openedAt?: Date;
  closedAt?: Date;
  updatedAt?: Date;
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
        position_id, ticket_id, setup_id, account_id, symbol, direction, quantity,
        entry_price, current_price, close_price, stop_loss, take_profit,
        unrealized_profit, realized_profit, status, close_reason, broker,
        opened_at, closed_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
      ON CONFLICT (position_id) DO UPDATE SET
        current_price = EXCLUDED.current_price,
        close_price = EXCLUDED.close_price,
        unrealized_profit = EXCLUDED.unrealized_profit,
        realized_profit = EXCLUDED.realized_profit,
        status = EXCLUDED.status,
        close_reason = EXCLUDED.close_reason,
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
      pos.direction,
      pos.quantity,
      pos.entryPrice,
      pos.currentPrice,
      pos.closePrice || null,
      pos.stopLoss || null,
      pos.takeProfit || null,
      pos.unrealizedProfit || 0,
      pos.realizedProfit || 0,
      pos.status,
      pos.closeReason || null,
      pos.broker || 'PAPER',
      pos.openedAt || new Date(),
      pos.closedAt || null
    ];

    try {
      const res = await this.query(text, values, client);
      return this.mapPositionRow(res.rows[0]);
    } catch (err: any) {
      logger.error(`[DB-REPOSITORY] Failed to save position ${pos.positionId}: ${err.message}`);
      throw new Error(`DB_SAVE_POSITION_FAILED: ${err.message}`);
    }
  }

  async getOpenPositions(accountId: string = 'DEFAULT'): Promise<PositionRecord[]> {
    const res = await this.query(
      `SELECT * FROM positions WHERE account_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC`,
      [accountId]
    );
    return res.rows.map(r => this.mapPositionRow(r));
  }

  async getClosedPositions(accountId: string = 'DEFAULT', limit: number = 100): Promise<PositionRecord[]> {
    const res = await this.query(
      `SELECT * FROM positions WHERE account_id = $1 AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT $2`,
      [accountId, limit]
    );
    return res.rows.map(r => this.mapPositionRow(r));
  }

  /**
   * Transactional Position Close:
   * Atomically closes a position record and updates the account balance.
   */
  async closePositionTransaction(params: {
    positionId: string;
    closePrice: number;
    realizedProfit: number;
    closeReason: string;
    accountId?: string;
  }): Promise<{ position: PositionRecord; newBalance: number }> {
    const accountId = params.accountId || 'DEFAULT';
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Fetch position
      const posRes = await client.query(`SELECT * FROM positions WHERE position_id = $1 FOR UPDATE`, [params.positionId]);
      if (!posRes.rows.length) {
        throw new Error(`POSITION_NOT_FOUND: ${params.positionId}`);
      }

      // 2. Update position
      const updatePosRes = await client.query(`
        UPDATE positions
        SET status = 'CLOSED',
            close_price = $1,
            realized_profit = $2,
            close_reason = $3,
            closed_at = NOW(),
            updated_at = NOW()
        WHERE position_id = $4
        RETURNING *;
      `, [params.closePrice, params.realizedProfit, params.closeReason, params.positionId]);

      const updatedPosition = this.mapPositionRow(updatePosRes.rows[0]);

      // 3. Update account_state balance
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
      await client.query('ROLLBACK');
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
  async savePostMortemReview(id: string, tradeId: string, review: any): Promise<void> {
    const text = `
      INSERT INTO post_mortem_reviews (id, trade_id, review, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (id) DO UPDATE SET review = EXCLUDED.review;
    `;
    await this.query(text, [id, tradeId, JSON.stringify(review)]);
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
      direction: r.direction,
      quantity: parseFloat(r.quantity),
      entryPrice: parseFloat(r.entry_price),
      currentPrice: parseFloat(r.current_price),
      closePrice: r.close_price ? parseFloat(r.close_price) : undefined,
      stopLoss: r.stop_loss ? parseFloat(r.stop_loss) : undefined,
      takeProfit: r.take_profit ? parseFloat(r.take_profit) : undefined,
      unrealizedProfit: parseFloat(r.unrealized_profit || '0'),
      realizedProfit: parseFloat(r.realized_profit || '0'),
      status: r.status,
      closeReason: r.close_reason,
      broker: r.broker,
      openedAt: r.opened_at ? new Date(r.opened_at) : undefined,
      closedAt: r.closed_at ? new Date(r.closed_at) : undefined,
      updatedAt: r.updated_at ? new Date(r.updated_at) : undefined
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
    const res = await this.query(text, [
      rec.id,
      rec.accountId || 'DEFAULT',
      rec.broker,
      rec.action,
      rec.targetId,
      rec.details ? JSON.stringify(rec.details) : null
    ], client);
    const r = res.rows[0] || rec;
    return {
      id: r.id || rec.id,
      accountId: r.account_id || rec.accountId,
      broker: r.broker || rec.broker,
      action: r.action || rec.action,
      targetId: r.target_id || rec.targetId,
      details: r.details ? (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) : rec.details,
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
}
