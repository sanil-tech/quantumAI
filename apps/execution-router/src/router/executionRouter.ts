import { RiskClearedPayload, Order, ExecutionReport, OrderPlacedPayload, OrderFilledPayload } from '@iati/core-types';
import { BrokerAdapter } from '../adapters/brokerAdapter';
import { PaperBrokerAdapter } from '../adapters/paperBrokerAdapter';
import { OrderManager } from '../oms/orderManager';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import { logger, ErrorCategory } from '@iati/core';
import { verifyGovernanceSignature } from '../../../risk-governance/src/modules/riskTokenService';
import { observabilityService } from '../../../../src/server/services/observabilityService';

export class ExecutionRouter {
  public brokerAdapters: Map<string, BrokerAdapter> = new Map();
  public orderManager = new OrderManager();
  public defaultBrokerId = 'paper-broker-01';

  constructor() {
    const paperAdapter = new PaperBrokerAdapter();
    this.brokerAdapters.set(paperAdapter.id, paperAdapter);
  }

  registerBroker(adapter: BrokerAdapter): void {
    this.brokerAdapters.set(adapter.id, adapter);
  }

  async getAllPositions(): Promise<any[]> {
    const positions: any[] = [];
    for (const adapter of this.brokerAdapters.values()) {
      if (adapter.getPositions) {
        try {
          const adapterPositions = await adapter.getPositions();
          positions.push(...adapterPositions);
        } catch (err) {
          // Ignore individual adapter position lookup errors
        }
      }
    }
    return positions;
  }

  async getAccountStatuses(): Promise<any[]> {
    const statuses: any[] = [];
    for (const adapter of this.brokerAdapters.values()) {
      try {
        const status = await adapter.getAccountStatus();
        statuses.push(status);
      } catch (err) {
        // Ignore individual adapter status lookup errors
      }
    }
    return statuses;
  }

  async handleRiskCleared(payload: RiskClearedPayload): Promise<{ order: Order; report: ExecutionReport }> {
    const startTime = Date.now();
    const { proposal_id, approval_id, symbol, account_id, trade_proposal } = payload;
    const token = payload.approval_token || payload.governance_decision?.token;
    const executionId = proposal_id || `exec-${Date.now()}`;

    observabilityService.metrics.incCounter('execution_total');
    observabilityService.recordTrace(executionId, 'RISK_CLEARED_RECEIVED', {
      proposalId: proposal_id,
      approvalId: approval_id,
      symbol,
      accountId: account_id
    });

    try {
      // MANDATORY EXECUTION INVARIANT: NO VALID RiskApprovalToken = NO EXECUTION
      if (!token) {
        observabilityService.metrics.incCounter('execution_failure_total');
        observabilityService.metrics.incCounter('risk_token_invalid_total');
        throw new Error('Execution Router Violation: Missing RiskApprovalToken. NO VALID RiskApprovalToken = NO EXECUTION.');
      }

      if (token.status !== 'APPROVED') {
        observabilityService.metrics.incCounter('execution_failure_total');
        observabilityService.metrics.incCounter('risk_rejected_total');
        throw new Error(`Execution Router Violation: RiskApprovalToken status is '${token.status}'. Execution rejected.`);
      }

      if (!verifyGovernanceSignature(token)) {
        observabilityService.metrics.incCounter('execution_failure_total');
        observabilityService.metrics.incCounter('risk_token_invalid_total');
        throw new Error('Execution Router Violation: Invalid governanceSignature on RiskApprovalToken.');
      }

      // Token Expiration check (5 minutes)
      if (Date.now() - token.riskCheckTimestamp > 5 * 60 * 1000) {
        observabilityService.metrics.incCounter('execution_failure_total');
        observabilityService.metrics.incCounter('risk_token_expired_total');
        throw new Error('Execution Router Violation: Expired RiskApprovalToken.');
      }

      // Symbol & Direction verification
      const normTokenSymbol = token.symbol.replace('/', '').toUpperCase();
      const normReqSymbol = symbol.replace('/', '').toUpperCase();
      if (normTokenSymbol !== normReqSymbol) {
        observabilityService.metrics.incCounter('execution_failure_total');
        observabilityService.metrics.incCounter('risk_token_mismatch_total');
        throw new Error(`Execution Router Violation: Token symbol '${token.symbol}' does not match payload symbol '${symbol}'.`);
      }

      if (token.direction !== trade_proposal.direction) {
        observabilityService.metrics.incCounter('execution_failure_total');
        observabilityService.metrics.incCounter('risk_token_mismatch_total');
        throw new Error(`Execution Router Violation: Token direction '${token.direction}' does not match trade proposal direction '${trade_proposal.direction}'.`);
      }

      // Validate execution request & check risk approval exists
      if (!approval_id || !proposal_id) {
        observabilityService.metrics.incCounter('execution_failure_total');
        throw new Error('Execution Router Violation: Missing Risk Approval or Proposal ID.');
      }

      observabilityService.logStructured('info', {
        service: 'execution-router',
        event: 'EXECUTION_STARTED',
        executionId,
        proposalId: proposal_id,
        approvalId: approval_id,
        symbol,
        direction: trade_proposal.direction,
        status: 'PROCESSING'
      });

      const quantity = token.approvedLotSize || 0.10;

      const requestedLot = (trade_proposal as any).lotSize;
      if (requestedLot && requestedLot > token.approvedLotSize) {
        observabilityService.metrics.incCounter('execution_failure_total');
        throw new Error(`Execution Router Violation: Requested lot size (${requestedLot}) exceeds approved lot size (${token.approvedLotSize}).`);
      }

      // Idempotency check: check if an order has already been created for this proposal and approval
      const existingOrders = this.orderManager.getOrdersByProposal(proposal_id);
      const existingOrder = existingOrders.find(o => o.approval_id === approval_id);
      if (existingOrder) {
        observabilityService.logStructured('info', {
          service: 'execution-router',
          event: 'DUPLICATE_EXECUTION_DETECTED',
          executionId,
          proposalId: proposal_id,
          brokerOrderId: existingOrder.order_id,
          status: existingOrder.status
        });
        const report: ExecutionReport = {
          report_id: `rep-dup-${existingOrder.order_id}`,
          order_id: existingOrder.order_id,
          requested_price: existingOrder.price || 1.0,
          filled_price: existingOrder.price || 1.0,
          slippage: 0,
          slippage_pct: 0,
          latency_ms: 0,
          status: existingOrder.status === 'REJECTED' ? 'REJECTED' : 'FILLED',
          timestamp: new Date()
        };
        observabilityService.metrics.incCounter('execution_success_total');
        return { order: existingOrder, report };
      }

      const stopLoss = token.stopLoss ?? token.stop_loss ?? trade_proposal.stopLoss ?? trade_proposal.stop_loss;
      const takeProfit = token.takeProfit ?? token.take_profit ?? trade_proposal.takeProfit ?? trade_proposal.take_profit;
      const riskPercent = token.riskPercent ?? token.risk_percent ?? trade_proposal.riskPercent ?? trade_proposal.risk_percent;
      const riskAmount = token.calculatedRiskAmount;
      const strategyId = token.strategyId || (trade_proposal as any).strategyId || trade_proposal.strategy_id;
      const strategyVersion = token.strategyVersion || (trade_proposal as any).strategyVersion || trade_proposal.strategy_version;

      // 1. Create Order in OMS
      const order = this.orderManager.createOrder(
        proposal_id,
        approval_id,
        account_id,
        symbol,
        trade_proposal.direction,
        quantity,
        'MARKET',
        undefined,
        this.defaultBrokerId,
        {
          stop_loss: stopLoss,
          take_profit: takeProfit,
          risk_percent: riskPercent,
          risk_amount: riskAmount,
          strategy_id: strategyId,
          strategy_version: strategyVersion
        }
      );

      observabilityService.recordTrace(executionId, 'ORDER_CREATED', {
        brokerOrderId: order.order_id,
        quantity: order.quantity,
        symbol: order.symbol,
        stopLoss: order.stop_loss,
        takeProfit: order.take_profit
      });

      // Publish OrderPlaced Event
      const orderPlacedPayload: OrderPlacedPayload = {
        order_id: order.order_id,
        proposal_id: order.proposal_id,
        approval_id: order.approval_id,
        symbol: order.symbol,
        direction: order.direction,
        quantity: order.quantity,
        order_type: order.order_type,
        price: order.price,
        stop_loss: order.stop_loss,
        take_profit: order.take_profit,
        timestamp: new Date()
      };

      await globalEventBus.publish({
        id: `evt-placed-${Date.now()}`,
        type: EventTypes.OrderPlaced,
        timestamp: new Date(),
        payload: orderPlacedPayload
      });

      // 2. Select Broker Adapter
      const broker = this.brokerAdapters.get(order.broker_id);
      if (!broker || !broker.isConnected()) {
        this.orderManager.updateOrderStatus(order.order_id, 'REJECTED');
        observabilityService.metrics.incCounter('execution_failure_total');
        observabilityService.metrics.incCounter('broker_error_total');
        throw new Error(`Broker Adapter ${order.broker_id} unavailable.`);
      }

      // 3. Submit Order to Broker
      this.orderManager.updateOrderStatus(order.order_id, 'SUBMITTED');
      observabilityService.metrics.incCounter('broker_request_total');
      
      const brokerStart = Date.now();
      const report = await broker.placeOrder(order);
      const brokerDuration = Date.now() - brokerStart;
      
      observabilityService.metrics.observeHistogram('broker_latency', brokerDuration);

      // 4. Update Order Status and Publish Events
      if (report.status === 'FILLED') {
        this.orderManager.updateOrderStatus(order.order_id, 'FILLED');
        observabilityService.metrics.incCounter('execution_success_total');

        const orderFilledPayload: OrderFilledPayload = {
          fill_id: report.report_id,
          order_id: order.order_id,
          proposal_id: order.proposal_id,
          symbol: order.symbol,
          direction: order.direction,
          quantity: order.quantity,
          filled_price: report.filled_price,
          slippage: report.slippage,
          latency_ms: report.latency_ms,
          timestamp: new Date()
        };

        await globalEventBus.publish({
          id: `evt-filled-${Date.now()}`,
          type: EventTypes.OrderFilled,
          timestamp: new Date(),
          payload: orderFilledPayload
        });

        // Fetch position & publish PositionUpdated
        const updatedPosition = await broker.getPosition(symbol);
        if (updatedPosition) {
          await globalEventBus.publish({
            id: `evt-pos-${Date.now()}`,
            type: EventTypes.PositionUpdated,
            timestamp: new Date(),
            payload: {
              position: updatedPosition,
              timestamp: new Date()
            }
          });
        }

        const totalDuration = Date.now() - startTime;
        observabilityService.metrics.observeHistogram('execution_duration', totalDuration);

        observabilityService.logStructured('info', {
          service: 'execution-router',
          event: 'EXECUTION_COMPLETED',
          executionId,
          proposalId: proposal_id,
          brokerOrderId: order.order_id,
          symbol,
          direction: trade_proposal.direction,
          status: 'FILLED',
          durationMs: totalDuration
        });

        observabilityService.recordTrace(executionId, 'COMPLETED', {
          brokerOrderId: order.order_id,
          status: 'FILLED',
          filledPrice: report.filled_price
        });

      } else {
        this.orderManager.updateOrderStatus(order.order_id, 'REJECTED');
        observabilityService.metrics.incCounter('execution_failure_total');

        observabilityService.logStructured('warn', {
          service: 'execution-router',
          event: 'EXECUTION_REJECTED',
          executionId,
          proposalId: proposal_id,
          brokerOrderId: order.order_id,
          status: 'REJECTED'
        });
      }

      return { order, report };
    } catch (err: any) {
      const totalDuration = Date.now() - startTime;
      observabilityService.recordTrace(executionId, 'EXECUTION_FAILED', {
        error: err.message
      });
      observabilityService.logStructured('error', {
        service: 'execution-router',
        event: 'EXECUTION_ERROR',
        executionId,
        proposalId: proposal_id,
        status: 'FAILED',
        durationMs: totalDuration,
        errorCode: err.message
      });
      throw err;
    }
  }
}

