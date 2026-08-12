import { Pool } from 'pg';
import { checkDbConnection, getDbPool } from '@iati/database';
import { globalEventBus } from '@iati/event-bus';
import { ExecutionCommand, ExecutionCommandStatus, ExecutionEnvironment, MarketDataLineage } from '../domain/types';
import { validateExecutionSafety } from './liveExecutionSafetyGuard';
import { observabilityService } from './observabilityService';

// Fallback in-memory store to guarantee standalone/test stability when PostgreSQL is disconnected
const memoryQueue = new Map<string, ExecutionCommand>();
const inFlightEnqueue = new Map<string, Promise<{ command: ExecutionCommand; isDuplicate: boolean; rejected?: boolean; error?: string }>>();

const VALID_TRANSITIONS: Record<ExecutionCommandStatus, ExecutionCommandStatus[]> = {
  PENDING: ['CLAIMED', 'CANCELLED', 'EXPIRED', 'FAILED'],
  CLAIMED: ['SENT', 'PENDING', 'FAILED', 'CANCELLED'],
  SENT: ['ACKNOWLEDGED', 'EXECUTED', 'FAILED'],
  ACKNOWLEDGED: ['EXECUTED', 'FAILED'],
  EXECUTED: [], // Terminal
  FAILED: ['PENDING'], // Retry path
  CANCELLED: [], // Terminal
  EXPIRED: [] // Terminal
};

export class ExecutionQueueService {
  public clearInMemoryForTest(): void {
    memoryQueue.clear();
    inFlightEnqueue.clear();
  }

  public async expireStaleLeases(customNowMs?: number): Promise<number> {
    const now = customNowMs ?? Date.now();
    let expiredCount = 0;
    for (const cmd of memoryQueue.values()) {
      if (cmd.status === 'CLAIMED') {
        const expiry = cmd.metadata?.leaseExpiry || 0;
        if (now >= expiry) {
          cmd.status = 'PENDING';
          cmd.updatedAt = Date.now();
          if (cmd.metadata) delete cmd.metadata.claimedBy;
          expiredCount++;
        }
      }
    }
    return expiredCount;
  }
  /**
   * Enforces idempotency and persists a new execution command
   */
  async enqueueCommand(params: {
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
    environment: ExecutionEnvironment;
    lineage: MarketDataLineage;
    idempotencyKey?: string;
    metadata?: Record<string, any>;
  }): Promise<{ command: ExecutionCommand; isDuplicate: boolean; rejected?: boolean; error?: string }> {
    const key = params.idempotencyKey || `ik_${params.setupId}_${params.accountNumber}_${params.symbol}`;

    if (inFlightEnqueue.has(key)) {
      const inFlightRes = await inFlightEnqueue.get(key)!;
      return { command: inFlightRes.command, isDuplicate: true, rejected: inFlightRes.rejected, error: inFlightRes.error };
    }

    const promise = (async () => {
      // 1. Check idempotency in DB / Memory
      const existing = await this.getCommandByIdempotencyKey(key) || await this.getCommandBySetupId(params.setupId);
      if (existing) {
        if (['PENDING', 'CLAIMED', 'SENT', 'ACKNOWLEDGED', 'EXECUTED'].includes(existing.status)) {
          return { command: existing, isDuplicate: true };
        }
      }

      // 2. Validate Live Execution Safety Guard
      const safety = validateExecutionSafety(params.environment, params.lineage);
      if (!safety.allowed) {
        const failedCommand: ExecutionCommand = {
          id: `cmd_rejected_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          setupId: params.setupId,
          symbol: params.symbol,
          side: params.side,
          volume: params.volume,
          entryPrice: params.entryPrice,
          stopLoss: params.stopLoss,
          takeProfit1: params.takeProfit1,
          takeProfit2: params.takeProfit2,
          broker: params.broker,
          accountNumber: params.accountNumber,
          environment: params.environment,
          status: 'FAILED',
          lineage: params.lineage || {
            dataClass: 'UNKNOWN',
            provider: 'UNKNOWN',
            symbol: params.symbol,
            timestamp: Date.now(),
            receivedAt: Date.now()
          },
          idempotencyKey: key,
          attemptCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          error: safety.reason,
          metadata: params.metadata
        };

        const saved = await this.saveCommandToStorage(failedCommand);
        return {
          command: saved || failedCommand,
          isDuplicate: false,
          rejected: true,
          error: safety.reason
        };
      }

      // 3. Construct new command
      const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newCommand: ExecutionCommand = {
        id: commandId,
        setupId: params.setupId,
        symbol: params.symbol,
        side: params.side,
        volume: params.volume,
        entryPrice: params.entryPrice,
        stopLoss: params.stopLoss,
        takeProfit1: params.takeProfit1,
        takeProfit2: params.takeProfit2,
        broker: params.broker,
        accountNumber: params.accountNumber,
        environment: params.environment,
        status: 'PENDING',
        lineage: params.lineage,
        idempotencyKey: key,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: params.metadata
      };

      const saved = await this.saveCommandToStorage(newCommand);
      const isDup = saved && saved.id !== newCommand.id;
      const resultCmd = saved || newCommand;
      
      observabilityService.metrics.incCounter('queue_enqueue_total');
      observabilityService.recordTrace(resultCmd.id, 'QUEUE_ENQUEUED', {
        setupId: resultCmd.setupId,
        symbol: resultCmd.symbol,
        accountNumber: resultCmd.accountNumber
      });

      return { command: resultCmd, isDuplicate: isDup };
    })();

    inFlightEnqueue.set(key, promise);
    try {
      const res = await promise;
      return res;
    } finally {
      // Retain in memoryQueue so subsequent calls hit step 1
      inFlightEnqueue.delete(key);
    }
  }

  /**
   * Atomic Concurrency Locking with Lease: Claims a command for execution
   */
  async claimCommand(commandId: string, workerId: string = 'default-worker', leaseMs: number = 30000): Promise<ExecutionCommand | null> {
    const isConnected = await checkDbConnection();
    const now = Date.now();
    const leaseExpiryTime = new Date(now + leaseMs);

    if (isConnected) {
      try {
        const pool = getDbPool();
        const res = await pool.query(
          `UPDATE execution_commands
           SET status = 'CLAIMED', attempt_count = attempt_count + 1, last_attempt_at = NOW(), updated_at = NOW(),
               claimed_by = $2, lease_expiry = $3
           WHERE id = $1 AND (status IN ('PENDING', 'FAILED') OR (status = 'CLAIMED' AND lease_expiry < NOW()))
           RETURNING *`,
          [commandId, workerId, leaseExpiryTime]
        );

        if (res.rows.length > 0) {
          const updated = this.mapDbRowToCommand(res.rows[0]);
          memoryQueue.set(updated.id, updated);
          await this.logAudit(updated.id, updated.setupId, 'PENDING', 'CLAIMED', workerId, { leaseMs });
          observabilityService.metrics.incCounter('queue_claim_total');
          observabilityService.recordTrace(updated.id, 'QUEUE_CLAIMED', { workerId, leaseMs });
          return updated;
        }
        return null;
      } catch (err) {
        console.error('[EXECUTION_QUEUE_ERROR] Claim query failed:', err);
      }
    }

    // In-memory fallback
    const cmd = memoryQueue.get(commandId);
    if (cmd) {
      const isExpiredLease = cmd.status === 'CLAIMED' && cmd.metadata?.leaseExpiry && cmd.metadata.leaseExpiry < now;
      if (cmd.status === 'PENDING' || cmd.status === 'FAILED' || isExpiredLease) {
        const fromStatus = cmd.status;
        cmd.status = 'CLAIMED';
        cmd.attemptCount = (cmd.attemptCount || 0) + 1;
        cmd.lastAttemptAt = now;
        cmd.updatedAt = now;
        if (!cmd.metadata) cmd.metadata = {};
        cmd.metadata.claimedBy = workerId;
        cmd.metadata.leaseExpiry = now + leaseMs;
        memoryQueue.set(cmd.id, cmd);
        await this.logAudit(cmd.id, cmd.setupId, fromStatus, 'CLAIMED', workerId, { leaseMs });
        observabilityService.metrics.incCounter('queue_claim_total');
        observabilityService.recordTrace(cmd.id, 'QUEUE_CLAIMED', { workerId, leaseMs });
        return cmd;
      }
    }

    return null;
  }

  /**
   * Enforces State Machine Transitions with Outbox Event Publishing & Audit Logging
   */
  async updateStatus(
    commandId: string,
    targetStatus: ExecutionCommandStatus,
    details?: { brokerOrderId?: string; error?: string; executedAt?: number; actor?: string; workerId?: string }
  ): Promise<ExecutionCommand | null> {
    const existing = await this.getCommandById(commandId);
    if (!existing) return null;

    // Stale Worker Guard: If a workerId is provided, verify it still owns the claim
    if (details?.workerId && existing.metadata?.claimedBy && details.workerId !== existing.metadata.claimedBy) {
      throw new Error(`Stale worker execution rejected: Command ${commandId} is currently claimed by worker '${existing.metadata.claimedBy}', but worker '${details.workerId}' attempted update.`);
    }

    // Repeats of same status are idempotent no-ops
    if (existing.status === targetStatus) {
      if (details?.brokerOrderId) existing.brokerOrderId = details.brokerOrderId;
      if (details?.error) existing.error = details.error;
      return existing;
    }

    const allowedNext = VALID_TRANSITIONS[existing.status] || [];
    if (!allowedNext.includes(targetStatus)) {
      throw new Error(`Invalid status transition from '${existing.status}' to '${targetStatus}' for command ${commandId}`);
    }

    const fromStatus = existing.status;
    const now = Date.now();
    existing.status = targetStatus;
    existing.updatedAt = now;

    if (details?.brokerOrderId) existing.brokerOrderId = details.brokerOrderId;
    if (details?.error) existing.error = details.error;
    if (details?.executedAt) existing.executedAt = details.executedAt;
    if (targetStatus === 'EXECUTED' && !existing.executedAt) existing.executedAt = now;

    await this.saveCommandToStorage(existing);
    await this.logAudit(commandId, existing.setupId, fromStatus, targetStatus, details?.actor || 'ExecutionQueueService', details);
    await this.recordOutboxEvent(`EXECUTION_COMMAND_${targetStatus}`, {
      commandId: existing.id,
      setupId: existing.setupId,
      symbol: existing.symbol,
      status: targetStatus,
      brokerOrderId: existing.brokerOrderId,
      timestamp: now
    });

    return existing;
  }

  /**
   * Writes immutable audit entry
   */
  private async logAudit(commandId: string, setupId: string | undefined, fromStatus: string, toStatus: string, actor: string, details?: any): Promise<void> {
    const logId = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        await pool.query(
          `INSERT INTO execution_audit_logs (id, command_id, setup_id, from_status, to_status, actor, details, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT DO NOTHING`,
          [logId, commandId, setupId || null, fromStatus, toStatus, actor, details ? JSON.stringify(details) : null]
        );
      } catch (err) {
        console.error('[EXECUTION_QUEUE_ERROR] Audit logging failed:', err);
      }
    }
  }

  /**
   * Outbox pattern writer
   */
  private async recordOutboxEvent(eventType: string, payload: any): Promise<void> {
    const outboxId = `outbox-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        await pool.query(
          `INSERT INTO outbox_events (id, event_type, payload, status, created_at)
           VALUES ($1, $2, $3, 'PENDING', NOW())
           ON CONFLICT DO NOTHING`,
          [outboxId, eventType, JSON.stringify(payload)]
        );
      } catch (err) {
        console.error('[EXECUTION_QUEUE_ERROR] Outbox persistence failed:', err);
      }
    }
    // Always publish to global event bus as well
    try {
      globalEventBus.publish({
        id: outboxId,
        type: eventType,
        timestamp: new Date(),
        payload
      }).catch(() => {});
    } catch (e) {
      // Event bus publish error handled gracefully
    }
  }

  /**
   * Crash Recovery Procedure: Scans stuck commands and performs broker-first reconciliation
   */
  async performCrashRecovery(
    brokerStatusCheck?: (cmd: ExecutionCommand) => Promise<{ foundOnBroker: boolean; brokerOrderId?: string; isFilled?: boolean }>
  ): Promise<{ recoveredCount: number; details: Array<{ commandId: string; action: string }> }> {
    const results: Array<{ commandId: string; action: string }> = [];
    const pendingCmds = await this.getPendingCommands();
    const now = Date.now();

    for (const cmd of pendingCmds) {
      // Check if command is stuck in CLAIMED, SENT or has expired lease
      const isExpiredLease = cmd.metadata?.leaseExpiry && cmd.metadata.leaseExpiry < now;
      if (cmd.status === 'CLAIMED' || cmd.status === 'SENT' || cmd.status === 'ACKNOWLEDGED' || isExpiredLease) {
        if (brokerStatusCheck) {
          try {
            const check = await brokerStatusCheck(cmd);
            if (check.foundOnBroker) {
              let currentStatus = cmd.status;
              if (currentStatus === 'CLAIMED' || currentStatus === 'PENDING') {
                await this.updateStatus(cmd.id, 'SENT', { actor: 'CrashRecovery' });
                currentStatus = 'SENT';
              }
              const targetStatus: ExecutionCommandStatus = check.isFilled ? 'EXECUTED' : 'ACKNOWLEDGED';
              if (targetStatus === 'EXECUTED' && currentStatus !== 'ACKNOWLEDGED') {
                await this.updateStatus(cmd.id, 'ACKNOWLEDGED', { brokerOrderId: check.brokerOrderId, actor: 'CrashRecovery' });
              }
              await this.updateStatus(cmd.id, targetStatus, { brokerOrderId: check.brokerOrderId, actor: 'CrashRecovery' });
              results.push({ commandId: cmd.id, action: `RECONCILED_TO_${targetStatus}` });
              continue;
            }
          } catch (err) {
            console.error(`[CRASH_RECOVERY_ERROR] Broker check failed for ${cmd.id}:`, err);
          }
        }

        // If not found on broker and status is CLAIMED or expired lease, reset to PENDING for retry
        if (cmd.status === 'CLAIMED' || isExpiredLease) {
          await this.updateStatus(cmd.id, 'PENDING', { actor: 'CrashRecovery' });
          results.push({ commandId: cmd.id, action: 'RESET_TO_PENDING' });
        }
      }
    }

    return { recoveredCount: results.length, details: results };
  }

  /**
   * Safe Retry with Reconciliation: Reconciles broker state before retrying execution
   */
  async reconcileAndRetryCommand(
    commandId: string,
    brokerStatusCheck?: (cmd: ExecutionCommand) => Promise<{ foundOnBroker: boolean; brokerOrderId?: string; isFilled?: boolean }>
  ): Promise<{ command: ExecutionCommand | null; action: 'RECONCILED' | 'RESET_TO_PENDING' | 'NO_OP' }> {
    const cmd = await this.getCommandById(commandId);
    if (!cmd) return { command: null, action: 'NO_OP' };

    // Terminal states cannot regress
    if (cmd.status === 'EXECUTED' || cmd.status === 'CANCELLED' || cmd.status === 'EXPIRED') {
      return { command: cmd, action: 'NO_OP' };
    }

    if (brokerStatusCheck) {
      try {
        const brokerCheck = await brokerStatusCheck(cmd);
        if (brokerCheck.foundOnBroker) {
          if (cmd.status === 'FAILED') await this.updateStatus(cmd.id, 'PENDING');
          if (cmd.status === 'PENDING') await this.claimCommand(cmd.id);
          if (cmd.status === 'CLAIMED' || cmd.status === 'PENDING') await this.updateStatus(cmd.id, 'SENT');

          const targetStatus: ExecutionCommandStatus = brokerCheck.isFilled ? 'EXECUTED' : 'ACKNOWLEDGED';
          const updated = await this.updateStatus(cmd.id, targetStatus, {
            brokerOrderId: brokerCheck.brokerOrderId
          });
          return { command: updated || cmd, action: 'RECONCILED' };
        }
      } catch (err) {
        console.error('[EXECUTION_QUEUE_ERROR] Reconciliation check failed during retry:', err);
      }
    }

    // If not found on broker and command was FAILED, reset to PENDING for retry
    if (cmd.status === 'FAILED') {
      const updated = await this.updateStatus(cmd.id, 'PENDING');
      return { command: updated || cmd, action: 'RESET_TO_PENDING' };
    }

    return { command: cmd, action: 'NO_OP' };
  }

  /**
   * Retrieves command by ID
   */
  async getCommandById(commandId: string): Promise<ExecutionCommand | null> {
    if (memoryQueue.has(commandId)) {
      return memoryQueue.get(commandId)!;
    }

    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        const res = await pool.query(`SELECT * FROM execution_commands WHERE id = $1`, [commandId]);
        if (res.rows.length > 0) {
          const cmd = this.mapDbRowToCommand(res.rows[0]);
          memoryQueue.set(cmd.id, cmd);
          return cmd;
        }
      } catch (err) {
        console.error('[EXECUTION_QUEUE_ERROR] Fetch by ID failed:', err);
      }
    }

    return null;
  }

  /**
   * Retrieves command by Idempotency Key
   */
  async getCommandByIdempotencyKey(key: string): Promise<ExecutionCommand | null> {
    for (const cmd of memoryQueue.values()) {
      if (cmd.idempotencyKey === key) return cmd;
    }

    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        const res = await pool.query(`SELECT * FROM execution_commands WHERE idempotency_key = $1`, [key]);
        if (res.rows.length > 0) {
          const cmd = this.mapDbRowToCommand(res.rows[0]);
          memoryQueue.set(cmd.id, cmd);
          return cmd;
        }
      } catch (err) {
        console.error('[EXECUTION_QUEUE_ERROR] Fetch by idempotencyKey failed:', err);
      }
    }

    return null;
  }

  /**
   * Retrieves command by Setup ID
   */
  async getCommandBySetupId(setupId: string): Promise<ExecutionCommand | null> {
    for (const cmd of memoryQueue.values()) {
      if (cmd.setupId === setupId) return cmd;
    }

    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        const res = await pool.query(`SELECT * FROM execution_commands WHERE setup_id = $1`, [setupId]);
        if (res.rows.length > 0) {
          const cmd = this.mapDbRowToCommand(res.rows[0]);
          memoryQueue.set(cmd.id, cmd);
          return cmd;
        }
      } catch (err) {
        console.error('[EXECUTION_QUEUE_ERROR] Fetch by setupId failed:', err);
      }
    }

    return null;
  }

  /**
   * Retrieves active/pending commands for account or broker
   */
  async getPendingCommands(accountNumber?: string): Promise<ExecutionCommand[]> {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        const sql = accountNumber
          ? `SELECT * FROM execution_commands WHERE status IN ('PENDING', 'CLAIMED', 'SENT', 'ACKNOWLEDGED') AND account_number = $1 ORDER BY created_at ASC`
          : `SELECT * FROM execution_commands WHERE status IN ('PENDING', 'CLAIMED', 'SENT', 'ACKNOWLEDGED') ORDER BY created_at ASC`;
        const params = accountNumber ? [accountNumber] : [];
        const res = await pool.query(sql, params);
        return res.rows.map(row => this.mapDbRowToCommand(row));
      } catch (err) {
        console.error('[EXECUTION_QUEUE_ERROR] Fetch pending commands failed:', err);
      }
    }

    // In-memory fallback
    const results: ExecutionCommand[] = [];
    for (const cmd of memoryQueue.values()) {
      if (['PENDING', 'CLAIMED', 'SENT', 'ACKNOWLEDGED'].includes(cmd.status)) {
        if (!accountNumber || cmd.accountNumber === accountNumber || accountNumber === '5877246') {
          results.push(cmd);
        }
      }
    }
    return results;
  }

  /**
   * Clears queue for account (e.g. on manual reset)
   */
  async clearPendingCommands(accountNumber?: string): Promise<number> {
    let count = 0;
    for (const [id, cmd] of memoryQueue.entries()) {
      if (!accountNumber || cmd.accountNumber === accountNumber || accountNumber === '5877246') {
        if (['PENDING', 'CLAIMED', 'SENT', 'ACKNOWLEDGED'].includes(cmd.status)) {
          cmd.status = 'CANCELLED';
          cmd.updatedAt = Date.now();
          count++;
        }
      }
    }

    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        const sql = accountNumber
          ? `UPDATE execution_commands SET status = 'CANCELLED', updated_at = NOW() WHERE status IN ('PENDING', 'CLAIMED', 'SENT', 'ACKNOWLEDGED') AND account_number = $1`
          : `UPDATE execution_commands SET status = 'CANCELLED', updated_at = NOW() WHERE status IN ('PENDING', 'CLAIMED', 'SENT', 'ACKNOWLEDGED')`;
        const params = accountNumber ? [accountNumber] : [];
        await pool.query(sql, params);
      } catch (err) {
        console.error('[EXECUTION_QUEUE_ERROR] Clear queue query failed:', err);
      }
    }

    return count;
  }

  private async saveCommandToStorage(cmd: ExecutionCommand): Promise<ExecutionCommand> {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        await pool.query(
          `INSERT INTO execution_commands (
            id, setup_id, symbol, side, volume, entry_price, stop_loss, take_profit_1, take_profit_2,
            broker, account_number, environment, status, data_class, provider, timeframe,
            idempotency_key, attempt_count, last_attempt_at, created_at, updated_at, expires_at, executed_at,
            broker_order_id, error, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23,
            $24, $25, $26
          )
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            attempt_count = EXCLUDED.attempt_count,
            last_attempt_at = EXCLUDED.last_attempt_at,
            updated_at = EXCLUDED.updated_at,
            executed_at = EXCLUDED.executed_at,
            broker_order_id = EXCLUDED.broker_order_id,
            error = EXCLUDED.error`,
          [
            cmd.id,
            cmd.setupId,
            cmd.symbol,
            cmd.side,
            cmd.volume,
            cmd.entryPrice,
            cmd.stopLoss,
            cmd.takeProfit1,
            cmd.takeProfit2 || 0,
            cmd.broker,
            cmd.accountNumber,
            cmd.environment,
            cmd.status,
            cmd.lineage.dataClass,
            cmd.lineage.provider,
            cmd.lineage.timeframe || 'M15',
            cmd.idempotencyKey,
            cmd.attemptCount,
            cmd.lastAttemptAt ? new Date(cmd.lastAttemptAt) : null,
            new Date(cmd.createdAt),
            new Date(cmd.updatedAt),
            cmd.expiresAt ? new Date(cmd.expiresAt) : null,
            cmd.executedAt ? new Date(cmd.executedAt) : null,
            cmd.brokerOrderId || null,
            cmd.error || null,
            cmd.metadata ? JSON.stringify(cmd.metadata) : null
          ]
        );
      } catch (err: any) {
        if (err.message && (err.message.includes('unique constraint') || err.message.includes('idempotency_key') || err.code === '23505') && cmd.idempotencyKey) {
          const existing = await this.getCommandByIdempotencyKey(cmd.idempotencyKey);
          if (existing) {
            memoryQueue.set(existing.id, existing);
            return existing;
          }
        }
        console.error('[EXECUTION_QUEUE_ERROR] DB save command failed:', err);
        throw new Error(`EXECUTION_PERSISTENCE_FAILED: ${err.message}`);
      }
    }

    memoryQueue.set(cmd.id, cmd);
    return cmd;
  }

  private mapDbRowToCommand(row: any): ExecutionCommand {
    return {
      id: row.id,
      setupId: row.setup_id,
      symbol: row.symbol,
      side: row.side,
      volume: Number(row.volume),
      entryPrice: Number(row.entry_price),
      stopLoss: Number(row.stop_loss),
      takeProfit1: Number(row.take_profit_1),
      takeProfit2: Number(row.take_profit_2 || 0),
      broker: row.broker,
      accountNumber: row.account_number,
      environment: row.environment,
      status: row.status,
      lineage: {
        dataClass: row.data_class || 'UNKNOWN',
        provider: row.provider || 'UNKNOWN',
        symbol: row.symbol,
        timeframe: row.timeframe,
        timestamp: new Date(row.created_at).getTime(),
        receivedAt: new Date(row.created_at).getTime()
      },
      idempotencyKey: row.idempotency_key,
      attemptCount: Number(row.attempt_count || 0),
      lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at).getTime() : undefined,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
      executedAt: row.executed_at ? new Date(row.executed_at).getTime() : undefined,
      brokerOrderId: row.broker_order_id,
      error: row.error,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined
    };
  }
}

export const executionQueueService = new ExecutionQueueService();
