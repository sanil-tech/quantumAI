import { describe, it, expect } from 'vitest';
import { MarketFeatureEngine } from '../apps/intelligence/src/features/featureEngine';
import { MarketStructureAnalyzer } from '../apps/intelligence/src/structure/structureAnalyzer';
import { MarketRegimeEngine } from '../apps/intelligence/src/regime/regimeEngine';
import { MockProviderAdapter } from '../apps/market-data/src/providers/providerAdapter';

describe('Market Intelligence Engine (Sprint 3)', () => {
  const provider = new MockProviderAdapter();
  const featureEngine = new MarketFeatureEngine();
  const structureAnalyzer = new MarketStructureAnalyzer();
  const regimeEngine = new MarketRegimeEngine();

  it('should calculate price, trend, volatility, momentum, liquidity features', async () => {
    const candles = await provider.fetchCandles('EURUSD', '1h', 50);
    const features = featureEngine.extractAllFeatures(candles);

    expect(features.price.ohlc.symbol).toBe('EURUSD');
    expect(features.trend.direction).toBeDefined();
    expect(features.volatility.atr).toBeGreaterThan(0);
    expect(features.momentum.rsi).toBeGreaterThanOrEqual(0);
    expect(features.momentum.rsi).toBeLessThanOrEqual(100);
    expect(features.liquidity.spread).toBeGreaterThan(0);
  });

  it('should detect market structure patterns', async () => {
    const candles = await provider.fetchCandles('GBPUSD', '1h', 20);
    const structure = structureAnalyzer.analyzeStructure(candles);

    expect(structure.pattern).toBeDefined();
    expect(Array.isArray(structure.supportZones)).toBe(true);
    expect(Array.isArray(structure.resistanceZones)).toBe(true);
  });

  it('should classify market regime and generate market state', async () => {
    const candles = await provider.fetchCandles('BTCUSD', '1h', 50);
    const features = featureEngine.extractAllFeatures(candles);
    const structure = structureAnalyzer.analyzeStructure(candles);
    const state = regimeEngine.generateMarketState('BTCUSD', features, structure);

    expect(state.symbol).toBe('BTCUSD');
    expect(state.regime.regime).toBeDefined();
    expect(state.confidence).toBeGreaterThan(0);
    expect(state.evidence.length).toBeGreaterThan(0);
  });
});
