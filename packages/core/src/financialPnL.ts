export interface FinancialPnLInput {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  closePrice: number;
  lotSizeOrVolume: number; // lots (e.g. 0.01) or base units (e.g. 1000)
  commission?: number; // monetary commission (e.g. -0.05 or 0.05)
  swap?: number;
  conversionFee?: number;
}

export interface FinancialPnLResult {
  pipDifference: number; // exact fractional pips, e.g. +1.60
  grossProfit: number; // exact gross P&L in quote/account currency, e.g. +0.16
  commission: number; // commission in quote currency, e.g. -0.05
  swap: number;
  conversionFee: number;
  netProfit: number; // exact net P&L, e.g. +0.11
  pipValue: number;
  units: number;
}

/**
 * Calculates exact fractional pips, gross monetary P&L, commission, and net monetary P&L.
 * Preserves decimal precision and strictly avoids integer rounding distortion.
 */
export function calculateFinancialPnL(input: FinancialPnLInput): FinancialPnLResult {
  const { symbol, direction, entryPrice, closePrice, lotSizeOrVolume } = input;
  const cleanSymbol = symbol.toUpperCase().replace('/', '');
  const isJPY = cleanSymbol.includes('JPY');
  const isGold = cleanSymbol.includes('XAU');
  const pipSize = isJPY ? 0.01 : isGold ? 0.1 : 0.0001;

  // Derive units: If input is <= 50, it is in standard lots (e.g. 0.01 lot = 1,000 units).
  // If > 50, it is already base units (e.g. 1,000 EUR units).
  let units = lotSizeOrVolume;
  if (lotSizeOrVolume <= 50) {
    units = lotSizeOrVolume * 100000;
  }

  const rawDelta = closePrice - entryPrice;
  const directionalDelta = direction === 'BUY' ? rawDelta : -rawDelta;
  const pipDifference = Number((directionalDelta / pipSize).toFixed(2));

  // Exact gross monetary profit = units * directionalDelta (for USD quote pairs)
  const grossProfit = Number((units * directionalDelta).toFixed(2));

  const rawCommission = input.commission || 0;
  // Ensure commission is negative if specified as cost
  const commission = rawCommission > 0 ? -rawCommission : rawCommission;
  const swap = input.swap || 0;
  const conversionFee = input.conversionFee || 0;

  const netProfit = Number((grossProfit + commission + swap - conversionFee).toFixed(2));
  const pipValue = Number(((units / 100000) * 10).toFixed(2));

  return {
    pipDifference,
    grossProfit,
    commission,
    swap,
    conversionFee,
    netProfit,
    pipValue,
    units
  };
}
