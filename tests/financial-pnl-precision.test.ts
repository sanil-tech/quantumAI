import { describe, it, expect } from 'vitest';
import { calculateFinancialPnL } from '../packages/core/src/financialPnL';

describe('Financial P&L Precision & Fractional Pip Verification Suite', () => {
  // Case 1: The verified cTrader DEMO trade
  it('Case 1: accurately computes fractional pips (1.60) and exact gross ($0.16) for verified trade 285026529', () => {
    const result = calculateFinancialPnL({
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.16694,
      closePrice: 1.16710,
      lotSizeOrVolume: 0.01,
      commission: -0.05
    });

    // Must be exact 1.60 pips (NOT rounded to 2.0 integer pips)
    expect(result.pipDifference).toBe(1.60);
    expect(result.pipDifference).not.toBe(2.0);

    // Gross P&L must be exactly $0.16 (NOT $0.20)
    expect(result.grossProfit).toBe(0.16);
    expect(result.grossProfit).not.toBe(0.20);

    // Commission must be -$0.05
    expect(result.commission).toBe(-0.05);

    // Net P&L = $0.16 - $0.05 = $0.11
    expect(result.netProfit).toBe(0.11);
  });

  // Case 2: Exact integer pips
  it('Case 2: accurately computes exact integer pip movement (10.0 pips)', () => {
    const result = calculateFinancialPnL({
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.16600,
      closePrice: 1.16700,
      lotSizeOrVolume: 0.01
    });

    expect(result.pipDifference).toBe(10.0);
    expect(result.grossProfit).toBe(1.00); // 10 pips * $0.10/pip = $1.00
  });

  // Case 3: Another fractional pip scenario
  it('Case 3: accurately computes fractional pip movement (1.50 pips)', () => {
    const result = calculateFinancialPnL({
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.16695,
      closePrice: 1.16710,
      lotSizeOrVolume: 0.01
    });

    expect(result.pipDifference).toBe(1.50);
    expect(result.grossProfit).toBe(0.15); // 1.5 pips * $0.10/pip = $0.15
  });

  // Case 4: Negative P&L and SELL direction tests
  it('Case 4a: negative price movement on BUY produces negative P&L without sign inversion', () => {
    const result = calculateFinancialPnL({
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.16710,
      closePrice: 1.16694,
      lotSizeOrVolume: 0.01
    });

    expect(result.pipDifference).toBe(-1.60);
    expect(result.grossProfit).toBe(-0.16);
    expect(result.netProfit).toBe(-0.16);
  });

  it('Case 4b: falling price on SELL produces positive P&L', () => {
    const result = calculateFinancialPnL({
      symbol: 'EURUSD',
      direction: 'SELL',
      entryPrice: 1.16710,
      closePrice: 1.16694,
      lotSizeOrVolume: 0.01
    });

    expect(result.pipDifference).toBe(1.60);
    expect(result.grossProfit).toBe(0.16);
    expect(result.netProfit).toBe(0.16);
  });

  it('Case 4c: rising price on SELL produces negative P&L', () => {
    const result = calculateFinancialPnL({
      symbol: 'EURUSD',
      direction: 'SELL',
      entryPrice: 1.16694,
      closePrice: 1.16710,
      lotSizeOrVolume: 0.01
    });

    expect(result.pipDifference).toBe(-1.60);
    expect(result.grossProfit).toBe(-0.16);
    expect(result.netProfit).toBe(-0.16);
  });

  // Case 5: Volume scaling tests
  it('Case 5a: scales monetary P&L linearly with 0.10 lot (mini-lot = $1.00/pip)', () => {
    const result = calculateFinancialPnL({
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.16694,
      closePrice: 1.16710,
      lotSizeOrVolume: 0.10
    });

    expect(result.pipDifference).toBe(1.60);
    expect(result.grossProfit).toBe(1.60); // 1.6 pips * $1.00/pip = $1.60
  });

  it('Case 5b: scales monetary P&L linearly with 1.00 lot (standard lot = $10.00/pip)', () => {
    const result = calculateFinancialPnL({
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.16694,
      closePrice: 1.16710,
      lotSizeOrVolume: 1.00
    });

    expect(result.pipDifference).toBe(1.60);
    expect(result.grossProfit).toBe(16.00); // 1.6 pips * $10.00/pip = $16.00
  });

  it('Case 5c: accepts raw base units (e.g. 1000 EUR base units)', () => {
    const result = calculateFinancialPnL({
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.16694,
      closePrice: 1.16710,
      lotSizeOrVolume: 1000
    });

    expect(result.pipDifference).toBe(1.60);
    expect(result.grossProfit).toBe(0.16);
  });

  // Property & Edge Tests
  it('Property Test: zero price movement yields exactly 0.00 pips and $0.00 gross P&L', () => {
    const result = calculateFinancialPnL({
      symbol: 'EURUSD',
      direction: 'BUY',
      entryPrice: 1.16700,
      closePrice: 1.16700,
      lotSizeOrVolume: 0.01
    });

    expect(result.pipDifference).toBe(0.00);
    expect(result.grossProfit).toBe(0.00);
    expect(result.netProfit).toBe(0.00);
  });

  it('JPY Pair Test: handles USDJPY pip scaling (0.01 per pip)', () => {
    const result = calculateFinancialPnL({
      symbol: 'USDJPY',
      direction: 'BUY',
      entryPrice: 158.000,
      closePrice: 158.160,
      lotSizeOrVolume: 0.01
    });

    expect(result.pipDifference).toBe(16.00);
  });
});
