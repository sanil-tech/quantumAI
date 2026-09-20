import { describe, it, expect } from 'vitest';
import {
  decomposeFxSymbol,
  aggregateCurrencyFactors,
  normalizeExecutionSequence,
  normalizeActivePositions,
  normalizeSymbol,
  validateFxSymbol,
  CurrencyLeg,
  CurrencyRiskFactor,
  NormalizedSequenceInput,
  NormalizedPositionInput
} from '../packages/core/src/currencyExposureNormalizer';

describe('Phase 2C.2 — Isolated Currency Decomposition & Exposure Normalizer', () => {

  describe('Part 1: Basic Deterministic FX Symbol Decomposition', () => {
    it('1. EURJPY BUY decomposes into LONG EUR (+) and SHORT JPY (-)', () => {
      const result = decomposeFxSymbol('EURJPY', 'BUY', 0.01, 1.0);
      expect(result.success).toBe(true);
      expect(result.baseCurrency).toBe('EUR');
      expect(result.quoteCurrency).toBe('JPY');
      expect(result.dataQuality).toBe('DERIVED');

      // Base leg (EUR)
      expect(result.baseLeg).toBeDefined();
      expect(result.baseLeg?.currency).toBe('EUR');
      expect(result.baseLeg?.direction).toBe('LONG');
      expect(result.baseLeg?.signedUnits).toBe(0.01);
      expect(result.baseLeg?.grossUnits).toBe(0.01);
      expect(result.baseLeg?.baseUnits).toBe(1000);

      // Quote leg (JPY)
      expect(result.quoteLeg).toBeDefined();
      expect(result.quoteLeg?.currency).toBe('JPY');
      expect(result.quoteLeg?.direction).toBe('SHORT');
      expect(result.quoteLeg?.signedUnits).toBe(-0.01);
      expect(result.quoteLeg?.grossUnits).toBe(0.01);
      expect(result.quoteLeg?.baseUnits).toBe(1000);

      // Risk Factors
      expect(result.baseRiskFactor?.signedRiskPercent).toBe(1.0);
      expect(result.quoteRiskFactor?.signedRiskPercent).toBe(-1.0);
    });

    it('2. EURJPY SELL decomposes into SHORT EUR (-) and LONG JPY (+)', () => {
      const result = decomposeFxSymbol('EURJPY', 'SELL', 0.02, 1.0);
      expect(result.success).toBe(true);
      expect(result.baseCurrency).toBe('EUR');
      expect(result.quoteCurrency).toBe('JPY');

      expect(result.baseLeg?.direction).toBe('SHORT');
      expect(result.baseLeg?.signedUnits).toBe(-0.02);
      expect(result.quoteLeg?.direction).toBe('LONG');
      expect(result.quoteLeg?.signedUnits).toBe(0.02);

      expect(result.baseRiskFactor?.signedRiskPercent).toBe(-1.0);
      expect(result.quoteRiskFactor?.signedRiskPercent).toBe(1.0);
    });

    it('3. GBPJPY BUY decomposes into LONG GBP (+) and SHORT JPY (-)', () => {
      const result = decomposeFxSymbol('GBPJPY', 'BUY', 0.05, 1.0);
      expect(result.success).toBe(true);
      expect(result.baseCurrency).toBe('GBP');
      expect(result.quoteCurrency).toBe('JPY');

      expect(result.baseLeg?.direction).toBe('LONG');
      expect(result.baseLeg?.signedUnits).toBe(0.05);
      expect(result.quoteLeg?.direction).toBe('SHORT');
      expect(result.quoteLeg?.signedUnits).toBe(-0.05);
    });

    it('4. GBPJPY SELL decomposes into SHORT GBP (-) and LONG JPY (+)', () => {
      const result = decomposeFxSymbol('GBPJPY', 'SELL', 0.05, 1.0);
      expect(result.success).toBe(true);
      expect(result.baseLeg?.direction).toBe('SHORT');
      expect(result.baseLeg?.signedUnits).toBe(-0.05);
      expect(result.quoteLeg?.direction).toBe('LONG');
      expect(result.quoteLeg?.signedUnits).toBe(0.05);
    });

    it('5. USDJPY BUY and SELL decompose correctly', () => {
      const buyRes = decomposeFxSymbol('USDJPY', 'BUY', 0.1, 1.0);
      expect(buyRes.baseLeg?.currency).toBe('USD');
      expect(buyRes.baseLeg?.direction).toBe('LONG');
      expect(buyRes.quoteLeg?.currency).toBe('JPY');
      expect(buyRes.quoteLeg?.direction).toBe('SHORT');

      const sellRes = decomposeFxSymbol('USDJPY', 'SELL', 0.1, 1.0);
      expect(sellRes.baseLeg?.direction).toBe('SHORT');
      expect(sellRes.quoteLeg?.direction).toBe('LONG');
    });

    it('6. Execution price accurately calculates quote units when provided', () => {
      const result = decomposeFxSymbol('EURJPY', 'BUY', 0.01, 1.0, 162.50);
      expect(result.success).toBe(true);
      expect(result.baseLeg?.baseUnits).toBe(1000); // 0.01 * 100,000
      expect(result.quoteLeg?.quoteUnits).toBe(162500); // 1,000 * 162.50
    });
  });

  describe('Part 2: Input Validation & Edge Cases', () => {
    it('7. Rejects invalid symbol lengths or formats', () => {
      const res1 = decomposeFxSymbol('EUR', 'BUY', 0.01);
      expect(res1.success).toBe(false);
      expect(res1.errorCode).toBe('INVALID_SYMBOL');

      const res2 = decomposeFxSymbol('EURUSDJPY', 'BUY', 0.01);
      expect(res2.success).toBe(false);
      expect(res2.errorCode).toBe('INVALID_SYMBOL');
    });

    it('8. Rejects identical base and quote currency (e.g. EUREUR)', () => {
      const res = decomposeFxSymbol('EUREUR', 'BUY', 0.01);
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('SAME_BASE_QUOTE');
    });

    it('9. Rejects non-standard FX instruments without guessing (e.g. US30, BTCUSD, XAUUSD)', () => {
      const res1 = decomposeFxSymbol('US30XX', 'BUY', 0.01);
      expect(res1.success).toBe(false);
      expect(res1.errorCode).toBe('UNSUPPORTED_INSTRUMENT');

      const res2 = decomposeFxSymbol('BTCUSD', 'BUY', 0.01);
      expect(res2.success).toBe(false);
      expect(res2.errorCode).toBe('UNSUPPORTED_INSTRUMENT');
    });

    it('10. Rejects invalid volume or directions', () => {
      const resVol = decomposeFxSymbol('EURUSD', 'BUY', 0);
      expect(resVol.success).toBe(false);
      expect(resVol.errorCode).toBe('INVALID_VOLUME');

      const resNeg = decomposeFxSymbol('EURUSD', 'BUY', -0.05);
      expect(resNeg.success).toBe(false);
      expect(resNeg.errorCode).toBe('INVALID_VOLUME');

      const resDir = decomposeFxSymbol('EURUSD', 'HOLD' as any, 0.01);
      expect(resDir.success).toBe(false);
      expect(resDir.errorCode).toBe('INVALID_DIRECTION');
    });

    it('11. Handles symbol formatting variations (slashes, dashes, lowercase)', () => {
      const res = decomposeFxSymbol('eur/jpy', 'BUY', 0.01);
      expect(res.success).toBe(true);
      expect(res.baseCurrency).toBe('EUR');
      expect(res.quoteCurrency).toBe('JPY');
    });
  });

  describe('Part 3: Cross-Pair Aggregation & Invariants', () => {
    it('12. Scenario C: EURJPY BUY (1%) + GBPJPY BUY (1%) -> Reinforcing Short JPY (-2%)', () => {
      const d1 = decomposeFxSymbol('EURJPY', 'BUY', 0.01, 1.0);
      const d2 = decomposeFxSymbol('GBPJPY', 'BUY', 0.01, 1.0);

      const legs = [d1.baseLeg!, d1.quoteLeg!, d2.baseLeg!, d2.quoteLeg!];
      const riskFactors = [d1.baseRiskFactor!, d1.quoteRiskFactor!, d2.baseRiskFactor!, d2.quoteRiskFactor!];

      const agg = aggregateCurrencyFactors(legs, riskFactors);

      expect(agg.currencies['EUR'].netRiskPercent).toBe(1.0);
      expect(agg.currencies['GBP'].netRiskPercent).toBe(1.0);
      expect(agg.currencies['JPY'].grossShortRiskPercent).toBe(2.0);
      expect(agg.currencies['JPY'].grossLongRiskPercent).toBe(0.0);
      expect(agg.currencies['JPY'].netRiskPercent).toBe(-2.0);
      expect(agg.currencies['JPY'].grossExposureRiskPercent).toBe(2.0);
      expect(agg.currencies['JPY'].contributingSymbols).toContain('EURJPY');
      expect(agg.currencies['JPY'].contributingSymbols).toContain('GBPJPY');
    });

    it('13. Scenario D: EURJPY SELL (1%) + GBPJPY SELL (1%) -> Reinforcing Long JPY (+2%)', () => {
      const d1 = decomposeFxSymbol('EURJPY', 'SELL', 0.01, 1.0);
      const d2 = decomposeFxSymbol('GBPJPY', 'SELL', 0.01, 1.0);

      const legs = [d1.baseLeg!, d1.quoteLeg!, d2.baseLeg!, d2.quoteLeg!];
      const riskFactors = [d1.baseRiskFactor!, d1.quoteRiskFactor!, d2.baseRiskFactor!, d2.quoteRiskFactor!];

      const agg = aggregateCurrencyFactors(legs, riskFactors);

      expect(agg.currencies['EUR'].netRiskPercent).toBe(-1.0);
      expect(agg.currencies['GBP'].netRiskPercent).toBe(-1.0);
      expect(agg.currencies['JPY'].grossLongRiskPercent).toBe(2.0);
      expect(agg.currencies['JPY'].grossShortRiskPercent).toBe(0.0);
      expect(agg.currencies['JPY'].netRiskPercent).toBe(2.0);
    });

    it('14. Scenario E: EURJPY BUY (1%) + GBPJPY SELL (1%) -> Offsetting JPY (Net 0%, Gross 2%)', () => {
      const d1 = decomposeFxSymbol('EURJPY', 'BUY', 0.01, 1.0);
      const d2 = decomposeFxSymbol('GBPJPY', 'SELL', 0.01, 1.0);

      const legs = [d1.baseLeg!, d1.quoteLeg!, d2.baseLeg!, d2.quoteLeg!];
      const riskFactors = [d1.baseRiskFactor!, d1.quoteRiskFactor!, d2.baseRiskFactor!, d2.quoteRiskFactor!];

      const agg = aggregateCurrencyFactors(legs, riskFactors);

      expect(agg.currencies['EUR'].netRiskPercent).toBe(1.0);
      expect(agg.currencies['GBP'].netRiskPercent).toBe(-1.0);
      
      // JPY MUST NOT lose gross participation info
      expect(agg.currencies['JPY'].grossLongRiskPercent).toBe(1.0);
      expect(agg.currencies['JPY'].grossShortRiskPercent).toBe(1.0);
      expect(agg.currencies['JPY'].netRiskPercent).toBe(0.0);
      expect(agg.currencies['JPY'].grossExposureRiskPercent).toBe(2.0);
    });

    it('15. EURUSD BUY (1%) + EURJPY BUY (1%) -> Reinforcing Long EUR (+2%)', () => {
      const d1 = decomposeFxSymbol('EURUSD', 'BUY', 0.01, 1.0);
      const d2 = decomposeFxSymbol('EURJPY', 'BUY', 0.01, 1.0);

      const legs = [d1.baseLeg!, d1.quoteLeg!, d2.baseLeg!, d2.quoteLeg!];
      const riskFactors = [d1.baseRiskFactor!, d1.quoteRiskFactor!, d2.baseRiskFactor!, d2.quoteRiskFactor!];

      const agg = aggregateCurrencyFactors(legs, riskFactors);

      expect(agg.currencies['EUR'].grossLongRiskPercent).toBe(2.0);
      expect(agg.currencies['EUR'].netRiskPercent).toBe(2.0);
      expect(agg.currencies['USD'].netRiskPercent).toBe(-1.0);
      expect(agg.currencies['JPY'].netRiskPercent).toBe(-1.0);
    });

    it('16. GBPUSD BUY (1%) + GBPJPY BUY (1%) -> Reinforcing Long GBP (+2%)', () => {
      const d1 = decomposeFxSymbol('GBPUSD', 'BUY', 0.01, 1.0);
      const d2 = decomposeFxSymbol('GBPJPY', 'BUY', 0.01, 1.0);

      const legs = [d1.baseLeg!, d1.quoteLeg!, d2.baseLeg!, d2.quoteLeg!];
      const riskFactors = [d1.baseRiskFactor!, d1.quoteRiskFactor!, d2.baseRiskFactor!, d2.quoteRiskFactor!];

      const agg = aggregateCurrencyFactors(legs, riskFactors);

      expect(agg.currencies['GBP'].grossLongRiskPercent).toBe(2.0);
      expect(agg.currencies['GBP'].netRiskPercent).toBe(2.0);
      expect(agg.currencies['USD'].netRiskPercent).toBe(-1.0);
      expect(agg.currencies['JPY'].netRiskPercent).toBe(-1.0);
    });
  });

  describe('Part 4: Scaleout & Execution Sequence Normalization', () => {
    it('17. Scaleout sequence SEQ-EURJPY-1789643444455 aggregates 3 child legs to 0.03 lots, NO double-counting', () => {
      const sequence: NormalizedSequenceInput = {
        sequenceId: 'SEQ-EURJPY-1789643444455',
        symbol: 'EURJPY',
        direction: 'BUY',
        totalVolume: 0.03,
        reservedRiskPercent: 1.0,
        status: 'ACTIVE',
        childPositions: [
          { positionId: 'POS-EURJPY-1789643444455-1', volume: 0.01, status: 'OPEN', reservedRiskPercent: 0.333 },
          { positionId: 'POS-EURJPY-1789643444455-2', volume: 0.01, status: 'OPEN', reservedRiskPercent: 0.333 },
          { positionId: 'POS-EURJPY-1789643444455-3', volume: 0.01, status: 'OPEN', reservedRiskPercent: 0.334 }
        ]
      };

      const agg = normalizeExecutionSequence(sequence);

      expect(agg.totalGrossLots).toBe(0.06); // 0.03 EUR lots + 0.03 JPY lots gross
      expect(agg.currencies['EUR'].netUnits).toBe(0.03);
      expect(agg.currencies['JPY'].netUnits).toBe(-0.03);
      expect(agg.currencies['EUR'].netRiskPercent).toBe(1.0);
      expect(agg.currencies['JPY'].netRiskPercent).toBe(-1.0);
    });

    it('18. Terminated sequence produces 0.00 active exposure', () => {
      const sequence: NormalizedSequenceInput = {
        sequenceId: 'SEQ-EURJPY-1789643444455',
        symbol: 'EURJPY',
        direction: 'BUY',
        totalVolume: 0.03,
        reservedRiskPercent: 1.0,
        status: 'TERMINATED',
        childPositions: [
          { positionId: 'POS-EURJPY-1789643444455-1', volume: 0.01, status: 'CLOSED' },
          { positionId: 'POS-EURJPY-1789643444455-2', volume: 0.01, status: 'CLOSED' },
          { positionId: 'POS-EURJPY-1789643444455-3', volume: 0.01, status: 'CLOSED' }
        ]
      };

      const agg = normalizeExecutionSequence(sequence);

      expect(agg.totalGrossLots).toBe(0);
      expect(agg.totalGrossRiskPercent).toBe(0);
      expect(Object.keys(agg.currencies).length).toBe(0);
    });
  });

  describe('Part 5: Position Lifecycle & Filtering (Active vs Closed vs Signals)', () => {
    it('19. Closed positions are excluded from active currency exposure', () => {
      const positions: NormalizedPositionInput[] = [
        { positionId: 'POS-1', symbol: 'EURJPY', direction: 'BUY', volume: 0.01, status: 'CLOSED', reservedRiskPercent: 0.33 },
        { positionId: 'POS-2', symbol: 'EURJPY', direction: 'BUY', volume: 0.01, status: 'CLOSED', reservedRiskPercent: 0.33 },
        { positionId: 'POS-3', symbol: 'EURJPY', direction: 'BUY', volume: 0.01, status: 'CLOSED', reservedRiskPercent: 0.34 }
      ];

      const agg = normalizeActivePositions(positions);

      expect(agg.totalGrossLots).toBe(0);
      expect(agg.totalGrossRiskPercent).toBe(0);
      expect(Object.keys(agg.currencies).length).toBe(0);
    });

    it('20. Only active OPEN positions contribute to currency exposure', () => {
      const positions: NormalizedPositionInput[] = [
        { positionId: 'POS-ACTIVE-1', symbol: 'EURUSD', direction: 'BUY', volume: 0.02, status: 'OPEN', reservedRiskPercent: 0.5 },
        { positionId: 'POS-CLOSED-2', symbol: 'GBPJPY', direction: 'SELL', volume: 0.05, status: 'CLOSED', reservedRiskPercent: 1.0 },
        { positionId: 'POS-CANCELLED-3', symbol: 'USDJPY', direction: 'BUY', volume: 0.03, status: 'CANCELLED', reservedRiskPercent: 0.8 }
      ];

      const agg = normalizeActivePositions(positions);

      expect(agg.currencies['EUR'].netUnits).toBe(0.02);
      expect(agg.currencies['USD'].netUnits).toBe(-0.02);
      expect(agg.currencies['EUR'].netRiskPercent).toBe(0.5);
      expect(agg.currencies['USD'].netRiskPercent).toBe(-0.5);
      expect(agg.currencies['GBP']).toBeUndefined();
      expect(agg.currencies['JPY']).toBeUndefined();
    });
  });

  describe('Part 6: Mathematical Property & Invariant Tests', () => {
    it('21. Invariant: Equal volume BUY + SELL of same pair perfectly nets to zero', () => {
      const dBuy = decomposeFxSymbol('EURUSD', 'BUY', 0.1, 1.0);
      const dSell = decomposeFxSymbol('EURUSD', 'SELL', 0.1, 1.0);

      const legs = [dBuy.baseLeg!, dBuy.quoteLeg!, dSell.baseLeg!, dSell.quoteLeg!];
      const riskFactors = [dBuy.baseRiskFactor!, dBuy.quoteRiskFactor!, dSell.baseRiskFactor!, dSell.quoteRiskFactor!];

      const agg = aggregateCurrencyFactors(legs, riskFactors);

      expect(agg.currencies['EUR'].netUnits).toBe(0);
      expect(agg.currencies['EUR'].netRiskPercent).toBe(0);
      expect(agg.currencies['USD'].netUnits).toBe(0);
      expect(agg.currencies['USD'].netRiskPercent).toBe(0);

      // Gross exposure is strictly positive (2 * 0.1 = 0.2 lots each, 2% risk each)
      expect(agg.currencies['EUR'].grossLongUnits).toBe(0.1);
      expect(agg.currencies['EUR'].grossShortUnits).toBe(0.1);
      expect(agg.currencies['EUR'].grossExposureRiskPercent).toBe(2.0);
    });

    it('22. Invariant: Gross exposure is never negative (>= 0)', () => {
      const pairs = ['EURJPY', 'GBPJPY', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'];
      for (const p of pairs) {
        const d = decomposeFxSymbol(p, 'BUY', 0.05, 0.75);
        expect(d.baseLeg!.grossUnits).toBeGreaterThan(0);
        expect(d.quoteLeg!.grossUnits).toBeGreaterThan(0);
        expect(d.baseRiskFactor!.grossLongRiskPercent).toBeGreaterThanOrEqual(0);
        expect(d.quoteRiskFactor!.grossShortRiskPercent).toBeGreaterThanOrEqual(0);
      }
    });

    it('23. Invariant: Pure function produces zero side effects and is perfectly idempotent', () => {
      const input = { symbol: 'EURJPY', dir: 'BUY' as const, vol: 0.03, risk: 1.0 };
      const run1 = decomposeFxSymbol(input.symbol, input.dir, input.vol, input.risk);
      const run2 = decomposeFxSymbol(input.symbol, input.dir, input.vol, input.risk);

      expect(run1).toEqual(run2);
    });
  });
});
