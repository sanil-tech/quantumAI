import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { marketDataRouter } from '../src/server/routes/marketData';
import * as marketDataGenerator from '../src/lib/marketDataGenerator';
import { buildMarketDataEnvelope } from '@iati/core';
import fs from 'fs';
import path from 'path';

describe('Phase 5B — Market Data Extraction & Safety Verification', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/forex', marketDataRouter);
  });

  const baseNow = Date.now();
  const createMockCandles = (count = 10) => {
    const candles = [];
    for (let i = 0; i < count; i++) {
      const base = 1.0850 + i * 0.0001;
      candles.push({
        time: Math.floor((baseNow - (count - i) * 60000) / 1000),
        open: Number(base.toFixed(5)),
        high: Number((base + 0.001).toFixed(5)),
        low: Number((base - 0.001).toFixed(5)),
        close: Number((base + 0.0002).toFixed(5)),
        volume: 1000
      });
    }
    return candles;
  };

  // Test A: GET /api/forex/candles returns valid LIVE data correctly
  it('Test A: GET /api/forex/candles returns valid LIVE data envelope correctly', async () => {
    const validCandles = createMockCandles(10);
    const mockEnvelope = buildMarketDataEnvelope(
      'EUR/USD', 'H1', 'LIVE', validCandles, 'YahooFinance', 'YAHOO', undefined, undefined, baseNow
    );

    vi.spyOn(marketDataGenerator, 'fetchRealCandleEnvelope').mockResolvedValue(mockEnvelope);

    const server = app.listen(0);
    const address = server.address() as any;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/forex/candles?pair=EUR/USD&timeframe=H1&mode=LIVE`);
    const data = await res.json();
    server.close();

    expect(res.status).toBe(200);
    expect(data.pair).toBe('EUR/USD');
    expect(data.timeframe).toBe('H1');
    expect(data.candles).toHaveLength(10);
    expect(data.envelope.status).toBe('VALID');
    expect(data.envelope.executable).toBe(true);
  });

  // Test B: LIVE provider timeout returns 503 LIVE_MARKET_DATA_UNAVAILABLE
  it('Test B: LIVE provider timeout returns 503 LIVE_MARKET_DATA_UNAVAILABLE', async () => {
    const timeoutEnvelope = buildMarketDataEnvelope(
      'EUR/USD', 'H1', 'LIVE', [], 'YahooFinance', 'YAHOO', 'UNAVAILABLE', 'LIVE_MARKET_DATA_UNAVAILABLE: Timeout', baseNow
    );

    vi.spyOn(marketDataGenerator, 'fetchRealCandleEnvelope').mockResolvedValue(timeoutEnvelope);

    const server = app.listen(0);
    const address = server.address() as any;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/forex/candles?pair=EUR/USD&timeframe=H1&mode=LIVE`);
    const data = await res.json();
    server.close();

    expect(res.status).toBe(503);
    expect(data.error).toContain('LIVE_MARKET_DATA_UNAVAILABLE');
    expect(data.status).toBe('UNAVAILABLE');
    expect(data.executable).toBe(false);
  });

  // Test C: LIVE stale data returns 503 STALE_MARKET_DATA
  it('Test C: LIVE stale data returns 503 STALE_MARKET_DATA', async () => {
    const staleCandles = [
      { time: Math.floor((baseNow - 7200000) / 1000), open: 1.085, high: 1.090, low: 1.080, close: 1.085, volume: 100 }
    ];
    const staleEnvelope = buildMarketDataEnvelope(
      'EUR/USD', 'M15', 'LIVE', staleCandles, 'YahooFinance', 'YAHOO', undefined, undefined, baseNow
    );

    vi.spyOn(marketDataGenerator, 'fetchRealCandleEnvelope').mockResolvedValue(staleEnvelope);

    const server = app.listen(0);
    const address = server.address() as any;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/forex/candles?pair=EUR/USD&timeframe=M15&mode=LIVE`);
    const data = await res.json();
    server.close();

    expect(res.status).toBe(503);
    expect(data.error).toBe('STALE_MARKET_DATA');
    expect(data.status).toBe('STALE');
    expect(data.executable).toBe(false);
  });

  // Test D: LIVE invalid candle data returns 503 INVALID_MARKET_DATA
  it('Test D: LIVE invalid candle data returns 503 INVALID_MARKET_DATA', async () => {
    const invalidCandles = [
      { time: Math.floor(baseNow / 1000), open: 1.085, high: 1.080, low: 1.090, close: 1.085, volume: 100 }
    ];
    const invalidEnvelope = buildMarketDataEnvelope(
      'EUR/USD', 'H1', 'LIVE', invalidCandles, 'YahooFinance', 'YAHOO', undefined, undefined, baseNow
    );

    vi.spyOn(marketDataGenerator, 'fetchRealCandleEnvelope').mockResolvedValue(invalidEnvelope);

    const server = app.listen(0);
    const address = server.address() as any;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/forex/candles?pair=EUR/USD&timeframe=H1&mode=LIVE`);
    const data = await res.json();
    server.close();

    expect(res.status).toBe(503);
    expect(data.error).toBe('HIGH_LESS_THAN_LOW');
    expect(data.status).toBe('INVALID');
    expect(data.executable).toBe(false);
  });

  // Test E: Synthetic data remains dataMode = SYNTHETIC, executable = false
  it('Test E: Synthetic data returns dataMode = SYNTHETIC with executable = false', async () => {
    const syntheticCandles = createMockCandles(10);
    const synthEnvelope = buildMarketDataEnvelope(
      'EUR/USD', 'H1', 'SYNTHETIC', syntheticCandles, 'SyntheticGenerator', 'SYNTHETIC', undefined, undefined, baseNow
    );

    vi.spyOn(marketDataGenerator, 'fetchRealCandleEnvelope').mockResolvedValue(synthEnvelope);

    const server = app.listen(0);
    const address = server.address() as any;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/forex/candles?pair=EUR/USD&timeframe=H1&mode=SYNTHETIC`);
    const data = await res.json();
    server.close();

    expect(res.status).toBe(200);
    expect(data.envelope.dataMode).toBe('SYNTHETIC');
    expect(data.envelope.executable).toBe(false);
  });

  // Test F: Market-data provenance survives route extraction
  it('Test F: Market-data provenance survives route extraction', async () => {
    const candles = createMockCandles(10);
    const customEnvelope = buildMarketDataEnvelope(
      'GBP/USD', 'M15', 'LIVE', candles, 'CustomFeedSource', 'CUSTOM_PROV', undefined, undefined, baseNow
    );

    vi.spyOn(marketDataGenerator, 'fetchRealCandleEnvelope').mockResolvedValue(customEnvelope);

    const server = app.listen(0);
    const address = server.address() as any;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/forex/candles?pair=GBP/USD&timeframe=M15&mode=LIVE`);
    const data = await res.json();
    server.close();

    expect(res.status).toBe(200);
    expect(data.envelope.provenance.provider).toBe('CUSTOM_PROV');
    expect(data.envelope.provenance.source).toBe('CustomFeedSource');
    expect(data.envelope.provenance.receivedAt).toBe(baseNow);
  });

  // Test G: /api/forex/analysis still returns expected SMC/analysis results
  it('Test G: /api/forex/analysis returns expected SMC/analysis results', async () => {
    const candles = createMockCandles(20);
    const mockEnvelope = buildMarketDataEnvelope(
      'EUR/USD', 'M15', 'LIVE', candles, 'YahooFinance', 'YAHOO', undefined, undefined, baseNow
    );

    vi.spyOn(marketDataGenerator, 'fetchRealCandleEnvelope').mockResolvedValue(mockEnvelope);

    const server = app.listen(0);
    const address = server.address() as any;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/forex/analysis?pair=EUR/USD&timeframe=M15&mode=LIVE`);
    const data = await res.json();
    server.close();

    expect(res.status).toBe(200);
    expect(data.pair).toBe('EUR/USD');
    expect(data.entryTimeframe).toBe('M15');
    expect(data.indicators).toBeDefined();
    expect(data.smc).toBeDefined();
    expect(data.lineage.dataClass).toBe('LIVE');
    expect(data.lineage.provider).toBe('YAHOO');
  });

  // Test H: Static architecture check - No inline market-data handlers in server.ts
  it('Test H: server.ts contains zero inline market-data fetching route handlers', () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, '../server.ts'), 'utf-8');
    
    expect(serverCode).not.toContain('app.get("/api/forex/candles"');
    expect(serverCode).not.toContain("app.get('/api/forex/candles'");
    expect(serverCode).not.toContain('app.get("/api/forex/analysis"');
    expect(serverCode).not.toContain("app.get('/api/forex/analysis'");
    expect(serverCode).toContain('app.use("/api/forex", marketDataRouter)');
  });
});
