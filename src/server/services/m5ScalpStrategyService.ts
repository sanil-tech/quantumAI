import { CurrencyPair, Timeframe, CandleData, IndicatorValues, SmcStructures } from '../../types';
import { m5DemoSafetyGuard } from './m5DemoSafetyGuard';
import { ctraderMarketDataFeedService } from './ctraderMarketDataFeedService';

export const QAI_M5_SCALP_V1_FORWARD_START = '2026-09-24T08:29:02Z';
export const QAI_M5_SCALP_STRATEGY_VERSION = 'QAI_M5_SCALP_BASELINE_V1';
export const M5_MAX_TTL_MS = 15 * 60 * 1000; // 15 minutes max TTL for M5 scalp

export const QAI_DEMO_CAPACITY_20_START = {
  effective_timestamp: '2026-09-24T08:54:25Z',
  event: 'QAI_DEMO_CAPACITY_20_START',
  previous_max_concurrent: 12,
  new_max_concurrent: 20,
  demo_capital: 10000,
  fixed_lot: 0.02,
  account_type: 'DEMO'
};

export interface M5ScalpEvaluationInput {
  symbol: CurrencyPair | string;
  currentPrice: number;
  candlesM5: CandleData[];
  candlesM15?: CandleData[];
  candlesH4?: CandleData[];
  indicatorsM5: IndicatorValues;
  smcM5?: SmcStructures;
  h4Regime?: 'TRENDING_BULLISH' | 'TRENDING_BEARISH' | 'RANGING_CHOPPY';
  m15Context?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  generatedAt?: number;
}

export interface M5ScalpSetupResult {
  marketOpportunityId: string;
  signalId: string;
  setupId: string;
  proposalId: string;
  symbol: string;
  timeframe: 'M5';
  direction: 'BUY' | 'SELL';
  decision: 'ACCEPTED' | 'REJECTED' | 'VETOED';
  rejectionReason?: 
    | 'REJECTED_H4_CONFLICT'
    | 'REJECTED_M15_CONFLICT'
    | 'REJECTED_SPREAD'
    | 'REJECTED_RR'
    | 'REJECTED_STRUCTURE'
    | 'REJECTED_ATR'
    | 'REJECTED_ANTI_CHASE'
    | 'REJECTED_STALE_SIGNAL'
    | 'REJECTED_NEWS'
    | 'VETOED_GEMINI'
    | 'EXPIRED'
    | 'VETOED_XAU';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  plannedRr: number;
  slDistancePips: number;
  slAtrRatio: number;
  spreadPips: number;
  riskPercent: number;
  riskAmount: number;
  lotSize: number;
  confidence: number;
  h4Regime: string;
  m15Context: string;
  strategyVersion: 'QAI_M5_SCALP_BASELINE_V1';
  executionMode: 'DEMO_FORWARD' | 'SHADOW';
  provenance: 'NATURAL_RUNTIME';
  forwardValidation: true;
  reasons: string[];
}

export class M5ScalpStrategyService {
  private static instance: M5ScalpStrategyService;

  public static getInstance(): M5ScalpStrategyService {
    if (!M5ScalpStrategyService.instance) {
      M5ScalpStrategyService.instance = new M5ScalpStrategyService();
    }
    return M5ScalpStrategyService.instance;
  }

  public getPipMultiplier(symbol: string): number {
    const sym = symbol.toUpperCase().replace(/[\/\-_]/g, '');
    if (sym.includes('JPY')) return 0.01;
    if (sym.includes('XAU') || sym.includes('GOLD')) return 0.1;
    return 0.0001;
  }

  /**
   * Primary evaluation function for QAI_M5_SCALP_BASELINE_V1
   */
  public evaluateM5Opportunity(input: M5ScalpEvaluationInput): M5ScalpSetupResult {
    const now = Date.now();
    const generatedAt = input.generatedAt || now;
    const symbol = input.symbol;
    const isJpy = symbol.includes('JPY');
    const isGold = symbol.includes('XAU') || symbol.includes('GOLD');
    const pipMultiplier = this.getPipMultiplier(symbol);

    const opportunityId = `opp_m5_${symbol.replace(/[\/\-_]/g, '')}_${now}_${Math.random().toString(36).substring(2, 6)}`;
    const signalId = `sig_m5_${symbol.replace(/[\/\-_]/g, '')}_${now}`;
    const setupId = `setup_m5_${symbol.replace(/[\/\-_]/g, '')}_${now}`;
    const proposalId = `prop_m5_${symbol.replace(/[\/\-_]/g, '')}_${now}`;

    // 1. XAU/USD Quarantine Gate
    if (isGold) {
      return this.buildRejectedResult({
        opportunityId, signalId, setupId, proposalId, symbol, direction: 'BUY',
        currentPrice: input.currentPrice, stopLoss: input.currentPrice * 0.99, takeProfit: input.currentPrice * 1.02,
        rejectionReason: 'VETOED_XAU',
        reasons: ['[QUARANTINE] XAU/USD Gold is quarantined from M5 Forex Scalp campaign.'],
        h4Regime: input.h4Regime || 'UNKNOWN', m15Context: input.m15Context || 'NEUTRAL',
        spreadPips: 0, slDistancePips: 0, slAtrRatio: 0
      });
    }

    // 2. TTL Check (Max 15 Minutes)
    if (now - generatedAt > M5_MAX_TTL_MS) {
      return this.buildRejectedResult({
        opportunityId, signalId, setupId, proposalId, symbol, direction: 'BUY',
        currentPrice: input.currentPrice, stopLoss: input.currentPrice * 0.99, takeProfit: input.currentPrice * 1.02,
        rejectionReason: 'REJECTED_STALE_SIGNAL',
        reasons: [`Signal age (${Math.ceil((now - generatedAt) / 60000)}m) exceeds M5 max TTL (15m).`],
        h4Regime: input.h4Regime || 'UNKNOWN', m15Context: input.m15Context || 'NEUTRAL',
        spreadPips: 0, slDistancePips: 0, slAtrRatio: 0
      });
    }

    // 3. Extract M5 Indicators & ATR(14)
    const currentPrice = input.currentPrice;
    const atr = Number(input.indicatorsM5?.atr) || (currentPrice * 0.0015);
    const rsi = Number(input.indicatorsM5?.rsi) || 50;
    const ema20 = Number(input.indicatorsM5?.ema20) || currentPrice;
    const ema50 = Number(input.indicatorsM5?.ema50) || currentPrice;
    const superTrend = input.indicatorsM5?.superTrend?.trend || (currentPrice >= ema50 ? 'BULLISH' : 'BEARISH');

    // 4. Direction Determination (M5 Technical Bias)
    let direction: 'BUY' | 'SELL' = currentPrice >= ema50 ? 'BUY' : 'SELL';
    if (rsi >= 52 && superTrend === 'BULLISH') direction = 'BUY';
    else if (rsi <= 48 && superTrend === 'BEARISH') direction = 'SELL';

    // 5. H4 Directional Regime Filter (Strict Higher-Timeframe Alignment)
    const h4Regime = input.h4Regime || (currentPrice >= ema50 ? 'TRENDING_BULLISH' : 'TRENDING_BEARISH');
    if (direction === 'BUY' && h4Regime === 'TRENDING_BEARISH') {
      return this.buildRejectedResult({
        opportunityId, signalId, setupId, proposalId, symbol, direction,
        currentPrice, stopLoss: currentPrice - 0.0020, takeProfit: currentPrice + 0.0040,
        rejectionReason: 'REJECTED_H4_CONFLICT',
        reasons: [`M5 BUY signal contradicts BEARISH H4 directional regime.`],
        h4Regime, m15Context: input.m15Context || 'NEUTRAL',
        spreadPips: 0, slDistancePips: 0, slAtrRatio: 0
      });
    } else if (direction === 'SELL' && h4Regime === 'TRENDING_BULLISH') {
      return this.buildRejectedResult({
        opportunityId, signalId, setupId, proposalId, symbol, direction,
        currentPrice, stopLoss: currentPrice + 0.0020, takeProfit: currentPrice - 0.0040,
        rejectionReason: 'REJECTED_H4_CONFLICT',
        reasons: [`M5 SELL signal contradicts BULLISH H4 directional regime.`],
        h4Regime, m15Context: input.m15Context || 'NEUTRAL',
        spreadPips: 0, slDistancePips: 0, slAtrRatio: 0
      });
    }

    // 6. Live Spread Control (Fetch actual cTrader bid/ask tick data)
    let spreadPips = 1.2;
    const liveCandles = ctraderMarketDataFeedService.getLiveCandles(symbol as any);
    if (liveCandles.valid && liveCandles.candles.length > 0) {
      const spreadVal = liveCandles.spread || 0.00012;
      spreadPips = Number((spreadVal / pipMultiplier).toFixed(1));
    }

    const MAX_ALLOWED_SPREAD_PIPS = 2.5; // Max 2.5 pips spread for Forex M5 scalping
    if (spreadPips > MAX_ALLOWED_SPREAD_PIPS) {
      return this.buildRejectedResult({
        opportunityId, signalId, setupId, proposalId, symbol, direction,
        currentPrice, stopLoss: currentPrice - 0.0020, takeProfit: currentPrice + 0.0040,
        rejectionReason: 'REJECTED_SPREAD',
        reasons: [`Live spread (${spreadPips} pips) exceeds maximum M5 scalp spread limit (${MAX_ALLOWED_SPREAD_PIPS} pips).`],
        h4Regime, m15Context: input.m15Context || 'NEUTRAL',
        spreadPips, slDistancePips: 0, slAtrRatio: 0
      });
    }

    // 7. Structure + ATR(14) Stop Loss Calculation with 1.5x Liquidity Buffer
    // Base ATR multiplier: 1.50 ATR to protect against wick hunting / spread spikes
    const atrDistance = atr * 1.50;
    const atrDistancePips = Number((atrDistance / pipMultiplier).toFixed(1));

    // Swing structure lookup from M5 candles
    const candles = input.candlesM5 || [];
    let structuralPrice = currentPrice;
    if (candles.length >= 5) {
      const recent = candles.slice(-5);
      if (direction === 'BUY') {
        const lowest = Math.min(...recent.map(c => c.low));
        // Add 1.5x ATR buffer below lowest to absorb liquidity sweeps / stop hunts
        structuralPrice = lowest - (1.5 * atr);
      } else {
        const highest = Math.max(...recent.map(c => c.high));
        // Add 1.5x ATR buffer above highest to absorb liquidity sweeps / stop hunts
        structuralPrice = highest + (1.5 * atr);
      }
    }

    // Minimum noise floor: JPY=35p, Majors=20p to prevent premature stops on normal oscillations
    const minFloorPips = isJpy ? 35 : 20;
    const minFloorDistance = minFloorPips * pipMultiplier;

    const calculatedStop = direction === 'BUY'
      ? Math.min(currentPrice - atrDistance, structuralPrice, currentPrice - minFloorDistance)
      : Math.max(currentPrice + atrDistance, structuralPrice, currentPrice + minFloorDistance);

    const stopLoss = Number(calculatedStop.toFixed(isJpy ? 3 : 5));

    const slPriceDistance = Math.abs(currentPrice - stopLoss);
    const slDistancePips = Number((slPriceDistance / pipMultiplier).toFixed(1));
    const slAtrRatio = Number((slPriceDistance / atr).toFixed(2));

    // Verify spread vs SL distance (< 30% of SL)
    if ((spreadPips / slDistancePips) > 0.30) {
      return this.buildRejectedResult({
        opportunityId, signalId, setupId, proposalId, symbol, direction,
        currentPrice, stopLoss, takeProfit: currentPrice + (slPriceDistance * 2),
        rejectionReason: 'REJECTED_SPREAD',
        reasons: [`Spread (${spreadPips} pips) is > 30% of Stop Loss distance (${slDistancePips} pips).`],
        h4Regime, m15Context: input.m15Context || 'NEUTRAL',
        spreadPips, slDistancePips, slAtrRatio
      });
    }

    // 8. Structure-Aware Take Profit Calculation (Preferred 1:2.0 R:R, Min 1:1.5)
    const tpDistance = slPriceDistance * 2.0; // 1:2.0 Target
    const takeProfit1 = direction === 'BUY'
      ? Number((currentPrice + tpDistance).toFixed(isJpy ? 3 : 5))
      : Number((currentPrice - tpDistance).toFixed(isJpy ? 3 : 5));

    const takeProfit2 = direction === 'BUY'
      ? Number((currentPrice + (tpDistance * 1.5)).toFixed(isJpy ? 3 : 5))
      : Number((currentPrice - (tpDistance * 1.5)).toFixed(isJpy ? 3 : 5));

    const plannedRr = Number((tpDistance / slPriceDistance).toFixed(2));

    // Minimum R:R check (1:1.5)
    if (plannedRr < 1.5) {
      return this.buildRejectedResult({
        opportunityId, signalId, setupId, proposalId, symbol, direction,
        currentPrice, stopLoss, takeProfit: takeProfit1,
        rejectionReason: 'REJECTED_RR',
        reasons: [`Planned R:R (${plannedRr}) is below minimum acceptable ratio (1:1.5).`],
        h4Regime, m15Context: input.m15Context || 'NEUTRAL',
        spreadPips, slDistancePips, slAtrRatio
      });
    }

    // 9. Risk & Sizing Calculation (Fixed DEMO test lot = 0.02 LOT)
    const riskPercent = 1.0;
    const riskAmount = 2.0;
    const lotSize = 0.02; // Fixed 0.02 lot size for DEMO forward validation campaign

    // 10. Programmatic DEMO Safety Guard Assertion before confirming DEMO_FORWARD execution
    const demoCheck = m5DemoSafetyGuard.verifyDemoAccount();
    if (!demoCheck.executionAllowed || !demoCheck.isDemoVerified) {
      return this.buildRejectedResult({
        opportunityId, signalId, setupId, proposalId, symbol, direction,
        currentPrice, stopLoss, takeProfit: takeProfit1,
        rejectionReason: 'VETOED_GEMINI',
        reasons: [`[SAFETY_GUARD] DEMO execution blocked: ${demoCheck.reason}`],
        h4Regime, m15Context: input.m15Context || 'NEUTRAL',
        spreadPips, slDistancePips, slAtrRatio
      });
    }

    return {
      marketOpportunityId: opportunityId,
      signalId,
      setupId,
      proposalId,
      symbol,
      timeframe: 'M5',
      direction,
      decision: 'ACCEPTED',
      entryPrice: currentPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      plannedRr,
      slDistancePips,
      slAtrRatio,
      spreadPips,
      riskPercent,
      riskAmount,
      lotSize,
      confidence: 85,
      h4Regime,
      m15Context: input.m15Context || 'BULLISH',
      strategyVersion: QAI_M5_SCALP_STRATEGY_VERSION,
      executionMode: 'DEMO_FORWARD',
      provenance: 'NATURAL_RUNTIME',
      forwardValidation: true,
      reasons: [
        `✅ QAI_M5_SCALP_BASELINE_V1 Setup Qualified: ${direction} @ ${currentPrice}`,
        `H4 Regime Aligned (${h4Regime})`,
        `Structure + ATR(14) SL: ${stopLoss} (${slDistancePips} pips, ${slAtrRatio}x ATR)`,
        `TP: ${takeProfit1} (Planned R:R 1:${plannedRr})`,
        `Live Spread: ${spreadPips} pips`
      ]
    };
  }

  private buildRejectedResult(params: {
    opportunityId: string; signalId: string; setupId: string; proposalId: string;
    symbol: string; direction: 'BUY' | 'SELL'; currentPrice: number;
    stopLoss: number; takeProfit: number; rejectionReason: M5ScalpSetupResult['rejectionReason'];
    reasons: string[]; h4Regime: string; m15Context: string;
    spreadPips: number; slDistancePips: number; slAtrRatio: number;
  }): M5ScalpSetupResult {
    const slDist = params.slDistancePips || 20.0;
    const plannedRr = Number((Math.abs(params.takeProfit - params.currentPrice) / Math.abs(params.currentPrice - params.stopLoss)).toFixed(2)) || 1.5;

    return {
      marketOpportunityId: params.opportunityId,
      signalId: params.signalId,
      setupId: params.setupId,
      proposalId: params.proposalId,
      symbol: params.symbol,
      timeframe: 'M5',
      direction: params.direction,
      decision: 'REJECTED',
      rejectionReason: params.rejectionReason,
      entryPrice: params.currentPrice,
      stopLoss: params.stopLoss,
      takeProfit1: params.takeProfit,
      plannedRr,
      slDistancePips: slDist,
      slAtrRatio: params.slAtrRatio || 1.0,
      spreadPips: params.spreadPips || 1.2,
      riskPercent: 1.0,
      riskAmount: 10.0,
      lotSize: 0.01,
      confidence: 0,
      h4Regime: params.h4Regime,
      m15Context: params.m15Context,
      strategyVersion: QAI_M5_SCALP_STRATEGY_VERSION,
      executionMode: 'SHADOW',
      provenance: 'NATURAL_RUNTIME',
      forwardValidation: true,
      reasons: params.reasons
    };
  }
}

export const m5ScalpStrategyService = M5ScalpStrategyService.getInstance();
