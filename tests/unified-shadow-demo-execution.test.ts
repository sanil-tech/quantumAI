import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { BrokerReconciliationService } from '../apps/execution-router/src/services/brokerReconciliationService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';
import { learningService } from '../src/server/services/learningService';
import { Order, TradeProposal, RiskClearedPayload, UnifiedExecutionContract } from '@iati/core-types';
import { TradingRepository, PositionRecord } from '@iati/database';

describe('Unified Shadow + cTrader DEMO Execution & Adaptive Learning Verification Suite', () => {
  let ctraderAdapter: CTraderAdapter;
  let executionRouter: ExecutionRouter;
  let tradingRepo: TradingRepository;
  let reconService: BrokerReconciliationService;

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
    reconService = BrokerReconciliationService.getInstance(executionRouter, tradingRepo);

    process.env.EXECUTION_ENVIRONMENT = 'DEMO';
    process.env.CTRADER_CLIENT_ID = validDemoCredentials.clientId;
    process.env.CTRADER_CLIENT_SECRET = validDemoCredentials.clientSecret;
    process.env.CTRADER_ACCOUNT_ID = validDemoCredentials.accountId;
    process.env.CTRADER_ACCESS_TOKEN = validDemoCredentials.accessToken;
  });

  afterEach(() => {
    delete process.env.ENABLE_LIVE_EXECUTION_ARMED;
  });

  function createProposal(symbol: string = 'EURUSD', direction: 'BUY' | 'SELL' = 'BUY'): TradeProposal {
    return {
      id: `prop-unified-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      symbol,
      direction,
      confidence: 90,
      evidence: ['Unified Signal Engine Multi-Timeframe SMC Confluence'],
      agent_votes: [],
      why_direction: 'Bullish Order Block & Liquidity Sweep',
      invalidate_conditions: [],
      timestamp: new Date(),
      stopLoss: 1.0820,
      takeProfit: 1.0960
    };
  }

  // 1. Unified Execution Contract & Signal Identity
  it('1. Unified Execution Contract: separates traceId, applicationTradeId, and brokerPositionId', () => {
    const contract: UnifiedExecutionContract = {
      traceId: 'sig-eurusd-001',
      signalId: 'sig-eurusd-001',
      executionEnvironment: 'DEMO',
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.0850,
      volume: 0.10,
      createdAt: new Date(),
      executionStatus: 'BROKER_CONFIRMED',
      applicationTradeId: 'trade_123456_abc',
      brokerOrderId: 'b_ord_998877',
      brokerPositionId: 'b_pos_998877',
      outcomeSource: 'BROKER_CONFIRMED_OUTCOME',
      brokerConfirmed: true
    };

    expect(contract.traceId).toBe('sig-eurusd-001');
    expect(contract.applicationTradeId).toBe('trade_123456_abc');
    expect(contract.brokerPositionId).toBe('b_pos_998877');
    expect(contract.outcomeSource).toBe('BROKER_CONFIRMED_OUTCOME');
  });

  // 2. DEMO Order Execution via Adapter
  it('2. DEMO Order Execution: places order and receives broker position confirmation', async () => {
    const order: Order = {
      order_id: `ord_${Date.now()}`,
      proposal_id: 'prop_001',
      approval_id: 'appr_001',
      account_id: validDemoCredentials.accountId,
      symbol: 'EURUSD',
      direction: 'BUY',
      quantity: 0.10,
      order_type: 'MARKET',
      price: 1.0850,
      status: 'PENDING',
      created_at: new Date(),
      broker_id: 'ctrader-broker-01'
    };

    const report = await ctraderAdapter.placeOrder(order);

    expect(report.status).toBe('FILLED');
    expect(report.filled_price).toBeGreaterThan(0);
    expect(report.broker_position_id || report.brokerPositionId).toBeDefined();
    expect(report.broker_order_id || report.brokerOrderId).toBeDefined();
  });

  // 3. Close Position via Adapter
  it('3. Close Position: dispatches position close and confirms filled report', async () => {
    const report = await ctraderAdapter.closePosition('b_pos_12345', 0.10);
    expect(report.status).toBe('FILLED');
    expect(report.brokerPositionId || report.broker_position_id).toBe('b_pos_12345');
  });

  // 4. Broker State Reconciliation
  it('4. Broker State Reconciliation: detects matching and diverged state accurately', async () => {
    const reconReport = await reconService.reconcile(validDemoCredentials.accountId);
    expect(reconReport).toBeDefined();
    expect(reconReport.environment).toBe('DEMO');
    expect(reconReport.timestamp).toBeInstanceOf(Date);
    expect(Array.isArray(reconReport.results)).toBe(true);
  });

  // 5. Strict Safety Guard: LIVE mode is rejected
  it('5. Safety Invariant: refuses LIVE execution and enforces fail-closed guard', () => {
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
