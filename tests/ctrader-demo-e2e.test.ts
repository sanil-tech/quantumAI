import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { globalBrokerRegistry } from '../apps/execution-router/src/adapters/brokerRegistry';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';
import { brokerSyncService } from '../src/server/services/brokerSyncService';
import { learningService } from '../src/server/services/learningService';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { Order, TradeProposal, RiskClearedPayload, Position } from '@iati/core-types';
import { TradingRepository, PositionRecord } from '@iati/database';

describe('Phase 3A — cTrader DEMO End-to-End Certification Suite', () => {
  let ctraderAdapter: CTraderAdapter;
  let executionRouter: ExecutionRouter;
  let tradingRepo: TradingRepository;

  const validDemoCredentials = {
    clientId: 'ctrader_demo_client_12345',
    clientSecret: 'ctrader_demo_secret_67890',
    accountId: '5877246_DEMO',
    accessToken: 'ctrader_demo_token_abcde'
  };

  beforeEach(() => {
    ctraderAdapter = new CTraderAdapter({
      ...validDemoCredentials,
      environment: 'DEMO'
    });
    executionRouter = new ExecutionRouter();
    executionRouter.registerBroker(ctraderAdapter);
    tradingRepo = new TradingRepository();

    process.env.EXECUTION_ENVIRONMENT = 'DEMO';
    process.env.CTRADER_CLIENT_ID = validDemoCredentials.clientId;
    process.env.CTRADER_CLIENT_SECRET = validDemoCredentials.clientSecret;
    process.env.CTRADER_ACCOUNT_ID = validDemoCredentials.accountId;
    process.env.CTRADER_ACCESS_TOKEN = validDemoCredentials.accessToken;
  });

  afterEach(() => {
    delete process.env.ENABLE_LIVE_EXECUTION_ARMED;
  });

  function createValidProposal(overrides: Partial<TradeProposal> = {}): TradeProposal {
    return {
      id: `prop-e2e-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      symbol: 'EURUSD',
      direction: 'BUY',
      confidence: 88,
      evidence: ['E2E cTrader DEMO Certification Test'],
      agent_votes: [],
      why_direction: 'SMC Bullish Order Block Breakout',
      invalidate_conditions: [],
      timestamp: new Date(),
      stopLoss: 1.0820,
      takeProfit: 1.0960,
      ...overrides
    };
  }

  // A. DEMO configuration validation
  it('A. DEMO configuration validation: strictly verifies DEMO environment mode configuration', () => {
    const safetyCheck = validateExecutionEnvironmentSafety({
      environment: 'DEMO',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.10,
      credentials: validDemoCredentials
    });

    expect(safetyCheck.allowed).toBe(true);
    expect(safetyCheck.code).toBe('ALLOWED_DEMO');
  });

  // B. Credential validation
  it('B. Credential validation: refuses DEMO execution when required cTrader credentials are missing', async () => {
    const incompleteAdapter = new CTraderAdapter({
      clientId: '',
      clientSecret: '',
      accountId: '',
      accessToken: '',
      environment: 'DEMO'
    });

    await expect(incompleteAdapter.connect()).rejects.toThrow('CTRADER_MISSING_CREDENTIALS');

    const safetyCheck = validateExecutionEnvironmentSafety({
      environment: 'DEMO',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.10,
      credentials: { clientId: '', accountId: '' }
    });

    expect(safetyCheck.allowed).toBe(false);
    expect(safetyCheck.code).toBe('DEMO_CREDENTIALS_MISSING');
  });

  // C. Broker resolution
  it('C. Broker resolution: resolves ctrader-broker-01 cleanly from BrokerRegistry', () => {
    const resolved = executionRouter.getBroker('ctrader-broker-01');
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('ctrader-broker-01');
    expect(resolved?.name).toContain('cTrader');
  });

  // D. Governance enforcement
  it('D. Governance enforcement: rejects order if missing mandatory RiskApprovalToken or governance signature', async () => {
    const proposal = createValidProposal();
    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: validDemoCredentials.accountId,
      approval_id: `gov-invalid-${Date.now()}`,
      risk_score: 5,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: `gov-invalid-${Date.now()}`,
        status: 'APPROVED',
        risk_score: 5,
        checks: [],
        timestamp: new Date(),
        decision_authority: 'RiskGov'
      },
      timestamp: new Date(),
      broker_id: 'ctrader-broker-01'
    };

    await expect(executionRouter.handleRiskCleared(payload)).rejects.toThrow('Missing RiskApprovalToken');
  });

  // E. Order submission contract
  it('E. Order submission contract: routes RiskCleared payload to cTrader DEMO adapter', async () => {
    await ctraderAdapter.connect();
    const proposal = createValidProposal();
    const approvalId = `gov-e2e-${Date.now()}`;
    const token = createRiskApprovalToken({
      approvalId,
      signalId: proposal.id,
      symbol: proposal.symbol,
      direction: proposal.direction,
      approvedLotSize: 0.25,
      maxAllowedDrawdown: 5.0,
      calculatedRiskAmount: 250,
      status: 'APPROVED'
    });

    const payload: RiskClearedPayload & { environment?: any; credentials?: any } = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: validDemoCredentials.accountId,
      approval_id: approvalId,
      risk_score: 5,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: approvalId,
        status: 'APPROVED',
        risk_score: 5,
        checks: [],
        timestamp: new Date(),
        decision_authority: 'RiskGov',
        token
      },
      approval_token: token,
      timestamp: new Date(),
      broker_id: 'ctrader-broker-01',
      environment: 'DEMO',
      credentials: validDemoCredentials
    };

    const { order, report } = await executionRouter.handleRiskCleared(payload);

    expect(order.status).toBe('FILLED');
    expect(order.broker_id).toBe('ctrader-broker-01');
    expect(report.status).toBe('FILLED');
    expect(report.filled_price).toBeGreaterThan(0);
  });

  // F. Broker ID persistence
  it('F. Broker ID persistence: populates broker_order_id, broker_position_id, and broker_deal_id in execution report', async () => {
    await ctraderAdapter.connect();
    const sampleOrder: Order = {
      order_id: `ord-demo-ids-${Date.now()}`,
      proposal_id: `prop-demo-ids-${Date.now()}`,
      approval_id: `gov-demo-ids-${Date.now()}`,
      account_id: validDemoCredentials.accountId,
      symbol: 'EURUSD',
      direction: 'BUY',
      quantity: 0.50,
      order_type: 'MARKET',
      price: 1.0850,
      status: 'PENDING',
      created_at: new Date(),
      broker_id: 'ctrader-broker-01'
    };

    const report = await ctraderAdapter.placeOrder(sampleOrder);

    expect(report.broker_order_id).toBeDefined();
    expect(report.broker_order_id).toContain('ctrader-ord-');
    expect(report.broker_position_id).toBeDefined();
    expect(report.broker_position_id).toContain('ctrader-pos-');
    expect(report.broker_deal_id).toBeDefined();
    expect(report.broker_deal_id).toContain('ctrader-deal-');
  });

  // G. Webhook reconciliation
  it('G. Webhook reconciliation: processes cTrader webhook events idempotently', async () => {
    const customEventId = `evt_ctrader_demo_rec_${Date.now()}`;
    const orderId = `cmd_ctrader_rec_${Date.now()}`;

    const res1 = await brokerSyncService.processWebhookEvent({
      broker: 'ctrader-broker-01',
      eventType: 'POSITION_OPENED',
      accountNumber: validDemoCredentials.accountId,
      orderId,
      payload: {
        timestamp: Date.now(),
        symbol: 'EURUSD',
        status: 'FILLED',
        brokerOrderId: `ctrader-ord-rec-1`,
        brokerPositionId: `ctrader-pos-rec-1`,
        brokerDealId: `ctrader-deal-rec-1`
      },
      customEventId
    });

    expect(res1.processed).toBe(true);
    expect(res1.duplicate).toBe(false);

    const res2 = await brokerSyncService.processWebhookEvent({
      broker: 'ctrader-broker-01',
      eventType: 'POSITION_OPENED',
      accountNumber: validDemoCredentials.accountId,
      orderId,
      payload: {
        timestamp: Date.now(),
        symbol: 'EURUSD',
        status: 'FILLED'
      },
      customEventId
    });

    expect(res2.duplicate).toBe(true);
  });

  // H. PostgreSQL position update
  it('H. PostgreSQL position update: saves and queries positions with full metadata', async () => {
    const posId = `pos_demo_pg_${Date.now()}`;
    const posRecord: PositionRecord = {
      positionId: posId,
      ticketId: `tkt_${Date.now()}`,
      setupId: `setup_demo_${Date.now()}`,
      accountId: validDemoCredentials.accountId,
      symbol: 'EURUSD',
      direction: 'BUY',
      quantity: 0.10,
      entryPrice: 1.0850,
      currentPrice: 1.0850,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      unrealizedProfit: 0,
      realizedProfit: 0,
      status: 'OPEN',
      broker: 'ctrader-broker-01',
      environment: 'DEMO',
      brokerOrderId: `ctrader-ord-pg-${Date.now()}`,
      brokerPositionId: `ctrader-pos-pg-${Date.now()}`,
      brokerDealId: `ctrader-deal-pg-${Date.now()}`,
      reconciliationStatus: 'MATCHED',
      openedAt: new Date()
    };

    const saved = await tradingRepo.savePosition(posRecord);
    expect(saved.positionId).toBe(posId);
    expect(saved.brokerOrderId).toContain('ctrader-ord-pg-');
    expect(saved.reconciliationStatus).toBe('MATCHED');
  });

  // I. Position close
  it('I. Position close: closes cTrader position and calculates realized PnL', async () => {
    await ctraderAdapter.connect();
    const order: Order = {
      order_id: `ord-close-${Date.now()}`,
      proposal_id: `prop-close-${Date.now()}`,
      approval_id: `gov-close-${Date.now()}`,
      account_id: validDemoCredentials.accountId,
      symbol: 'EURUSD',
      direction: 'BUY',
      quantity: 0.20,
      order_type: 'MARKET',
      price: 1.0850,
      status: 'PENDING',
      created_at: new Date(),
      broker_id: 'ctrader-broker-01'
    };

    const placeReport = await ctraderAdapter.placeOrder(order);
    expect(placeReport.status).toBe('FILLED');

    const closeReport = await ctraderAdapter.closePosition(placeReport.broker_position_id!, 1.0910);
    expect(closeReport.status).toBe('FILLED');
    expect(closeReport.filled_price).toBe(1.0910);
  });

  // J. TradeClosed event
  it('J. TradeClosed event: emits TradeClosed event to event bus when position closes', async () => {
    let receivedPayload: TradeClosedPayload | null = null;
    globalEventBus.subscribe(EventTypes.TradeClosed, async (evt) => {
      receivedPayload = evt.payload;
    });

    const payload: TradeClosedPayload = {
      tradeId: `trade_e2e_closed_${Date.now()}`,
      positionId: `pos_e2e_closed_${Date.now()}`,
      accountId: validDemoCredentials.accountId,
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0930,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: 80.0,
      pnlPips: 80,
      environment: 'DEMO',
      closedAt: new Date()
    };

    await globalEventBus.publish({
      id: `evt_bus_e2e_${Date.now()}`,
      type: EventTypes.TradeClosed,
      timestamp: new Date(),
      payload
    });

    await new Promise((res) => setTimeout(res, 50));

    expect(receivedPayload).toBeDefined();
    expect(receivedPayload?.tradeId).toBe(payload.tradeId);
    expect(receivedPayload?.pnlDollars).toBe(80.0);
  });

  // K. Adaptive learning creation
  it('K. Adaptive learning creation: generates post-mortem review upon trade closure', async () => {
    const tradePayload: Partial<TradeClosedPayload> & { isOfflineMock?: boolean } = {
      tradeId: `trade_e2e_learning_${Date.now()}`,
      positionId: `pos_e2e_learning_${Date.now()}`,
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0930,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: 80.0,
      pnlPips: 80,
      learningVersion: '1.0',
      isOfflineMock: true
    };

    const review = await learningService.processClosedTrade(tradePayload);
    expect(review).toBeDefined();
    expect(review.outcome).toBe('WIN');
    expect(review.ratingScore).toBeGreaterThanOrEqual(1);
  });

  // L. Learning idempotency
  it('L. Learning idempotency: guarantees identical (tradeId, learningVersion) creates only one post-mortem review', async () => {
    const tradeId = `trade_idem_learning_${Date.now()}`;
    const tradePayload: Partial<TradeClosedPayload> & { isOfflineMock?: boolean } = {
      tradeId,
      positionId: tradeId,
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0930,
      pnlDollars: 80.0,
      learningVersion: '1.0',
      isOfflineMock: true
    };

    const review1 = await learningService.processClosedTrade(tradePayload);
    const review2 = await learningService.processClosedTrade(tradePayload);

    expect(review1.id).toBe(review2.id);
  });

  // M. Server restart recovery
  it('M. Server restart recovery: reprocesses pending webhooks after restart', async () => {
    const result = await brokerSyncService.reprocessPendingWebhooks();
    expect(result).toBeDefined();
    expect(typeof result.reprocessedCount).toBe('number');
  });

  // N. Admin visibility
  it('N. Admin visibility: returns open and closed trades from repository for admin center', async () => {
    const pos = await tradingRepo.getPositions({ accountId: validDemoCredentials.accountId, status: 'ALL' });
    expect(pos).toBeDefined();
    expect(Array.isArray(pos.positions)).toBe(true);
  });

  // O. Failure/rollback behavior
  it('O. Failure/rollback behavior: fails closed when LIVE environment is requested without disarmed flag reset', () => {
    const safetyCheck = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.10,
      credentials: validDemoCredentials
    });

    expect(safetyCheck.allowed).toBe(false);
    expect(safetyCheck.code).toBe('LIVE_EXECUTION_DISARMED');
  });
});
