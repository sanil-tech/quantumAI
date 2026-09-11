import { describe, it, expect } from 'vitest';
import {
  PAIR_CONFIGS,
  PAIR_SYMBOLS,
  isSupportedPair,
  getProviderSymbol,
  fetchRealCandleEnvelope
} from '../src/lib/marketDataGenerator';
import { CurrencyPair } from '../src/types';

describe('Multi-Symbol Authoritative Mapping & Anti-Aliasing Invariant', () => {
  const supportedPairs: CurrencyPair[] = [
    'EUR/USD',
    'GBP/USD',
    'USD/JPY',
    'AUD/USD',
    'USD/CHF',
    'NZD/USD',
    'USD/CAD',
    'EUR/JPY',
    'GBP/JPY',
    'XAU/USD',
    'NASDAQ',
    'BTC/USD'
  ];

  it('supports all 12 canonical symbols in PAIR_CONFIGS and PAIR_SYMBOLS', () => {
    for (const pair of supportedPairs) {
      expect(isSupportedPair(pair)).toBe(true);
      expect(PAIR_CONFIGS[pair]).toBeDefined();
      expect(PAIR_SYMBOLS[pair]).toBeDefined();
      expect(typeof PAIR_CONFIGS[pair].basePrice).toBe('number');
      expect(typeof PAIR_CONFIGS[pair].decimals).toBe('number');
    }
  });

  it('verifies unique provider symbols for each currency pair (zero collision)', () => {
    const symbols = supportedPairs.map(p => getProviderSymbol(p));
    const uniqueSymbols = new Set(symbols);
    expect(uniqueSymbols.size).toBe(supportedPairs.length);
  });

  it('prohibits silent EUR/USD aliasing for non-EUR pairs', () => {
    const eurSymbol = getProviderSymbol('EUR/USD');
    expect(eurSymbol).toBe('EURUSD=X');

    expect(getProviderSymbol('GBP/USD')).not.toBe(eurSymbol);
    expect(getProviderSymbol('USD/JPY')).not.toBe(eurSymbol);
    expect(getProviderSymbol('AUD/USD')).not.toBe(eurSymbol);
    expect(getProviderSymbol('USD/CHF')).not.toBe(eurSymbol);
    expect(getProviderSymbol('NZD/USD')).not.toBe(eurSymbol);
    expect(getProviderSymbol('USD/CAD')).not.toBe(eurSymbol);
    expect(getProviderSymbol('EUR/JPY')).not.toBe(eurSymbol);
    expect(getProviderSymbol('GBP/JPY')).not.toBe(eurSymbol);
    expect(getProviderSymbol('XAU/USD')).not.toBe(eurSymbol);
    expect(getProviderSymbol('NASDAQ')).not.toBe(eurSymbol);
    expect(getProviderSymbol('BTC/USD')).not.toBe(eurSymbol);

    // Verify exact expected Yahoo tickers
    expect(getProviderSymbol('USD/CHF')).toBe('USDCHF=X');
    expect(getProviderSymbol('NZD/USD')).toBe('NZDUSD=X');
    expect(getProviderSymbol('USD/CAD')).toBe('USDCAD=X');
    expect(getProviderSymbol('EUR/JPY')).toBe('EURJPY=X');
    expect(getProviderSymbol('GBP/JPY')).toBe('GBPJPY=X');
    expect(getProviderSymbol('XAU/USD')).toBe('GC=F');
    expect(getProviderSymbol('NASDAQ')).toBe('^IXIC');
    expect(getProviderSymbol('BTC/USD')).toBe('BTC-USD');
  });

  it('returns false and null for unsupported instruments', () => {
    const unsupported = ['ETH/USD', 'AAPL', 'FAKE/USD', 'XYZ123', ''];
    for (const sym of unsupported) {
      expect(isSupportedPair(sym)).toBe(false);
      expect(getProviderSymbol(sym as any)).toBeNull();
    }
  });

  it('fails closed and returns INVALID envelope for unsupported symbols in fetchRealCandleEnvelope', async () => {
    const result = await fetchRealCandleEnvelope('UNKNOWN/PAIR' as any, 'M15', 50, 'LIVE');
    expect(result.status).toBe('INVALID');
    expect(result.executable).toBe(false);
    expect(result.reason).toContain('UNSUPPORTED_SYMBOL');
    expect(result.data).toEqual([]);
  });
});
