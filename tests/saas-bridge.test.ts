import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { saasBridgeRouter } from '../src/server/routes/saasBridge';

const app = express();
app.use(express.json());
app.use('/api/saas', saasBridgeRouter);

describe('SaaS Bridge Router for Base44 Integration', () => {
  it('GET /api/saas/health should return engine status without auth', async () => {
    const res = await request(app).get('/api/saas/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.engine).toBe('ONLINE');
    expect(res.body.broker).toBeDefined();
  });

  it('GET /api/saas/stats/global should return aggregated stats without auth', async () => {
    const res = await request(app).get('/api/saas/stats/global');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.winRatePercent).toBeGreaterThan(0);
    expect(res.body.data.activeSubscribers).toBeDefined();
  });

  it('POST /api/saas/users/sync should reject unauthorized requests', async () => {
    const res = await request(app)
      .post('/api/saas/users/sync')
      .send({ email: 'test@example.com', cTraderAccountNumber: '123456' });
    expect(res.status).toBe(401);
  });

  it('POST /api/saas/users/sync should succeed with valid x-saas-api-key', async () => {
    const res = await request(app)
      .post('/api/saas/users/sync')
      .set('x-saas-api-key', process.env.ADMIN_API_KEY || 'quantum-saas-secret-2026')
      .send({
        email: 'trader1@client.com',
        name: 'Ahmad Trader',
        cTraderAccountNumber: '998877',
        plan: 'FREE_TRIAL',
        status: 'TRIAL'
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.subscriber.accountNumber).toBe('998877');
    expect(res.body.subscriber.status).toBe('TRIAL');
  });

  it('GET /api/saas/users/998877/cockpit should return subscriber cockpit with auth', async () => {
    const res = await request(app)
      .get('/api/saas/users/998877/cockpit')
      .set('x-saas-api-key', process.env.ADMIN_API_KEY || 'quantum-saas-secret-2026');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.subscriber.accountNumber).toBe('998877');
  });
});
