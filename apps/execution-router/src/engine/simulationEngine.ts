import { Order, ExecutionReport, OrderStatus } from '@iati/core-types';
import { MarketCondition } from '../types';
import { SlippageEngine } from './slippageEngine';

export class SimulationEngine {
  private condition: MarketCondition = {
    volatilityMode: 'NORMAL',
    liquidityMode: 'NORMAL',
    latencyMs: 15, // 15ms base latency
    baseSpreadPips: 1.0
  };

  private slippageEngine = new SlippageEngine();

  setMarketCondition(condition: Partial<MarketCondition>): void {
    this.condition = { ...this.condition, ...condition };
  }

  getMarketCondition(): MarketCondition {
    return { ...this.condition };
  }

  async simulateExecution(order: Order, currentMarketPrice: number): Promise<ExecutionReport> {
    const reportId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Simulate latency delay
    const totalLatency = this.condition.latencyMs + Math.floor(Math.random() * 10);
    await new Promise(res => setTimeout(res, Math.min(totalLatency, 50)));

    // Rejection simulation for thin liquidity or extreme stop conditions
    if (this.condition.liquidityMode === 'THIN' && Math.random() < 0.05) {
      return {
        report_id: reportId,
        order_id: order.order_id,
        requested_price: currentMarketPrice,
        filled_price: currentMarketPrice,
        slippage: 0,
        slippage_pct: 0,
        latency_ms: totalLatency,
        status: 'REJECTED',
        reason: 'Order rejected due to insufficient market liquidity.',
        timestamp: new Date()
      };
    }

    // Calculate slippage and execution price
    const requestedPrice = order.price || currentMarketPrice;
    const slippageResult = this.slippageEngine.calculateExecutionPrice(
      requestedPrice,
      order.direction,
      this.condition
    );

    return {
      report_id: reportId,
      order_id: order.order_id,
      requested_price: slippageResult.requestedPrice,
      filled_price: slippageResult.executedPrice,
      slippage: slippageResult.slippageAmount,
      slippage_pct: slippageResult.slippagePercentage,
      latency_ms: totalLatency,
      status: 'FILLED',
      timestamp: new Date()
    };
  }

  getSlippageEngine(): SlippageEngine {
    return this.slippageEngine;
  }
}
