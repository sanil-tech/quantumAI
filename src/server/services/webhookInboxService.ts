import crypto from 'crypto';
import { getDbPool } from '@iati/database';
import { logger } from '@iati/core';
import { stripeBillingService } from './stripeBillingService';

export interface WebhookProcessResult {
  success: boolean;
  eventId: string;
  eventType: string;
  status: 'PROCESSED' | 'DUPLICATE' | 'FAILED' | 'INVALID_SIGNATURE';
  isDuplicate?: boolean;
  message: string;
  tenantId?: string;
}

export class WebhookInboxService {
  private pool = getDbPool();

  /**
   * Safe Idempotent Event Recording in webhook_inbox table
   * Uses ON CONFLICT (provider, event_id) DO NOTHING
   */
  public async recordEvent(
    provider: string,
    eventId: string,
    eventType: string,
    payload: any
  ): Promise<{ isNew: boolean; inboxId: string }> {
    const inboxId = `wh_${crypto.randomBytes(12).toString('hex')}`;
    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL app.current_tenant_id = 'ALL'`);
      const insertRes = await client.query(
        `INSERT INTO webhook_inbox (id, event_id, provider, event_type, payload, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW())
         ON CONFLICT (provider, event_id) DO NOTHING
         RETURNING id`,
        [inboxId, eventId, provider, eventType, JSON.stringify(payload)]
      );

      if (insertRes.rows.length > 0) {
        return { isNew: true, inboxId: insertRes.rows[0].id };
      } else {
        // Event was already inserted
        const existingRes = await client.query(
          `SELECT id, status FROM webhook_inbox WHERE provider = $1 AND event_id = $2`,
          [provider, eventId]
        );
        const existingId = existingRes.rows[0]?.id || inboxId;
        return { isNew: false, inboxId: existingId };
      }
    } finally {
      client.release();
    }
  }

  /**
   * Update Webhook Inbox Record Status
   */
  public async markEventStatus(
    eventId: string,
    provider: string,
    status: 'PROCESSED' | 'FAILED' | 'DUPLICATE',
    errorMessage?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL app.current_tenant_id = 'ALL'`);
      await client.query(
        `UPDATE webhook_inbox 
         SET status = $1, processed_at = NOW(), error_message = $2 
         WHERE provider = $3 AND event_id = $4`,
        [status, errorMessage || null, provider, eventId]
      );
    } catch (err: any) {
      logger.warn(`[WEBHOOK-INBOX] Failed to update status for ${eventId}: ${err.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Process incoming Stripe Webhook with Signature Verification & Idempotency Guarantee
   */
  public async processStripeWebhook(
    eventPayload: any,
    signatureHeader?: string,
    rawBody?: string | Buffer,
    skipSignatureVerification: boolean = false
  ): Promise<WebhookProcessResult> {
    const eventId = eventPayload?.id || eventPayload?.event_id;
    const eventType = eventPayload?.type || eventPayload?.event_type;

    if (!eventId || !eventType) {
      return {
        success: false,
        eventId: eventId || 'unknown',
        eventType: eventType || 'unknown',
        status: 'FAILED',
        message: 'MALFORMED_WEBHOOK_PAYLOAD: Missing event ID or event type.'
      };
    }

    // 1. Signature Verification (unless explicitly bypassed in test unit)
    if (!skipSignatureVerification && signatureHeader && rawBody) {
      const isValidSig = stripeBillingService.verifySignature(rawBody, signatureHeader);
      if (!isValidSig) {
        logger.warn(`[WEBHOOK-INBOX] ❌ Invalid Stripe Signature for event ${eventId}`);
        return {
          success: false,
          eventId,
          eventType,
          status: 'INVALID_SIGNATURE',
          message: 'INVALID_STRIPE_SIGNATURE: Webhook signature verification failed.'
        };
      }
    }

    // 2. Idempotency Check & Ingestion into webhook_inbox
    const { isNew, inboxId } = await this.recordEvent('STRIPE', eventId, eventType, eventPayload);

    if (!isNew) {
      logger.info(`[WEBHOOK-INBOX] ⏭️ Duplicate event detected: ${eventId} (${eventType}). Skipping duplicate execution.`);
      return {
        success: true,
        eventId,
        eventType,
        status: 'DUPLICATE',
        isDuplicate: true,
        message: `Event ${eventId} has already been recorded and processed (Idempotent bypass).`
      };
    }

    // 3. Dispatch & Process Event
    try {
      let tenantIdResult: string | undefined;

      switch (eventType) {
        case 'checkout.session.completed': {
          const sessionObj = eventPayload.data?.object || eventPayload;
          const provisionResult = await stripeBillingService.handleCheckoutSessionCompleted(sessionObj);
          tenantIdResult = provisionResult.tenantId;
          break;
        }

        case 'customer.subscription.updated': {
          const subObj = eventPayload.data?.object || eventPayload;
          await stripeBillingService.handleSubscriptionUpdated(subObj);
          break;
        }

        case 'customer.subscription.deleted': {
          const subObj = eventPayload.data?.object || eventPayload;
          await stripeBillingService.handleSubscriptionDeleted(subObj);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoiceObj = eventPayload.data?.object || eventPayload;
          logger.info(`[WEBHOOK-INBOX] Payment succeeded for invoice ${invoiceObj.id}`);
          break;
        }

        case 'invoice.payment_failed': {
          const invoiceObj = eventPayload.data?.object || eventPayload;
          logger.warn(`[WEBHOOK-INBOX] Payment failed for invoice ${invoiceObj.id}`);
          break;
        }

        default:
          logger.info(`[WEBHOOK-INBOX] Unhandled Stripe event type ${eventType} logged safely in inbox.`);
          break;
      }

      // 4. Mark Event as PROCESSED
      await this.markEventStatus(eventId, 'STRIPE', 'PROCESSED');
      logger.info(`[WEBHOOK-INBOX] ✅ Successfully processed event ${eventId} (${eventType})`);

      return {
        success: true,
        eventId,
        eventType,
        status: 'PROCESSED',
        tenantId: tenantIdResult,
        message: `Successfully processed event ${eventId} (${eventType})`
      };
    } catch (err: any) {
      logger.error(`[WEBHOOK-INBOX] ❌ Error processing event ${eventId}: ${err.message}`);
      await this.markEventStatus(eventId, 'STRIPE', 'FAILED', err.message);
      return {
        success: false,
        eventId,
        eventType,
        status: 'FAILED',
        message: err.message
      };
    }
  }
}

export const webhookInboxService = new WebhookInboxService();
