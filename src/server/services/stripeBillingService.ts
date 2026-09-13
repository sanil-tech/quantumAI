import crypto from 'crypto';
import { TradingRepository, getDbPool } from '@iati/database';
import { logger } from '@iati/core';

export interface CheckoutSessionParams {
  email: string;
  name?: string;
  planId: string; // 'STARTER_MONTHLY' | 'PRO_MONTHLY' | 'ENTERPRISE_ANNUAL'
  successUrl: string;
  cancelUrl: string;
  tenantId?: string;
}

export interface TenantProvisionResult {
  tenantId: string;
  email: string;
  name: string;
  subscriptionId: string;
  planId: string;
  status: string;
  currentPeriodEnd: Date;
}

export class StripeBillingService {
  private pool = getDbPool();

  /**
   * Verify Stripe Webhook HMAC-SHA256 Signature
   * Adheres to Stripe standard: t=timestamp,v1=signature
   */
  public verifySignature(
    rawBody: string | Buffer,
    signatureHeader: string,
    secret?: string
  ): boolean {
    const webhookSecret = secret || process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret_quantum_2026';
    if (!signatureHeader || !rawBody) {
      return false;
    }

    try {
      const parts = signatureHeader.split(',');
      let timestamp = '';
      let receivedSignature = '';

      for (const part of parts) {
        const [key, value] = part.trim().split('=');
        if (key === 't') timestamp = value;
        if (key === 'v1') receivedSignature = value;
      }

      if (!timestamp || !receivedSignature) {
        // Fallback: If raw HMAC hex provided directly in test mode
        if (signatureHeader.length === 64) {
          const directHmac = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
          return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), Buffer.from(directHmac, 'hex'));
        }
        return false;
      }

      const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(receivedSignature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (err: any) {
      logger.error(`[STRIPE-BILLING] Signature verification exception: ${err.message}`);
      return false;
    }
  }

  /**
   * Create Checkout Session Mock / Stripe API Bridge
   */
  public async createCheckoutSession(params: CheckoutSessionParams): Promise<{
    sessionId: string;
    url: string;
  }> {
    const sessionId = `cs_test_${crypto.randomBytes(16).toString('hex')}`;
    const url = `https://checkout.stripe.com/c/pay/${sessionId}?success_url=${encodeURIComponent(params.successUrl)}`;

    logger.info(`[STRIPE-BILLING] Created Checkout Session ${sessionId} for ${params.email} (Plan: ${params.planId})`);
    return { sessionId, url };
  }

  /**
   * Handle checkout.session.completed:
   * 1. Auto-provisions new tenant UUID
   * 2. Inserts tenant into tenants table
   * 3. Inserts subscription record into subscriptions table
   */
  public async handleCheckoutSessionCompleted(session: any): Promise<TenantProvisionResult> {
    const email = session.customer_email || session.customer_details?.email || `subscriber_${Date.now()}@quantumai.trade`;
    const name = session.customer_details?.name || session.metadata?.name || 'QuantumAI Subscriber';
    const stripeCustomerId = session.customer || `cus_${crypto.randomBytes(12).toString('hex')}`;
    const stripeSubscriptionId = session.subscription || `sub_${crypto.randomBytes(12).toString('hex')}`;
    const planId = session.metadata?.planId || session.metadata?.plan_id || 'PRO_MONTHLY';
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default
    const preferredTenantId = session.client_reference_id || session.metadata?.tenantId;

    logger.info(`[STRIPE-BILLING] Provisioning tenant for checkout session ${session.id} (Email: ${email})`);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = 'ALL'`);

      // 1. Check or Insert Tenant
      let tenantId: string;
      const existingTenantRes = await client.query(
        `SELECT id, email, status FROM tenants WHERE email = $1`,
        [email]
      );

      if (existingTenantRes.rows.length > 0) {
        tenantId = existingTenantRes.rows[0].id;
        await client.query(
          `UPDATE tenants SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
          [tenantId]
        );
        logger.info(`[STRIPE-BILLING] Re-activated existing tenant: ${tenantId}`);
      } else {
        const generatedTenantId = preferredTenantId || crypto.randomUUID();
        const tier = planId.includes('ENTERPRISE') ? 'ENTERPRISE' : 'PRO';
        const maxRiskCap = tier === 'ENTERPRISE' ? 5.00 : 2.00;

        const insertTenantRes = await client.query(
          `INSERT INTO tenants (id, name, email, status, tier, max_accounts, max_risk_cap, created_at, updated_at)
           VALUES ($1, $2, $3, 'ACTIVE', $4, 3, $5, NOW(), NOW())
           RETURNING id`,
          [generatedTenantId, name, email, tier, maxRiskCap]
        );
        tenantId = insertTenantRes.rows[0].id;
        logger.info(`[STRIPE-BILLING] 🎉 New Tenant Provisioned: ${tenantId} (${email})`);
      }

      // 2. Insert or Upsert Subscription Record
      const subscriptionDbId = `sub_rec_${crypto.randomBytes(8).toString('hex')}`;
      await client.query(
        `INSERT INTO subscriptions (id, tenant_id, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_end, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, NOW(), NOW())
         ON CONFLICT (stripe_subscription_id) DO UPDATE 
         SET status = 'ACTIVE', current_period_end = EXCLUDED.current_period_end, updated_at = NOW()`,
        [subscriptionDbId, tenantId, stripeCustomerId, stripeSubscriptionId, planId, periodEnd]
      );

      await client.query('COMMIT');

      return {
        tenantId,
        email,
        name,
        subscriptionId: stripeSubscriptionId,
        planId,
        status: 'ACTIVE',
        currentPeriodEnd: periodEnd
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      logger.error(`[STRIPE-BILLING] Tenant provisioning failed: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Handle customer.subscription.updated
   */
  public async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const stripeSubId = subscription.id;
    const stripeStatus = (subscription.status || 'active').toUpperCase();
    const periodEnd = subscription.current_period_end 
      ? new Date(subscription.current_period_end * 1000) 
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const mappedStatus = stripeStatus === 'ACTIVE' ? 'ACTIVE' : 
                         stripeStatus === 'PAST_DUE' ? 'PAST_DUE' : 
                         stripeStatus === 'CANCELED' ? 'CANCELLED' : 'ACTIVE';

    logger.info(`[STRIPE-BILLING] Updating subscription ${stripeSubId} status to ${mappedStatus}`);

    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL app.current_tenant_id = 'ALL'`);
      const updateSubRes = await client.query(
        `UPDATE subscriptions 
         SET status = $1, current_period_end = $2, updated_at = NOW() 
         WHERE stripe_subscription_id = $3
         RETURNING tenant_id`,
        [mappedStatus, periodEnd, stripeSubId]
      );

      if (updateSubRes.rows.length > 0) {
        const tenantId = updateSubRes.rows[0].tenant_id;
        const tenantStatus = mappedStatus === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';
        await client.query(
          `UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2`,
          [tenantStatus, tenantId]
        );
        logger.info(`[STRIPE-BILLING] Tenant ${tenantId} status set to ${tenantStatus}`);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Handle customer.subscription.deleted
   */
  public async handleSubscriptionDeleted(subscription: any): Promise<void> {
    const stripeSubId = subscription.id;
    logger.warn(`[STRIPE-BILLING] Subscription cancelled / deleted: ${stripeSubId}`);

    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL app.current_tenant_id = 'ALL'`);
      const updateSubRes = await client.query(
        `UPDATE subscriptions 
         SET status = 'CANCELLED', updated_at = NOW() 
         WHERE stripe_subscription_id = $1
         RETURNING tenant_id`,
        [stripeSubId]
      );

      if (updateSubRes.rows.length > 0) {
        const tenantId = updateSubRes.rows[0].tenant_id;
        await client.query(
          `UPDATE tenants SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1`,
          [tenantId]
        );
        logger.warn(`[STRIPE-BILLING] Tenant ${tenantId} SUSPENDED due to cancelled subscription.`);
      }
    } finally {
      client.release();
    }
  }
}

export const stripeBillingService = new StripeBillingService();
