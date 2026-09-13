import { Router, Request, Response } from 'express';
import { stripeBillingService } from '../services/stripeBillingService';
import { webhookInboxService } from '../services/webhookInboxService';
import { logger } from '@iati/core';

export const billingRouter = Router();

/**
 * POST /api/billing/create-checkout-session
 * Creates Stripe Checkout Session for subscription tier
 */
billingRouter.post('/create-checkout-session', async (req: Request, res: Response) => {
  try {
    const { email, name, planId, successUrl, cancelUrl, tenantId } = req.body || {};

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'EMAIL_REQUIRED: Subscriber email is mandatory for checkout session creation.'
      });
    }

    const result = await stripeBillingService.createCheckoutSession({
      email,
      name: name || 'QuantumAI Trader',
      planId: planId || 'PRO_MONTHLY',
      successUrl: successUrl || 'http://localhost:5173/dashboard?checkout=success',
      cancelUrl: cancelUrl || 'http://localhost:5173/pricing?checkout=cancelled',
      tenantId
    });

    res.json({
      success: true,
      sessionId: result.sessionId,
      checkoutUrl: result.url
    });
  } catch (err: any) {
    logger.error(`[BILLING-ROUTE] Checkout session creation error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/billing/webhook
 * Official Stripe Webhook Handler with HMAC Signature Verification & Idempotent Inbox
 */
billingRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string | undefined;
    const rawBody = (req as any).rawBody || (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body));
    const payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(rawBody.toString('utf-8'));

    const result = await webhookInboxService.processStripeWebhook(
      payload,
      signature,
      rawBody
    );

    if (result.status === 'INVALID_SIGNATURE') {
      return res.status(400).json({
        received: false,
        error: result.message
      });
    }

    res.status(200).json({
      received: true,
      eventId: result.eventId,
      eventType: result.eventType,
      status: result.status,
      isDuplicate: result.isDuplicate || false,
      tenantId: result.tenantId,
      message: result.message
    });
  } catch (err: any) {
    logger.error(`[BILLING-ROUTE] Stripe Webhook processing failed: ${err.message}`);
    res.status(400).json({
      received: false,
      error: `Webhook Error: ${err.message}`
    });
  }
});
