import { Candle, Tick, IProviderAdapter } from '@iati/core-types';

export class MockProviderAdapter implements IProviderAdapter {
  private providerName = 'MOCK_QUANT_PROVIDER';

  getName(): string {
    return this.providerName;
  }

  async fetchCandles(symbol: string, timeframe: string = '1h', limit: number = 50): Promise<Candle[]> {
    const candles: Candle[] = [];
    const now = Date.now();
    let basePrice = symbol.includes('EUR') ? 1.0850 : symbol.includes('BTC') ? 65000 : 100;
    const intervalMs = timeframe === '1m' ? 60000 : timeframe === '1h' ? 3600000 : 86400000;

    for (let i = limit - 1; i >= 0; i--) {
      const timestamp = new Date(now - i * intervalMs);
      const randomChange = (Math.random() - 0.48) * (basePrice * 0.005);
      const open = basePrice;
      const close = basePrice + randomChange;
      const high = Math.max(open, close) + Math.random() * (basePrice * 0.002);
      const low = Math.min(open, close) - Math.random() * (basePrice * 0.002);
      const volume = Math.floor(Math.random() * 1000) + 100;

      candles.push({
        symbol,
        timeframe,
        open: Number(open.toFixed(5)),
        high: Number(high.toFixed(5)),
        low: Number(low.toFixed(5)),
        close: Number(close.toFixed(5)),
        volume,
        timestamp,
        provider: this.providerName
      });

      basePrice = close;
    }

    return candles;
  }

  async fetchTick(symbol: string): Promise<Tick> {
    const basePrice = symbol.includes('EUR') ? 1.0850 : symbol.includes('BTC') ? 65000 : 100;
    const spread = basePrice * 0.0001;
    const price = basePrice + (Math.random() - 0.5) * spread * 2;

    return {
      symbol,
      price: Number(price.toFixed(5)),
      volume: Math.floor(Math.random() * 50) + 1,
      bid: Number((price - spread / 2).toFixed(5)),
      ask: Number((price + spread / 2).toFixed(5)),
      timestamp: new Date(),
      provider: this.providerName
    };
  }
}
