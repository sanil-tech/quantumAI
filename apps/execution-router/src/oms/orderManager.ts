import { Order, OrderStatus, OrderType, MarketDirection } from '@iati/core-types';

export class OrderManager {
  private orders: Map<string, Order> = new Map(); // order_id -> Order

  createOrder(
    proposalId: string,
    approvalId: string,
    accountId: string,
    symbol: string,
    direction: MarketDirection,
    quantity: number,
    orderType: OrderType = 'MARKET',
    price?: number,
    brokerId: string = 'paper-broker-01',
    extra?: {
      stop_loss?: number;
      take_profit?: number;
      risk_percent?: number;
      risk_amount?: number;
      strategy_id?: string;
      strategy_version?: string;
    }
  ): Order {
    const orderId = `ord-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const order: Order = {
      order_id: orderId,
      proposal_id: proposalId,
      approval_id: approvalId,
      account_id: accountId,
      symbol,
      direction,
      quantity,
      order_type: orderType,
      price,
      status: 'PENDING',
      created_at: new Date(),
      broker_id: brokerId,
      stop_loss: extra?.stop_loss,
      take_profit: extra?.take_profit,
      risk_percent: extra?.risk_percent,
      risk_amount: extra?.risk_amount,
      strategy_id: extra?.strategy_id,
      strategy_version: extra?.strategy_version
    };

    this.orders.set(orderId, order);
    return order;
  }

  updateOrderStatus(orderId: string, status: OrderStatus): Order | undefined {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = status;
      if (status === 'FILLED') {
        order.filled_at = new Date();
      }
      this.orders.set(orderId, order);
    }
    return order;
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  getAllOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  getOrdersByProposal(proposalId: string): Order[] {
    return Array.from(this.orders.values()).filter(o => o.proposal_id === proposalId);
  }
}
