import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { PaperBrokerAdapter } from '../apps/execution-router/src/adapters/paperBrokerAdapter';
import { RiskClearedPayload, TradeProposal } from '@iati/core-types';
import { globalEventBus, EventTypes, IEvent } from '@iati/event-bus';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';

describe('Sprint 6 — Execution Router & Paper Trading Engine', () => {
  let router: ExecutionRouter;

  const mockProposal: TradeProposal = {
    id: 'prop-exec-99',
    symbol: 'EURUSD',
    direction: 'BUY',
    confidence: 0.88,
    evidence: ['Bullish momentum', 'Consensus high'],
    agent_votes: [],
    why_direction: 'Bullish consensus',
    invalidate_conditions: [],
    timestamp: new Date()
  };

  const validToken = createRiskApprovalToken({
    approvalId: 'gov-approval-777',
    signalId: 'prop-exec-99',
    symbol: 'EURUSD',
    direction: 'BUY',
    approvedLotSize: 0.1,
    maxAllowedDrawdown: 10,
    calculatedRiskAmount: 50,
    status: 'APPROVED'
  });

  const mockRiskClearedPayload: RiskClearedPayload = {
    proposal_id: 'prop-exec-99',
    symbol: 'EURUSD',
    account_id: 'DEFAULT',
    approval_id: 'gov-approval-777',
    risk_score: 0.18,
    trade_proposal: mockProposal,
    approval_token: validToken,
    governance_decision: {
      approval_id: 'gov-approval-777',
      status: 'APPROVED',
      risk_score: 0.18,
      checks: ['Exposure OK', 'Drawdown OK'],
      timestamp: new Date(),
      decision_authority: 'RiskGovernanceEngine',
      token: validToken
    },
    timestamp: new Date()
  };

  beforeEach(() => {
    router = new ExecutionRouter();
  });

  describe('Module 1 & 2: Order Management & Execution Router', () => {
    it('should create and process an order from a valid RiskCleared payload', async () => {
      const { order, report } = await router.handleRiskCleared(mockRiskClearedPayload);

      expect(order.proposal_id).toBe(mockProposal.id);
      expect(order.approval_id).toBe('gov-approval-777');
      expect(order.status).toBe('FILLED');
      expect(report.status).toBe('FILLED');
      expect(report.filled_price).toBeGreaterThan(0);
    });

    it('should throw error if Risk Approval ID is missing', async () => {
      const invalidPayload = { ...mockRiskClearedPayload, approval_id: '', approval_token: validToken };
      await expect(router.handleRiskCleared(invalidPayload)).rejects.toThrow('Missing Risk Approval or Proposal ID');
    });
  });

  describe('Module 3 & 4: Paper Broker Adapter', () => {
    it('should maintain connection status and report account metrics', async () => {
      const broker = router.brokerAdapters.get(router.defaultBrokerId) as PaperBrokerAdapter;
      expect(broker.isConnected()).toBe(true);

      const status = await broker.getAccountStatus();
      expect(status.balance).toBe(100000);
      expect(status.equity).toBeGreaterThan(0);
    });
  });

  describe('Module 5 & 7: Simulation Engine & Slippage Engine', () => {
    it('should calculate slippage during execution simulation', async () => {
      const broker = router.brokerAdapters.get(router.defaultBrokerId) as PaperBrokerAdapter;
      broker.simulationEngine.setMarketCondition({ volatilityMode: 'HIGH', baseSpreadPips: 2.0 });

      const { report } = await router.handleRiskCleared(mockRiskClearedPayload);
      expect(report.latency_ms).toBeGreaterThan(0);
      expect(report.slippage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Module 6: Position Management', () => {
    it('should track and update positions upon order fill', async () => {
      await router.handleRiskCleared(mockRiskClearedPayload);

      const broker = router.brokerAdapters.get(router.defaultBrokerId) as PaperBrokerAdapter;
      const position = await broker.getPosition('EURUSD');

      expect(position).toBeDefined();
      expect(position?.symbol).toBe('EURUSD');
      expect(position?.direction).toBe('BUY');
      expect(position?.status).toBe('OPEN');
    });
  });

  describe('Module 9 & 12: Event Flow Integration (RiskCleared -> OrderPlaced -> OrderFilled -> PositionUpdated)', () => {
    it('should publish OrderPlaced, OrderFilled, and PositionUpdated events in sequence', async () => {
      const eventsCaptured: string[] = [];

      globalEventBus.subscribe(EventTypes.OrderPlaced, async () => {
        eventsCaptured.push('OrderPlaced');
      });

      globalEventBus.subscribe(EventTypes.OrderFilled, async () => {
        eventsCaptured.push('OrderFilled');
      });

      globalEventBus.subscribe(EventTypes.PositionUpdated, async () => {
        eventsCaptured.push('PositionUpdated');
      });

      await router.handleRiskCleared(mockRiskClearedPayload);

      // Brief pause for setImmediate subscriber callbacks
      await new Promise(res => setTimeout(res, 50));

      expect(eventsCaptured).toContain('OrderPlaced');
      expect(eventsCaptured).toContain('OrderFilled');
      expect(eventsCaptured).toContain('PositionUpdated');
    });
  });

  describe('Phase 1 — Canonical Execution Contract Hardening', () => {
    it('1. Approved order contains quantity from RiskApprovalToken', async () => {
      const token = createRiskApprovalToken({
        approvalId: 'gov-qty-1',
        signalId: 'prop-qty-1',
        symbol: 'EURUSD',
        direction: 'BUY',
        approvedLotSize: 0.25,
        maxAllowedDrawdown: 10,
        calculatedRiskAmount: 100,
        status: 'APPROVED'
      });

      const payload: RiskClearedPayload = {
        proposal_id: 'prop-qty-1',
        symbol: 'EURUSD',
        account_id: 'DEFAULT',
        approval_id: 'gov-qty-1',
        risk_score: 0.1,
        trade_proposal: { ...mockProposal, id: 'prop-qty-1' },
        approval_token: token,
        governance_decision: {
          approval_id: 'gov-qty-1',
          status: 'APPROVED',
          risk_score: 0.1,
          checks: [],
          timestamp: new Date(),
          decision_authority: 'Test',
          token
        },
        timestamp: new Date()
      };

      const { order } = await router.handleRiskCleared(payload);
      expect(order.quantity).toBe(0.25);
    });

    it('2. Approved order preserves stop loss and take profit from token / proposal', async () => {
      const token = createRiskApprovalToken({
        approvalId: 'gov-sltp-1',
        signalId: 'prop-sltp-1',
        symbol: 'EURUSD',
        direction: 'BUY',
        approvedLotSize: 0.1,
        maxAllowedDrawdown: 10,
        calculatedRiskAmount: 50,
        status: 'APPROVED',
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        riskPercent: 1.5
      });

      const payload: RiskClearedPayload = {
        proposal_id: 'prop-sltp-1',
        symbol: 'EURUSD',
        account_id: 'DEFAULT',
        approval_id: 'gov-sltp-1',
        risk_score: 0.1,
        trade_proposal: {
          ...mockProposal,
          id: 'prop-sltp-1',
          stopLoss: 1.0800,
          takeProfit: 1.0950
        },
        approval_token: token,
        governance_decision: {
          approval_id: 'gov-sltp-1',
          status: 'APPROVED',
          risk_score: 0.1,
          checks: [],
          timestamp: new Date(),
          decision_authority: 'Test',
          token
        },
        timestamp: new Date()
      };

      const { order } = await router.handleRiskCleared(payload);
      expect(order.stop_loss).toBe(1.0800);
      expect(order.take_profit).toBe(1.0950);
      expect(order.risk_percent).toBe(1.5);
    });

    it('3. Rejected risk approval cannot reach broker', async () => {
      const token = createRiskApprovalToken({
        approvalId: 'gov-rej-1',
        signalId: 'prop-rej-1',
        symbol: 'EURUSD',
        direction: 'BUY',
        approvedLotSize: 0,
        maxAllowedDrawdown: 10,
        calculatedRiskAmount: 0,
        status: 'REJECTED',
        rejectionReason: 'Risk limit exceeded'
      });

      const payload: RiskClearedPayload = {
        proposal_id: 'prop-rej-1',
        symbol: 'EURUSD',
        account_id: 'DEFAULT',
        approval_id: 'gov-rej-1',
        risk_score: 0.9,
        trade_proposal: { ...mockProposal, id: 'prop-rej-1' },
        approval_token: token,
        governance_decision: {
          approval_id: 'gov-rej-1',
          status: 'REJECTED',
          risk_score: 0.9,
          checks: [],
          timestamp: new Date(),
          decision_authority: 'Test',
          token
        },
        timestamp: new Date()
      };

      await expect(router.handleRiskCleared(payload)).rejects.toThrow('RiskApprovalToken status is \'REJECTED\'');
    });

    it('4. Expired approval token cannot execute', async () => {
      const expiredTimestamp = Date.now() - (10 * 60 * 1000); // 10 mins ago (limit is 5 mins)
      const token = createRiskApprovalToken({
        approvalId: 'gov-exp-1',
        signalId: 'prop-exp-1',
        symbol: 'EURUSD',
        direction: 'BUY',
        approvedLotSize: 0.1,
        maxAllowedDrawdown: 10,
        calculatedRiskAmount: 50,
        status: 'APPROVED',
        timestamp: expiredTimestamp
      });

      const payload: RiskClearedPayload = {
        proposal_id: 'prop-exp-1',
        symbol: 'EURUSD',
        account_id: 'DEFAULT',
        approval_id: 'gov-exp-1',
        risk_score: 0.1,
        trade_proposal: { ...mockProposal, id: 'prop-exp-1' },
        approval_token: token,
        governance_decision: {
          approval_id: 'gov-exp-1',
          status: 'APPROVED',
          risk_score: 0.1,
          checks: [],
          timestamp: new Date(),
          decision_authority: 'Test',
          token
        },
        timestamp: new Date()
      };

      await expect(router.handleRiskCleared(payload)).rejects.toThrow('Expired RiskApprovalToken');
    });

    it('5. Invalid governance signature cannot execute', async () => {
      const token = createRiskApprovalToken({
        approvalId: 'gov-sig-1',
        signalId: 'prop-sig-1',
        symbol: 'EURUSD',
        direction: 'BUY',
        approvedLotSize: 0.1,
        maxAllowedDrawdown: 10,
        calculatedRiskAmount: 50,
        status: 'APPROVED'
      });
      token.governanceSignature = 'FORGED_SIGNATURE_123';

      const payload: RiskClearedPayload = {
        proposal_id: 'prop-sig-1',
        symbol: 'EURUSD',
        account_id: 'DEFAULT',
        approval_id: 'gov-sig-1',
        risk_score: 0.1,
        trade_proposal: { ...mockProposal, id: 'prop-sig-1' },
        approval_token: token,
        governance_decision: {
          approval_id: 'gov-sig-1',
          status: 'APPROVED',
          risk_score: 0.1,
          checks: [],
          timestamp: new Date(),
          decision_authority: 'Test',
          token
        },
        timestamp: new Date()
      };

      await expect(router.handleRiskCleared(payload)).rejects.toThrow('Invalid governanceSignature');
    });

    it('6. Duplicate execution remains idempotent', async () => {
      const token = createRiskApprovalToken({
        approvalId: 'gov-dup-1',
        signalId: 'prop-dup-1',
        symbol: 'EURUSD',
        direction: 'BUY',
        approvedLotSize: 0.1,
        maxAllowedDrawdown: 10,
        calculatedRiskAmount: 50,
        status: 'APPROVED'
      });

      const payload: RiskClearedPayload = {
        proposal_id: 'prop-dup-1',
        symbol: 'EURUSD',
        account_id: 'DEFAULT',
        approval_id: 'gov-dup-1',
        risk_score: 0.1,
        trade_proposal: { ...mockProposal, id: 'prop-dup-1' },
        approval_token: token,
        governance_decision: {
          approval_id: 'gov-dup-1',
          status: 'APPROVED',
          risk_score: 0.1,
          checks: [],
          timestamp: new Date(),
          decision_authority: 'Test',
          token
        },
        timestamp: new Date()
      };

      const res1 = await router.handleRiskCleared(payload);
      const res2 = await router.handleRiskCleared(payload);

      expect(res1.order.order_id).toBe(res2.order.order_id);
    });
  });
});
