import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { brokerRouter, serverBrokerConnection } from '../src/server/routes/broker';

const app = express();
app.use(express.json());
app.use('/api', brokerRouter);

describe('cTrader Broker Connection Flow & Telemetry Verification', () => {
  it('1. GET /api/broker/status should return active cTrader connection telemetry', async () => {
    const res = await request(app).get('/api/broker/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('connected', true);
    expect(res.body).toHaveProperty('accountNumber', '5881460');
    expect(res.body).toHaveProperty('platform', 'CTRADER');
    expect(typeof res.body.liveBalance).toBe('number');
    expect(res.body.liveBalance).toBeGreaterThan(0);
  });

  it('2. GET /api/broker/ping should return low latency round-trip status', async () => {
    const res = await request(app).get('/api/broker/ping');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('ONLINE');
    expect(typeof res.body.latencyMs).toBe('number');
  });

  it('3. POST /api/broker/connect should establish a new broker session with custom settings', async () => {
    const payload = {
      platform: 'CTRADER',
      brokerName: 'Spotware cTrader Cloud (Official Open API)',
      accountNumber: '5881460',
      environment: 'DEMO',
      serverHost: 'demo.ctraderapi.com:5035',
      customBalance: 1225.43
    };

    const res = await request(app)
      .post('/api/broker/connect')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.connection.accountNumber).toBe('5881460');
    expect(res.body.connection.platform).toBe('CTRADER');
    expect(res.body.connection.isConnected).toBe(true);
  });

  it('4. POST /api/broker/disconnect and reconnect flow should update state correctly', async () => {
    // Disconnect
    const discRes = await request(app).post('/api/broker/disconnect');
    expect(discRes.status).toBe(200);
    expect(discRes.body.success).toBe(true);

    // Verify disconnected in status
    const statusRes = await request(app).get('/api/broker/status');
    expect(statusRes.body.connected).toBe(false);

    // Reconnect
    const reconRes = await request(app)
      .post('/api/broker/connect')
      .send({
        platform: 'CTRADER',
        brokerName: 'Spotware cTrader Open API',
        accountNumber: '5881460',
        environment: 'DEMO'
      });
    expect(reconRes.body.success).toBe(true);
    expect(reconRes.body.connection.isConnected).toBe(true);
  });
});
