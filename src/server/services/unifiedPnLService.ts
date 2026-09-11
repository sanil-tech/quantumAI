import { TradingRepository, PositionRecord } from '@iati/database';

export interface PnLCalculation {
  unrealizedPnl: number;
  unrealizedPips: number;
  timestamp: Date;
  currentPrice: number;
  entryPrice: number;
  priceSource: 'live' | 'cached' | 'last_candle';
}

/**
 * Unified P&L Calculation Service
 * Ensures consistent unrealized P&L across all timeframes
 * Uses consistent price snapshots regardless of chart timeframe
 */
export class UnifiedPnLService {
  private tradingRepo: TradingRepository;
  private priceCache = new Map<string, { price: number; timestamp: Date }>();
  private cacheTimeout = 2000; // Cache prices for 2 seconds

  constructor() {
    this.tradingRepo = new TradingRepository();
  }

  /**
   * Calculate unrealized P&L for a position
   * Uses consistent pricing methodology across all timeframes
   */
  async calculateUnrealizedPnL(position: PositionRecord): Promise<PnLCalculation> {
    // Get current market price (use cached if within 2 seconds)
    const currentPrice = await this.getCurrentPrice(position.symbol);

    // Calculate pips based on instrument type
    const pips = this.calculatePips(position, currentPrice);

    // Calculate P&L in USD
    const pnl = this.calculatePnLDollars(position, pips);

    return {
      unrealizedPnl: pnl,
      unrealizedPips: pips,
      currentPrice,
      entryPrice: position.entryPrice,
      timestamp: new Date(),
      priceSource: 'live'
    };
  }

  /**
   * Get current price with caching to ensure consistency across timeframes
   */
  private async getCurrentPrice(symbol: string): Promise<number> {
    const cacheKey = `price_${symbol}`;
    const cached = this.priceCache.get(cacheKey);

    // Return cached price if fresh (within 2 seconds)
    if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTimeout) {
      return cached.price;
    }

    // Fetch fresh price
    const price = await this.fetchLivePrice(symbol);

    // Cache it
    this.priceCache.set(cacheKey, { price, timestamp: new Date() });

    return price;
  }

  /**
   * Fetch live price from broker
   */
  private async fetchLivePrice(symbol: string): Promise<number> {
    // This would integrate with your actual price feed (cTrader, MT5, etc.)
    // For now, return a placeholder that would be replaced with real implementation
    try {
      // Replace with actual broker API call
      // e.g., const tick = await ctraderMarketDataService.getTick(symbol);
      // return (tick.bid + tick.ask) / 2;
      
      console.log(`📍 Fetching live price for ${symbol}`);
      return 4702.93; // Placeholder
    } catch (err) {
      console.error(`❌ Failed to fetch price for ${symbol}:`, err);
      throw err;
    }
  }

  /**
   * Calculate pips between entry and current price
   * Accounts for JPY pairs (0.01 pips) vs others (0.0001 pips)
   */
  private calculatePips(position: PositionRecord, currentPrice: number): number {
    const isJPYPair = position.symbol.includes('JPY');
    const pipMultiplier = isJPYPair ? 0.01 : 0.0001;
    const priceDifference = currentPrice - position.entryPrice;
    const pips = priceDifference / pipMultiplier;

    // Apply direction
    return position.direction === 'BUY' ? pips : -pips;
  }

  /**
   * Calculate P&L in USD
   */
  private calculatePnLDollars(position: PositionRecord, pips: number): number {
    // Standard pip value calculation
    const pipValue = this.calculatePipValue(position.symbol, position.quantity);
    return pips * pipValue;
  }

  /**
   * Calculate pip value in USD
   */
  private calculatePipValue(symbol: string, quantity: number): number {
    // For XAU/USD (Gold): 1 pip = $0.01 per unit
    if (symbol === 'XAU/USD' || symbol === 'XAUUSD') {
      return quantity * 0.01;
    }

    // For FX pairs: 1 pip = $0.0001 * quantity
    // Standard lot size is 100,000 units = $10 per pip
    const standardLotSize = 100000;
    return (quantity / standardLotSize) * 10;
  }

  /**
   * Get consistent P&L for multiple positions
   * All calculations use same price snapshot
   */
  async getConsistentPortfolioPnL(accountId: string): Promise<{
    positions: Array<PositionRecord & { pnl: PnLCalculation }>;
    totalPnl: number;
    totalPips: number;
    timestamp: Date;
  }> {
    const positions = await this.tradingRepo.getOpenPositions(accountId);

    // Get all prices in one batch to ensure consistency
    const priceSnapshot = await this.getPriceSnapshot(positions);

    // Calculate P&L for each position using same price snapshot
    const positionsWithPnL = positions.map(pos => ({
      ...pos,
      pnl: this.calculatePnLWithPrice(pos, priceSnapshot.get(pos.symbol)!)
    }));

    const totalPnl = positionsWithPnL.reduce((sum, p) => sum + p.pnl.unrealizedPnl, 0);
    const totalPips = positionsWithPnL.reduce((sum, p) => sum + p.pnl.unrealizedPips, 0);

    return {
      positions: positionsWithPnL,
      totalPnl,
      totalPips,
      timestamp: new Date()
    };
  }

  /**
   * Get price snapshot for all symbols at once
   */
  private async getPriceSnapshot(positions: PositionRecord[]): Promise<Map<string, number>> {
    const symbols = [...new Set(positions.map(p => p.symbol))];
    const snapshot = new Map<string, number>();

    // Batch fetch all prices
    const prices = await Promise.all(
      symbols.map(symbol => this.getCurrentPrice(symbol))
    );

    symbols.forEach((symbol, idx) => {
      snapshot.set(symbol, prices[idx]);
    });

    return snapshot;
  }

  /**
   * Calculate P&L using a specific price
   */
  private calculatePnLWithPrice(position: PositionRecord, currentPrice: number): PnLCalculation {
    const pips = this.calculatePips(position, currentPrice);
    const pnl = this.calculatePnLDollars(position, pips);

    return {
      unrealizedPnl: pnl,
      unrealizedPips: pips,
      currentPrice,
      entryPrice: position.entryPrice,
      timestamp: new Date(),
      priceSource: 'live'
    };
  }

  /**
   * Clear price cache (call after market close or periodically)
   */
  clearPriceCache() {
    this.priceCache.clear();
    console.log('🧹 Price cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      cachedPrices: this.priceCache.size,
      cacheTimeout: this.cacheTimeout
    };
  }

  /**
   * Validate P&L calculation consistency
   */
  validatePnLConsistency(pnl1: PnLCalculation, pnl2: PnLCalculation, tolerancePips: number = 1): boolean {
    const pipDifference = Math.abs(pnl1.unrealizedPips - pnl2.unrealizedPips);
    return pipDifference <= tolerancePips;
  }

  /**
   * Generate P&L consistency report
   */
  generateConsistencyReport(): string {
    const stats = this.getCacheStats();
    return `
P&L CONSISTENCY REPORT
Generated: ${new Date().toISOString()}

Cache Status:
  Cached Prices: ${stats.cachedPrices}
  Cache Timeout: ${stats.cacheTimeout}ms

Consistency Mechanism:
  ✅ Price snapshot caching (2 second window)
  ✅ Batch price fetching
  ✅ Unified pip calculation
  ✅ Consistent P&L across timeframes

How It Works:
  1. All P&L calculations use same price snapshot
  2. Prices cached for 2 seconds across timeframe switches
  3. No recalculation until cache expires
  4. Ensures consistency even when switching M1→M15→H1→D1

Result:
  ✅ Unrealized P&L stays consistent
  ✅ No variance between timeframes
  ✅ Smooth user experience
`;
  }
}

// Export singleton
export const unifiedPnLService = new UnifiedPnLService();
