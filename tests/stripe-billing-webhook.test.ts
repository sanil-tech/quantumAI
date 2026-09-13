import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import express, { Express } from 'express';
import request from 'supertest';
import { stripeBillingService } from '../src/server/services/stripeBillingService';
import { webhookInboxService } from '../src/server/services/webhookInboxService';
import { billingRouter } from '../src/server/routes/billing';
import { getDbPool } from '@iati/database';

describe('Stripe Billing & Webhook Inbox Security & Idempotency Tests', () => {
  let app: Express;
  const pool = getDbPool();
  const TEST_SECRET = 'whsec_test_secret_for_vitest_2026';
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET;

    app = express();
    app.use(express.json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      }
    }));
    app.use('/api/billing', billingRouter);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function generateStripeSignatureHeader(payloadStr: string, secret: string = TEST_SECRET): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payloadStr}`)
      .digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  describe('1. Stripe Signature Verification Security', () => {
    it('1.1 Valid HMAC-SHA256 signature is accepted', () => {
      const payload = JSON.stringify({ id: 'evt_test_1', type: 'checkout.session.completed' });
      const header = generateStripeSignatureHeader(payload, TEST_SECRET);

      const isValid = stripeBillingService.verifySignature(payload, header, TEST_SECRET);
      expect(isValid).toBe(true);
    });

    it('1.2 Tampered payload or wrong signature header is rejected', () => {
      const originalPayload = JSON.stringify({ id: 'evt_test_1', type: 'checkout.session.completed' });
      const tamperedPayload = JSON.stringify({ id: 'evt_test_1', type: 'checkout.session.completed', tampered: true });
      const header = generateStripeSignatureHeader(originalPayload, TEST_SECRET);

      const isValid = stripeBillingService.verifySignature(tamperedPayload, header, TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it('1.3 Incorrect secret key signature is rejected', () => {
      const payload = JSON.stringify({ id: 'evt_test_2', type: 'checkout.session.completed' });
      const wrongHeader = generateStripeSignatureHeader(payload, 'whsec_wrong_key_999');

      const isValid = stripeBillingService.verifySignature(payload, wrongHeader, TEST_SECRET);
      expect(isValid).toBe(false);
    });
  });

  describe('2. Webhook Inbox Idempotency Invariant', () => {
    it('2.1 Identical Event ID is processed only once; second call returns DUPLICATE status', async () => {
      const testEventId = `evt_idemp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const payload = {
        id: testEventId,
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: `in_test_${Date.now()}`,
            customer: 'cus_test_idemp_1',
            amount_paid: 9900
          }
        }
      };

      // 1st Execution -> Should be PROCESSED
      const firstResult = await webhookInboxService.processStripeWebhook(payload, undefined, undefined, true);
      expect(firstResult.success).toBe(true);
      expect(firstResult.status).toBe('PROCESSED');
      expect(firstResult.isDuplicate).toBeFalsy();

      // 2nd Execution (Duplicate Event ID) -> Must return DUPLICATE without reprocessing
      const secondResult = await webhookInboxService.processStripeWebhook(payload, undefined, undefined, true);
      expect(secondResult.success).toBe(true);
      expect(secondResult.status).toBe('DUPLICATE');
      expect(secondResult.isDuplicate).toBe(true);
    });
  });

  describe('3. Automated Tenant Provisioning Lifecycle', () => {
    it('3.1 checkout.session.completed automatically provisions tenant and subscription', async () => {
      const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const testEmail = `trader_${uniqueSuffix}@quantum-test.com`;
      const testEventId = `evt_checkout_${uniqueSuffix}`;
      const testSubId = `sub_${uniqueSuffix}`;

      const checkoutPayload = {
        id: testEventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: `cs_${uniqueSuffix}`,
            customer: `cus_${uniqueSuffix}`,
            subscription: testSubId,
            customer_email: testEmail,
            customer_details: {
              name: 'Dr. Quantum Trader',
              email: testEmail
            },
            metadata: {
              planId: 'ENTERPRISE_ANNUAL'
            }
          }
        }
      };

      const result = await webhookInboxService.processStripeWebhook(checkoutPayload, undefined, undefined, true);
      expect(result.success).toBe(true);
      expect(result.status).toBe('PROCESSED');
      expect(result.tenantId).toBeDefined();

      // Verify tenant exists in database
      const client = await pool.connect();
      try {
        await client.query(`SET LOCAL app.current_tenant_id = 'ALL'`);
        const tenantRes = await client.query(`SELECT * FROM tenants WHERE id = $1`, [result.tenantId]);
        expect(tenantRes.rows.length).toBe(1);
        expect(tenantRes.rows[0].email).toBe(testEmail);
        expect(tenantRes.rows[0].status).toBe('ACTIVE');
        expect(tenantRes.rows[0].tier).toBe('ENTERPRISE');

        // Verify subscription record exists
        const subRes = await client.query(`SELECT * FROM subscriptions WHERE stripe_subscription_id = $1`, [testSubId]);
        expect(subRes.rows.length).toBe(1);
        expect(subRes.rows[0].tenant_id).toBe(result.tenantId);
        expect(subRes.rows[0].status).toBe('ACTIVE');
      } finally {
        client.release();
      }
    });

    it('3.2 customer.subscription.deleted suspends the tenant account', async () => {
      const uniqueSuffix = `del_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const testEmail = `cancel_${uniqueSuffix}@quantum-test.com`;
      const testSubId = `sub_del_${uniqueSuffix}`;

      // 1. First provision tenant via checkout session
      const checkoutPayload = {
        id: `evt_init_${uniqueSuffix}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: `cs_init_${uniqueSuffix}`,
            customer: `cus_init_${uniqueSuffix}`,
            subscription: testSubId,
            customer_email: testEmail,
            customer_details: { email: testEmail, name: 'Canceling Trader' },
            metadata: { planId: 'PRO_MONTHLY' }
          }
        }
      };

      const provRes = await webhookInboxService.processStripeWebhook(checkoutPayload, undefined, undefined, true);
      expect(provRes.success).toBe(true);
      const tenantId = provRes.tenantId;

      // 2. Trigger customer.subscription.deleted webhook
      const cancelPayload = {
        id: `evt_delete_${uniqueSuffix}`,
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: testSubId,
            status: 'canceled'
          }
        }
      };

      const cancelRes = await webhookInboxService.processStripeWebhook(cancelPayload, undefined, undefined, true);
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.status).toBe('PROCESSED');

      // 3. Verify tenant is now SUSPENDED
      const client = await pool.connect();
      try {
        await client.query(`SET LOCAL app.current_tenant_id = 'ALL'`);
        const tenantRes = await client.query(`SELECT status FROM tenants WHERE id = $1`, [tenantId]);
        expect(tenantRes.rows[0].status).toBe('SUSPENDED');

        const subRes = await client.query(`SELECT status FROM subscriptions WHERE stripe_subscription_id = $1`, [testSubId]);
        expect(subRes.rows[0].status).toBe('CANCELLED');
      } finally {
        client.release();
      }
    });
  });

  describe('4. Billing HTTP Endpoints Integration', () => {
    it('4.1 POST /api/billing/create-checkout-session returns session ID and Stripe URL', async () => {
      const res = await request(app)
        .post('/api/billing/create-checkout-session')
        .send({
          email: 'test_checkout@quantum.ai',
          name: 'Pro Trader',
          planId: 'PRO_MONTHLY',
          successUrl: 'http://localhost:5173/dashboard',
          cancelUrl: 'http://localhost:5173/pricing'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.checkoutUrl).toContain('checkout.stripe.com');
    });

    it('4.2 POST /api/billing/webhook accepts valid signature and responds with 200 OK', async () => {
      const payload = {
        id: `evt_http_${Date.now()}`,
        type: 'invoice.payment_succeeded',
        data: {
          object: { id: `in_http_${Date.now()}` }
        }
      };
      const rawPayload = JSON.stringify(payload);
      const signature = generateStripeSignatureHeader(rawPayload, TEST_SECRET);

      const res = await request(app)
        .post('/api/billing/webhook')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.eventId).toBe(payload.id);
    });

    it('4.3 POST /api/billing/webhook rejects invalid signature with 400 Bad Request', async () => {
      const payload = {
        id: `evt_invalid_sig_${Date.now()}`,
        type: 'invoice.payment_succeeded',
        data: { object: {} }
      };
      const rawPayload = JSON.stringify(payload);

      const res = await request(app)
        .post('/api/billing/webhook')
        .set('stripe-signature', 't=12345,v1=invalid_fake_signature')
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(400);
      expect(res.body.received).toBe(false);
      expect(res.body.error).toContain('INVALID_STRIPE_SIGNATURE');
    });
  });
});
