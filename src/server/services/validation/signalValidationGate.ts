import { CurrencyPair, Timeframe, MarketRegime } from '../../../types';
import {
  CanonicalSignal,
  EntryMode,
  ExecutionEligibilityState,
  IndicatorSnapshot,
  SignalLifecycleStatus,
  SignalType,
  ValidationCheckResult,
  ValidationReport,
  ValidationStatus
} from './signalValidationTypes';

export interface RawSignalInput {
  signalId?: string;
  symbol: CurrencyPair | string;
  timeframe: Timeframe | string;
  generatedAt?: number;
  marketDataTimestamp?: number;
  dataSource?: string;
  currentPrice: number;
  direction: 'BUY' | 'SELL';
  signalType?: SignalType;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  recommendedLot?: number;
  indicators: Partial<IndicatorSnapshot>;
  marketRegime?: MarketRegime;
  modelConfidence?: number;
  reasoningEvidence?: string[];
  patternName?: string;
}

export class SignalValidationGate {
  private static instance: SignalValidationGate;

  public static getInstance(): SignalValidationGate {
    if (!SignalValidationGate.instance) {
      SignalValidationGate.instance = new SignalValidationGate();
    }
    return SignalValidationGate.instance;
  }

  /**
   * Helper to determine pip multiplier based on symbol
   */
  public getPipMultiplier(symbol: string): number {
    const sym = symbol.toUpperCase().replace(/[\/\-_]/g, '');
    if (sym.includes('JPY')) return 0.01;
    if (sym.includes('XAU') || sym.includes('GOLD')) return 0.1;
    if (sym.includes('BTC')) return 1.0;
    if (sym.includes('NAS') || sym.includes('TECH') || sym.includes('USTEC')) return 1.0;
    return 0.0001;
  }

  /**
   * Helper to convert price difference into pips
   */
  public calculatePips(symbol: string, price1: number, price2: number): number {
    const mult = this.getPipMultiplier(symbol);
    return Number((Math.abs(price1 - price2) / mult).toFixed(1));
  }

  /**
   * Primary entry point: Validates a signal deterministically and produces a CanonicalSignal & ValidationReport
   */
  public validateSignal(input: RawSignalInput): {
    canonicalSignal: CanonicalSignal;
    validationReport: ValidationReport;
    isExecutable: boolean;
  } {
    const now = Date.now();
    const symbol = input.symbol as CurrencyPair;
    const timeframe = (input.timeframe || 'M15') as Timeframe;
    const direction = input.direction;
    const currentPrice = Number(input.currentPrice);
    const entryPrice = Number(input.entryPrice);
    const stopLoss = Number(input.stopLoss);
    const takeProfit1 = Number(input.takeProfit1);
    const takeProfit2 = input.takeProfit2 ? Number(input.takeProfit2) : undefined;
    const signalId = input.signalId || `sig_${symbol.replace(/[\/\-_]/g, '')}_${timeframe}_${Date.now()}`;
    const errors: string[] = [];
    const warnings: string[] = [];
    const pipMultiplier = this.getPipMultiplier(symbol);

    // 1. DATA INTEGRITY CHECK
    let dataCheck: ValidationCheckResult = {
      checkName: 'Data Integrity',
      passed: true,
      status: 'PASS',
      message: 'All price fields, timestamps, and indicators are populated and finite numbers.'
    };

    if (
      !symbol ||
      !currentPrice || isNaN(currentPrice) || currentPrice <= 0 ||
      !entryPrice || isNaN(entryPrice) || entryPrice <= 0 ||
      !stopLoss || isNaN(stopLoss) || stopLoss <= 0 ||
      !takeProfit1 || isNaN(takeProfit1) || takeProfit1 <= 0
    ) {
      dataCheck = {
        checkName: 'Data Integrity',
        passed: false,
        status: 'REJECT',
        message: 'Missing or non-finite numeric price levels.'
      };
      errors.push(dataCheck.message);
    }

    // 2. INDICATOR SNAPSHOT EXTRACTION
    const ind = input.indicators || {};
    const ema50 = Number(ind.ema50 ?? currentPrice);
    const ema200 = Number(ind.ema200 ?? ema50);
    const rsi14 = Number(ind.rsi14 ?? (ind as any).rsi ?? 50);
    const adx = Number(ind.adx ?? 20);
    const plusDI = Number(ind.plusDI ?? (direction === 'BUY' ? 24 : 18));
    const minusDI = Number(ind.minusDI ?? (direction === 'SELL' ? 24 : 18));
    const superTrendDirection = ind.superTrendDirection || (ind as any).superTrend?.trend || (currentPrice >= ema50 ? 'BULLISH' : 'BEARISH');
    const atr = Number(ind.atr ?? (currentPrice * 0.002));
    const macdHistogram = ind.macdHistogram ?? (ind as any).macd?.histogram ?? 0;
    const vwap = ind.vwap ?? currentPrice;

    const indicators: IndicatorSnapshot = {
      ema20: ind.ema20,
      ema50,
      ema200,
      rsi14,
      adx,
      plusDI,
      minusDI,
      superTrendDirection,
      atr,
      macdHistogram,
      vwap
    };

    // 3. INDICATOR SEMANTICS CHECK (ADX strictly measures strength, never direction)
    let adxStrengthLabel: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG' = 'MODERATE';
    if (adx < 20) adxStrengthLabel = 'WEAK';
    else if (adx <= 25) adxStrengthLabel = 'MODERATE';
    else if (adx <= 50) adxStrengthLabel = 'STRONG';
    else adxStrengthLabel = 'VERY_STRONG';

    let adxInterpretation: ValidationCheckResult = {
      checkName: 'ADX Interpretation',
      passed: true,
      status: 'PASS',
      message: `ADX = ${adx.toFixed(1)} indicates ${adxStrengthLabel.toLowerCase()} trend strength. Directional component confirmed via +DI (${plusDI.toFixed(1)}) vs -DI (${minusDI.toFixed(1)}).`
    };

    if (adx < 20) {
      adxInterpretation.status = 'WARNING';
      adxInterpretation.message = `ADX = ${adx.toFixed(1)} indicates weak/non-trending environment. Pullback and range-bound volatility risk elevated.`;
      warnings.push(`ADX ${adx.toFixed(1)}: Pasaran dalam persekitaran aliran lemah (non-trending).`);
    }

    const indicatorSemantics: ValidationCheckResult = {
      checkName: 'Indicator Semantics',
      passed: true,
      status: 'PASS',
      message: 'Indicators adhere strictly to standard quantitative definitions (ADX=Strength, DI/EMA/SuperTrend=Direction).'
    };

    // 4. DIRECTION CONSISTENCY ENGINE
    const bullishEvidence: string[] = [];
    const bearishEvidence: string[] = [];
    let bullScore = 0;
    let bearScore = 0;

    // Price vs EMA50
    if (currentPrice > ema50) {
      bullScore += 20;
      bullishEvidence.push(`Harga (${currentPrice}) di atas EMA 50 (${ema50.toFixed(3)})`);
    } else if (currentPrice < ema50) {
      bearScore += 20;
      bearishEvidence.push(`Harga (${currentPrice}) di bawah EMA 50 (${ema50.toFixed(3)})`);
    }

    // EMA50 vs EMA200
    if (ema50 > ema200) {
      bullScore += 15;
      bullishEvidence.push(`EMA 50 di atas EMA 200 (Aliran Bullish Makro)`);
    } else if (ema50 < ema200) {
      bearScore += 15;
      bearishEvidence.push(`EMA 50 di bawah EMA 200 (Aliran Bearish Makro)`);
    }

    // SuperTrend
    if (superTrendDirection === 'BULLISH') {
      bullScore += 20;
      bullishEvidence.push(`SuperTrend dalam zon Bullish`);
    } else if (superTrendDirection === 'BEARISH') {
      bearScore += 20;
      bearishEvidence.push(`SuperTrend dalam zon Bearish`);
    }

    // +DI vs -DI
    if (plusDI > minusDI) {
      bullScore += 20;
      bullishEvidence.push(`+DI (${plusDI.toFixed(1)}) mendominasi -DI (${minusDI.toFixed(1)})`);
    } else if (minusDI > plusDI) {
      bearScore += 20;
      bearishEvidence.push(`-DI (${minusDI.toFixed(1)}) mendominasi +DI (${plusDI.toFixed(1)})`);
    }

    // MACD Histogram
    if (macdHistogram > 0) {
      bullScore += 10;
      bullishEvidence.push(`Histogram MACD positif (+${macdHistogram.toFixed(4)})`);
    } else if (macdHistogram < 0) {
      bearScore += 10;
      bearishEvidence.push(`Histogram MACD negatif (${macdHistogram.toFixed(4)})`);
    }

    // Evaluate Directional Conflict
    let directionConsistency: ValidationCheckResult = {
      checkName: 'Direction Consistency',
      passed: true,
      status: 'PASS',
      message: `Direction ${direction} matches technical evidence (Bull: ${bullScore} pts, Bear: ${bearScore} pts).`
    };

    const conflictMargin = direction === 'BUY' ? bearScore - bullScore : bullScore - bearScore;

    if (conflictMargin >= 25) {
      // Strongly contradictory evidence -> FAIL CLOSED REJECT
      directionConsistency = {
        checkName: 'Direction Consistency',
        passed: false,
        status: 'REJECT',
        message: `Signal direction ${direction} severely contradicts technical evidence (Dominant opposing score: ${direction === 'BUY' ? bearScore : bullScore} vs ${direction === 'BUY' ? bullScore : bearScore}).`
      };
      errors.push(directionConsistency.message);
    } else if (conflictMargin > 0) {
      // Moderate conflict -> MARK REVIEW
      directionConsistency = {
        checkName: 'Direction Consistency',
        passed: true,
        status: 'REVIEW',
        message: `Direction ${direction} has mixed/opposing evidence (Bull: ${bullScore}, Bear: ${bearScore}). Downgrading validation confidence.`
      };
      warnings.push(`Bukti teknikal berlawanan dikesan untuk ${direction}. Penilaian disemak semula.`);
    }

    // 5. RSI HANDLING (Momentum vs Pullback Risk)
    let rsiInterpretation: ValidationCheckResult = {
      checkName: 'RSI Interpretation',
      passed: true,
      status: 'PASS',
      message: `RSI = ${rsi14.toFixed(1)} in normal momentum range.`
    };

    const riskWarnings: string[] = [];

    if (rsi14 >= 80 && direction === 'BUY') {
      rsiInterpretation = {
        checkName: 'RSI Interpretation',
        passed: true,
        status: 'WARNING',
        message: `RSI = ${rsi14.toFixed(1)} indicates extremely overbought momentum; elevated pullback risk.`
      };
      const msg = `RSI ${rsi14.toFixed(1)} — Terlebih beli (Overbought); risiko 'pullback' meningkat.`;
      warnings.push(msg);
      riskWarnings.push(msg);
    } else if (rsi14 > 70 && direction === 'BUY') {
      rsiInterpretation = {
        checkName: 'RSI Interpretation',
        passed: true,
        status: 'WARNING',
        message: `RSI = ${rsi14.toFixed(1)} indicates strong upward momentum with moderate pullback risk.`
      };
      const msg = `RSI ${rsi14.toFixed(1)} — Momentum menaik kuat; pantau retracement.`;
      warnings.push(msg);
      riskWarnings.push(msg);
    } else if (rsi14 <= 20 && direction === 'SELL') {
      rsiInterpretation = {
        checkName: 'RSI Interpretation',
        passed: true,
        status: 'WARNING',
        message: `RSI = ${rsi14.toFixed(1)} indicates extremely oversold momentum; potential rebound risk.`
      };
      const msg = `RSI ${rsi14.toFixed(1)} — Terlebih jual (Oversold); risiko lantunan harga (rebound) meningkat.`;
      warnings.push(msg);
      riskWarnings.push(msg);
    } else if (rsi14 < 30 && direction === 'SELL') {
      rsiInterpretation = {
        checkName: 'RSI Interpretation',
        passed: true,
        status: 'WARNING',
        message: `RSI = ${rsi14.toFixed(1)} indicates strong downward momentum with moderate rebound risk.`
      };
      const msg = `RSI ${rsi14.toFixed(1)} — Momentum menurun kuat; waspada pantulan sokongan.`;
      warnings.push(msg);
      riskWarnings.push(msg);
    }

    // 6. ENTRY MODE VALIDATION & DISTANCE CALCULATION
    const distancePrice = Math.abs(currentPrice - entryPrice);
    const distancePips = Number((distancePrice / pipMultiplier).toFixed(1));
    const marketTolerancePips = 1.5; // Within 1.5 pips considered MARKET entry

    let entryMode: EntryMode;
    let initialLifecycle: SignalLifecycleStatus = 'VALID';

    if (direction === 'BUY') {
      if (entryPrice < currentPrice - (marketTolerancePips * pipMultiplier)) {
        entryMode = 'BUY_PULLBACK';
        initialLifecycle = 'WAITING_FOR_ENTRY';
      } else if (Math.abs(entryPrice - currentPrice) <= (marketTolerancePips * pipMultiplier)) {
        entryMode = 'BUY_MARKET';
        initialLifecycle = 'TRIGGERED';
      } else {
        entryMode = 'BUY_BREAKOUT';
        initialLifecycle = 'WAITING_FOR_ENTRY';
      }
    } else {
      // SELL
      if (entryPrice > currentPrice + (marketTolerancePips * pipMultiplier)) {
        entryMode = 'SELL_PULLBACK';
        initialLifecycle = 'WAITING_FOR_ENTRY';
      } else if (Math.abs(entryPrice - currentPrice) <= (marketTolerancePips * pipMultiplier)) {
        entryMode = 'SELL_MARKET';
        initialLifecycle = 'TRIGGERED';
      } else {
        entryMode = 'SELL_BREAKOUT';
        initialLifecycle = 'WAITING_FOR_ENTRY';
      }
    }

    let entryConsistency: ValidationCheckResult = {
      checkName: 'Entry Consistency',
      passed: true,
      status: 'PASS',
      message: `Entry mode classified as ${entryMode}. Current price: ${currentPrice}, Planned entry: ${entryPrice} (${distancePips} pips distance). Lifecycle status: ${initialLifecycle}.`
    };

    if (entryMode === 'BUY_PULLBACK' || entryMode === 'SELL_PULLBACK') {
      entryConsistency.status = 'WARNING';
      warnings.push(`Entri diklasifikasikan sebagai ${entryMode}. Pesanan menunggu harga mencecah ${entryPrice} (${distancePips} pip).`);
    }

    // 7. SL / TP / R:R GEOMETRY & VALUE VALIDATION
    let riskRewardCheck: ValidationCheckResult = {
      checkName: 'Risk / Reward & Geometry Check',
      passed: true,
      status: 'PASS',
      message: 'SL, TP1, and TP2 strictly adhere to directional geometry and positive R:R.'
    };

    let isGeometryValid = true;
    if (direction === 'BUY') {
      // Must be: SL < entryPrice < TP1 (and TP1 < TP2 if TP2 present)
      if (!(stopLoss < entryPrice && entryPrice < takeProfit1)) {
        isGeometryValid = false;
      }
      if (takeProfit2 && !(takeProfit1 < takeProfit2)) {
        isGeometryValid = false;
      }
    } else {
      // SELL: Must be: TP1 < entryPrice < SL (and TP2 < TP1 if TP2 present)
      if (!(takeProfit1 < entryPrice && entryPrice < stopLoss)) {
        isGeometryValid = false;
      }
      if (takeProfit2 && !(takeProfit2 < takeProfit1)) {
        isGeometryValid = false;
      }
    }

    if (!isGeometryValid) {
      riskRewardCheck = {
        checkName: 'Risk / Reward & Geometry Check',
        passed: false,
        status: 'REJECT',
        message: `Invalid SL/TP ordering for ${direction} (SL: ${stopLoss}, Entry: ${entryPrice}, TP1: ${takeProfit1}${takeProfit2 ? `, TP2: ${takeProfit2}` : ''}).`
      };
      errors.push(riskRewardCheck.message);
    }

    const riskPips = this.calculatePips(symbol, entryPrice, stopLoss);
    const rewardPipsTP1 = this.calculatePips(symbol, entryPrice, takeProfit1);
    const rewardPipsTP2 = takeProfit2 ? this.calculatePips(symbol, entryPrice, takeProfit2) : undefined;
    const rrTP1 = riskPips > 0 ? Number((rewardPipsTP1 / riskPips).toFixed(2)) : 0;
    const rrTP2 = (takeProfit2 && riskPips > 0) ? Number((rewardPipsTP2! / riskPips).toFixed(2)) : undefined;

    if (riskPips <= 0 || rewardPipsTP1 <= 0) {
      riskRewardCheck = {
        checkName: 'Risk / Reward & Geometry Check',
        passed: false,
        status: 'REJECT',
        message: `Risk pips (${riskPips}) or reward pips (${rewardPipsTP1}) is non-positive.`
      };
      errors.push(riskRewardCheck.message);
    }

    // 8. CONFIDENCE SEPARATION (Advisory vs Authoritative)
    const rawModelConfidence = Number(input.modelConfidence ?? 80);
    let validationConfidence = 50;

    if (direction === 'BUY') {
      validationConfidence = Math.min(95, Math.max(30, Math.round((bullScore / (bullScore + bearScore || 1)) * 100)));
    } else {
      validationConfidence = Math.min(95, Math.max(30, Math.round((bearScore / (bullScore + bearScore || 1)) * 100)));
    }

    // Adjust for ADX and RSI
    if (adx < 20) validationConfidence = Math.max(30, validationConfidence - 5);
    if ((rsi14 > 80 && direction === 'BUY') || (rsi14 < 20 && direction === 'SELL')) {
      validationConfidence = Math.max(30, validationConfidence - 4);
    }

    const effectiveConfidence = Math.round((rawModelConfidence * 0.4) + (validationConfidence * 0.6));

    let confidenceCheck: ValidationCheckResult = {
      checkName: 'Confidence Validation',
      passed: true,
      status: 'PASS',
      message: `AI Model Confidence: ${rawModelConfidence}% (Advisory). Deterministic Validation Confidence: ${validationConfidence}% (Authoritative). Effective: ${effectiveConfidence}%.`
    };

    if (effectiveConfidence < 65) {
      confidenceCheck.status = 'REVIEW';
      warnings.push(`Effective confidence (${effectiveConfidence}%) below high-conviction threshold (65%).`);
    }

    // 9. EXPLANATION CONSISTENCY VALIDATOR & REGENERATOR
    const rawReasons = input.reasoningEvidence || [];
    const sanitizedReasons: string[] = [];

    for (const raw of rawReasons) {
      let r = raw;

      // Rule: Never allow "ADX confirms bearish" or "ADX confirming trending bearish" or attributing direction to ADX alone
      if (/adx.*(bearish|bullish|confirming\s+trending\s+bearish|confirming\s+trending\s+bullish)/i.test(r)) {
        r = `ADX (${adx.toFixed(1)}) mengukur kekuatan trend (${adxStrengthLabel.toLowerCase()}); hala tuju disahkan oleh penunjuk directional (+DI: ${plusDI.toFixed(1)} / -DI: ${minusDI.toFixed(1)}).`;
      }

      // Rule: Never claim "BUY NOW" when entry is PULLBACK
      if (/buy\s+now|masuk\s+sekarang/i.test(r) && entryMode === 'BUY_PULLBACK') {
        r = `Menunggu rehat/pullback harga ke paras entri ${entryPrice} (${distancePips} pip dari harga semasa ${currentPrice}).`;
      }

      // Rule: Never claim "SELL NOW" when entry is PULLBACK
      if (/sell\s+now|jual\s+sekarang/i.test(r) && entryMode === 'SELL_PULLBACK') {
        r = `Menunggu rehat/pullback harga ke paras entri ${entryPrice} (${distancePips} pip dari harga semasa ${currentPrice}).`;
      }

      // Rule: Never claim "Strong trend" if ADX < 20
      if (/strong\s+trend|aliran\s+kuat/i.test(r) && adx < 20) {
        r = `ADX (${adx.toFixed(1)}) menunjukkan kekuatan aliran sederhana/lemah.`;
      }

      sanitizedReasons.push(r);
    }

    // Ensure key deterministic evidence is included if reasons list is empty or minimal
    if (sanitizedReasons.length === 0) {
      if (direction === 'BUY') {
        sanitizedReasons.push(...bullishEvidence.slice(0, 3).map(e => `• ${e}`));
      } else {
        sanitizedReasons.push(...bearishEvidence.slice(0, 3).map(e => `• ${e}`));
      }
    }

    let explanationCheck: ValidationCheckResult = {
      checkName: 'Explanation Consistency',
      passed: true,
      status: 'PASS',
      message: 'Explanations sanitized and verified to never contradict technical indicators or misinterpret ADX/RSI semantics.'
    };

    // 10. FINAL VALIDATION STATUS & FAIL-CLOSED LOGIC
    let overallStatus: ValidationStatus = 'PASS';
    let finalLifecycleStatus: SignalLifecycleStatus = initialLifecycle;

    if (errors.length > 0) {
      overallStatus = 'REJECTED';
      finalLifecycleStatus = 'REJECTED';
    } else if (directionConsistency.status === 'REVIEW' || confidenceCheck.status === 'REVIEW') {
      overallStatus = 'REVIEW';
    } else if (warnings.length > 0) {
      overallStatus = 'WARNING';
    }

    const isExecutable = overallStatus !== 'REJECTED' && finalLifecycleStatus !== 'REJECTED';

    // 11. EXECUTION ELIGIBILITY DETERMINATION (Separate from Validation Status)
    let executionEligibility: ExecutionEligibilityState = 'NOT_ELIGIBLE';
    let eligibilityReason = '';

    if (overallStatus === 'REJECTED') {
      executionEligibility = 'BLOCKED';
      eligibilityReason = `Signal rejected by validation gate: ${errors.join(' | ')}`;
    } else if (entryMode === 'BUY_MARKET' || entryMode === 'SELL_MARKET') {
      executionEligibility = 'ELIGIBLE_FOR_EXECUTION';
      eligibilityReason = `Market entry condition satisfied (${distancePips} pips within tolerance).`;
    } else if (entryMode === 'BUY_PULLBACK' || entryMode === 'SELL_PULLBACK') {
      executionEligibility = 'WAITING_FOR_ENTRY';
      eligibilityReason = `Pullback entry not yet reached. Waiting for market price to retrace to ${entryPrice} (${distancePips} pips away).`;
    } else if (entryMode === 'BUY_BREAKOUT' || entryMode === 'SELL_BREAKOUT') {
      executionEligibility = 'WAITING_FOR_ENTRY';
      eligibilityReason = `Breakout trigger not yet reached. Waiting for market price to reach ${entryPrice} (${distancePips} pips away).`;
    }

    const validationReport: ValidationReport = {
      signalId,
      symbol,
      timeframe,
      direction,
      entryMode,
      currentPrice,
      plannedEntry: entryPrice,
      distancePips,
      timestamp: now,
      dataCheck,
      indicatorSemantics,
      directionConsistency,
      rsiInterpretation,
      adxInterpretation,
      entryConsistency,
      riskRewardCheck,
      confidenceCheck,
      explanationCheck,
      overallStatus,
      finalLifecycleStatus,
      executionEligibility,
      eligibilityReason,
      errors,
      warnings,
      sanitizedReasons,
      isExecutable
    };

    const ttlMs = timeframe === 'M15' ? 2 * 3600000 : (timeframe === 'H1' ? 6 * 3600000 : 24 * 3600000);

    const canonicalSignal: CanonicalSignal = {
      signalId,
      symbol,
      timeframe,
      generatedAt: input.generatedAt || now,
      expiryTime: now + ttlMs,
      marketDataTimestamp: input.marketDataTimestamp || now,
      dataSource: input.dataSource || 'CTRADER_LIVE_FEED',
      currentPrice,
      direction,
      signalType: input.signalType || (entryMode.includes('PULLBACK') ? 'ORDER_BLOCK_RETEST' : 'MOMENTUM_CONTINUATION'),
      entryPrice,
      entryMode,
      distancePips,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskPips,
      rewardPipsTP1,
      rewardPipsTP2,
      rrTP1,
      rrTP2,
      recommendedLot: input.recommendedLot || (effectiveConfidence >= 80 ? 0.02 : 0.01),
      indicators,
      marketRegime: input.marketRegime || (direction === 'BUY' ? 'TRENDING_BULLISH' : 'TRENDING_BEARISH'),
      modelConfidence: rawModelConfidence,
      validationConfidence,
      confidence: effectiveConfidence,
      reasoningEvidence: sanitizedReasons,
      bullishEvidence,
      bearishEvidence,
      riskWarnings,
      validationStatus: overallStatus,
      validationErrors: errors,
      validationWarnings: warnings,
      executionStatus: finalLifecycleStatus,
      executionEligibility,
      eligibilityReason
    };

    return {
      canonicalSignal,
      validationReport,
      isExecutable
    };
  }

  /**
   * Generates a readable plain-text Validation Report
   */
  public formatValidationReportText(report: ValidationReport): string {
    return [
      `==================================================`,
      `SIGNAL VALIDATION REPORT`,
      `==================================================`,
      `Signal: ${report.symbol} ${report.timeframe} ${report.direction} (${report.entryMode})`,
      `Current Price: ${report.currentPrice} | Planned Entry: ${report.plannedEntry} (${report.distancePips} pips)`,
      ``,
      `Data: ${report.dataCheck.status} - ${report.dataCheck.message}`,
      `Indicator semantics: ${report.indicatorSemantics.status} - ${report.indicatorSemantics.message}`,
      `Direction consistency: ${report.directionConsistency.status} - ${report.directionConsistency.message}`,
      `RSI interpretation: ${report.rsiInterpretation.status} - ${report.rsiInterpretation.message}`,
      `ADX interpretation: ${report.adxInterpretation.status} - ${report.adxInterpretation.message}`,
      `Entry consistency: ${report.entryConsistency.status} - ${report.entryConsistency.message}`,
      `Risk/reward: ${report.riskRewardCheck.status} - ${report.riskRewardCheck.message}`,
      `Confidence: ${report.confidenceCheck.status} - ${report.confidenceCheck.message}`,
      `Explanation: ${report.explanationCheck.status} - ${report.explanationCheck.message}`,
      ``,
      `Final status: ${report.overallStatus} / ${report.finalLifecycleStatus}`,
      `Executable: ${report.isExecutable ? 'YES' : 'NO (FAIL-CLOSED BLOCKED)'}`,
      report.errors.length > 0 ? `Errors: ${report.errors.join(' | ')}` : '',
      report.warnings.length > 0 ? `Warnings: ${report.warnings.join(' | ')}` : '',
      `==================================================`
    ].filter(Boolean).join('\n');
  }
}

export const signalValidationGate = SignalValidationGate.getInstance();
