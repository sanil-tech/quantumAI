import { Order, ExecutionReport, Position, MarketDirection } from '@iati/core-types';

export interface MarketCondition {
  volatilityMode: 'NORMAL' | 'HIGH' | 'LOW';
  liquidityMode: 'NORMAL' | 'THIN' | 'EXPANDED_SPREAD';
  latencyMs: number;
  baseSpreadPips: number;
}

export interface SlippageCalculation {
  requestedPrice: number;
  executedPrice: number;
  slippageAmount: number;
  slippagePercentage: number;
}

export interface PerformanceMetrics {
  totalOrders: number;
  filledOrders: number;
  rejectedOrders: number;
  averageSlippagePips: number;
  averageLatencyMs: number;
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  winRate: number;
}
