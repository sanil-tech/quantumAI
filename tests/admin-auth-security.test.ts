import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { adminAuthMiddleware, adminRouter } from '../src/server/routes/admin';
import { canonicalExecutionRouter } from '../src/server/routes/execution';

describe('Super-Admin Authentication & Multi-Tenant Security Tests', () => {
  let app: Express;
  const originalEnv = process.env;
  const TEST_ADMIN_KEY = 'super-secret-admin-key-2026';
  const TEST_JWT_SECRET = 'super-secret-jwt-key-2026';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);

    // Reset execution router to armed state before each test
    canonicalExecutionRouter.arm();
  });

  afterEach(() => {
    process.env = originalEnv;
    canonicalExecutionRouter.arm();
  });

  describe('1. Endpoint Authentication & RBAC Authorization Boundaries', () => {
    it('1.1 Unauthenticated requests to /tenants return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/admin/tenants');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
    });

    it('1.2 Unauthenticated requests to /telemetry return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/admin/telemetry');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
    });

    it('1.3 Unauthenticated requests to /kill-switch return 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/admin/kill-switch')
        .send({ action: 'DISARM' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
    });

    it('1.4 Standard tenant/trader user JWT returns 403 Forbidden', async () => {
      const tenantToken = jwt.sign(
        { userId: 'tenant-user-123', tenantId: 'tenant-uuid-456', role: 'USER' },
        TEST_JWT_SECRET
      );

      const resTenants = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', `Bearer ${tenantToken}`);
      
      expect(resTenants.status).toBe(403);
      expect(resTenants.body.success).toBe(false);
      expect(resTenants.body.error).toContain('FORBIDDEN_ADMIN_ACCESS');

      const resTelemetry = await request(app)
        .get('/api/admin/telemetry')
        .set('Authorization', `Bearer ${tenantToken}`);
      expect(resTelemetry.status).toBe(403);

      const resKill = await request(app)
        .post('/api/admin/kill-switch')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ action: 'DISARM' });
      expect(resKill.status).toBe(403);
    });

    it('1.5 Forged headers or query parameters (?adminBypass=true) are rejected with 401', async () => {
      const res = await request(app)
        .get('/api/admin/tenants?adminBypass=true')
        .set('x-user-role', 'super_admin');
      
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
    });
  });

  describe('2. Super-Admin Multi-Tenant API Operations', () => {
    it('2.1 Super-Admin JWT allows GET /api/admin/tenants with tenant list payload', async () => {
      const superAdminToken = jwt.sign(
        { userId: 'root-admin', role: 'super_admin' },
        TEST_JWT_SECRET
      );

      const res = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.tenants)).toBe(true);
      expect(res.body.tenants.length).toBeGreaterThan(0);

      const firstTenant = res.body.tenants[0];
      expect(firstTenant).toHaveProperty('tenantId');
      expect(firstTenant).toHaveProperty('accountNumber');
      expect(firstTenant).toHaveProperty('brokerName');
      expect(firstTenant).toHaveProperty('connectionType');
    });

    it('2.2 Super-Admin x-admin-key header allows GET /api/admin/telemetry with real-time socket health', async () => {
      const res = await request(app)
        .get('/api/admin/telemetry')
        .set('x-admin-key', TEST_ADMIN_KEY);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.telemetry).toBeDefined();
      expect(res.body.telemetry).toHaveProperty('socketHealth');
      expect(res.body.telemetry).toHaveProperty('latencyMs');
      expect(res.body.telemetry).toHaveProperty('globalOrdersCount');
      expect(res.body.telemetry).toHaveProperty('executionGate');
      expect(res.body.telemetry.executionGate).toBe('ARMED');
    });

    it('2.3 Super-Admin POST /api/admin/kill-switch can DISARM and ARM execution router', async () => {
      const superAdminToken = jwt.sign(
        { userId: 'root-admin', role: 'super_admin' },
        TEST_JWT_SECRET
      );

      // Step 1: Disarm Global Kill Switch
      const disarmRes = await request(app)
        .post('/api/admin/kill-switch')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ action: 'DISARM', reason: 'High volatility safety halt' });

      expect(disarmRes.status).toBe(200);
      expect(disarmRes.body.success).toBe(true);
      expect(disarmRes.body.action).toBe('DISARM');
      expect(disarmRes.body.killSwitchState.isGlobalArmed).toBe(false);

      // Verify Telemetry reflects DISARMED state
      const telemRes = await request(app)
        .get('/api/admin/telemetry')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(telemRes.body.telemetry.executionGate).toBe('DISARMED');
      expect(telemRes.body.telemetry.isKillSwitchActive).toBe(true);

      // Step 2: Restore / Arm Execution Router
      const armRes = await request(app)
        .post('/api/admin/kill-switch')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ action: 'ARM' });

      expect(armRes.status).toBe(200);
      expect(armRes.body.success).toBe(true);
      expect(armRes.body.action).toBe('ARM');
      expect(armRes.body.killSwitchState.isGlobalArmed).toBe(true);
    });

    it('2.4 Per-Tenant Kill Switch isolates specific tenant while keeping global engine armed', async () => {
      const superAdminToken = jwt.sign(
        { userId: 'root-admin', role: 'super_admin' },
        TEST_JWT_SECRET
      );

      const targetTenantId = 'tenant-xyz-999';

      const res = await request(app)
        .post('/api/admin/kill-switch')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ action: 'DISARM', tenantId: targetTenantId, reason: 'Tenant risk margin violation' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.killSwitchState.isGlobalArmed).toBe(true);
      expect(res.body.killSwitchState.tenantStates[targetTenantId].isArmed).toBe(false);
    });
  });

  describe('3. Execution Engine Invariant: Fail-Closed on Disarm', () => {
    it('3.1 Disarmed router immediately rejects order execution requests', async () => {
      canonicalExecutionRouter.disarm(undefined, 'Emergency Test Disarm');

      const mockPayload: any = {
        proposal_id: 'prop-test-01',
        approval_id: 'gov-test-01',
        symbol: 'EURUSD',
        account_id: '5881460',
        approval_token: {
          approvalId: 'gov-test-01',
          signalId: 'prop-test-01',
          symbol: 'EURUSD',
          direction: 'BUY',
          approvedLotSize: 0.01,
          status: 'APPROVED',
          riskCheckTimestamp: Date.now()
        },
        trade_proposal: {
          direction: 'BUY',
          symbol: 'EURUSD'
        }
      };

      await expect(canonicalExecutionRouter.handleRiskCleared(mockPayload)).rejects.toThrow(
        /KILL_SWITCH_ACTIVE/
      );
    });
  });
});