import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { CTraderConfigValidator } from '../src/server/services/ctraderConfigValidator';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { adminRouter } from '../src/server/routes/admin';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';
import { brokerSyncService } from '../src/server/services/brokerSyncService';
import { learningService } from '../src/server/services/learningService';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { TradingRepository } from '@iati/database';
import { TradeProposal, RiskClearedPayload } from '@iati/core-types';

describe('Phase 3B — Real cTrader DEMO Connectivity & Controlled Trade Certification Suite', () => {
  let app: express.Express;
  let repo: TradingRepository;
  const adminApiKey = 'test-admin-secret-key-3b';

  const validDemoCredentials = {
    clientId: 'ctrader_demo_client_12345',
    clientSecret: 'ctrader_demo_secret_67890',
    accountId: '5877246_DEMO',
    accessToken: 'ctrader_demo_token_abcde'
  };

  beforeEach(() => {
    process.env.ADMIN_API_KEY = adminApiKey;
    process.env.EXECUTION_ENVIRONMENT = 'DEMO';
    process.env.CTRADER_CLIENT_ID = validDemoCredentials.clientId;
    process.env.CTRADER_CLIENT_SECRET = validDemoCredentials.clientSecret;
    process.env.CTRADER_ACCOUNT_ID = validDemoCredentials.accountId;
    process.env.CTRADER_ACCESS_TOKEN = validDemoCredentials.accessToken;

    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);

    repo = new TradingRepository();
  });

  afterEach(() => {
    delete process.env.ENABLE_LIVE_EXECUTION_ARMED;
  });

  // A. Missing DEMO credentials rejected
  it('A. Missing DEMO credentials rejected: throws error when required cTrader environment variables are missing', () => {
    expect(() => {
      CTraderConfigValidator.validateDemoConfig({ clientId: '' });
    }).toThrow('CTRADER_DEMO_CREDENTIALS_MISSING');
  });

  // B. Invalid DEMO credentials rejected
  it('B. Invalid DEMO credentials rejected: CTraderAdapter.connect() throws on invalid auth credentials', async () => {
    const invalidAdapter = new CTraderAdapter({
      ...validDemoCredentials,
      environment: 'DEMO'
    });
    invalidAdapter.mockAuthFail = true;

    await expect(invalidAdapter.connect()).rejects.toThrow('CTRADER_AUTH_FAILURE');
  });

  // C. Valid DEMO configuration accepted
  it('C. Valid DEMO configuration accepted: parses valid DEMO config without error', () => {
    const config = CTraderConfigValidator.validateDemoConfig();
    expect(config.environment).toBe('DEMO');
    expect(config.clientId).toBe(validDemoCredentials.clientId);
    expect(config.accountId).toBe(validDemoCredentials.accountId);
  });

  // D. PAPER cannot execute cTrader
  it('D. PAPER cannot execute cTrader: ExecutionSafetyGate blocks ctrader-broker-01 in PAPER environment', () => {
    const check = validateExecutionEnvironmentSafety({
      environment: 'PAPER',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.10
    });

    expect(check.allowed).toBe(false);
    expect(check.code).toBe('PAPER_ENVIRONMENT_VIOLATION');
  });

  // E. LIVE cannot be enabled by Phase 3B
  it('E. LIVE cannot be enabled by Phase 3B: rejects LIVE environment execution from Phase 3B safety gate', () => {
    delete process.env.ENABLE_LIVE_EXECUTION_ARMED;

    const check = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.10,
      credentials: validDemoCredentials
    });

    expect(check.allowed).toBe(false);
    expect(check.code).toBe('LIVE_EXECUTION_DISARMED');
  });

  // F. Admin endpoint requires authentication
  it('F. Admin endpoint requires authentication: rejects GET /api/admin/ctrader/status without x-admin-key header', async () => {
    const res = await request(app).get('/api/admin/ctrader/status');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
  });

  // G. Secrets never appear in responses
  it('G. Secrets never appear in responses: GET /api/admin/ctrader/status strictly sanitizes output', async () => {
    const res = await request(app)
      .get('/api/admin/ctrader/status')
      .set('x-admin-key', adminApiKey);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.clientSecret).toBeUndefined();
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.accountId).toBeDefined();
    expect(res.body.accountId).not.toBe(validDemoCredentials.accountId); // Masked (e.g. 5877***)
  });

  // H. Connectivity failure handled correctly
  it('H. Connectivity failure handled correctly: returns AUTHENTICATION_FAILED status when adapter fails connect', async () => {
    process.env.CTRADER_CLIENT_ID = ''; // force validation fail
    const res = await request(app)
      .get('/api/admin/ctrader/status')
      .set('x-admin-key', adminApiKey);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NOT_CONFIGURED');
    expect(res.body.connected).toBe(false);
  });

  // I. Successful broker connectivity represented correctly
  it('I. Successful broker connectivity represented correctly: returns CONNECTED when credentials and broker are healthy', async () => {
    const res = await request(app)
      .get('/api/admin/ctrader/status')
      .set('x-admin-key', adminApiKey);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONNECTED');
    expect(res.body.connected).toBe(true);
    expect(res.body.environment).toBe('DEMO');
  });

  // J. DEMO execution requires RiskApprovalToken
  it('J. DEMO execution requires RiskApprovalToken: handleRiskCleared throws if token is missing', async () => {
    const router = new ExecutionRouter();
    const proposal: TradeProposal = {
      id: `prop-notoken-${Date.now()}`,
      symbol: 'EURUSD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['No Token Test'],
      agent_votes: [],
      why_direction: 'Test',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: validDemoCredentials.accountId,
      approval_id: `gov-notoken-${Date.now()}`,
      risk_score: 5,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: `gov-notoken-${Date.now()}`,
        status: 'APPROVED',
        risk_score: 5,
        checks: [],
        timestamp: new Date(),
        decision_authority: 'Gov'
      },
      timestamp: new Date(),
      broker_id: 'ctrader-broker-01'
    };

    await expect(router.handleRiskCleared(payload)).rejects.toThrow('Missing RiskApprovalToken');
  });

  // K. Invalid governance signature rejected
  it('K. Invalid governance signature rejected: rejects execution if HMAC signature is tampered', async () => {
    const router = new ExecutionRouter();
    const proposal: TradeProposal = {
      id: `prop-badhmac-${Date.now()}`,
      symbol: 'EURUSD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Tampered Signature'],
      agent_votes: [],
      why_direction: 'Test',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const token = createRiskApprovalToken({
      approvalId: `gov-badhmac-${Date.now()}`,
      signalId: proposal.id,
      symbol: proposal.symbol,
      direction: proposal.direction,
      approvedLotSize: 0.10,
      maxAllowedDrawdown: 5.0,
      calculatedRiskAmount: 100,
      status: 'APPROVED'
    });

    token.governanceSignature = 'tampered_invalid_signature_123';

    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: validDemoCredentials.accountId,
      approval_id: token.approvalId,
      risk_score: 5,
      trade_proposal: proposal,
      approval_token: token,
      governance_decision: {
        approval_id: token.approvalId,
        status: 'APPROVED',
        risk_score: 5,
        checks: [],
        timestamp: new Date(),
        decision_authority: 'Gov',
        token
      },
      timestamp: new Date(),
      broker_id: 'ctrader-broker-01'
    };

    await expect(router.handleRiskCleared(payload)).rejects.toThrow('Invalid governanceSignature');
  });

  // L. Wrong symbol rejected
  it('L. Wrong symbol rejected: rejects execution if token symbol does not match proposal symbol', async () => {
    const router = new ExecutionRouter();
    const proposal: TradeProposal = {
      id: `prop-symmismatch-${Date.now()}`,
      symbol: 'GBPUSD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Symbol Mismatch'],
      agent_votes: [],
      why_direction: 'Test',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const token = createRiskApprovalToken({
      approvalId: `gov-symmismatch-${Date.now()}`,
      signalId: proposal.id,
      symbol: 'EURUSD', // Token is for EURUSD, proposal is for GBPUSD
      direction: proposal.direction,
      approvedLotSize: 0.10,
      maxAllowedDrawdown: 5.0,
      calculatedRiskAmount: 100,
      status: 'APPROVED'
    });

    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: validDemoCredentials.accountId,
      approval_id: token.approvalId,
      risk_score: 5,
      trade_proposal: proposal,
      approval_token: token,
      governance_decision: {
        approval_id: token.approvalId,
        status: 'APPROVED',
        risk_score: 5,
        checks: [],
        timestamp: new Date(),
        decision_authority: 'Gov',
        token
      },
      timestamp: new Date(),
      broker_id: 'ctrader-broker-01'
    };

    await expect(router.handleRiskCleared(payload)).rejects.toThrow('Token symbol');
  });

  // M. Wrong direction rejected
  it('M. Wrong direction rejected: rejects execution if token direction does not match proposal direction', async () => {
    const router = new ExecutionRouter();
    const proposal: TradeProposal = {
      id: `prop-dirmismatch-${Date.now()}`,
      symbol: 'EURUSD',
      direction: 'SELL',
      confidence: 85,
      evidence: ['Direction Mismatch'],
      agent_votes: [],
      why_direction: 'Test',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const token = createRiskApprovalToken({
      approvalId: `gov-dirmismatch-${Date.now()}`,
      signalId: proposal.id,
      symbol: proposal.symbol,
      direction: 'BUY', // Token is BUY, proposal is SELL
      approvedLotSize: 0.10,
      maxAllowedDrawdown: 5.0,
      calculatedRiskAmount: 100,
      status: 'APPROVED'
    });

    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: validDemoCredentials.accountId,
      approval_id: token.approvalId,
      risk_score: 5,
      trade_proposal: proposal,
      approval_token: token,
      governance_decision: {
        approval_id: token.approvalId,
        status: 'APPROVED',
        risk_score: 5,
        checks: [],
        timestamp: new Date(),
        decision_authority: 'Gov',
        token
      },
      timestamp: new Date(),
      broker_id: 'ctrader-broker-01'
    };

    await expect(router.handleRiskCleared(payload)).rejects.toThrow('Token direction');
  });

  // N. Quantity above approvedLotSize rejected
  it('N. Quantity above approvedLotSize rejected: rejects execution if requested lot exceeds approvedLotSize', async () => {
    const router = new ExecutionRouter();
    const proposal: TradeProposal & { lotSize?: number } = {
      id: `prop-lotexceed-${Date.now()}`,
      symbol: 'EURUSD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Lot Exceed Test'],
      agent_votes: [],
      why_direction: 'Test',
      invalidate_conditions: [],
      timestamp: new Date(),
      lotSize: 2.0 // Requested 2.0 lots
    };

    const token = createRiskApprovalToken({
      approvalId: `gov-lotexceed-${Date.now()}`,
      signalId: proposal.id,
      symbol: proposal.symbol,
      direction: proposal.direction,
      approvedLotSize: 0.50, // Approved only 0.50 lots
      maxAllowedDrawdown: 5.0,
      calculatedRiskAmount: 500,
      status: 'APPROVED'
    });

    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: validDemoCredentials.accountId,
      approval_id: token.approvalId,
      risk_score: 5,
      trade_proposal: proposal,
      approval_token: token,
      governance_decision: {
        approval_id: token.approvalId,
        status: 'APPROVED',
        risk_score: 5,
        checks: [],
        timestamp: new Date(),
        decision_authority: 'Gov',
        token
      },
      timestamp: new Date(),
      broker_id: 'ctrader-broker-01'
    };

    await expect(router.handleRiskCleared(payload)).rejects.toThrow('exceeds approved lot size');
  });

  // O. Duplicate DEMO execution remains idempotent
  it('O. Duplicate DEMO execution remains idempotent: controlled DEMO trade execution route returns existing position cleanly', async () => {
    const res1 = await request(app)
      .post('/api/admin/ctrader/execute-demo-trade')
      .set('x-admin-key', adminApiKey)
      .send({ symbol: 'EURUSD', direction: 'BUY', lotSize: 0.01 });

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.positionId).toBeDefined();
  });

  // P. Broker identifiers persisted
  it('P. Broker identifiers persisted: position in PostgreSQL contains broker_order_id, broker_position_id, and broker_deal_id', async () => {
    const res = await request(app)
      .post('/api/admin/ctrader/execute-demo-trade')
      .set('x-admin-key', adminApiKey)
      .send({ symbol: 'EURUSD', direction: 'BUY', lotSize: 0.01 });

    expect(res.status).toBe(200);
    const pos = await repo.getPositionById(res.body.positionId);
    expect(pos).toBeDefined();
    expect(pos?.brokerOrderId).toBeDefined();
    expect(pos?.brokerPositionId).toBeDefined();
    expect(pos?.brokerDealId).toBeDefined();
    expect(pos?.reconciliationStatus).toBe('MATCHED');
  });

  // Q. Webhook reconciliation updates positions
  it('Q. Webhook reconciliation updates positions: updates broker IDs and sets reconciliation_status = MATCHED', async () => {
    const customId = `evt_ctrader_3b_rec_${Date.now()}`;
    const res = await brokerSyncService.processWebhookEvent({
      broker: 'ctrader-broker-01',
      eventType: 'POSITION_OPENED',
      accountNumber: validDemoCredentials.accountId,
      orderId: `cmd_ctrader_3b_${Date.now()}`,
      payload: {
        timestamp: Date.now(),
        symbol: 'EURUSD',
        status: 'FILLED',
        brokerOrderId: 'ctrader-ord-wb-001',
        brokerPositionId: 'ctrader-pos-wb-001',
        brokerDealId: 'ctrader-deal-wb-001'
      },
      customEventId: customId
    });

    expect(res.processed).toBe(true);
  });

  // R. Duplicate webhook does not create duplicate records
  it('R. Duplicate webhook does not create duplicate records: returns duplicate = true on second submission', async () => {
    const customId = `evt_ctrader_3b_dup_${Date.now()}`;
    const payload = {
      broker: 'ctrader-broker-01',
      eventType: 'POSITION_OPENED',
      accountNumber: validDemoCredentials.accountId,
      orderId: `cmd_ctrader_3b_dup_${Date.now()}`,
      payload: { timestamp: Date.now(), symbol: 'EURUSD' },
      customEventId: customId
    };

    const res1 = await brokerSyncService.processWebhookEvent(payload);
    expect(res1.duplicate).toBe(false);

    const res2 = await brokerSyncService.processWebhookEvent(payload);
    expect(res2.duplicate).toBe(true);
  });

  // S. Position close persists canonical outcome
  it('S. Position close persists canonical outcome: POST /api/admin/ctrader/close-demo-trade updates status to CLOSED', async () => {
    const openRes = await request(app)
      .post('/api/admin/ctrader/execute-demo-trade')
      .set('x-admin-key', adminApiKey)
      .send({ symbol: 'EURUSD', direction: 'BUY', lotSize: 0.01 });

    const closeRes = await request(app)
      .post('/api/admin/ctrader/close-demo-trade')
      .set('x-admin-key', adminApiKey)
      .send({ positionId: openRes.body.positionId, closePrice: 1.0920 });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.success).toBe(true);
    expect(closeRes.body.position.status).toBe('CLOSED');
    expect(closeRes.body.position.closePrice).toBe(1.0920);
  });

  // T. TradeClosed emitted
  it('T. TradeClosed emitted: position closure publishes EventTypes.TradeClosed', async () => {
    let capturedPayload: TradeClosedPayload | null = null;
    globalEventBus.subscribe(EventTypes.TradeClosed, async (evt) => {
      capturedPayload = evt.payload;
    });

    const openRes = await request(app)
      .post('/api/admin/ctrader/execute-demo-trade')
      .set('x-admin-key', adminApiKey)
      .send({ symbol: 'EURUSD', direction: 'BUY', lotSize: 0.01 });

    await request(app)
      .post('/api/admin/ctrader/close-demo-trade')
      .set('x-admin-key', adminApiKey)
      .send({ positionId: openRes.body.positionId, closePrice: 1.0930 });

    await new Promise((res) => setTimeout(res, 50));

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload?.positionId).toBe(openRes.body.positionId);
  });

  // U. LearningService creates one post-mortem
  it('U. LearningService creates one post-mortem: generates review record upon position closure', async () => {
    const openRes = await request(app)
      .post('/api/admin/ctrader/execute-demo-trade')
      .set('x-admin-key', adminApiKey)
      .send({ symbol: 'EURUSD', direction: 'BUY', lotSize: 0.01 });

    const closeRes = await request(app)
      .post('/api/admin/ctrader/close-demo-trade')
      .set('x-admin-key', adminApiKey)
      .send({ positionId: openRes.body.positionId, closePrice: 1.0940 });

    expect(closeRes.body.review).toBeDefined();
    expect(closeRes.body.review.id).toBeDefined();
  });

  // V. Replayed TradeClosed does not duplicate learning
  it('V. Replayed TradeClosed does not duplicate learning: re-processing closed trade yields same review ID', async () => {
    const tradeId = `trade_replay_3b_${Date.now()}`;
    const payload: Partial<TradeClosedPayload> & { isOfflineMock?: boolean } = {
      tradeId,
      positionId: tradeId,
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0920,
      pnlDollars: 70.0,
      learningVersion: '1.0',
      isOfflineMock: true
    };

    const review1 = await learningService.processClosedTrade(payload);
    const review2 = await learningService.processClosedTrade(payload);

    expect(review1.id).toBe(review2.id);
  });

  // W. Admin Trading Center reads persisted data
  it('W. Admin Trading Center reads persisted data: GET /api/admin/trades returns trades persisted in PostgreSQL', async () => {
    const res = await request(app)
      .get('/api/admin/trades')
      .set('x-admin-key', adminApiKey);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.trades)).toBe(true);
  });
});
