import { Order, ExecutionReport, Position } from '@iati/core-types';

export interface AccountStatus {
  accountId: string;
  brokerId: string;
  balance: number;
  equity: number;
  currency: string;
  connected: boolean;
}

export interface BrokerAdapter {
  id: string;
  name: string;

  connect(): Promise<boolean>;
  disconnect(): Promise<boolean>;
  isConnected(): boolean;

  placeOrder(order: Order): Promise<ExecutionReport>;
  cancelOrder(orderId: string): Promise<boolean>;
  getPosition(symbol: string): Promise<Position | undefined>;
  getAccountStatus(): Promise<AccountStatus>;
}
