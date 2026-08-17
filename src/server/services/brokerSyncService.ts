import { checkDbConnection, getDbPool } from '@iati/database';
import { BrokerWebhookEvent, ExecutionCommand } from '../domain/types';
import { executionQueueService } from './executionQueueService';

const processedWebhookEvents = new Set<string>();

import { AccountService } from './accountService';

export class BrokerSyncService {
  /**
   * Processes incoming broker webhook idempotently using Webhook Inbox Pattern
   */
  async processWebhookEvent(params: {
    broker: string;
    eventType: string;
    accountNumber?: string;
    orderId?: string;
    payload: Record<string, any>;
    customEventId?: string;
  }): Promise<{ processed: boolean; duplicate: boolean; updatedCommand?: ExecutionCommand | null }> {
    const rawKey = params.customEventId || `${params.broker}_${params.eventType}_${params.orderId || ''}_${params.payload.timestamp || params.payload.time || Date.now()}`;
    const eventId = `evt_${rawKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    // 1. Check in-memory idempotency cache
    if (processedWebhookEvents.has(eventId)) {
      return { processed: false, duplicate: true };
    }

    const isConnected = await checkDbConnection();

    // 2. Webhook Inbox Pattern: Persist event in inbox before processing
    if (isConnected) {
      try {
        const pool = getDbPool();
        const checkRes = await pool.query(`SELECT event_id, status FROM broker_webhook_events WHERE event_id = $1`, [eventId]);
        if (checkRes.rows.length > 0) {
          processedWebhookEvents.add(eventId);
          return { processed: false, duplicate: true };
        }

        await pool.query(
          `INSERT INTO broker_webhook_events (event_id, broker, event_type, account_number, order_id, payload, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'RECEIVED', NOW())
           ON CONFLICT (event_id) DO NOTHING`,
          [
            eventId,
            params.broker,
            params.eventType,
            params.accountNumber || null,
            params.orderId || null,
            JSON.stringify(params.payload)
          ]
        );
      } catch (err) {
        console.error('[BROKER_SYNC_ERROR] Webhook inbox insertion failed:', err);
      }
    }

    processedWebhookEvents.add(eventId);

    // 3. Process payload and update state
    let updatedCommand: ExecutionCommand | null = null;
    let processError: string | null = null;

    try {
      const targetOrderId = params.orderId || params.payload.orderId || params.payload.ticket || params.payload.mt5Ticket;
      const targetSetupId = params.payload.setupId;

      if (targetOrderId || targetSetupId) {
        let command: ExecutionCommand | null = null;
        if (targetOrderId) {
          command = await executionQueueService.getCommandById(targetOrderId);
        }
        if (!command && targetSetupId) {
          command = await executionQueueService.getCommandBySetupId(targetSetupId);
        }

        if (command) {
          const normEventType = params.eventType.toUpperCase();
          if (normEventType.includes('ACK') || normEventType.includes('ACCEPT') || normEventType.includes('QUEUED')) {
            if (['PENDING', 'CLAIMED', 'SENT'].includes(command.status)) {
              if (command.status === 'PENDING') await executionQueueService.claimCommand(command.id);
              if (command.status === 'CLAIMED' || command.status === 'PENDING') await executionQueueService.updateStatus(command.id, 'SENT');
              updatedCommand = await executionQueueService.updateStatus(command.id, 'ACKNOWLEDGED', {
                brokerOrderId: String(targetOrderId || command.brokerOrderId),
                actor: 'BrokerSyncService'
              });
            } else {
              updatedCommand = command;
            }
          } else if (normEventType.includes('FILL') || normEventType.includes('EXECUTE') || normEventType.includes('TRADE_OPENED') || normEventType.includes('POSITION_OPENED')) {
            if (['PENDING', 'CLAIMED', 'SENT', 'ACKNOWLEDGED'].includes(command.status)) {
              if (command.status === 'PENDING') await executionQueueService.claimCommand(command.id);
              if (command.status === 'CLAIMED' || command.status === 'PENDING') await executionQueueService.updateStatus(command.id, 'SENT');
              updatedCommand = await executionQueueService.updateStatus(command.id, 'EXECUTED', {
                brokerOrderId: String(targetOrderId || command.brokerOrderId),
                executedAt: Date.now(),
                actor: 'BrokerSyncService'
              });
            } else {
              updatedCommand = command;
            }
          } else if (normEventType.includes('REJECT') || normEventType.includes('FAIL') || normEventType.includes('CANCEL')) {
            if (!['EXECUTED', 'CANCELLED', 'EXPIRED'].includes(command.status)) {
              updatedCommand = await executionQueueService.updateStatus(command.id, 'FAILED', {
                error: params.payload.error || params.payload.reason || 'Broker order rejected',
                actor: 'BrokerSyncService'
              });
            } else {
              updatedCommand = command;
            }
          }
        }

        // Reconcile and update PostgreSQL canonical positions record with broker IDs
        if (isConnected) {
          try {
            const pool = getDbPool();
            const brokerOrderId = params.payload.brokerOrderId || params.payload.broker_order_id || targetOrderId || (updatedCommand ? updatedCommand.brokerOrderId : null);
            const brokerPositionId = params.payload.brokerPositionId || params.payload.broker_position_id || params.payload.positionId;
            const brokerDealId = params.payload.brokerDealId || params.payload.broker_deal_id || params.payload.dealId;
            const setupId = targetSetupId || (updatedCommand ? updatedCommand.setupId : null);

            if (brokerOrderId || brokerPositionId || brokerDealId) {
              await pool.query(
                `UPDATE positions 
                 SET broker_order_id = COALESCE($1, broker_order_id),
                     broker_position_id = COALESCE($2, broker_position_id),
                     broker_deal_id = COALESCE($3, broker_deal_id),
                     reconciliation_status = 'MATCHED',
                     updated_at = NOW()
                 WHERE (setup_id = $4 AND $4 IS NOT NULL)
                    OR (position_id = $5 AND $5 IS NOT NULL)
                    OR (ticket_id = $5 AND $5 IS NOT NULL)
                    OR (broker_order_id = $1 AND $1 IS NOT NULL)`,
                [
                  brokerOrderId || null,
                  brokerPositionId || null,
                  brokerDealId || null,
                  setupId || null,
                  targetOrderId || null
                ]
              );
            }
          } catch (dbSyncErr) {
            console.error('[BROKER_SYNC_ERROR] Position broker ID reconciliation failed:', dbSyncErr);
          }
        }
      }
    } catch (err: any) {
      processError = err.message || String(err);
      console.error('[BROKER_SYNC_ERROR] Error processing webhook event:', err);
    }

    // 4. Update Webhook Inbox status
    if (isConnected) {
      try {
        const pool = getDbPool();
        const finalStatus = processError ? 'FAILED' : 'PROCESSED';
        await pool.query(
          `UPDATE broker_webhook_events SET status = $1, error = $2, processed_at = NOW() WHERE event_id = $3`,
          [finalStatus, processError, eventId]
        );
      } catch (err) {
        console.error('[BROKER_SYNC_ERROR] Webhook inbox status update failed:', err);
      }
    }

    return { processed: !processError, duplicate: false, updatedCommand };
  }

  /**
   * Reprocesses unprocessed webhook events from inbox (e.g. after crash/restart)
   */
  async reprocessPendingWebhooks(): Promise<{ reprocessedCount: number }> {
    const isConnected = await checkDbConnection();
    if (!isConnected) return { reprocessedCount: 0 };

    try {
      const pool = getDbPool();
      const res = await pool.query(`SELECT * FROM broker_webhook_events WHERE status = 'RECEIVED' ORDER BY created_at ASC`);
      let count = 0;
      for (const row of res.rows) {
        const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        await this.processWebhookEvent({
          broker: row.broker,
          eventType: row.event_type,
          accountNumber: row.account_number,
          orderId: row.order_id,
          payload,
          customEventId: row.event_id.replace(/^evt_/, '')
        });
        count++;
      }
      return { reprocessedCount: count };
    } catch (err) {
      console.error('[BROKER_SYNC_ERROR] Reprocess pending webhooks failed:', err);
      return { reprocessedCount: 0 };
    }
  }
}

export const brokerSyncService = new BrokerSyncService();
