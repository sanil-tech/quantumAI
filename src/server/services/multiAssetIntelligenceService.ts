
export type AssetQualityState = 'HEALTHY' | 'DEGRADED' | 'STALE' | 'INVALID';

export interface MultiAssetQuote {
  symbol: string;
  symbolId: number;
  digits: number;
  pipPosition: number;
  bid: number;
  ask: number;
  spreadPips: number;
  lastTickTimestamp: number;
  quality: AssetQualityState;
}

export interface ShadowPositionRecord {
  shadowId: string;
  signalId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  entryTime: number;
  exitTime?: number;
  status: 'OPEN' | 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_MANUAL';
  simulatedPnlPips: number;
  simulatedPnlDollars: number;
  rMultiple: number;
  mfePips: number;
  maePips: number;
}

export interface AssetPerformanceMetrics {
  symbol: string;
  totalSignals: number;
  shadowWins: number;
  shadowLosses: number;
  winRatePercent: number;
  netPips: number;
  netDollars: number;
  profitFactor: number;
  averageR: number;
}

export class MultiAssetIntelligenceService {
  private static symbolSpecs: Record<string, { symbolId: number; digits: number; pipPosition: number; maxSpreadPips: number }> = {
    EURUSD: { symbolId: 1, digits: 5, pipPosition: 4, maxSpreadPips: 2.5 },
    GBPUSD: { symbolId: 2, digits: 5, pipPosition: 4, maxSpreadPips: 3.0 },
    USDJPY: { symbolId: 4, digits: 3, pipPosition: 2, maxSpreadPips: 2.5 },
    XAUUSD: { symbolId: 43, digits: 2, pipPosition: 1, maxSpreadPips: 5.0 }
  };

  public static validateQuote(
    symbol: string,
    bid: number,
    ask: number,
    tickTimestamp: number,
    now = Date.now()
  ): MultiAssetQuote {
    const spec = this.symbolSpecs[symbol];
    if (!spec || bid <= 0 || ask <= 0 || ask < bid) {
      return {
        symbol,
        symbolId: spec ? spec.symbolId : 0,
        digits: spec ? spec.digits : 5,
        pipPosition: spec ? spec.pipPosition : 4,
        bid,
        ask,
        spreadPips: 0,
        lastTickTimestamp: tickTimestamp,
        quality: 'INVALID'
      };
    }

    const pipMultiplier = Math.pow(10, -spec.pipPosition);
    const spreadPips = Number(((ask - bid) / pipMultiplier).toFixed(1));
    const ageMs = now - tickTimestamp;

    let quality: AssetQualityState = 'HEALTHY';
    if (ageMs > 60000) {
      quality = 'STALE';
    } else if (spreadPips > spec.maxSpreadPips) {
      quality = 'DEGRADED';
    }

    return {
      symbol,
      symbolId: spec.symbolId,
      digits: spec.digits,
      pipPosition: spec.pipPosition,
      bid,
      ask,
      spreadPips,
      lastTickTimestamp: tickTimestamp,
      quality
    };
  }

  public static processShadowTrade(
    signalId: string,
    symbol: string,
    direction: 'BUY' | 'SELL',
    entryPrice: number,
    slPrice: number,
    tpPrice: number,
    currentPrice: number,
    entryTime = Date.now()
  ): ShadowPositionRecord {
    const spec = this.symbolSpecs[symbol] || { digits: 5, pipPosition: 4 };
    const pipMultiplier = Math.pow(10, -spec.pipPosition);

    let status: ShadowPositionRecord['status'] = 'OPEN';
    let exitTime: number | undefined;

    if (direction === 'BUY') {
      if (currentPrice >= tpPrice) {
        status = 'CLOSED_TP';
        exitTime = Date.now();
      } else if (currentPrice <= slPrice) {
        status = 'CLOSED_SL';
        exitTime = Date.now();
      }
    } else {
      if (currentPrice <= tpPrice) {
        status = 'CLOSED_TP';
        exitTime = Date.now();
      } else if (currentPrice >= slPrice) {
        status = 'CLOSED_SL';
        exitTime = Date.now();
      }
    }

    const diff = direction === 'BUY' ? currentPrice - entryPrice : entryPrice - currentPrice;
    const simulatedPnlPips = Number((diff / pipMultiplier).toFixed(1));
    const simulatedPnlDollars = Number((simulatedPnlPips * 0.10).toFixed(2));
    const rMultiple = status === 'CLOSED_TP' ? 2.0 : status === 'CLOSED_SL' ? -1.0 : Number((simulatedPnlPips / 20.0).toFixed(2));

    return {
      shadowId: 'SHADOW-' + signalId,
      signalId,
      symbol,
      direction,
      entryPrice,
      slPrice,
      tpPrice,
      entryTime,
      exitTime,
      status,
      simulatedPnlPips,
      simulatedPnlDollars,
      rMultiple,
      mfePips: Math.max(0, simulatedPnlPips),
      maePips: Math.min(0, simulatedPnlPips)
    };
  }
}
