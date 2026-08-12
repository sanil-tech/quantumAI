import { checkDbConnection, getDbPool } from '@iati/database';
import { globalEventBus } from '@iati/event-bus';

export interface OutboxEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  payload: any;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  createdAt: number;
  publishedAt?: number;
}

const memoryOutbox: OutboxEvent[] = [];

export class OutboxService {
  public clearInMemoryForTest(): void {
    memoryOutbox.length = 0;
  }

  public async recordEvent(
    eventType: string,
    aggregateType: string,
    payload: any
  ): Promise<OutboxEvent> {
    const event: OutboxEvent = {
      id: `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      eventType,
      aggregateType,
      payload,
      status: 'PENDING',
      createdAt: Date.now()
    };

    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        await pool.query(
          `INSERT INTO outbox_events (id, event_type, aggregate_type, payload, status, created_at)
           VALUES ($1, $2, $3, $4, 'PENDING', NOW())
           ON CONFLICT DO NOTHING`,
          [event.id, eventType, aggregateType, JSON.stringify(payload)]
        );
      } catch (err) {
        console.error('[OUTBOX_SERVICE_ERROR] Persistence failed:', err);
      }
    }

    memoryOutbox.push(event);
    return event;
  }

  public async getUnpublishedEvents(): Promise<OutboxEvent[]> {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        const res = await pool.query(
          `SELECT * FROM outbox_events WHERE status = 'PENDING' ORDER BY created_at ASC`
        );
        if (res.rows.length > 0) {
          return res.rows.map(r => ({
            id: r.id,
            eventType: r.event_type,
            aggregateType: r.aggregate_type || 'ExecutionQueue',
            payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
            status: r.status,
            createdAt: new Date(r.created_at).getTime()
          }));
        }
      } catch (err) {
        console.error('[OUTBOX_SERVICE_ERROR] Fetch failed:', err);
      }
    }

    return memoryOutbox.filter(e => e.status === 'PENDING');
  }

  public async markPublished(eventId: string): Promise<void> {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      try {
        const pool = getDbPool();
        await pool.query(
          `UPDATE outbox_events SET status = 'PUBLISHED', published_at = NOW() WHERE id = $1`,
          [eventId]
        );
      } catch (err) {
        console.error('[OUTBOX_SERVICE_ERROR] Mark published failed:', err);
      }
    }

    const found = memoryOutbox.find(e => e.id === eventId);
    if (found) {
      found.status = 'PUBLISHED';
      found.publishedAt = Date.now();
      try {
        globalEventBus.publish({
          id: found.id,
          type: found.eventType,
          timestamp: new Date(),
          payload: found.payload
        }).catch(() => {});
      } catch (e) {}
    }
  }
}

export const outboxService = new OutboxService();
