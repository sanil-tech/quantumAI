import { z } from 'zod';
import { Candle, MarketDataUpdatedPayload } from '@iati/core-types';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import { logger } from '@iati/core';
import { MockProviderAdapter } from '../providers/providerAdapter';

const candleSchema = z.object({
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  open: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  volume: z.number().nonnegative(),
  timestamp: z.date(),
  provider: z.string().optional()
});

export class MarketDataService {
  private provider = new MockProviderAdapter();
  private inMemoryCache = new Map<string, Candle[]>();

  async ingestCandles(symbol: string, timeframe: string = '1h', count: number = 50): Promise<Candle[]> {
    const candles = await this.provider.fetchCandles(symbol, timeframe, count);
    
    // Validate each candle
    const validatedCandles: Candle[] = [];
    for (const candle of candles) {
      const parsed = candleSchema.safeParse(candle);
      if (parsed.success) {
        validatedCandles.push(parsed.data);
      } else {
        logger.warn(`Invalid candle format received: ${JSON.stringify(parsed.error.format())}`);
      }
    }

    // Cache locally
    const cacheKey = `${symbol}:${timeframe}`;
    this.inMemoryCache.set(cacheKey, validatedCandles);

    // Publish latest candle as event
    if (validatedCandles.length > 0) {
      const latest = validatedCandles[validatedCandles.length - 1];
      const eventPayload: MarketDataUpdatedPayload = {
        symbol,
        timeframe,
        candle: latest,
        provider: this.provider.getName(),
        timestamp: new Date()
      };

      await globalEventBus.publish({
        id: `mkt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: EventTypes.MarketDataUpdated,
        timestamp: new Date(),
        payload: eventPayload
      });
    }

    return validatedCandles;
  }

  async getCandles(symbol: string, timeframe: string = '1h'): Promise<Candle[]> {
    const cacheKey = `${symbol}:${timeframe}`;
    if (this.inMemoryCache.has(cacheKey)) {
      return this.inMemoryCache.get(cacheKey)!;
    }
    return this.ingestCandles(symbol, timeframe, 50);
  }
}
