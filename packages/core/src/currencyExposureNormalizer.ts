/**
 * Phase 2C.2 — Isolated Currency Decomposition & Exposure Normalizer
 * QuantumAI IATI OS
 * 
 * STRICT ARCHITECTURAL INVARIANTS:
 * - Pure, deterministic, side-effect free library.
 * - Zero external network calls, zero broker API calls, zero database calls, zero AI dependencies.
 * - Decouples lot volume, base units, quote units, and normalized risk factor percentage.
 * - `signedRiskPercent` is a normalized risk-factor representation, NOT monetary currency exposure.
 * - Isolated from live execution governance gates in this phase.
 */

export type FxDirection = 'BUY' | 'SELL';

export type ExposureDataQuality = 'AUTHORITATIVE' | 'DERIVED' | 'INFERRED' | 'UNKNOWN' | 'UNAVAILABLE';

export type DecompositionErrorCode = 
  | 'INVALID_SYMBOL' 
  | 'UNSUPPORTED_INSTRUMENT' 
  | 'INVALID_DIRECTION' 
  | 'INVALID_VOLUME'
  | 'SAME_BASE_QUOTE';

export interface CurrencyLeg {
  currency: string;
  direction: 'LONG' | 'SHORT';
  signedUnits: number;     // e.g. +0.01 for LONG 0.01 lots, -0.01 for SHORT 0.01 lots
  grossUnits: number;      // e.g. 0.01
  baseUnits: number;       // e.g. lots * 100,000 standard contract units
  quoteUnits: number | null; // e.g. baseUnits * executionPrice when authoritative executionPrice is provided
  sourceSymbol: string;
  sourceDirection: FxDirection;
}

/**
 * CurrencyRiskFactor represents a normalized risk-factor percentage of account equity.
 * IMPORTANT: This represents equity risk allocation at stop-loss distance, NOT monetary currency exposure.
 */
export interface CurrencyRiskFactor {
  currency: string;
  signedRiskPercent: number;       // e.g. +1.0 for LONG 1.0% risk, -1.0 for SHORT 1.0% risk
  grossLongRiskPercent: number;    // e.g. 1.0
  grossShortRiskPercent: number;   // e.g. 0.0
  sourceSymbol: string;
  sourceDirection: FxDirection;
}

export interface FxDecompositionResult {
  success: boolean;
  baseCurrency?: string;
  quoteCurrency?: string;
  baseLeg?: CurrencyLeg;
  quoteLeg?: CurrencyLeg;
  baseRiskFactor?: CurrencyRiskFactor;
  quoteRiskFactor?: CurrencyRiskFactor;
  dataQuality: ExposureDataQuality;
  errorCode?: DecompositionErrorCode;
  errorMessage?: string;
}

export interface CurrencyExposureAggregate {
  currency: string;
  grossLongUnits: number;
  grossShortUnits: number;
  netUnits: number;
  grossLongBaseUnits: number;
  grossShortBaseUnits: number;
  netBaseUnits: number;
  grossLongRiskPercent: number;
  grossShortRiskPercent: number;
  netRiskPercent: number;
  grossExposureRiskPercent: number; // grossLongRiskPercent + grossShortRiskPercent
  contributingSymbols: string[];
  dataQuality: ExposureDataQuality;
}

export interface PortfolioExposureAggregationResult {
  currencies: Record<string, CurrencyExposureAggregate>;
  totalGrossLots: number;
  totalGrossRiskPercent: number;
  dataQuality: ExposureDataQuality;
}

export interface NormalizedPositionInput {
  positionId: string;
  symbol: string;
  direction: FxDirection;
  volume: number;
  status: 'OPEN' | 'CLOSED' | 'PENDING' | 'CANCELLED';
  executionPrice?: number;
  reservedRiskPercent?: number;
  sequenceId?: string;
}

export interface NormalizedSequenceInput {
  sequenceId: string;
  symbol: string;
  direction: FxDirection;
  totalVolume: number;
  reservedRiskPercent: number;
  status: 'INITIALIZING' | 'ACTIVE' | 'SCALING_OUT' | 'TERMINATED';
  childPositions: Array<{
    positionId: string;
    volume: number;
    status: 'OPEN' | 'CLOSED' | 'PENDING' | 'CANCELLED';
    executionPrice?: number;
    reservedRiskPercent?: number;
  }>;
}

export const STANDARD_FX_CURRENCIES: ReadonlySet<string> = new Set([
  'EUR', 'USD', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'
]);

/**
 * Normalizes an FX symbol string (removes slashes, dashes, spaces, converts to uppercase).
 */
export function normalizeSymbol(rawSymbol: string): string {
  if (!rawSymbol || typeof rawSymbol !== 'string') return '';
  return rawSymbol.trim().toUpperCase().replace(/[\/\-_]/g, '');
}

/**
 * Validates whether a normalized string is a supported standard 6-character FX pair.
 */
export function validateFxSymbol(normalizedSymbol: string): {
  isValid: boolean;
  baseCurrency?: string;
  quoteCurrency?: string;
  errorCode?: DecompositionErrorCode;
  errorMessage?: string;
} {
  if (!normalizedSymbol || normalizedSymbol.length !== 6) {
    return {
      isValid: false,
      errorCode: 'INVALID_SYMBOL',
      errorMessage: `Symbol '${normalizedSymbol}' must be exactly 6 alphanumeric characters for FX decomposition.`
    };
  }

  const base = normalizedSymbol.substring(0, 3);
  const quote = normalizedSymbol.substring(3, 6);

  if (base === quote) {
    return {
      isValid: false,
      errorCode: 'SAME_BASE_QUOTE',
      errorMessage: `Base currency '${base}' cannot be identical to quote currency '${quote}'.`
    };
  }

  if (!STANDARD_FX_CURRENCIES.has(base) || !STANDARD_FX_CURRENCIES.has(quote)) {
    return {
      isValid: false,
      errorCode: 'UNSUPPORTED_INSTRUMENT',
      errorMessage: `Symbol '${normalizedSymbol}' contains non-standard FX currency components (Base: ${base}, Quote: ${quote}).`
    };
  }

  return {
    isValid: true,
    baseCurrency: base,
    quoteCurrency: quote
  };
}

/**
 * Pure function to decompose an FX pair into its orthogonal base and quote currency legs.
 * 
 * Rules:
 * - BUY BASE/QUOTE -> LONG BASE (+), SHORT QUOTE (-)
 * - SELL BASE/QUOTE -> SHORT BASE (-), LONG QUOTE (+)
 */
export function decomposeFxSymbol(
  rawSymbol: string,
  direction: FxDirection,
  volume: number,
  reservedRiskPercent?: number,
  executionPrice?: number
): FxDecompositionResult {
  const normSymbol = normalizeSymbol(rawSymbol);
  const symbolVal = validateFxSymbol(normSymbol);

  if (!symbolVal.isValid || !symbolVal.baseCurrency || !symbolVal.quoteCurrency) {
    return {
      success: false,
      dataQuality: 'UNKNOWN',
      errorCode: symbolVal.errorCode,
      errorMessage: symbolVal.errorMessage
    };
  }

  if (direction !== 'BUY' && direction !== 'SELL') {
    return {
      success: false,
      dataQuality: 'UNKNOWN',
      errorCode: 'INVALID_DIRECTION',
      errorMessage: `Direction must be strictly 'BUY' or 'SELL', received '${direction}'.`
    };
  }

  if (typeof volume !== 'number' || !Number.isFinite(volume) || volume <= 0) {
    return {
      success: false,
      dataQuality: 'UNKNOWN',
      errorCode: 'INVALID_VOLUME',
      errorMessage: `Volume must be a finite positive number, received '${volume}'.`
    };
  }

  const base = symbolVal.baseCurrency;
  const quote = symbolVal.quoteCurrency;
  const isBuy = direction === 'BUY';

  // Base leg
  const baseDirection: 'LONG' | 'SHORT' = isBuy ? 'LONG' : 'SHORT';
  const baseSignedUnits = isBuy ? volume : -volume;
  const baseStandardUnits = volume * 100_000;

  // Quote leg
  const quoteDirection: 'LONG' | 'SHORT' = isBuy ? 'SHORT' : 'LONG';
  const quoteSignedUnits = isBuy ? -volume : volume;
  const quoteBaseUnits = volume * 100_000;
  const quoteUnits = (typeof executionPrice === 'number' && Number.isFinite(executionPrice) && executionPrice > 0)
    ? quoteBaseUnits * executionPrice
    : null;

  const baseLeg: CurrencyLeg = {
    currency: base,
    direction: baseDirection,
    signedUnits: Number(baseSignedUnits.toFixed(8)),
    grossUnits: volume,
    baseUnits: baseStandardUnits,
    quoteUnits: null,
    sourceSymbol: normSymbol,
    sourceDirection: direction
  };

  const quoteLeg: CurrencyLeg = {
    currency: quote,
    direction: quoteDirection,
    signedUnits: Number(quoteSignedUnits.toFixed(8)),
    grossUnits: volume,
    baseUnits: quoteBaseUnits,
    quoteUnits,
    sourceSymbol: normSymbol,
    sourceDirection: direction
  };

  let baseRiskFactor: CurrencyRiskFactor | undefined;
  let quoteRiskFactor: CurrencyRiskFactor | undefined;

  if (typeof reservedRiskPercent === 'number' && Number.isFinite(reservedRiskPercent) && reservedRiskPercent >= 0) {
    const baseSignedRisk = isBuy ? reservedRiskPercent : -reservedRiskPercent;
    const quoteSignedRisk = isBuy ? -reservedRiskPercent : reservedRiskPercent;

    baseRiskFactor = {
      currency: base,
      signedRiskPercent: Number(baseSignedRisk.toFixed(4)),
      grossLongRiskPercent: isBuy ? reservedRiskPercent : 0,
      grossShortRiskPercent: isBuy ? 0 : reservedRiskPercent,
      sourceSymbol: normSymbol,
      sourceDirection: direction
    };

    quoteRiskFactor = {
      currency: quote,
      signedRiskPercent: Number(quoteSignedRisk.toFixed(4)),
      grossLongRiskPercent: isBuy ? 0 : reservedRiskPercent,
      grossShortRiskPercent: isBuy ? reservedRiskPercent : 0,
      sourceSymbol: normSymbol,
      sourceDirection: direction
    };
  }

  return {
    success: true,
    baseCurrency: base,
    quoteCurrency: quote,
    baseLeg,
    quoteLeg,
    baseRiskFactor,
    quoteRiskFactor,
    dataQuality: 'DERIVED'
  };
}

/**
 * Aggregates a collection of currency legs and optional risk factors into a portfolio currency map.
 * Strictly maintains gross long, gross short, and net units/risk without loss of gross participation info.
 */
export function aggregateCurrencyFactors(
  legs: CurrencyLeg[],
  riskFactors: CurrencyRiskFactor[] = []
): PortfolioExposureAggregationResult {
  const result: Record<string, CurrencyExposureAggregate> = {};
  let totalGrossLots = 0;
  let totalGrossRiskPercent = 0;

  for (const leg of legs) {
    if (!result[leg.currency]) {
      result[leg.currency] = {
        currency: leg.currency,
        grossLongUnits: 0,
        grossShortUnits: 0,
        netUnits: 0,
        grossLongBaseUnits: 0,
        grossShortBaseUnits: 0,
        netBaseUnits: 0,
        grossLongRiskPercent: 0,
        grossShortRiskPercent: 0,
        netRiskPercent: 0,
        grossExposureRiskPercent: 0,
        contributingSymbols: [],
        dataQuality: 'DERIVED'
      };
    }

    const agg = result[leg.currency];
    if (!agg.contributingSymbols.includes(leg.sourceSymbol)) {
      agg.contributingSymbols.push(leg.sourceSymbol);
    }

    if (leg.direction === 'LONG') {
      agg.grossLongUnits += leg.grossUnits;
      agg.grossLongBaseUnits += leg.baseUnits;
    } else {
      agg.grossShortUnits += leg.grossUnits;
      agg.grossShortBaseUnits += leg.baseUnits;
    }

    agg.netUnits = Number((agg.grossLongUnits - agg.grossShortUnits).toFixed(8));
    agg.netBaseUnits = Number((agg.grossLongBaseUnits - agg.grossShortBaseUnits).toFixed(2));
    totalGrossLots += leg.grossUnits;
  }

  for (const rf of riskFactors) {
    if (!result[rf.currency]) {
      result[rf.currency] = {
        currency: rf.currency,
        grossLongUnits: 0,
        grossShortUnits: 0,
        netUnits: 0,
        grossLongBaseUnits: 0,
        grossShortBaseUnits: 0,
        netBaseUnits: 0,
        grossLongRiskPercent: 0,
        grossShortRiskPercent: 0,
        netRiskPercent: 0,
        grossExposureRiskPercent: 0,
        contributingSymbols: [],
        dataQuality: 'DERIVED'
      };
    }

    const agg = result[rf.currency];
    if (!agg.contributingSymbols.includes(rf.sourceSymbol)) {
      agg.contributingSymbols.push(rf.sourceSymbol);
    }

    agg.grossLongRiskPercent += rf.grossLongRiskPercent;
    agg.grossShortRiskPercent += rf.grossShortRiskPercent;
    agg.netRiskPercent = Number((agg.grossLongRiskPercent - agg.grossShortRiskPercent).toFixed(4));
    agg.grossExposureRiskPercent = Number((agg.grossLongRiskPercent + agg.grossShortRiskPercent).toFixed(4));
    totalGrossRiskPercent += (rf.grossLongRiskPercent + rf.grossShortRiskPercent);
  }

  return {
    currencies: result,
    totalGrossLots: Number(totalGrossLots.toFixed(8)),
    totalGrossRiskPercent: Number(totalGrossRiskPercent.toFixed(4)),
    dataQuality: 'DERIVED'
  };
}

/**
 * Normalizes an execution sequence containing scaleout child legs.
 * Invariant: Aggregates active child legs without double-counting the parent sequence.
 */
export function normalizeExecutionSequence(
  sequence: NormalizedSequenceInput
): PortfolioExposureAggregationResult {
  // If sequence is TERMINATED, active exposure is zero
  if (sequence.status === 'TERMINATED') {
    return {
      currencies: {},
      totalGrossLots: 0,
      totalGrossRiskPercent: 0,
      dataQuality: 'DERIVED'
    };
  }

  const activeChildren = sequence.childPositions.filter(c => c.status === 'OPEN');
  
  // If active children exist, use children sum; if none filled yet but sequence is active, use parent sequence totals
  const legs: CurrencyLeg[] = [];
  const riskFactors: CurrencyRiskFactor[] = [];

  if (activeChildren.length > 0) {
    for (const child of activeChildren) {
      const decomp = decomposeFxSymbol(
        sequence.symbol,
        sequence.direction,
        child.volume,
        child.reservedRiskPercent,
        child.executionPrice
      );
      if (decomp.success && decomp.baseLeg && decomp.quoteLeg) {
        legs.push(decomp.baseLeg, decomp.quoteLeg);
        if (decomp.baseRiskFactor && decomp.quoteRiskFactor) {
          riskFactors.push(decomp.baseRiskFactor, decomp.quoteRiskFactor);
        }
      }
    }
  } else if (sequence.status === 'INITIALIZING' || sequence.status === 'ACTIVE') {
    const decomp = decomposeFxSymbol(
      sequence.symbol,
      sequence.direction,
      sequence.totalVolume,
      sequence.reservedRiskPercent
    );
    if (decomp.success && decomp.baseLeg && decomp.quoteLeg) {
      legs.push(decomp.baseLeg, decomp.quoteLeg);
      if (decomp.baseRiskFactor && decomp.quoteRiskFactor) {
        riskFactors.push(decomp.baseRiskFactor, decomp.quoteRiskFactor);
      }
    }
  }

  return aggregateCurrencyFactors(legs, riskFactors);
}

/**
 * Filters a mixed collection of positions/signals, accepting ONLY active 'OPEN' positions into currency exposure.
 */
export function normalizeActivePositions(
  positions: NormalizedPositionInput[]
): PortfolioExposureAggregationResult {
  const activePositions = positions.filter(p => p.status === 'OPEN');
  const legs: CurrencyLeg[] = [];
  const riskFactors: CurrencyRiskFactor[] = [];

  for (const pos of activePositions) {
    const decomp = decomposeFxSymbol(
      pos.symbol,
      pos.direction,
      pos.volume,
      pos.reservedRiskPercent,
      pos.executionPrice
    );
    if (decomp.success && decomp.baseLeg && decomp.quoteLeg) {
      legs.push(decomp.baseLeg, decomp.quoteLeg);
      if (decomp.baseRiskFactor && decomp.quoteRiskFactor) {
        riskFactors.push(decomp.baseRiskFactor, decomp.quoteRiskFactor);
      }
    }
  }

  return aggregateCurrencyFactors(legs, riskFactors);
}
