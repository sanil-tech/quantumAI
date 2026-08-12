import { checkDbConnection, getDbPool } from '@iati/database';

export interface WebhookEvent {
  id: string;
  source: string;
  idempotencyHash: string;
  payload: any;
  status: 'PROCESSED' | 'DUPLICATE_SKIPPED' | 'FAILED';
  receivedAt: number;
}

const memoryInbox = new Map<string, WebhookEvent>();

export class WebhookInboxService {
  public clearForTest(): void {
    memoryInbox.clear();
  }

  public async receiveWebhook(
    source: string,
    idempotencyHash: string,
    payload: any
  ): Promise<{ status: 'PROCESSED' | 'DUPLICATE_SKIPPED' | 'FAILED'; duplicate: boolean; event: WebhookEvent }> {
    const isConnected = await checkDbConnection();

    if (isConnected) {
      try {
        const pool = getDbPool();
        const existing = await pool.query(
          `SELECT * FROM broker_webhook_events WHERE idempotency_hash = $1`,
          [idempotencyHash]
        );

        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          const event: WebhookEvent = {
            id: row.id,
            source: row.source || source,
            idempotencyHash,
            payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
            status: 'DUPLICATE_SKIPPED',
            receivedAt: new Date(row.received_at).getTime()
          };
          return { status: 'DUPLICATE_SKIPPED', duplicate: true, event };
        }

        const id = `wh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await pool.query(
          `INSERT INTO broker_webhook_events (id, source, idempotency_hash, payload, status, received_at)
           VALUES ($1, $2, $3, $4, 'PROCESSED', NOW())`,
          [id, source, idempotencyHash, JSON.stringify(payload)]
        );

        const event: WebhookEvent = {
          id,
          source,
          idempotencyHash,
          payload,
          status: 'PROCESSED',
          receivedAt: Date.now()
        };
        memoryInbox.set(idempotencyHash, event);
        return { status: 'PROCESSED', duplicate: false, event };
      } catch (err) {
        console.error('[WEBHOOK_INBOX_ERROR] DB check failed:', err);
      }
    }

    // In-memory fallback
    if (memoryInbox.has(idempotencyHash)) {
      const existing = memoryInbox.get(idempotencyHash)!;
      return { status: 'DUPLICATE_SKIPPED', duplicate: true, event: existing };
    }

    const id = `wh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const event: WebhookEvent = {
      id,
      source,
      idempotencyHash,
      payload,
      status: 'PROCESSED',
      receivedAt: Date.now()
    };
    memoryInbox.set(idempotencyHash, event);
    return { status: 'PROCESSED', duplicate: false, event };
  }
}

export const webhookInboxService = new WebhookInboxService();
