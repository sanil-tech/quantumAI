import { MarketDirection } from '@iati/core-types';
import { MarketCondition, SlippageCalculation } from '../types';

export class SlippageEngine {
  private executionHistory: SlippageCalculation[] = [];

  calculateExecutionPrice(
    requestedPrice: number,
    direction: MarketDirection,
    condition: MarketCondition
  ): SlippageCalculation {
    // Standard pip size for forex/indices (~0.0001 or equivalent)
    const pipMultiplier = requestedPrice > 100 ? 0.01 : 0.0001;

    // Base spread
    let spreadPips = condition.baseSpreadPips;
    if (condition.liquidityMode === 'THIN') spreadPips *= 2.0;
    if (condition.liquidityMode === 'EXPANDED_SPREAD') spreadPips *= 3.5;

    // Slippage random factor based on volatility
    let maxSlippagePips = 0.5;
    if (condition.volatilityMode === 'HIGH') maxSlippagePips = 3.0;
    if (condition.volatilityMode === 'LOW') maxSlippagePips = 0.2;

    const randomSlippagePips = (Math.random() * maxSlippagePips);
    const totalSlippagePips = (spreadPips / 2) + randomSlippagePips;

    // Slippage adverse direction: BUY fills higher, SELL fills lower
    const priceAdjustment = totalSlippagePips * pipMultiplier;
    const executedPrice = direction === 'BUY'
      ? requestedPrice + priceAdjustment
      : requestedPrice - priceAdjustment;

    const slippageAmount = Math.abs(executedPrice - requestedPrice);
    const slippagePercentage = (slippageAmount / requestedPrice) * 100;

    const calculation: SlippageCalculation = {
      requestedPrice: Number(requestedPrice.toFixed(5)),
      executedPrice: Number(executedPrice.toFixed(5)),
      slippageAmount: Number(slippageAmount.toFixed(5)),
      slippagePercentage: Number(slippagePercentage.toFixed(4))
    };

    this.executionHistory.push(calculation);
    if (this.executionHistory.length > 200) this.executionHistory.shift();

    return calculation;
  }

  getAverageSlippagePips(): number {
    if (this.executionHistory.length === 0) return 0;
    const sum = this.executionHistory.reduce((acc, item) => acc + item.slippageAmount, 0);
    return Number((sum / this.executionHistory.length).toFixed(5));
  }
}
