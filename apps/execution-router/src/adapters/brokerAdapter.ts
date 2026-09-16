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
  closePosition?(positionId: string, volume?: number): Promise<ExecutionReport>;
  partialClosePosition?(positionId: string, volume: number): Promise<ExecutionReport>;
  amendPositionSLTP?(positionId: string, stopLoss?: number, takeProfit?: number): Promise<boolean>;
  getPosition(symbol: string): Promise<Position | undefined>;
  getPositions?(): Promise<Position[]>;
  getAccountStatus(): Promise<AccountStatus>;
}
