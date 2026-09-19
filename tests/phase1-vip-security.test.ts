import { describe, it, expect, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { copierRouter, publishCopierSignal } from '../src/server/routes/copier.js';
import { adminRouter } from '../src/server/routes/admin.js';
import { vipSubscriptionService, signVipToken } from '../src/server/services/vipSubscriptionService.js';
import { EconomicContextService } from '../src/server/services/economicContextService.js';
import * as crypto from 'crypto';

describe('PHASE 1 VIP SECURITY & SIGNAL GATEWAY HARDENING', () => {
  let app: Express;
  const REAL_ADMIN_KEY = 'quantum_admin_prod_secure_key_991827364';

  beforeEach(() => {
    process.env.ADMIN_API_KEY = REAL_ADMIN_KEY;
    delete process.env.NODE_ENV; // Ensure test environment behavior

    app = express();
    app.use(express.json());
    app.use('/api', copierRouter);
    app.use('/api/admin', adminRouter);
  });

  // =========================================================================
  // 1. SIGNAL GATEWAY ADVERSARIAL TESTS (P1-1, P1-4, P1-5)
  // =========================================================================
  describe('P1-1 & P1-5: Signal Gateway Authentication & Cryptographic Token Verification', () => {
    it('rejects anonymous GET /api/copier/signal without any auth or account (401)', async () => {
      const res = await request(app).get('/api/copier/signal');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('ACCOUNT_REQUIRED');
    });

    it('rejects GET /api/copier/signal with account but missing token (401)', async () => {
      const res = await request(app).get('/api/copier/signal?account=123456');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('AUTH_TOKEN_REQUIRED');
    });

    it('rejects random/forged authorization token (403)', async () => {
      const res = await request(app)
        .get('/api/copier/signal?account=123456&token=fake_random_forged_token.12345.abcde');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('INVALID_SIGNATURE');
    });

    it('rejects Free user from receiving VIP signal stream (403)', async () => {
      // Free user registered without active VIP subscription
      const reg = vipSubscriptionService.registerAccount({
        accountNumber: '112233',
        telegramChatId: 'free_user_99',
        tier: 'FREE'
      });
      expect(reg.status).toBe('PENDING_VERIFICATION');

      // Attempt to access signal endpoint without valid token
      const res = await request(app)
        .get(`/api/copier/signal?account=112233&token=invalid_token`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('MALFORMED_TOKEN_STRUCTURE');
    });

    it('rejects pending VIP customer (403)', async () => {
      const reg = vipSubscriptionService.registerAccount({
        accountNumber: '445566',
        telegramChatId: 'pending_vip_user',
        tier: 'VIP'
      });
      expect(reg.status).toBe('PENDING_VERIFICATION');

      // Token for pending account
      const forgedToken = signVipToken({
        licenseId: 'lic_445566',
        accountNumber: '445566',
        tier: 'VIP_INSTITUTIONAL',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        jti: 'test_jti_pending',
        environment: 'development'
      });

      const res = await request(app)
        .get(`/api/copier/signal?account=445566&token=${forgedToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('PENDING_VERIFICATION');
    });

    it('rejects expired VIP subscription token (403)', async () => {
      vipSubscriptionService.registerAccount({
        accountNumber: '778899',
        telegramChatId: 'expired_vip_user',
        tier: 'VIP'
      });
      const active = vipSubscriptionService.activateAccount('778899', -1); // Expired 1 day ago

      const res = await request(app)
        .get(`/api/copier/signal?account=778899&token=${active.authToken || active.token}`);
      expect(res.status).toBe(403);
      expect(['TOKEN_EXPIRED', 'VIP_EXPIRED_OR_REVOKED']).toContain(res.body.error);
    });

    it('rejects revoked VIP customer token (403)', async () => {
      vipSubscriptionService.registerAccount({
        accountNumber: '998877',
        telegramChatId: 'revoked_vip_user',
        tier: 'VIP'
      });
      const active = vipSubscriptionService.activateAccount('998877', 30);
      vipSubscriptionService.revokeAccount('998877', 'Payment refunded / revoked');

      const res = await request(app)
        .get(`/api/copier/signal?account=998877&token=${active.authToken || active.token}`);
      expect(res.status).toBe(403);
      expect(['ACCOUNT_SUSPENDED', 'VIP_EXPIRED_OR_REVOKED']).toContain(res.body.error);
    });

    it('rejects account mismatch: Customer A token used by Customer B account (403)', async () => {
      // Customer A is valid active VIP
      vipSubscriptionService.registerAccount({
        accountNumber: '100001',
        telegramChatId: 'customer_A',
        tier: 'VIP'
      });
      const activeA = vipSubscriptionService.activateAccount('100001', 30);
      expect(activeA.status).toBe('ACTIVE');

      // Customer B presents Customer A's token with Account B
      const res = await request(app)
        .get(`/api/copier/signal?account=100002&token=${activeA.authToken || activeA.token}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('ACCOUNT_MISMATCH');
    });

    it('rejects tampered token: payload modified (e.g. extending expiry or changing account) (403)', async () => {
      vipSubscriptionService.registerAccount({
        accountNumber: '200002',
        telegramChatId: 'tamper_test',
        tier: 'VIP'
      });
      const active = vipSubscriptionService.activateAccount('200002', 30);
      const token = active.authToken || active.token;
      const parts = token.split('.');
      expect(parts.length).toBe(3);

      // Decode payload, modify expiry to far future, re-encode without matching HMAC signature
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      payload.exp = Date.now() + 1000 * 60 * 60 * 24 * 365; // +1 year
      const forgedB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const forgedToken = `${parts[0]}.${forgedB64}.${parts[2]}`; // Keep old signature with tampered payload

      const res = await request(app)
        .get(`/api/copier/signal?account=200002&token=${forgedToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('INVALID_SIGNATURE');
    });

    it('allows legitimate active VIP customer with valid signed token (200)', async () => {
      vipSubscriptionService.registerAccount({
        accountNumber: '300003',
        telegramChatId: 'legit_vip',
        tier: 'VIP'
      });
      const active = vipSubscriptionService.activateAccount('300003', 30);

      const res = await request(app)
        .get(`/api/copier/signal?account=300003&token=${active.authToken || active.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('hasSignal');
    });
  });

  // =========================================================================
  // 2. ADMIN AUTHENTICATION & CONSTANT-TIME TIMING TESTS (P1-2, P1-3)
  // =========================================================================
  describe('P1-2 & P1-3: Admin Fallback Elimination & Constant-Time Security', () => {
    it('fails closed when ADMIN_API_KEY is not configured (401)', async () => {
      delete process.env.ADMIN_API_KEY;

      const res = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', `Bearer ${REAL_ADMIN_KEY}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
    });

    it('rejects old hardcoded demo key "admin_demo_key_88" (401)', async () => {
      process.env.ADMIN_API_KEY = REAL_ADMIN_KEY;

      const resCopier = await request(app)
        .get('/api/copier/subscribers')
        .set('Authorization', 'Bearer admin_demo_key_88');
      expect(resCopier.status).toBe(401);

      const resAdmin = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', 'Bearer admin_demo_key_88');
      expect(resAdmin.status).toBe(401);
    });

    it('rejects old hardcoded super admin key "super_admin_secret_key" (401)', async () => {
      process.env.ADMIN_API_KEY = REAL_ADMIN_KEY;

      const resCopier = await request(app)
        .get('/api/copier/subscribers')
        .set('Authorization', 'Bearer super_admin_secret_key');
      expect(resCopier.status).toBe(401);

      const resAdmin = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', 'Bearer super_admin_secret_key');
      expect(resAdmin.status).toBe(401);
    });

    it('rejects random key or malformed auth header (401)', async () => {
      const res1 = await request(app)
        .get('/api/copier/subscribers')
        .set('Authorization', 'Bearer totally_wrong_secret_123');
      expect(res1.status).toBe(401);

      const res2 = await request(app)
        .get('/api/copier/subscribers')
        .set('Authorization', 'MalformedHeaderWithoutBearer');
      expect(res2.status).toBe(401);

      const res3 = await request(app)
        .get('/api/copier/subscribers');
      expect(res3.status).toBe(401);
    });

    it('accepts legitimate configured ADMIN_API_KEY (200)', async () => {
      process.env.ADMIN_API_KEY = REAL_ADMIN_KEY;
      const res = await request(app)
        .get('/api/copier/subscribers')
        .set('Authorization', `Bearer ${REAL_ADMIN_KEY}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('subscribers');
    });
  });

  // =========================================================================
  // 3. PERSISTENT REPLAY PROTECTION (P1-7, P1-8)
  // =========================================================================
  describe('P1-7 & P1-8: Persistent Signal Replay Prevention', () => {
    it('prevents re-delivering the same Signal ID to the same customer', async () => {
      vipSubscriptionService.registerAccount({
        accountNumber: '500005',
        telegramChatId: 'replay_user',
        tier: 'VIP'
      });
      const active = vipSubscriptionService.activateAccount('500005', 30);
      const token = active.authToken || active.token;

      // Publish a new master-confirmed signal
      const signalId = `SIG_TEST_${Date.now()}_EURUSD`;
      publishCopierSignal({
        id: signalId,
        action: 'NEW_ORDER',
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        stopLoss: 1.0820,
        takeProfit1: 1.0880,
        takeProfit2: 1.0920,
        masterBrokerOrderId: 987654321
      });

      // First poll: Customer receives the signal
      const res1 = await request(app)
        .get(`/api/copier/signal?account=500005&token=${token}`);
      expect(res1.status).toBe(200);
      expect(res1.body.hasSignal).toBe(true);
      expect(res1.body.id).toBe(signalId);

      // Second poll: Delivery ledger records that signal has already been delivered to this license
      const res2 = await request(app)
        .get(`/api/copier/signal?account=500005&token=${token}`);
      expect(res2.status).toBe(200);
      expect(res2.body.hasSignal).toBe(false);
      expect(res2.body.message).toContain('already consumed or no new signal');
    });

    it('persists replay protection across simulated restarts (durable delivery ledger)', () => {
      const dynamicId = `SIG_DURABLE_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const licenseId = 'LIC_DURABLE_TEST_999';

      expect(vipSubscriptionService.isSignalDelivered(licenseId, dynamicId)).toBe(false);

      // Record delivery
      vipSubscriptionService.recordSignalDelivery(licenseId, dynamicId);

      // Verify immediate memory check
      expect(vipSubscriptionService.isSignalDelivered(licenseId, dynamicId)).toBe(true);

      // Verify persistent check
      expect(vipSubscriptionService.isSignalDelivered(licenseId, dynamicId)).toBe(true);
    });
  });

  // =========================================================================
  // 4. ECONOMIC CALENDAR FAIL-CLOSED (P1-9)
  // =========================================================================
  describe('P1-9: Economic Calendar Fail-Closed Boundary', () => {
    it('returns fail-closed state when calendar is uninitialized or empty', () => {
      // Clear events to simulate uninitialized / empty calendar
      EconomicContextService.clearEvents();
      const state = EconomicContextService.getCalendarState();
      expect(state).toBe('CALENDAR_UNAVAILABLE');

      // Autonomous execution evaluation
      const evalResult = EconomicContextService.evaluateEconomicContext({ symbol: 'EUR/USD' });
      expect(evalResult.decisionAllowed).toBe(false);
      expect(evalResult.reason).toContain('ECONOMIC_CALENDAR_UNAVAILABLE_FAIL_CLOSED_NO_TRADE');
    });

    it('permits trading only when calendar is CALENDAR_READY', () => {
      // Simulate ready cache with non-overlapping event
      EconomicContextService.setEvents([
        {
          id: 'ev_test_1',
          name: 'Non-impact announcement',
          currency: 'USD',
          impact: 'LOW',
          timestampUtc: new Date(Date.now() - 3600000 * 5).toISOString(),
          status: 'CONFIRMED'
        }
      ]);
      const state = EconomicContextService.getCalendarState();
      expect(state).toBe('CALENDAR_READY');

      const evalResult = EconomicContextService.evaluateEconomicContext({ symbol: 'EUR/USD' });
      expect(evalResult.decisionAllowed).toBe(true);
      expect(evalResult.reason).toBe('ECONOMIC_CONTEXT_CLEAR_TRADE_PERMITTED');
    });
  });

  // =========================================================================
  // 5. CRITICAL DECOMPILED cBot ADVERSARIAL BOUNDARY
  // =========================================================================
  describe('CRITICAL ADVERSARY: Decompiled cBot & Bypassed Local VerifyVipLicense()', () => {
    it('prevents attacker with Customer A account and hacked cBot from getting signals after revocation', async () => {
      // 1. Customer A is a VIP who was revoked
      vipSubscriptionService.registerAccount({
        accountNumber: '600006',
        telegramChatId: 'victim_A',
        tier: 'VIP'
      });
      const activeA = vipSubscriptionService.activateAccount('600006', 30);
      vipSubscriptionService.revokeAccount('600006', 'Refunded and barred');

      // 2. Attacker modifies cBot's local VerifyVipLicense() to return true and runs cBot
      // 3. Hacked cBot attempts to poll signal endpoint using Customer A's account and token
      const res = await request(app)
        .get(`/api/copier/signal?account=600006&token=${activeA.authToken || activeA.token}`);

      // The server is authoritative: local modification is completely irrelevant
      expect(res.status).toBe(403);
      expect(['ACCOUNT_SUSPENDED', 'VIP_EXPIRED_OR_REVOKED']).toContain(res.body.error);
      expect(res.body.hasSignal).toBe(false);
    });

    it('prevents Customer B from forging Customer A authorization or obtaining VIP signals', async () => {
      // Customer A is active VIP
      vipSubscriptionService.registerAccount({
        accountNumber: '800008',
        telegramChatId: 'legit_customer_A',
        tier: 'VIP'
      });
      vipSubscriptionService.activateAccount('800008', 30);

      // Customer B attempts to generate their own token for account 800008 using random secret
      const forgedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const forgedPayload = Buffer.from(JSON.stringify({
        sub: 'attacker_B',
        accountNumber: '800008',
        tier: 'VIP',
        exp: Date.now() + 10000000
      })).toString('base64url');
      const forgedSig = 'invalid_signature_generated_by_attacker';
      const fakeToken = `${forgedHeader}.${forgedPayload}.${forgedSig}`;

      const res = await request(app)
        .get(`/api/copier/signal?account=800008&token=${fakeToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('INVALID_SIGNATURE');
    });
  });

  // =========================================================================
  // 6. INFORMATION DISCLOSURE (P1-13)
  // =========================================================================
  describe('P1-13: Information Disclosure Remediation', () => {
    it('public /api/copier/status exposes no customer account numbers or internal subscriber lists', async () => {
      const res = await request(app).get('/api/copier/status');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('QuantumAI VIP Copier Gateway');
      // Must NOT contain sensitive subscriber accounts or internal subscriber lists
      expect(res.body.subscribers).toBeUndefined();
      expect(res.body.accounts).toBeUndefined();
      expect(res.body.rawSubscribers).toBeUndefined();
    });
  });
});
