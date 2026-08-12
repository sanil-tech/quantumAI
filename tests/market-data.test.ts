import { describe, it, expect } from 'vitest';
import { MarketDataService } from '../apps/market-data/src/services/marketDataService';
import { MockProviderAdapter } from '../apps/market-data/src/providers/providerAdapter';

describe('Market Data Service (Sprint 2)', () => {
  const provider = new MockProviderAdapter();
  const service = new MarketDataService();

  it('should fetch candles via provider adapter', async () => {
    const candles = await provider.fetchCandles('EURUSD', '1h', 10);
    expect(candles).toHaveLength(10);
    expect(candles[0].symbol).toBe('EURUSD');
    expect(candles[0].provider).toBe('MOCK_QUANT_PROVIDER');
  });

  it('should ingest and validate candles and store in cache', async () => {
    const candles = await service.ingestCandles('EURUSD', '1h', 15);
    expect(candles).toHaveLength(15);

    const fetched = await service.getCandles('EURUSD', '1h');
    expect(fetched).toHaveLength(15);
    expect(fetched[0].symbol).toBe('EURUSD');
  });
});
