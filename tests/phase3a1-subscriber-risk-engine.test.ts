import { approveCopierSignal } from '../src/server/services/copierSafetyPolicy';
// Contract tests must never publish into the running application's disk queue or contact a broker.
const isolatedQueue = vi.hoisted(() => {
  for (const key of ['TELEGRAM_BOT_TOKEN','TELEGRAM_CHANNEL_ID','TELEGRAM_VIP_CHAT_ID','TELEGRAM_FREE_CHAT_ID']) delete process.env[key];
  return new Map<string,string>();
});
vi.mock('fs',()=>({existsSync:(p:string)=>isolatedQueue.has(p),readFileSync:(p:string)=>isolatedQueue.get(p),writeFileSync:(p:string,s:string)=>isolatedQueue.set(p,s),mkdirSync:vi.fn()}));
vi.mock('../src/server/services/multiClientCopierService',()=>({multiClientCopierService:{}}));
let approvedFixtureId = 0;
function publishCopierSignal(signal: Parameters<typeof publishApprovedSignal>[0]) {
  const canonical = {signalId:'risk-fixture-'+(++approvedFixtureId),symbol:signal.pair,direction:signal.direction,
    entryPrice:signal.entryPrice,stopLoss:signal.stopLoss,takeProfit1:signal.takeProfit1,takeProfit2:signal.takeProfit2,
    confidence:90,validationStatus:'PASS',validationErrors:[],executionStatus:'WAITING_FOR_ENTRY',expiryTime:Date.now()+60000};
  return publishApprovedSignal(signal,approveCopierSignal(canonical as any,'WAITING_FOR_ENTRY'));
}
import { describe, it, expect, vi } from 'vitest';
import { publishCopierSignal as publishApprovedSignal, CopierLiveSignal } from '../src/server/routes/copier';
import { TelegramNotificationService, TradeBroadcastPayload } from '../src/server/services/telegramNotificationService';

/**
 * Production-equivalent Pure Risk Engine implementation mirroring cBot C# logic
 * for exact mathematical and logic verification.
 */
export enum RiskCalculationMode {
  FixedLot = 'FixedLot',
  PercentageEquity = 'PercentageEquity'
}

export enum RiskProfileType {
  Conservative = 'Conservative', // 0.25%
  Standard = 'Standard',         // 0.50%
  Growth = 'Growth',             // 1.00%
  Aggressive = 'Aggressive',     // 1.50%
  HighRisk = 'HighRisk',         // 2.00%
  Custom = 'Custom'              // 0.01% - 2.00%
}

export interface SymbolSpecs {
  name: string;
  pipSize: number;
  pipValue: number; // Value of 1 pip per 1 unit of volume in account currency
  volumeInUnitsMin: number;
  volumeInUnitsStep: number;
  volumeInUnitsMax: number;
  spreadPips: number;
}

export interface PositionRiskState {
  symbolName: string;
  volumeUnits: number;
  entryPrice: number;
  stopLoss?: number;
  isPending?: boolean;
}

export interface PortfolioGuardConfig {
  maxDailyLossPct: number;
  maxAccountDrawdownPct: number;
  maxTotalOpenRiskPct: number;
  maxConcurrentTrades: number;
  maxSpreadPips: number;
  maxLotCap: number; // in lots
}

export class LocalRiskEngine {
  public static getSelectedRiskPct(profile: RiskProfileType, customRiskPct?: number): number {
    switch (profile) {
      case RiskProfileType.Conservative: return 0.25;
      case RiskProfileType.Standard: return 0.50;
      case RiskProfileType.Growth: return 1.00;
      case RiskProfileType.Aggressive: return 1.50;
      case RiskProfileType.HighRisk: return 2.00;
      case RiskProfileType.Custom:
        if (!customRiskPct || isNaN(customRiskPct) || customRiskPct <= 0 || !isFinite(customRiskPct)) {
          return 0.50; // Fallback to standard
        }
        return Math.min(2.00, Math.max(0.01, customRiskPct));
      default: return 0.50;
    }
  }

  public static normalizeVolumeDown(targetUnits: number, minUnits: number, stepUnits: number, maxUnits: number): number {
    if (isNaN(targetUnits) || !isFinite(targetUnits) || targetUnits <= 0) return 0;
    if (isNaN(minUnits) || !isFinite(minUnits) || minUnits <= 0) return 0;
    if (isNaN(stepUnits) || !isFinite(stepUnits) || stepUnits <= 0) return 0;
    if (isNaN(maxUnits) || !isFinite(maxUnits) || maxUnits <= 0) return 0;
    if (maxUnits < minUnits) return 0;

    const steps = Math.floor((targetUnits - minUnits) / stepUnits);
    if (steps < 0) return 0; // Less than broker minimum

    let normalized = minUnits + (steps * stepUnits);
    if (normalized > maxUnits) normalized = maxUnits;
    return normalized;
  }

  public static evaluatePortfolioGuards(
    equity: number,
    dailyBaselineEquity: number,
    highWaterMark: number,
    openPositions: PositionRiskState[],
    activeSetupTags: string[],
    symbolSpecsMap: Map<string, SymbolSpecs>,
    config: PortfolioGuardConfig
  ): { allowed: boolean; reason?: string; remainingPortfolioRiskPct: number; currentOpenRiskPct: number } {
    // 1. Daily Loss Guard
    const dailyLoss = dailyBaselineEquity - equity;
    const dailyLossPct = dailyBaselineEquity > 0 && dailyLoss > 0 ? (dailyLoss / dailyBaselineEquity) * 100.0 : 0;
    if (dailyLossPct >= config.maxDailyLossPct) {
      return {
        allowed: false,
        reason: `DAILY_LOSS_LIMIT_REACHED: Daily loss ${dailyLossPct.toFixed(2)}% >= max ${config.maxDailyLossPct.toFixed(2)}%`,
        remainingPortfolioRiskPct: 0,
        currentOpenRiskPct: 0
      };
    }

    // 2. Max Account Drawdown Guard (High-Water Mark)
    const peakEquity = Math.max(highWaterMark, equity);
    const drawdown = peakEquity - equity;
    const drawdownPct = peakEquity > 0 && drawdown > 0 ? (drawdown / peakEquity) * 100.0 : 0;
    if (drawdownPct >= config.maxAccountDrawdownPct) {
      return {
        allowed: false,
        reason: `MAX_DRAWDOWN_LIMIT_REACHED: Drawdown ${drawdownPct.toFixed(2)}% >= max ${config.maxAccountDrawdownPct.toFixed(2)}%`,
        remainingPortfolioRiskPct: 0,
        currentOpenRiskPct: 0
      };
    }

    // 3. Max Total Open Risk Guard
    let totalOpenRiskMonetary = 0;
    for (const pos of openPositions) {
      const sym = symbolSpecsMap.get(pos.symbolName);
      if (!sym) continue;
      let slPips = 0;
      if (pos.stopLoss !== undefined && pos.stopLoss > 0) {
        slPips = Math.abs(pos.entryPrice - pos.stopLoss) / sym.pipSize;
      } else {
        // Fail-closed policy for missing SL
        slPips = Math.max(50.0, sym.spreadPips * 5.0);
      }
      totalOpenRiskMonetary += slPips * sym.pipValue * pos.volumeUnits;
    }

    const currentOpenRiskPct = equity > 0 ? (totalOpenRiskMonetary / equity) * 100.0 : 0;
    if (currentOpenRiskPct >= config.maxTotalOpenRiskPct) {
      return {
        allowed: false,
        reason: `PORTFOLIO_RISK_CEILING_REACHED: Current open risk ${currentOpenRiskPct.toFixed(2)}% >= max ${config.maxTotalOpenRiskPct.toFixed(2)}%`,
        remainingPortfolioRiskPct: 0,
        currentOpenRiskPct
      };
    }

    const remainingPortfolioRiskPct = Math.max(0, config.maxTotalOpenRiskPct - currentOpenRiskPct);

    // 4. Max Concurrent Trades Guard
    const uniqueSetups = new Set(activeSetupTags);
    if (uniqueSetups.size >= config.maxConcurrentTrades) {
      return {
        allowed: false,
        reason: `MAX_CONCURRENT_SETUPS_REACHED: Active setups ${uniqueSetups.size} >= max ${config.maxConcurrentTrades}`,
        remainingPortfolioRiskPct,
        currentOpenRiskPct
      };
    }

    return {
      allowed: true,
      remainingPortfolioRiskPct,
      currentOpenRiskPct
    };
  }

  public static calculatePositionSize(
    mode: RiskCalculationMode,
    profile: RiskProfileType,
    customRiskPct: number | undefined,
    equity: number,
    rawSlPips: number,
    symbol: SymbolSpecs,
    config: PortfolioGuardConfig,
    serverMaxRiskPct: number = 2.00,
    remainingPortfolioRiskPct: number = 4.00,
    fixedLotSize: number = 0.02,
    useMethod2Split: boolean = true
  ): {
    allowed: boolean;
    reason?: string;
    effectiveSlPips: number;
    effectiveRiskPct: number;
    monetaryRiskBudget: number;
    totalUnits: number;
    ticket1Units: number;
    ticket2Units: number;
    actualMonetaryRisk: number;
    actualRiskPct: number;
  } {
    // 1. Minimum spread and safeguard check
    if (symbol.spreadPips > config.maxSpreadPips) {
      return {
        allowed: false,
        reason: `SPREAD_EXCEEDED: Spread ${symbol.spreadPips} pips > max ${config.maxSpreadPips} pips`,
        effectiveSlPips: rawSlPips,
        effectiveRiskPct: 0,
        monetaryRiskBudget: 0,
        totalUnits: 0,
        ticket1Units: 0,
        ticket2Units: 0,
        actualMonetaryRisk: 0,
        actualRiskPct: 0
      };
    }

    // Effective SL distance applying post-safeguard rule
    const effectiveSlPips = Math.max(rawSlPips, Math.max(10.0, symbol.spreadPips * 2.0));

    let rawVolumeUnits: number;
    let effectiveRiskPct: number;
    let monetaryRiskBudget: number;

    if (mode === RiskCalculationMode.PercentageEquity) {
      const subscriberRisk = this.getSelectedRiskPct(profile, customRiskPct);
      effectiveRiskPct = Math.min(subscriberRisk, Math.min(serverMaxRiskPct, remainingPortfolioRiskPct));

      if (effectiveRiskPct <= 0.001) {
        return {
          allowed: false,
          reason: `ZERO_RISK_BUDGET: Effective risk budget is ${effectiveRiskPct.toFixed(3)}%`,
          effectiveSlPips,
          effectiveRiskPct: 0,
          monetaryRiskBudget: 0,
          totalUnits: 0,
          ticket1Units: 0,
          ticket2Units: 0,
          actualMonetaryRisk: 0,
          actualRiskPct: 0
        };
      }

      monetaryRiskBudget = equity * (effectiveRiskPct / 100.0);
      const costPerUnit = effectiveSlPips * symbol.pipValue;
      if (costPerUnit <= 0) {
        return {
          allowed: false,
          reason: 'INVALID_PIP_COST: Symbol pip value or SL distance invalid',
          effectiveSlPips,
          effectiveRiskPct,
          monetaryRiskBudget,
          totalUnits: 0,
          ticket1Units: 0,
          ticket2Units: 0,
          actualMonetaryRisk: 0,
          actualRiskPct: 0
        };
      }
      rawVolumeUnits = monetaryRiskBudget / costPerUnit;
    } else {
      // Fixed lot mode: Check server max cap and remaining portfolio budget
      rawVolumeUnits = fixedLotSize * 100000; // Standard 100k conversion
      const fixedLotRiskMonetary = rawVolumeUnits * effectiveSlPips * symbol.pipValue;
      const fixedLotRiskPct = equity > 0 ? (fixedLotRiskMonetary / equity) * 100.0 : 0;

      if (fixedLotRiskPct > serverMaxRiskPct) {
        return {
          allowed: false,
          reason: `FIXED_LOT_SERVER_CEILING_EXCEEDED: Fixed lot risk ${fixedLotRiskPct.toFixed(2)}% > server max ${serverMaxRiskPct.toFixed(2)}%`,
          effectiveSlPips,
          effectiveRiskPct: fixedLotRiskPct,
          monetaryRiskBudget: fixedLotRiskMonetary,
          totalUnits: 0,
          ticket1Units: 0,
          ticket2Units: 0,
          actualMonetaryRisk: 0,
          actualRiskPct: 0
        };
      }

      if (fixedLotRiskPct > remainingPortfolioRiskPct) {
        return {
          allowed: false,
          reason: `FIXED_LOT_PORTFOLIO_BUDGET_EXCEEDED: Fixed lot risk ${fixedLotRiskPct.toFixed(2)}% > remaining portfolio budget ${remainingPortfolioRiskPct.toFixed(2)}%`,
          effectiveSlPips,
          effectiveRiskPct: fixedLotRiskPct,
          monetaryRiskBudget: fixedLotRiskMonetary,
          totalUnits: 0,
          ticket1Units: 0,
          ticket2Units: 0,
          actualMonetaryRisk: 0,
          actualRiskPct: 0
        };
      }

      monetaryRiskBudget = fixedLotRiskMonetary;
      effectiveRiskPct = fixedLotRiskPct;
    }

    // Apply Max Lot Cap
    const maxCapUnits = config.maxLotCap * 100000;
    if (rawVolumeUnits > maxCapUnits) {
      rawVolumeUnits = maxCapUnits;
    }

    // Normalize Volume DOWN
    const normalizedTotalUnits = this.normalizeVolumeDown(
      rawVolumeUnits,
      symbol.volumeInUnitsMin,
      symbol.volumeInUnitsStep,
      symbol.volumeInUnitsMax
    );

    // Strict Broker Minimum Guard: DO NOT BUMP UP!
    if (normalizedTotalUnits < symbol.volumeInUnitsMin) {
      return {
        allowed: false,
        reason: `MIN_VOLUME_RISK_EXCEEDED: Budget allows ${Math.floor(rawVolumeUnits)} units, below broker min ${symbol.volumeInUnitsMin} units. Bump-up prohibited.`,
        effectiveSlPips,
        effectiveRiskPct,
        monetaryRiskBudget,
        totalUnits: 0,
        ticket1Units: 0,
        ticket2Units: 0,
        actualMonetaryRisk: 0,
        actualRiskPct: 0
      };
    }

    // Split-Ticket Allocation (Method 2 Strict 50:50)
    let ticket1Units: number;
    let ticket2Units: number;

    if (useMethod2Split) {
      const halfUnits = this.normalizeVolumeDown(
        normalizedTotalUnits / 2.0,
        symbol.volumeInUnitsMin,
        symbol.volumeInUnitsStep,
        symbol.volumeInUnitsMax
      );
      if (halfUnits < symbol.volumeInUnitsMin || (halfUnits * 2.0) > normalizedTotalUnits) {
        return {
          allowed: false,
          reason: `METHOD_2_EQUAL_SPLIT_FAILED: Volume ${normalizedTotalUnits} units cannot be split into two equal tickets >= broker min ${symbol.volumeInUnitsMin} units.`,
          effectiveSlPips,
          effectiveRiskPct,
          monetaryRiskBudget,
          totalUnits: 0,
          ticket1Units: 0,
          ticket2Units: 0,
          actualMonetaryRisk: 0,
          actualRiskPct: 0
        };
      }
      ticket1Units = halfUnits;
      ticket2Units = halfUnits;
    } else {
      ticket1Units = normalizedTotalUnits;
      ticket2Units = 0;
    }

    const actualTotalUnits = ticket1Units + ticket2Units;
    const actualMonetaryRisk = actualTotalUnits * effectiveSlPips * symbol.pipValue;
    const actualRiskPct = equity > 0 ? (actualMonetaryRisk / equity) * 100.0 : 0;

    return {
      allowed: true,
      effectiveSlPips,
      effectiveRiskPct,
      monetaryRiskBudget,
      totalUnits: actualTotalUnits,
      ticket1Units,
      ticket2Units,
      actualMonetaryRisk,
      actualRiskPct
    };
  }
}

describe('QuantumAI Phase 3A.1 — Subscriber Equity-Normalized Local Risk Engine', () => {
  const standardSymbolEURUSD: SymbolSpecs = {
    name: 'EURUSD',
    pipSize: 0.0001,
    pipValue: 0.0001, // In USD account: 100,000 units * 0.0001 = $10/pip
    volumeInUnitsMin: 1000,   // 0.01 lot
    volumeInUnitsStep: 1000,  // 0.01 lot
    volumeInUnitsMax: 5000000,// 50.0 lots
    spreadPips: 1.2
  };

  const standardConfig: PortfolioGuardConfig = {
    maxDailyLossPct: 3.0,
    maxAccountDrawdownPct: 6.0,
    maxTotalOpenRiskPct: 4.0,
    maxConcurrentTrades: 3,
    maxSpreadPips: 3.5,
    maxLotCap: 5.0
  };

  describe('1. Risk Profile Mapping & Validation', () => {
    it('correctly maps all predefined risk profiles to institutional percentages', () => {
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Conservative)).toBe(0.25);
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Standard)).toBe(0.50);
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Growth)).toBe(1.00);
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Aggressive)).toBe(1.50);
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.HighRisk)).toBe(2.00);
    });

    it('validates custom risk percentage within >0.00% and <=2.00%', () => {
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Custom, 0.75)).toBe(0.75);
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Custom, 1.80)).toBe(1.80);
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Custom, 0.05)).toBe(0.05);
    });

    it('clamps or safely falls back on invalid custom risk values', () => {
      // Over 2.00% -> clamped to 2.00%
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Custom, 3.50)).toBe(2.00);
      // Negative / zero -> fallback to default standard 0.50%
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Custom, 0)).toBe(0.50);
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Custom, -1.0)).toBe(0.50);
      // NaN / Infinity -> fallback to default standard 0.50%
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Custom, NaN)).toBe(0.50);
      expect(LocalRiskEngine.getSelectedRiskPct(RiskProfileType.Custom, Infinity)).toBe(0.50);
    });
  });

  describe('2. Percentage Equity Position Sizing & SL Dynamics', () => {
    it('calculates exact lot volume for standard $10k account on EURUSD with 20 pip SL', () => {
      const res = LocalRiskEngine.calculatePositionSize(
        RiskCalculationMode.PercentageEquity,
        RiskProfileType.Standard, // 0.50% ($50 budget)
        undefined,
        10000,
        20, // 20 pips SL
        standardSymbolEURUSD,
        standardConfig
      );

      expect(res.allowed).toBe(true);
      expect(res.monetaryRiskBudget).toBe(50.0);
      // Cost per unit = 20 * 0.0001 = $0.002. Raw = 50 / 0.002 = 25,000 units.
      // Strict 50:50 split: 25,000 / 2 = 12,500 -> normalized down to step is 12,000 each.
      // Total units = T1(12,000) + T2(12,000) = 24,000 units (0.24 lots) <= 0.25 lot budget
      expect(res.totalUnits).toBe(24000);
      expect(res.ticket1Units).toBe(12000);
      expect(res.ticket2Units).toBe(12000);
      expect(res.actualMonetaryRisk).toBe(48.0); // 48.0 <= 50.0 budget
      expect(res.actualRiskPct).toBe(0.48);
    });

    it('uses effective post-safeguard SL distance when signal SL is below minimum', () => {
      const res = LocalRiskEngine.calculatePositionSize(
        RiskCalculationMode.PercentageEquity,
        RiskProfileType.Standard, // 0.50% ($50 budget)
        undefined,
        10000,
        4, // Raw signal has 4 pips SL (below 10 pip safeguard)
        standardSymbolEURUSD,
        standardConfig
      );

      expect(res.allowed).toBe(true);
      // Effective SL must be clamped to 10 pips minimum
      expect(res.effectiveSlPips).toBe(10.0);
      // Cost per unit = 10 * 0.0001 = $0.001. Units = 50 / 0.001 = 50,000 units (0.50 lots)
      expect(res.totalUnits).toBe(50000);
      expect(res.actualMonetaryRisk).toBe(50.0); // Exact budget adherence
    });

    it('strictly avoids overshooting risk budget through downward step normalization', () => {
      const res = LocalRiskEngine.calculatePositionSize(
        RiskCalculationMode.PercentageEquity,
        RiskProfileType.Standard, // 0.50% ($50 budget)
        undefined,
        10000,
        33, // 33 pips SL -> 50 / (33 * 0.0001) = 15,151.5 units
        standardSymbolEURUSD,
        standardConfig
      );

      expect(res.allowed).toBe(true);
      // Raw: 50 / (33 * 0.0001) = 15,151.5 units. Total normalized = 15,000 units.
      // Strict 50:50 split: 15,000 / 2 = 7,500 -> normalized down = 7,000 each.
      // Total units = T1(7,000) + T2(7,000) = 14,000 units
      expect(res.totalUnits).toBe(14000);
      expect(res.ticket1Units).toBe(7000);
      expect(res.ticket2Units).toBe(7000);
      // Actual risk: 14,000 * 33 * 0.0001 = $46.20 <= $50.00 budget
      expect(res.actualMonetaryRisk).toBeLessThanOrEqual(50.0);
      expect(res.actualRiskPct).toBeLessThanOrEqual(0.50);
    });
  });

  describe('3. Broker Minimum Rule & Zero-Bumping Protection', () => {
    it('SKIPS trade if equity is too small for broker min lot without exceeding risk budget', () => {
      // Small account: $100, 0.50% risk = $0.50 budget.
      // EURUSD 25 pips SL -> 0.01 lot (1000 units) risks $2.50 = 2.50% equity (5x budget!)
      const res = LocalRiskEngine.calculatePositionSize(
        RiskCalculationMode.PercentageEquity,
        RiskProfileType.Standard,
        undefined,
        100,
        25,
        standardSymbolEURUSD,
        standardConfig
      );

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('MIN_VOLUME_RISK_EXCEEDED');
      expect(res.totalUnits).toBe(0);
    });

    it('SKIPS trade under Method 2 if volume cannot be split into two equal tickets >= broker min', () => {
      // Account with enough for 1000 units (0.01 lot) total, but 500 units per split is < 1000 min
      const res = LocalRiskEngine.calculatePositionSize(
        RiskCalculationMode.PercentageEquity,
        RiskProfileType.Standard, // $10 budget on $2000 equity
        undefined,
        2000,
        100, // 100 pips SL -> 10 / (100 * 0.0001) = 1000 units (0.01 lot)
        standardSymbolEURUSD,
        standardConfig,
        2.00,
        4.00,
        0.02,
        true // Method 2 active
      );

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('METHOD_2_EQUAL_SPLIT_FAILED');
    });
  });

  describe('4. Maximum Lot Cap & Fixed Lot Mode', () => {
    it('enforces maximum lot cap on large accounts', () => {
      const res = LocalRiskEngine.calculatePositionSize(
        RiskCalculationMode.PercentageEquity,
        RiskProfileType.HighRisk, // 2.00% on $500,000 = $10,000 budget
        undefined,
        500000,
        10, // 10 pips -> 10,000 / 0.001 = 10,000,000 units (100 lots)
        standardSymbolEURUSD,
        standardConfig // maxLotCap = 5.0 lots (500,000 units)
      );

      expect(res.allowed).toBe(true);
      expect(res.totalUnits).toBe(500000); // Clamped to 5.0 lots
      expect(res.ticket1Units).toBe(250000);
      expect(res.ticket2Units).toBe(250000);
    });

    it('supports backward-compatible Fixed Lot mode with safety caps', () => {
      const res = LocalRiskEngine.calculatePositionSize(
        RiskCalculationMode.FixedLot,
        RiskProfileType.Standard,
        undefined,
        10000,
        20,
        standardSymbolEURUSD,
        standardConfig,
        2.00,
        4.00,
        0.04 // 0.04 lots requested
      );

      expect(res.allowed).toBe(true);
      expect(res.totalUnits).toBe(4000); // 0.04 lot
      expect(res.ticket1Units).toBe(2000); // 0.02 lot
      expect(res.ticket2Units).toBe(2000); // 0.02 lot
    });
  });

  describe('5. Account & Portfolio Guards', () => {
    it('blocks new trades when daily loss limit is reached', () => {
      const guardRes = LocalRiskEngine.evaluatePortfolioGuards(
        9650,  // Current equity
        10000, // Daily baseline (Loss: $350 = 3.50% >= 3.00% limit)
        10000, // HWM
        [],
        [],
        new Map([['EURUSD', standardSymbolEURUSD]]),
        standardConfig
      );

      expect(guardRes.allowed).toBe(false);
      expect(guardRes.reason).toContain('DAILY_LOSS_LIMIT_REACHED');
    });

    it('blocks new trades when max account drawdown is reached', () => {
      const guardRes = LocalRiskEngine.evaluatePortfolioGuards(
        11200, // Current equity
        11200, // Daily Baseline (0% daily loss today)
        12000, // High-water mark (Drawdown from peak: $800 / $12,000 = 6.67% >= 6.00% limit)
        [],
        [],
        new Map([['EURUSD', standardSymbolEURUSD]]),
        standardConfig
      );

      expect(guardRes.allowed).toBe(false);
      expect(guardRes.reason).toContain('MAX_DRAWDOWN_LIMIT_REACHED');
    });

    it('enforces total open risk ceiling across open positions and pending orders', () => {
      // 2 open positions risking 1.8% each = 3.6% open risk. Max limit = 4.0%. Remaining = 0.4%
      const positions: PositionRiskState[] = [
        { symbolName: 'EURUSD', volumeUnits: 90000, entryPrice: 1.1000, stopLoss: 1.0980 }, // 20 pips * 90k * 0.0001 = $180 (1.8% of $10k)
        { symbolName: 'EURUSD', volumeUnits: 90000, entryPrice: 1.1000, stopLoss: 1.0980 }  // $180 (1.8% of $10k)
      ];

      const guardRes = LocalRiskEngine.evaluatePortfolioGuards(
        10000,
        10000,
        10000,
        positions,
        ['EURUSD_01', 'EURUSD_02'],
        new Map([['EURUSD', standardSymbolEURUSD]]),
        standardConfig
      );

      expect(guardRes.allowed).toBe(true);
      expect(guardRes.currentOpenRiskPct).toBeCloseTo(3.60, 2);
      expect(guardRes.remainingPortfolioRiskPct).toBeCloseTo(0.40, 2);

      // Sizing with 0.40% remaining budget clamps a 0.50% standard profile to 0.40%
      const sizeRes = LocalRiskEngine.calculatePositionSize(
        RiskCalculationMode.PercentageEquity,
        RiskProfileType.Standard, // Wants 0.50%
        undefined,
        10000,
        20,
        standardSymbolEURUSD,
        standardConfig,
        2.00,
        guardRes.remainingPortfolioRiskPct // 0.40%
      );

      expect(sizeRes.allowed).toBe(true);
      expect(sizeRes.effectiveRiskPct).toBeCloseTo(0.40, 2);
      expect(sizeRes.monetaryRiskBudget).toBeCloseTo(40.0, 1);
    });

    it('handles missing SL with fail-closed conservative distance', () => {
      const positions: PositionRiskState[] = [
        { symbolName: 'EURUSD', volumeUnits: 100000, entryPrice: 1.1000, stopLoss: undefined } // Missing SL
      ];

      const guardRes = LocalRiskEngine.evaluatePortfolioGuards(
        10000,
        10000,
        10000,
        positions,
        ['EURUSD_01'],
        new Map([['EURUSD', standardSymbolEURUSD]]),
        standardConfig
      );

      // 50 pips fail-closed fallback * 100k * 0.0001 = $500 (5.0% of $10k > 4.0% limit)
      expect(guardRes.allowed).toBe(false);
      expect(guardRes.reason).toContain('PORTFOLIO_RISK_CEILING_REACHED');
    });

    it('blocks trades when max concurrent setups limit is reached', () => {
      const guardRes = LocalRiskEngine.evaluatePortfolioGuards(
        10000,
        10000,
        10000,
        [],
        ['EURUSD_01', 'GBPUSD_02', 'USDJPY_03'], // 3 active setups >= max 3
        new Map([['EURUSD', standardSymbolEURUSD]]),
        standardConfig
      );

      expect(guardRes.allowed).toBe(false);
      expect(guardRes.reason).toContain('MAX_CONCURRENT_SETUPS_REACHED');
    });
  });

  describe('6. Server Contracts, Queue Persistence & Propagation', () => {
    it('publishes signals with default recommended and max risk percentages when omitted', () => {
      const sig = publishCopierSignal({
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        stopLoss: 1.0825,
        takeProfit1: 1.0880,
        takeProfit2: 1.0910,
        lotSize: 0.02
      });

      expect(sig.recommendedRiskPct).toBe(0.50);
      expect(sig.maxRiskPct).toBe(2.00);
      expect(sig.id).toBeDefined();
    });

    it('strictly preserves small valid ceilings (0.05%) without bumping to 0.10%', () => {
      const sig = publishCopierSignal({
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        stopLoss: 1.0825,
        takeProfit1: 1.0880,
        takeProfit2: 1.0910,
        lotSize: 0.02,
        recommendedRiskPct: 0.04,
        maxRiskPct: 0.05
      });

      expect(sig.maxRiskPct).toBe(0.05);
      expect(sig.recommendedRiskPct).toBe(0.04);
    });

    it('rejects signals where recommendedRiskPct exceeds maxRiskPct', () => {
      expect(() => {
        publishCopierSignal({
          pair: 'GBP/USD',
          direction: 'SELL',
          entryPrice: 1.2950,
          stopLoss: 1.2980,
          takeProfit1: 1.2910,
          takeProfit2: 1.2870,
          lotSize: 0.02,
          recommendedRiskPct: 2.50,
          maxRiskPct: 1.50
        });
      }).toThrowError(/RECOMMENDED_RISK_EXCEEDS_MAX/);
    });

    it('rejects negative or malformed risk values', () => {
      expect(() => {
        publishCopierSignal({
          pair: 'EUR/USD',
          direction: 'BUY',
          entryPrice: 1.0850,
          stopLoss: 1.0825,
          takeProfit1: 1.0880,
          takeProfit2: 1.0910,
          lotSize: 0.02,
          recommendedRiskPct: -0.5
        });
      }).toThrowError(/MALFORMED_RECOMMENDED_RISK/);

      expect(() => {
        publishCopierSignal({
          pair: 'EUR/USD',
          direction: 'BUY',
          entryPrice: 1.0850,
          stopLoss: 1.0825,
          takeProfit1: 1.0880,
          takeProfit2: 1.0910,
          lotSize: 0.02,
          maxRiskPct: NaN
        });
      }).toThrowError(/MALFORMED_MAX_RISK/);
    });

    it('rejects maxRiskPct exceeding 5.00%', () => {
      expect(() => {
        publishCopierSignal({
          pair: 'XAU/USD',
          direction: 'BUY',
          entryPrice: 2650.0,
          stopLoss: 2640.0,
          takeProfit1: 2665.0,
          takeProfit2: 2680.0,
          lotSize: 0.02,
          maxRiskPct: 25.0
        });
      }).toThrowError(/MALFORMED_MAX_RISK/);
    });

    it('rejects maxRiskPct < 0.01% (e.g. 0.005%) without auto-bumping', () => {
      expect(() => {
        publishCopierSignal({
          pair: 'EUR/USD',
          direction: 'BUY',
          entryPrice: 1.0850,
          stopLoss: 1.0825,
          takeProfit1: 1.0880,
          takeProfit2: 1.0910,
          lotSize: 0.02,
          maxRiskPct: 0.005
        });
      }).toThrowError(/MALFORMED_MAX_RISK/);
    });

    it('strictly preserves small valid custom ceilings (e.g. 0.05%) without bumping to 0.10% or rounding', () => {
      const sig = publishCopierSignal({
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        stopLoss: 1.0825,
        takeProfit1: 1.0880,
        takeProfit2: 1.0910,
        lotSize: 0.02,
        recommendedRiskPct: 0.02,
        maxRiskPct: 0.05
      });
      expect(sig.maxRiskPct).toBe(0.05);
      expect(sig.recommendedRiskPct).toBe(0.02);
    });
  });

  describe('7. Telegram Alert Formatting (EN & MS)', () => {
    const service = TelegramNotificationService.getInstance();

    it('formats English trade alert with dynamic equity risk and local engine note', () => {
      const payload: TradeBroadcastPayload = {
        pair: 'EUR/USD',
        direction: 'BUY',
        timeframe: 'M15',
        entryPrice: 1.08500,
        stopLoss: 1.08250,
        takeProfit1: 1.08800,
        takeProfit2: 1.09100,
        confidence: 94,
        reasons: ['H1 Order Block Retest', 'London Liquidity Sweep'],
        recommendedRiskPct: 0.50,
        maxRiskPct: 2.00,
        tier: 'VIP',
        status: 'ENTRY_DISPATCHED'
      };

      const messageEn = service.formatTradeAlert(payload, 'en');
      expect(messageEn).toContain('Recommended Risk:* `0.5% of Equity`');
      expect(messageEn).toContain('Maximum Permitted Risk:* `2%`');
      expect(messageEn).toContain('Local Risk Engine:');
      expect(messageEn).toContain('cBot auto-calculates lot volume');
    });

    it('unconditionally renders risk-normalized messaging for legacy signals without risk fields', () => {
      const legacyPayload: TradeBroadcastPayload = {
        pair: 'EUR/USD',
        direction: 'BUY',
        timeframe: 'M15',
        entryPrice: 1.08500,
        stopLoss: 1.08250,
        takeProfit1: 1.08800,
        takeProfit2: 1.09100,
        confidence: 94,
        reasons: ['Breakout'],
        lotSize: 0.05,
        tier: 'VIP',
        status: 'ENTRY_DISPATCHED'
      };

      const messageEn = service.formatTradeAlert(legacyPayload, 'en');
      expect(messageEn).toContain('Recommended Risk:* `0.5% of Equity` _(Master Ref: 0.05 Lots)_');
      expect(messageEn).toContain('Maximum Permitted Risk:* `2%`');
      expect(messageEn).toContain('Local Risk Engine:');
    });

    it('formats Bahasa Melayu trade alert with dynamic equity risk and local engine note', () => {
      const payload: TradeBroadcastPayload = {
        pair: 'EUR/USD',
        direction: 'BUY',
        timeframe: 'M15',
        entryPrice: 1.08500,
        stopLoss: 1.08250,
        takeProfit1: 1.08800,
        takeProfit2: 1.09100,
        confidence: 94,
        reasons: ['H1 Order Block Retest', 'London Liquidity Sweep'],
        recommendedRiskPct: 0.50,
        maxRiskPct: 2.00,
        tier: 'VIP',
        status: 'ENTRY_DISPATCHED'
      };

      const messageMs = service.formatTradeAlert(payload, 'ms');
      expect(messageMs).toContain('Cadangan Risiko:* `0.5% daripada Ekuiti`');
      expect(messageMs).toContain('Had Maksimum Risiko Dibenarkan:* `2%`');
      expect(messageMs).toContain('Enjin Risiko Tempatan:');
      expect(messageMs).toContain('cBot mengira volum lot secara automatik');
    });
  });
});
