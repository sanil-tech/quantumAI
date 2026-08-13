import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { adminAuthMiddleware, adminRouter } from '../src/server/routes/admin';

describe('Admin Authentication Security Tests (Blocker 1 Remediation)', () => {
  let app: Express;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADMIN_API_KEY = 'valid-production-admin-key-9988';
    process.env.JWT_SECRET = 'valid-jwt-secret-key-1122';
    
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('1. Unauthenticated request returns 401 Unauthorized', async () => {
    const res = await request(app).get('/api/admin/trades');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
  });

  it('2. Authenticated non-admin user JWT returns 403 Forbidden', async () => {
    const userToken = jwt.sign({ userId: 'user-123', role: 'trader' }, process.env.JWT_SECRET!);
    const res = await request(app)
      .get('/api/admin/trades')
      .set('Authorization', `Bearer ${userToken}`);
    
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('FORBIDDEN_ADMIN_ACCESS');
  });

  it('3. Authenticated admin user JWT is allowed', async () => {
    const adminToken = jwt.sign({ userId: 'admin-1', role: 'admin' }, process.env.JWT_SECRET!);
    const res = await request(app)
      .get('/api/admin/trades')
      .set('Authorization', `Bearer ${adminToken}`);
    
    // Status should not be 401 or 403 (will attempt DB query or handle)
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('3b. Direct x-admin-key header is allowed', async () => {
    const res = await request(app)
      .get('/api/admin/trades')
      .set('x-admin-key', 'valid-production-admin-key-9988');
    
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('4. Forged x-user-role header is rejected (returns 401)', async () => {
    const res = await request(app)
      .get('/api/admin/trades')
      .set('x-user-role', 'admin');
    
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
  });

  it('5. ?adminBypass=true query parameter is rejected (returns 401)', async () => {
    const res = await request(app)
      .get('/api/admin/trades?adminBypass=true');
    
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
  });

  it('6. Missing or invalid credentials return 401', async () => {
    const res = await request(app)
      .get('/api/admin/trades')
      .set('Authorization', 'Bearer invalid-token-12345');
    
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
  });

  it('7. Production configuration fails closed without env keys', async () => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.JWT_SECRET;

    const res = await request(app)
      .get('/api/admin/trades')
      .set('x-admin-key', 'quantum-admin-secret-2026');
    
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
  });
});