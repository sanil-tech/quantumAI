import { RiskClearedPayload, Order, ExecutionReport, OrderPlacedPayload, OrderFilledPayload } from '@iati/core-types';
import { BrokerAdapter } from '../adapters/brokerAdapter';
import { PaperBrokerAdapter } from '../adapters/paperBrokerAdapter';
import { CTraderAdapter } from '../adapters/ctraderAdapter';
import { BrokerRegistry, DEFAULT_BROKER_ID } from '../adapters/brokerRegistry';
import { validateExecutionEnvironmentSafety, ExecutionEnvironmentMode } from '../adapters/executionSafetyGate';
import { OrderManager } from '../oms/orderManager';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import { logger, ErrorCategory } from '@iati/core';
import { verifyGovernanceSignature } from '../../../risk-governance/src/modules/riskTokenService';
import { observabilityService } from '../../../../src/server/services/observabilityService';

export class ExecutionRouter {
  public brokerRegistry = new BrokerRegistry();
  public brokerAdapters: Map<string, BrokerAdapter> = new Map();
  public orderManager = new OrderManager();
  public defaultBrokerId = DEFAULT_BROKER_ID;

  constructor() {
    const paperAdapter = new PaperBrokerAdapter();
    const ctraderAdapter = new CTraderAdapter();
    this.registerBroker(paperAdapter);
    this.registerBroker(ctraderAdapter);
  }

  registerBroker(adapter: BrokerAdapter): void {
    this.brokerRegistry.register(adapter);
    this.brokerAdapters.set(adapter.id, adapter);
  }

  getBroker(brokerId?: string): BrokerAdapter | undefined {
    return this.brokerRegistry.get(brokerId) || this.brokerAdapters.get(brokerId || this.defaultBrokerId);
  }

  async getAllPositions(): Promise<any[]> {
    const positions: any[] = [];
    for (const adapter of this.brokerRegistry.listAdapters()) {
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
    for (const adapter of this.brokerRegistry.listAdapters()) {
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

      // Server-Side Execution Environment Safety Gate Check
      const targetBrokerId = payload.broker_id || payload.brokerId || token.brokerId || token.broker_id || (trade_proposal as any).brokerId || this.defaultBrokerId;
      const targetEnv: ExecutionEnvironmentMode = (payload as any).environment || (process.env.EXECUTION_ENVIRONMENT as any) || 'PAPER';
      const quantity = token.approvedLotSize || 0.10;
      const stopLoss = (token as any).stopLoss ?? (token as any).stop_loss ?? (trade_proposal as any).stopLoss ?? (trade_proposal as any).stop_loss ?? (payload as any).stopLoss ?? (payload as any).stop_loss;
      const takeProfit = (token as any).takeProfit ?? (token as any).take_profit ?? (trade_proposal as any).takeProfit ?? (trade_proposal as any).take_profit ?? (payload as any).takeProfit ?? (payload as any).take_profit ?? (payload as any).takeProfit1;

      const symNorm = symbol.replace('/', '').toUpperCase();
      const isJpy = symNorm.includes('JPY');
      const isGold = symNorm.includes('XAU') || symNorm.includes('GOLD');
      const isBtc = symNorm.includes('BTC');
      const isIndex = symNorm.includes('NAS') || symNorm.includes('TECH') || symNorm.includes('USTEC');

      const rawPrice = (trade_proposal as any).entryPrice ?? (trade_proposal as any).price ?? (token as any).entryPrice ?? (token as any).price ?? (payload as any).price ?? (payload as any).entryPrice;
      const refEntry = typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : (
        symNorm === 'EURJPY' ? 185.20 :
        symNorm === 'USDJPY' ? 159.70 :
        symNorm === 'GBPJPY' ? 216.20 :
        symNorm === 'EURUSD' ? 1.1595 :
        symNorm === 'GBPUSD' ? 1.3535 :
        symNorm === 'AUDUSD' ? 0.7160 :
        symNorm === 'NZDUSD' ? 0.5925 :
        symNorm === 'USDCHF' ? 0.8080 :
        symNorm === 'USDCAD' ? 1.3885 :
        isGold ? 4455.0 : 1.0
      );

      const decimals = isJpy ? 3 : (isGold || isBtc || isIndex) ? 2 : 5;
      const autoSlOffset = isGold ? 20.0 : (isJpy ? 0.35 : (isBtc ? 500.0 : (isIndex ? 100.0 : 0.0030)));
      const autoTpOffset = isGold ? 40.0 : (isJpy ? 0.70 : (isBtc ? 1000.0 : (isIndex ? 200.0 : 0.0060)));

      const finalStopLoss = typeof stopLoss === 'number' && Number.isFinite(stopLoss) && stopLoss > 0
        ? stopLoss
        : Number((trade_proposal.direction === 'BUY' ? refEntry - autoSlOffset : refEntry + autoSlOffset).toFixed(decimals));

      const finalTakeProfit = typeof takeProfit === 'number' && Number.isFinite(takeProfit) && takeProfit > 0
        ? takeProfit
        : Number((trade_proposal.direction === 'BUY' ? refEntry + autoTpOffset : refEntry - autoTpOffset).toFixed(decimals));

      const safetyResult = validateExecutionEnvironmentSafety({
        environment: targetEnv,
        brokerId: targetBrokerId,
        symbol,
        direction: trade_proposal.direction,
        requestedLotSize: quantity,
        stopLoss: finalStopLoss,
        takeProfit: finalTakeProfit,
        token
      });

      if (!safetyResult.allowed) {
        observabilityService.metrics.incCounter('execution_failure_total');
        throw new Error(`Execution Router Violation (${safetyResult.code}): ${safetyResult.reason}`);
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

      const riskPercent = token.riskPercent ?? token.risk_percent ?? trade_proposal.riskPercent ?? trade_proposal.risk_percent;
      const riskAmount = token.calculatedRiskAmount;
      const strategyId = token.strategyId || (trade_proposal as any).strategyId || trade_proposal.strategy_id;
      const strategyVersion = token.strategyVersion || (trade_proposal as any).strategyVersion || trade_proposal.strategy_version;

      const orderPrice = typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : undefined;

      const orderType = (payload as any).orderType || (payload as any).order_type || (trade_proposal as any).orderType || (trade_proposal as any).order_type || (orderPrice ? 'LIMIT' : 'MARKET');

      // 1. Create Order in OMS
      const order = this.orderManager.createOrder(
        proposal_id,
        approval_id,
        account_id,
        symbol,
        trade_proposal.direction,
        quantity,
        orderType,
        orderPrice,
        targetBrokerId,
        {
          stop_loss: finalStopLoss,
          take_profit: finalTakeProfit,
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
      const broker = this.getBroker(order.broker_id);
      if (!broker) {
        this.orderManager.updateOrderStatus(order.order_id, 'REJECTED');
        observabilityService.metrics.incCounter('execution_failure_total');
        observabilityService.metrics.incCounter('broker_error_total');
        throw new Error(`Broker Adapter ${order.broker_id} unavailable.`);
      }

      if (!broker.isConnected()) {
        try {
          await broker.connect();
        } catch (connErr: any) {
          this.orderManager.updateOrderStatus(order.order_id, 'REJECTED');
          observabilityService.metrics.incCounter('execution_failure_total');
          observabilityService.metrics.incCounter('broker_error_total');
          throw new Error(`Broker Adapter ${order.broker_id} connection failed: ${connErr.message}`);
        }
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

