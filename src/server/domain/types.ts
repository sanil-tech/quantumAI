export type MarketDataClass = 'LIVE' | 'DELAYED' | 'HISTORICAL' | 'PAPER' | 'SIMULATED' | 'SYNTHETIC' | 'UNKNOWN';

export type ExecutionCommandStatus = 
  | 'PENDING' 
  | 'CLAIMED' 
  | 'SENT' 
  | 'ACKNOWLEDGED' 
  | 'EXECUTED' 
  | 'FAILED' 
  | 'CANCELLED' 
  | 'EXPIRED';

export type ExecutionEnvironment = 'DEMO' | 'REAL_LIVE' | 'PAPER';

export interface MarketDataLineage {
  dataClass: MarketDataClass;
  provider: string;
  symbol: string;
  timeframe?: string;
  timestamp: number;
  receivedAt: number;
}

export interface ExecutionCommand {
  id: string;
  setupId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  broker: 'MT5' | 'CTRADER' | 'PAPER' | string;
  accountNumber: string;
  environment: ExecutionEnvironment;
  status: ExecutionCommandStatus;
  lineage: MarketDataLineage;
  idempotencyKey?: string;
  attemptCount: number;
  lastAttemptAt?: number;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  executedAt?: number;
  brokerOrderId?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface BrokerWebhookEvent {
  eventId: string;
  broker: string;
  eventType: string;
  accountNumber?: string;
  orderId?: string;
  payload: Record<string, any>;
  processedAt: number;
}
