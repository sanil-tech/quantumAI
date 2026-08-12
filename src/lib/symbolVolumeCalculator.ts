import { CurrencyPair } from '../types';

export interface SymbolSpec {
  symbol: string;
  pair: CurrencyPair;
  lotUnits: number;        // e.g. 100,000 for Forex, 100 for XAU/USD, 1 for NASDAQ/BTC
  pipSize: number;         // e.g. 0.0001 for Forex, 0.01 for JPY, 0.1 for Gold, 1.0 for Indices/Crypto
  pipValuePerLot: number;  // USD value of 1 pip for 1 standard Lot
}

export const SYMBOL_SPECS: Record<CurrencyPair, SymbolSpec> = {
  'EUR/USD': { symbol: 'EURUSD', pair: 'EUR/USD', lotUnits: 100000, pipSize: 0.0001, pipValuePerLot: 10 },
  'GBP/USD': { symbol: 'GBPUSD', pair: 'GBP/USD', lotUnits: 100000, pipSize: 0.0001, pipValuePerLot: 10 },
  'USD/JPY': { symbol: 'USDJPY', pair: 'USD/JPY', lotUnits: 100000, pipSize: 0.01,   pipValuePerLot: 6.5 },
  'AUD/USD': { symbol: 'AUDUSD', pair: 'AUD/USD', lotUnits: 100000, pipSize: 0.0001, pipValuePerLot: 10 },
  'XAU/USD': { symbol: 'XAUUSD', pair: 'XAU/USD', lotUnits: 100,    pipSize: 0.10,   pipValuePerLot: 10 },
  'NASDAQ':  { symbol: 'NAS100', pair: 'NASDAQ',  lotUnits: 1,      pipSize: 1.0,    pipValuePerLot: 20 },
  'BTC/USD': { symbol: 'BTCUSD', pair: 'BTC/USD', lotUnits: 1,      pipSize: 1.0,    pipValuePerLot: 1 }
};

/**
 * Calculates exact position units and lot size based on broker symbol specifications and risk formula:
 * Volume (Units) = (Account Balance * (Risk % / 100)) / (Stop Loss in Pips * Pip Value per Unit)
 */
export function calculateExactSymbolVolume(
  pair: CurrencyPair,
  balance: number,
  riskPercent: number,
  entryPrice: number,
  stopLoss: number
): {
  lotSize: number;
  volumeUnits: number;
  riskAmountUsd: number;
  stopLossPips: number;
  pipValuePerUnit: number;
} {
  const spec = SYMBOL_SPECS[pair] || SYMBOL_SPECS['EUR/USD'];
  const riskAmountUsd = balance * (Math.max(0.1, riskPercent) / 100);
  const priceDistance = Math.abs(entryPrice - stopLoss);

  const stopLossPips = Math.max(1, priceDistance / spec.pipSize);
  const pipValuePerUnit = spec.pipValuePerLot / spec.lotUnits;

  // Formula: Volume (Units) = (Account Balance * (Risk % / 100)) / (Stop Loss in Pips * Pip Value per Unit)
  const rawUnits = riskAmountUsd / (stopLossPips * pipValuePerUnit);
  const rawLots = rawUnits / spec.lotUnits;

  const lotSize = Math.max(0.01, Math.min(100.0, Number(rawLots.toFixed(2))));
  const volumeUnits = Math.round(lotSize * spec.lotUnits);

  return {
    lotSize,
    volumeUnits,
    riskAmountUsd: Number(riskAmountUsd.toFixed(2)),
    stopLossPips: Number(stopLossPips.toFixed(1)),
    pipValuePerUnit
  };
}
