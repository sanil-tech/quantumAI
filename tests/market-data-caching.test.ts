import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchRealCandleEnvelope,
  clearMarketDataCache,
  getMarketDataCacheStats,
  CANDLE_CACHE_TTL_MS
} from '../src/lib/marketDataGenerator';

describe('Market Data Server-Side Caching & Request Coalescing', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearMarketDataCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearMarketDataCache();
  });

  it('1. Cache Miss: fetches from upstream, populates cache, and returns valid envelope (200 OK)', async () => {
    const mockData = {
      chart: {
        result: [
          {
            timestamp: [1700000000, 1700000060],
            indicators: {
              quote: [
                {
                  open: [1.085, 1.0852],
                  high: [1.086, 1.0862],
                  low: [1.084, 1.0842],
                  close: [1.0855, 1.0858],
                  volume: [1000, 1200]
                }
              ]
            }
          }
        ]
      }
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData
    });
    global.fetch = fetchSpy as any;

    const envelope = await fetchRealCandleEnvelope('EUR/USD', 'M1', 10, 'LIVE');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(['VALID', 'STALE']).toContain(envelope.status);
    expect(envelope.data.length).toBe(2);
    expect(envelope.data[1].close).toBe(1.0858);

    const stats = getMarketDataCacheStats();
    expect(stats.cacheSize).toBe(1);
    expect(stats.inFlightSize).toBe(0);
  });

  it('2. Cache Hit: returns cached data without issuing an upstream fetch within TTL', async () => {
    const mockData = {
      chart: {
        result: [
          {
            timestamp: [1700000000],
            indicators: { quote: [{ open: [1.1], high: [1.11], low: [1.09], close: [1.105], volume: [500] }] }
          }
        ]
      }
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData
    });
    global.fetch = fetchSpy as any;

    // First call (Miss)
    const env1 = await fetchRealCandleEnvelope('GBP/USD', 'M15', 10, 'LIVE');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call immediately (Hit)
    const env2 = await fetchRealCandleEnvelope('GBP/USD', 'M15', 10, 'LIVE');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // STILL 1 call
    expect(env2.data).toEqual(env1.data);
  });

  it('3. TTL Expiration: issues a new fetch once the 30s TTL expires', async () => {
    const mockData = {
      chart: {
        result: [
          {
            timestamp: [1700000000],
            indicators: { quote: [{ open: [1.1], high: [1.11], low: [1.09], close: [1.105], volume: [500] }] }
          }
        ]
      }
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData
    });
    global.fetch = fetchSpy as any;

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // First call at time T0
    await fetchRealCandleEnvelope('USD/JPY', 'H1', 10, 'LIVE');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Call at T0 + 20s (Hit)
    vi.spyOn(Date, 'now').mockReturnValue(now + 20000);
    await fetchRealCandleEnvelope('USD/JPY', 'H1', 10, 'LIVE');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Call at T0 + 31s (Expired -> Miss)
    vi.spyOn(Date, 'now').mockReturnValue(now + 31000);
    await fetchRealCandleEnvelope('USD/JPY', 'H1', 10, 'LIVE');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('4. Concurrent Request Coalescing (Single-Flight): 20 simultaneous calls make exactly 1 upstream fetch', async () => {
    const mockData = {
      chart: {
        result: [
          {
            timestamp: [1700000000],
            indicators: { quote: [{ open: [1.2], high: [1.21], low: [1.19], close: [1.205], volume: [800] }] }
          }
        ]
      }
    };

    // Simulate slow upstream response (100ms delay)
    const fetchSpy = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: async () => mockData
          });
        }, 100);
      });
    });
    global.fetch = fetchSpy as any;

    // Trigger 20 simultaneous requests
    const promises = Array.from({ length: 20 }).map(() =>
      fetchRealCandleEnvelope('AUD/USD', 'M5', 150, 'LIVE')
    );

    const results = await Promise.all(promises);

    // Exactly 1 upstream fetch should have been made
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(results.length).toBe(20);
    // All 20 callers got the exact same envelope data
    for (let i = 1; i < 20; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });

  it('5. Upstream 429 Rate Limit & Stale Fallback: returns stale cache if upstream returns 429', async () => {
    const mockValidData = {
      chart: {
        result: [
          {
            timestamp: [1700000000],
            indicators: { quote: [{ open: [1.08], high: [1.09], low: [1.07], close: [1.085], volume: [1000] }] }
          }
        ]
      }
    };

    let fetchCount = 0;
    const fetchSpy = vi.fn().mockImplementation(() => {
      fetchCount++;
      if (fetchCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidData
        });
      }
      // Second call fails with 429 Too Many Requests
      return Promise.resolve({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit exceeded' })
      });
    });
    global.fetch = fetchSpy as any;

    const baseTime = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(baseTime);

    // Call 1: Success & cache
    const initialEnv = await fetchRealCandleEnvelope('EUR/USD', 'H4', 10, 'LIVE');
    expect(['VALID', 'STALE']).toContain(initialEnv.status);
    expect(initialEnv.data[0].close).toBe(1.085);

    // Advance time past TTL (40 seconds)
    vi.spyOn(Date, 'now').mockReturnValue(baseTime + 40000);

    // Call 2: Upstream returns 429, but stale cache exists -> serves stale cache cleanly without throwing
    const staleEnv = await fetchRealCandleEnvelope('EUR/USD', 'H4', 10, 'LIVE');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(['VALID', 'STALE']).toContain(staleEnv.status);
    expect(staleEnv.data[0].close).toBe(1.085);
  });

  it('6. Upstream 5xx Server Error & Stale Fallback: returns stale cache if upstream returns 503', async () => {
    const mockValidData = {
      chart: {
        result: [
          {
            timestamp: [1700000000],
            indicators: { quote: [{ open: [2380], high: [2390], low: [2375], close: [2385], volume: [2000] }] }
          }
        ]
      }
    };

    let fetchCount = 0;
    const fetchSpy = vi.fn().mockImplementation(() => {
      fetchCount++;
      if (fetchCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidData
        });
      }
      return Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service Unavailable' })
      });
    });
    global.fetch = fetchSpy as any;

    const baseTime = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(baseTime);

    // Initial fetch
    await fetchRealCandleEnvelope('XAU/USD', 'D1', 10, 'LIVE');

    // Expire cache
    vi.spyOn(Date, 'now').mockReturnValue(baseTime + 40000);

    // Upstream 503 -> serves stale cache
    const staleEnv = await fetchRealCandleEnvelope('XAU/USD', 'D1', 10, 'LIVE');
    expect(['VALID', 'STALE']).toContain(staleEnv.status);
    expect(staleEnv.data[0].close).toBe(2385);
  });

  it('7. Fresh 429 without prior cache: returns valid fallback candles without crashing', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Rate limit' })
    });
    global.fetch = fetchSpy as any;

    const env = await fetchRealCandleEnvelope('BTC/USD', 'M15', 10, 'LIVE');
    expect(env.status).toBe('VALID');
    expect(env.data.length).toBe(10);
    expect(env.provenance.source).toBe('QuantumAI Live Market Engine (Fallback)');
  });
});
