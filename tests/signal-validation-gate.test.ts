import { describe, it, expect } from 'vitest';
import { signalValidationGate } from '../src/server/services/validation/signalValidationGate';

describe('Signal Validation Gate - Production Test Suite', () => {
  /**
   * TEST 1: BUY with Price > EMA50, SuperTrend Bullish, ADX 20, RSI 86.7
   * Expected: VALID, BUY_PULLBACK if entry below current price, ADX must NOT be labeled bearish.
   */
  it('TEST 1: Validates EURJPY M15 BUY setup with RSI 86.7 and ADX 20 without mislabeling ADX', () => {
    const currentPrice = 180.489;
    const entryPrice = 180.321; // Pullback entry below current price
    const stopLoss = 179.971;
    const takeProfit1 = 181.021;
    const takeProfit2 = 181.581;

    const result = signalValidationGate.validateSignal({
      symbol: 'EUR/JPY',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      modelConfidence: 88,
      indicators: {
        ema50: 180.100,
        ema200: 179.500,
        rsi14: 86.7,
        adx: 20.0,
        plusDI: 28.5,
        minusDI: 14.2,
        superTrendDirection: 'BULLISH',
        atr: 0.25
      },
      reasoningEvidence: [
        'Price broke above M15 structure',
        'ADX confirming trending bearish', // Mistaken explanation from AI
        'SuperTrend is bullish'
      ]
    });

    expect(result.isExecutable).toBe(true);
    expect(result.canonicalSignal.validationStatus).not.toBe('REJECTED');
    expect(result.canonicalSignal.entryMode).toBe('BUY_PULLBACK');
    expect(result.canonicalSignal.executionStatus).toBe('WAITING_FOR_ENTRY');
    expect(result.canonicalSignal.distancePips).toBeCloseTo(16.8, 1);

    // Verify ADX interpretation is strictly trend strength, not bearish direction
    expect(result.validationReport.adxInterpretation.message).toContain('trend strength');
    expect(result.validationReport.adxInterpretation.message).not.toContain('bearish');

    // Verify explanation was sanitized to remove "ADX confirming trending bearish"
    const sanitizedJoined = result.canonicalSignal.reasoningEvidence.join(' ');
    expect(sanitizedJoined).not.toContain('ADX confirming trending bearish');
    expect(sanitizedJoined).toContain('mengukur kekuatan trend');

    // Verify RSI overbought warning is generated
    expect(result.canonicalSignal.riskWarnings.some(w => w.includes('Terlebih beli') || w.includes('Overbought'))).toBe(true);
  });

  /**
   * TEST 2: BUY with Bearish SuperTrend, price below EMA50, -DI > +DI
   * Expected: REJECT or REVIEW due to contradictory technical evidence.
   */
  it('TEST 2: Rejects or requires review when BUY is proposed against dominant bearish evidence', () => {
    const result = signalValidationGate.validateSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice: 1.08200,
      entryPrice: 1.08150,
      stopLoss: 1.07900,
      takeProfit1: 1.08700,
      modelConfidence: 85,
      indicators: {
        ema50: 1.08600, // Price < EMA50
        ema200: 1.08900, // EMA50 < EMA200
        rsi14: 38,
        adx: 28.0,
        plusDI: 12.0,
        minusDI: 32.0, // -DI > +DI
        superTrendDirection: 'BEARISH',
        atr: 0.0015
      },
      reasoningEvidence: ['Attempting counter-trend bottom bounce']
    });

    expect(result.canonicalSignal.validationStatus).toBe('REJECTED');
    expect(result.isExecutable).toBe(false);
    expect(result.canonicalSignal.executionStatus).toBe('REJECTED');
    expect(result.validationReport.errors.some(e => e.includes('severely contradicts'))).toBe(true);
  });

  /**
   * TEST 3: BUY_PULLBACK where currentPrice > entryPrice
   * Expected: WAITING_FOR_ENTRY, no market execution permitted.
   */
  it('TEST 3: BUY_PULLBACK is marked WAITING_FOR_ENTRY when current price is above planned entry', () => {
    const result = signalValidationGate.validateSignal({
      symbol: 'GBP/USD',
      timeframe: 'H1',
      direction: 'BUY',
      currentPrice: 1.30500,
      entryPrice: 1.30200, // 30 pips pullback
      stopLoss: 1.29800,
      takeProfit1: 1.31000,
      modelConfidence: 80,
      indicators: {
        ema50: 1.30100,
        ema200: 1.29500,
        rsi14: 62,
        adx: 24,
        plusDI: 26,
        minusDI: 15,
        superTrendDirection: 'BULLISH',
        atr: 0.0020
      }
    });

    expect(result.canonicalSignal.entryMode).toBe('BUY_PULLBACK');
    expect(result.canonicalSignal.executionStatus).toBe('WAITING_FOR_ENTRY');
    expect(result.canonicalSignal.distancePips).toBeCloseTo(30.0, 1);
    expect(result.isExecutable).toBe(true);
  });

  /**
   * TEST 4: BUY_MARKET where currentPrice approximately equals entryPrice (within 1.5 pips)
   * Expected: TRIGGERED / eligible for direct execution.
   */
  it('TEST 4: BUY_MARKET is marked TRIGGERED when current price approximately equals entry', () => {
    const result = signalValidationGate.validateSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice: 1.08502,
      entryPrice: 1.08500, // 0.2 pips distance
      stopLoss: 1.08200,
      takeProfit1: 1.09000,
      modelConfidence: 82,
      indicators: {
        ema50: 1.08300,
        ema200: 1.07900,
        rsi14: 58,
        adx: 26,
        plusDI: 28,
        minusDI: 14,
        superTrendDirection: 'BULLISH',
        atr: 0.0012
      }
    });

    expect(result.canonicalSignal.entryMode).toBe('BUY_MARKET');
    expect(result.canonicalSignal.executionStatus).toBe('TRIGGERED');
    expect(result.canonicalSignal.distancePips).toBeLessThanOrEqual(1.5);
    expect(result.isExecutable).toBe(true);
  });

  /**
   * TEST 5: Invalid BUY SL/TP ordering (SL >= entryPrice or TP <= entryPrice)
   * Expected: Fail-closed REJECT.
   */
  it('TEST 5: Rejects signal immediately if SL/TP geometric ordering is invalid', () => {
    // Invalid geometry: Stop Loss is higher than Entry Price on a BUY
    const result = signalValidationGate.validateSignal({
      symbol: 'USD/JPY',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice: 155.000,
      entryPrice: 155.000,
      stopLoss: 156.000, // INVALID: SL above entry for BUY!
      takeProfit1: 154.000, // INVALID: TP below entry for BUY!
      modelConfidence: 85,
      indicators: {
        ema50: 154.000,
        ema200: 153.000,
        rsi14: 55,
        adx: 25,
        plusDI: 25,
        minusDI: 15,
        superTrendDirection: 'BULLISH',
        atr: 0.3
      }
    });

    expect(result.isExecutable).toBe(false);
    expect(result.canonicalSignal.validationStatus).toBe('REJECTED');
    expect(result.canonicalSignal.executionStatus).toBe('REJECTED');
    expect(result.validationReport.errors.some(e => e.includes('Invalid SL/TP ordering'))).toBe(true);
  });

  /**
   * TEST 6: RSI > 80 + BUY
   * Expected: BUY may remain valid with momentum, but generates warning for elevated pullback risk.
   */
  it('TEST 6: Allows momentum BUY at RSI > 80 but attaches explicit pullback risk warning', () => {
    const result = signalValidationGate.validateSignal({
      symbol: 'AUD/USD',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice: 0.67500,
      entryPrice: 0.67380,
      stopLoss: 0.67100,
      takeProfit1: 0.67900,
      modelConfidence: 84,
      indicators: {
        ema50: 0.67200,
        ema200: 0.66800,
        rsi14: 84.5, // Extremely overbought
        adx: 32,
        plusDI: 35,
        minusDI: 10,
        superTrendDirection: 'BULLISH',
        atr: 0.0015
      }
    });

    expect(result.isExecutable).toBe(true);
    expect(result.canonicalSignal.validationStatus).toBe('WARNING');
    expect(result.canonicalSignal.riskWarnings.some(w => w.includes('Terlebih beli') || w.includes('pullback'))).toBe(true);
  });

  /**
   * TEST 7: AI explanation says "ADX confirms bearish" while +DI > -DI and SuperTrend bullish.
   * Expected: Explanation failure caught and sanitized with proper ADX strength semantics.
   */
  it('TEST 7: Automatically sanitizes AI explanation stating "ADX confirms bearish" during bullish regime', () => {
    const result = signalValidationGate.validateSignal({
      symbol: 'EUR/JPY',
      timeframe: 'H1',
      direction: 'BUY',
      currentPrice: 182.500,
      entryPrice: 182.300,
      stopLoss: 181.800,
      takeProfit1: 183.200,
      modelConfidence: 87,
      indicators: {
        ema50: 182.000,
        ema200: 181.000,
        rsi14: 65,
        adx: 22.5,
        plusDI: 28.0,
        minusDI: 15.0,
        superTrendDirection: 'BULLISH',
        atr: 0.35
      },
      reasoningEvidence: [
        'ADX confirms bearish continuation on H1',
        'SuperTrend is BULLISH',
        'BUY NOW at market price' // Invalid because entry is pullback
      ]
    });

    const reasons = result.canonicalSignal.reasoningEvidence;
    expect(reasons.some(r => r.includes('ADX confirms bearish'))).toBe(false);
    expect(reasons.some(r => r.includes('mengukur kekuatan trend'))).toBe(true);
    expect(reasons.some(r => r.includes('BUY NOW'))).toBe(false);
    expect(reasons.some(r => r.includes('Menunggu rehat/pullback'))).toBe(true);
  });

  /**
   * TEST 8: AI confidence = 88% without calibrated probability model.
   * Expected: Labeled as AI Model Confidence (advisory), separated from authoritative validation confidence.
   */
  it('TEST 8: Separates advisory AI model confidence from authoritative deterministic validation confidence', () => {
    const result = signalValidationGate.validateSignal({
      symbol: 'USD/CAD',
      timeframe: 'M15',
      direction: 'SELL',
      currentPrice: 1.38500,
      entryPrice: 1.38600, // Pullback sell
      stopLoss: 1.38900,
      takeProfit1: 1.38000,
      modelConfidence: 88, // Advisory AI score
      indicators: {
        ema50: 1.38800,
        ema200: 1.39200,
        rsi14: 35,
        adx: 26,
        plusDI: 14,
        minusDI: 29,
        superTrendDirection: 'BEARISH',
        atr: 0.0014
      }
    });

    expect(result.canonicalSignal.modelConfidence).toBe(88);
    expect(result.canonicalSignal.validationConfidence).toBeGreaterThanOrEqual(70);
    expect(result.validationReport.confidenceCheck.message).toContain('AI Model Confidence: 88% (Advisory)');
    expect(result.validationReport.confidenceCheck.message).toContain('Deterministic Validation Confidence:');
  });

  /**
   * TEST 9: Symmetrical SELL tests (SELL_PULLBACK, SELL_MARKET, SELL_BREAKOUT)
   */
  it('TEST 9: Symmetrically handles SELL setups and oversold RSI warnings correctly', () => {
    const result = signalValidationGate.validateSignal({
      symbol: 'GBP/JPY',
      timeframe: 'M15',
      direction: 'SELL',
      currentPrice: 195.000,
      entryPrice: 195.200, // Pullback entry above current price on a SELL
      stopLoss: 195.800,
      takeProfit1: 194.000,
      takeProfit2: 193.200,
      modelConfidence: 85,
      indicators: {
        ema50: 195.500,
        ema200: 196.200,
        rsi14: 18.5, // Extremely oversold
        adx: 30,
        plusDI: 12,
        minusDI: 34,
        superTrendDirection: 'BEARISH',
        atr: 0.45
      }
    });

    expect(result.canonicalSignal.entryMode).toBe('SELL_PULLBACK');
    expect(result.canonicalSignal.executionStatus).toBe('WAITING_FOR_ENTRY');
    expect(result.canonicalSignal.riskWarnings.some(w => w.includes('Terlebih jual') || w.includes('rebound'))).toBe(true);
    expect(result.canonicalSignal.rrTP1).toBeGreaterThanOrEqual(1.5);
    expect(result.isExecutable).toBe(true);
  });

  /**
   * TEST 10: Multi-asset Pip Precision Validation (JPY, Gold, Crypto, FX)
   */
  it('TEST 10: Correctly calculates pips across JPY, Gold, and standard FX', () => {
    const fxPips = signalValidationGate.calculatePips('EUR/USD', 1.08500, 1.08200);
    expect(fxPips).toBe(30.0);

    const jpyPips = signalValidationGate.calculatePips('EUR/JPY', 180.489, 180.321);
    expect(jpyPips).toBe(16.8);

    const goldPips = signalValidationGate.calculatePips('XAU/USD', 2400.0, 2395.0);
    expect(goldPips).toBe(50.0);
  });
});
