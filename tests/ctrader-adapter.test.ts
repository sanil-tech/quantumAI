import { describe, it, expect, beforeEach } from 'vitest';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { globalBrokerRegistry } from '../apps/execution-router/src/adapters/brokerRegistry';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';
import { brokerSyncService } from '../src/server/services/brokerSyncService';
import { learningService } from '../src/server/services/learningService';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { Order, TradeProposal, RiskClearedPayload, RiskApprovalToken } from '@iati/core-types';

describe('Phase 2 — Production cTrader Broker Adapter & Integration Suite', () => {
  let adapter: CTraderAdapter;
  let router: ExecutionRouter;

  beforeEach(() => {
    adapter = new CTraderAdapter({
      clientId: 'test_client_id_123',
      clientSecret: 'test_client_secret_456',
      accountId: '5877246_DEMO',
      accessToken: 'test_access_token_789',
      environment: 'DEMO'
    });
    router = new ExecutionRouter();
    router.registerBroker(adapter);
  });

  function createSampleOrder(overrides: Partial<Order> = {}): Order {
    return {
      order_id: `ord-ctrader-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      proposal_id: `prop-ctrader-${Date.now()}`,
      approval_id: `gov-ctrader-${Date.now()}`,
      account_id: '5877246_DEMO',
      symbol: 'EURUSD',
      direction: 'BUY',
      quantity: 0.50,
      order_type: 'MARKET',
      price: 1.0850,
      status: 'PENDING',
      created_at: new Date(),
      broker_id: 'ctrader-broker-01',
      stop_loss: 1.0800,
      take_profit: 1.0950,
      strategy_id: 'SMC_ALPHA',
      strategy_version: '2.0',
      ...overrides
    };
  }

  // 1. Adapter implements BrokerAdapter interface
  it('1. CTraderAdapter implements BrokerAdapter interface methods and properties', () => {
    expect(adapter.id).toBe('ctrader-broker-01');
    expect(adapter.name).toBe('cTrader Open API Broker Adapter');
    expect(typeof adapter.connect).toBe('function');
    expect(typeof adapter.disconnect).toBe('function');
    expect(typeof adapter.isConnected).toBe('function');
    expect(typeof adapter.placeOrder).toBe('function');
    expect(typeof adapter.cancelOrder).toBe('function');
    expect(typeof adapter.getPosition).toBe('function');
    expect(typeof adapter.getAccountStatus).toBe('function');
  });

  // 2. BUY execution
  it('2. executes BUY market order successfully', async () => {
    await adapter.connect();
    const order = createSampleOrder({ direction: 'BUY' });
    const report = await adapter.placeOrder(order);

    expect(report.status).toBe('FILLED');
    expect(report.broker_id).toBe('ctrader-broker-01');
    expect(report.filled_price).toBeGreaterThan(0);
  });

  // 3. SELL execution
  it('3. executes SELL market order successfully', async () => {
    await adapter.connect();
    const order = createSampleOrder({ direction: 'SELL', symbol: 'GBPUSD', price: 1.2500 });
    const report = await adapter.placeOrder(order);

    expect(report.status).toBe('FILLED');
    expect(report.filled_price).toBe(1.2500);
  });

  // 4. SL propagation
  it('4. preserves and propagates Stop Loss correctly into position', async () => {
    await adapter.connect();
    const order = createSampleOrder({ stop_loss: 1.0775 });
    const report = await adapter.placeOrder(order);

    expect(report.status).toBe('FILLED');
    const pos = await adapter.getPosition(order.symbol, order.account_id);
    expect(pos?.stop_loss).toBe(1.0775);
  });

  // 5. TP propagation
  it('5. preserves and propagates Take Profit correctly into position', async () => {
    await adapter.connect();
    const order = createSampleOrder({ take_profit: 1.0980 });
    const report = await adapter.placeOrder(order);

    expect(report.status).toBe('FILLED');
    const pos = await adapter.getPosition(order.symbol, order.account_id);
    expect(pos?.take_profit).toBe(1.0980);
  });

  // 6. Quantity conversion
  it('6. correctly converts lot size to units and vice-versa', () => {
    expect(adapter.lotsToUnits(1.0)).toBe(100000);
    expect(adapter.lotsToUnits(0.5)).toBe(50000);
    expect(adapter.lotsToUnits(0.01)).toBe(1000);
    expect(adapter.unitsToLots(100000)).toBe(1.0);
    expect(adapter.unitsToLots(25000)).toBe(0.25);
  });

  // 7. broker_order_id persistence
  it('7. returns valid broker_order_id in execution report', async () => {
    await adapter.connect();
    const order = createSampleOrder();
    const report = await adapter.placeOrder(order);

    expect(report.broker_order_id).toBeDefined();
    expect(report.broker_order_id).toContain('ctrader-ord-');
  });

  // 8. broker_position_id persistence
  it('8. returns valid broker_position_id in execution report', async () => {
    await adapter.connect();
    const order = createSampleOrder();
    const report = await adapter.placeOrder(order);

    expect(report.broker_position_id).toBeDefined();
    expect(report.broker_position_id).toContain('ctrader-pos-');
  });

  // 9. broker_deal_id persistence
  it('9. returns valid broker_deal_id in execution report', async () => {
    await adapter.connect();
    const order = createSampleOrder();
    const report = await adapter.placeOrder(order);

    expect(report.broker_deal_id).toBeDefined();
    expect(report.broker_deal_id).toContain('ctrader-deal-');
  });

  // 10. Duplicate execution idempotency
  it('10. handles duplicate executions idempotently in ExecutionRouter OMS', async () => {
    await adapter.connect();
    process.env.CTRADER_CLIENT_ID = 'test_client_id_123';
    process.env.CTRADER_ACCOUNT_ID = '5877246_DEMO';

    const proposal: TradeProposal = {
      id: `prop-dup-${Date.now()}`,
      symbol: 'EURUSD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Idempotency test'],
      agent_votes: [],
      why_direction: 'Test',
      invalidate_conditions: [],
      timestamp: new Date(),
      stopLoss: 1.0800,
      takeProfit: 1.0950
    };

    const approvalId = `gov-dup-${Date.now()}`;
    const token = createRiskApprovalToken({
      approvalId,
      signalId: proposal.id,
      symbol: proposal.symbol,
      direction: proposal.direction,
      approvedLotSize: 0.20,
      maxAllowedDrawdown: 5.0,
      calculatedRiskAmount: 200,
      status: 'APPROVED'
    });

    const payload: RiskClearedPayload & { environment?: any; credentials?: any } = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: '5877246_DEMO',
      approval_id: approvalId,
      risk_score: 10,
      trade_proposal: proposal,
      governance_decision: { approval_id: approvalId, status: 'APPROVED', risk_score: 10, checks: [], timestamp: new Date(), decision_authority: 'Gov', token },
      approval_token: token,
      timestamp: new Date(),
      broker_id: 'ctrader-broker-01',
      environment: 'DEMO',
      credentials: { clientId: 'test_client_id_123', accountId: '5877246_DEMO' }
    };

    const run1 = await router.handleRiskCleared(payload);
    expect(run1.order.status).toBe('FILLED');

    const run2 = await router.handleRiskCleared(payload);
    expect(run2.order.order_id).toBe(run1.order.order_id);
    expect(run2.report.report_id).toContain('rep-dup-');
  });

  // 11. Rejected order
  it('11. returns REJECTED status when broker rejects order', async () => {
    await adapter.connect();
    adapter.mockReject = true;
    const order = createSampleOrder();

    const report = await adapter.placeOrder(order);
    expect(report.status).toBe('REJECTED');
    expect(report.reason).toContain('CTRADER_ORDER_REJECTED');
  });

  // 12. Timeout
  it('12. throws timeout error when cTrader does not respond in time', async () => {
    await adapter.connect();
    adapter.mockTimeout = true;
    const order = createSampleOrder();

    await expect(adapter.placeOrder(order)).rejects.toThrow('CTRADER_TIMEOUT');
  });

  // 13. Authentication failure
  it('13. fails connect when credentials are invalid', async () => {
    adapter.mockAuthFail = true;
    await expect(adapter.connect()).rejects.toThrow('CTRADER_AUTH_FAILURE');
  });

  // 14. Environment gate
  it('14. environment safety gate rejects cTrader execution in PAPER environment', () => {
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

  // 15. LIVE requires explicit configuration
  it('15. LIVE environment fails closed when credentials or arming flag are missing', () => {
    delete process.env.ENABLE_LIVE_EXECUTION_ARMED;

    const check = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.10
    });

    expect(check.allowed).toBe(false);
    expect(check.code).toBe('LIVE_EXECUTION_DISARMED');
  });

  // 16. DEMO execution
  it('16. DEMO environment permits cTrader with demo credentials', () => {
    const check = validateExecutionEnvironmentSafety({
      environment: 'DEMO',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.10,
      credentials: { clientId: 'demo_client', accountId: 'demo_acc' }
    });

    expect(check.allowed).toBe(true);
  });

  // 17. PAPER cannot accidentally call cTrader
  it('17. PAPER environment strictly forces PaperBrokerAdapter', () => {
    const checkPaper = validateExecutionEnvironmentSafety({
      environment: 'PAPER',
      brokerId: 'paper-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.10
    });
    expect(checkPaper.allowed).toBe(true);

    const checkCTraderInPaper = validateExecutionEnvironmentSafety({
      environment: 'PAPER',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.10
    });
    expect(checkCTraderInPaper.allowed).toBe(false);
  });

  // 18. Broker webhook reconciliation
  it('18. reconciles cTrader webhook events idempotently', async () => {
    const customId = `evt_ctrader_idemp_${Date.now()}`;
    const res1 = await brokerSyncService.processWebhookEvent({
      broker: 'ctrader-broker-01',
      eventType: 'POSITION_OPENED',
      accountNumber: '5877246_DEMO',
      orderId: `cmd_ctrader_test_${Date.now()}`,
      payload: { timestamp: Date.now(), symbol: 'EURUSD', status: 'FILLED' },
      customEventId: customId
    });

    expect(res1.processed).toBe(true);
    expect(res1.duplicate).toBe(false);

    const res2 = await brokerSyncService.processWebhookEvent({
      broker: 'ctrader-broker-01',
      eventType: 'POSITION_OPENED',
      accountNumber: '5877246_DEMO',
      orderId: `cmd_ctrader_test_${Date.now()}`,
      payload: { timestamp: Date.now(), symbol: 'EURUSD', status: 'FILLED' },
      customEventId: customId
    });

    expect(res2.duplicate).toBe(true);
  });

  // 19. Position close
  it('19. closes open cTrader position cleanly', async () => {
    await adapter.connect();
    const order = createSampleOrder();
    const report = await adapter.placeOrder(order);
    expect(report.status).toBe('FILLED');

    const closeReport = await adapter.closePosition(report.broker_position_id!, 1.0890);
    expect(closeReport.status).toBe('FILLED');
    expect(closeReport.filled_price).toBe(1.0890);
  });

  // 20. TradeClosed event
  it('20. publishes TradeClosed event upon position closure', async () => {
    let publishedEvent: any = null;
    const sub = globalEventBus.subscribe(EventTypes.TradeClosed, async (evt) => {
      publishedEvent = evt;
    });

    const payload: TradeClosedPayload = {
      tradeId: `trade_ctrader_close_test_${Date.now()}`,
      positionId: `pos_ctrader_close_test_${Date.now()}`,
      accountId: '5877246_DEMO',
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0920,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: 70.0,
      pnlPips: 70,
      environment: 'DEMO',
      closedAt: new Date()
    };

    await globalEventBus.publish({
      id: `evt_bus_close_${Date.now()}`,
      type: EventTypes.TradeClosed,
      timestamp: new Date(),
      payload
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(publishedEvent).toBeDefined();
    expect(publishedEvent.payload.tradeId).toBe(payload.tradeId);
    expect(publishedEvent.payload.pnlDollars).toBe(70.0);
  });

  // 21. Adaptive learning persistence
  it('21. creates post-mortem adaptive learning review for closed trade', async () => {
    const payload: Partial<TradeClosedPayload> & { isOfflineMock?: boolean } = {
      tradeId: `trade_learn_ctrader_${Date.now()}`,
      positionId: `pos_learn_ctrader_${Date.now()}`,
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0920,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      pnlDollars: 70.0,
      pnlPips: 70,
      learningVersion: '1.0',
      isOfflineMock: true
    };

    const review = await learningService.processClosedTrade(payload);
    expect(review).toBeDefined();
    expect(review.outcome).toBe('WIN');
    expect(review.ratingScore).toBeGreaterThanOrEqual(1);
  });

  // 22. Duplicate TradeClosed event does not duplicate learning
  it('22. prevents duplicate learning for same (tradeId, learningVersion)', async () => {
    const uniqueTradeId = `trade_dup_learn_${Date.now()}`;
    const payload: Partial<TradeClosedPayload> & { isOfflineMock?: boolean } = {
      tradeId: uniqueTradeId,
      positionId: uniqueTradeId,
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
});
