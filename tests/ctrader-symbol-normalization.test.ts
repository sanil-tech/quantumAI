import { describe, it, expect, beforeEach } from 'vitest';
import {
  CTraderVolumeNormalizer,
  CTraderSymbolRegistry,
  CTraderSymbolSpec
} from '../src/integrations/ctrader/ctraderSymbolService';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

describe('TASK 8B-P18: cTrader Dynamic Symbol Specification & Volume Normalization Suite', () => {
  // Standard Forex symbol spec (EURUSD)
  const eurusdSpec: CTraderSymbolSpec = {
    symbolId: 1,
    symbolName: 'EURUSD',
    digits: 5,
    pipPosition: 4,
    minVolume: 100000, // 0.01 lot = 1,000 EUR
    maxVolume: 10000000000, // 1,000 lots = 100,000,000 EUR
    stepVolume: 100000, // 0.01 lot
    lotSize: 10000000, // 100,000 EUR in cents
    measurementUnits: 'EUR'
  };

  // Commodity symbol spec (XAUUSD - Gold)
  const xauusdSpec: CTraderSymbolSpec = {
    symbolId: 2,
    symbolName: 'XAUUSD',
    digits: 2,
    pipPosition: 1,
    minVolume: 100, // 1 oz (0.01 lot if lotSize is 10,000 cents)
    maxVolume: 5000000, // 500 lots
    stepVolume: 100,
    lotSize: 10000, // 100 oz in cents
    measurementUnits: 'OUNCES'
  };

  // Crypto symbol spec (BTCUSD)
  const btcusdSpec: CTraderSymbolSpec = {
    symbolId: 3,
    symbolName: 'BTCUSD',
    digits: 2,
    pipPosition: 1,
    minVolume: 1, // 0.01 BTC (1 cent of BTC)
    maxVolume: 1000000, // 10,000 BTC
    stepVolume: 1,
    lotSize: 100, // 1 BTC in cents
    measurementUnits: 'BTC'
  };

  beforeEach(() => {
    CTraderSymbolRegistry.clear();
    CTraderSymbolRegistry.registerBatch([eurusdSpec, xauusdSpec, btcusdSpec]);
  });

  describe('1. Standard and Boundary Volume Normalization', () => {
    it('1. normalizes valid standard 1.0 lot volume to authoritative cTrader cents', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 1.0, 'LOTS');
      expect(res.isValid).toBe(true);
      expect(res.normalizedVolumeCents).toBe(10000000);
      expect(res.normalizedLots).toBe(1.0);
      expect(res.symbolId).toBe(1);
      expect(res.conversionBasis).toBe('LOTS_BASED');
    });

    it('2. normalizes exact minimum allowed volume (0.01 lot)', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 0.01, 'LOTS');
      expect(res.isValid).toBe(true);
      expect(res.normalizedVolumeCents).toBe(100000);
      expect(res.normalizedLots).toBe(0.01);
    });

    it('3. normalizes exact maximum allowed volume (1000.0 lots)', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 1000.0, 'LOTS');
      expect(res.isValid).toBe(true);
      expect(res.normalizedVolumeCents).toBe(10000000000);
      expect(res.normalizedLots).toBe(1000.0);
    });

    it('4. normalizes exact step-aligned volume boundary (0.05 lot)', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 0.05, 'LOTS');
      expect(res.isValid).toBe(true);
      expect(res.normalizedVolumeCents).toBe(500000);
      expect(res.normalizedLots).toBe(0.05);
    });
  });

  describe('2. Fail-Closed Validation & Rejection Invariants', () => {
    it('5. rejects volume strictly below minimum allowed volume', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 0.005, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('BELOW_MIN_VOLUME');
      expect(res.rejectionReason).toContain('VOLUME_BELOW_MINIMUM');
    });

    it('6. rejects volume strictly above maximum allowed volume', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 1000.01, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('ABOVE_MAX_VOLUME');
      expect(res.rejectionReason).toContain('VOLUME_ABOVE_MAXIMUM');
    });

    it('7. rejects volume not aligned with stepVolume', () => {
      const weirdStepSpec: CTraderSymbolSpec = {
        ...eurusdSpec,
        minVolume: 100000, // 0.01 lot
        stepVolume: 100000 // 0.01 lot step
      };
      const res = CTraderVolumeNormalizer.normalizeVolume(weirdStepSpec, 0.015, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('INVALID_STEP');
      expect(res.rejectionReason).toContain('INVALID_VOLUME_STEP');
    });

    it('8. rejects zero volume fail-closed', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 0, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('INVALID_QUANTITY');
    });

    it('9. rejects negative volume fail-closed', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, -1.0, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('INVALID_QUANTITY');
    });

    it('10. rejects fractional lots resulting in fractional cents', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 0.0000001, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(['BELOW_MIN_VOLUME', 'NON_INTEGER_CENTS']).toContain(res.rejectionCode);
    });
  });

  describe('3. Multi-Asset & Dynamic Spec Integrity', () => {
    it('11. normalizes commodity (XAUUSD) with specific gold contract lotSize', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(xauusdSpec, 1.0, 'LOTS');
      expect(res.isValid).toBe(true);
      expect(res.normalizedVolumeCents).toBe(10000); // 100 oz in cents
      expect(res.normalizedLots).toBe(1.0);
    });

    it('12. rejects missing symbol specification fail-closed without inventing metadata', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(null, 1.0, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('MISSING_SPEC');
      expect(res.rejectionReason).toContain('SYMBOL_SPECIFICATION_MISSING');
    });

    it('13. rejects malformed symbol specification with non-positive parameters', () => {
      const malformedSpec: any = {
        symbolId: 1,
        minVolume: -100,
        maxVolume: 1000,
        stepVolume: 10,
        lotSize: 100
      };
      const res = CTraderVolumeNormalizer.normalizeVolume(malformedSpec, 1.0, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('MALFORMED_SPEC');
    });

    it('14. guarantees deterministic repeated conversion across identical inputs', () => {
      const res1 = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 2.5, 'LOTS');
      const res2 = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 2.5, 'LOTS');
      expect(res1).toEqual(res2);
    });

    it('15. verifies no universal hard-coded conversion assumption between distinct assets', () => {
      const fxRes = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 1.0, 'LOTS');
      const goldRes = CTraderVolumeNormalizer.normalizeVolume(xauusdSpec, 1.0, 'LOTS');
      const btcRes = CTraderVolumeNormalizer.normalizeVolume(btcusdSpec, 1.0, 'LOTS');

      expect(fxRes.normalizedVolumeCents).toBe(10000000);
      expect(goldRes.normalizedVolumeCents).toBe(10000);
      expect(btcRes.normalizedVolumeCents).toBe(100);
      expect(fxRes.normalizedVolumeCents).not.toBe(goldRes.normalizedVolumeCents);
    });
  });

  describe('4. Numeric Safety & Extreme Bounds', () => {
    it('16. protects against unsafe integer / NaN inputs', () => {
      const resNaN = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, NaN, 'LOTS');
      const resInf = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, Infinity, 'LOTS');
      expect(resNaN.isValid).toBe(false);
      expect(resInf.isValid).toBe(false);
      expect(resNaN.rejectionCode).toBe('INVALID_QUANTITY');
    });

    it('17. rejects extremely small sub-micro quantities', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 1e-12, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(res.rejectionCode).toBe('BELOW_MIN_VOLUME');
    });

    it('18. rejects extremely large unsafe quantities exceeding MAX_SAFE_INTEGER', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 1e15, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(['UNSAFE_INTEGER', 'ABOVE_MAX_VOLUME']).toContain(res.rejectionCode);
    });

    it('19. preserves structured diagnostic metadata on failed normalization', () => {
      const res = CTraderVolumeNormalizer.normalizeVolume(eurusdSpec, 0.002, 'LOTS');
      expect(res.isValid).toBe(false);
      expect(res.spec).toBeDefined();
      expect(res.spec?.minVolume).toBe(100000);
      expect(res.rejectionCode).toBe('BELOW_MIN_VOLUME');
      expect(res.rejectionReason).toBeDefined();
    });

    it('20. enforces READ_ONLY_MODE_ENFORCED on CTraderAdapter order submission', async () => {
      const adapter = new CTraderAdapter();
      const norm = adapter.normalizeVolume('EURUSD', 1.0, 'LOTS');
      expect(norm.isValid).toBe(true);

      // Order placement MUST remain strictly fail-closed
      await expect(adapter.placeOrder({} as any)).rejects.toThrow('READ_ONLY_MODE_ENFORCED: Trade execution disabled in Phase 3B audit.');
      await expect(adapter.closePosition('pos_1')).rejects.toThrow('READ_ONLY_MODE_ENFORCED: Trade execution disabled in Phase 3B audit.');
    });
  });
});
