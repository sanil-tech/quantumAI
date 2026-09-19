import { CurrencyPair, Timeframe } from '../../../types';
import {
  CanonicalSignal,
  EntryMode,
  ExecutionEligibilityState,
  SignalLifecycleStatus,
  ValidationStatus
} from './signalValidationTypes';
import { signalValidationGate } from './signalValidationGate';

export interface LiveMarketContext {
  currentPrice: number;
  bidPrice?: number;
  askPrice?: number;
  spreadPips?: number;
  marketDataTimestamp?: number;
  freshIndicators?: any;
  accountState?: {
    isAutoEnabled: boolean;
    freeMargin?: number;
    openPositionsCount?: number;
    maxConcurrentOrders?: number;
  };
}

export interface ExecutionEligibilityEvaluation {
  signalId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryMode: EntryMode;
  currentPrice: number;
  plannedEntry: number;
  distancePips: number;
  executionEligibility: ExecutionEligibilityState;
  decision: string;
  isMarketExecutable: boolean;
  isPendingLimitEligible: boolean;
  spreadPips: number;
  signalAgeMs: number;
  revalidationDetails?: any;
}

export interface ExecutionGateLogData {
  signalId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryMode: EntryMode;
  currentPrice: number;
  plannedEntry: number;
  distancePips?: number;
  validationStatus: ValidationStatus;
  executionEligibility: ExecutionEligibilityState;
  validationConfidence: number;
  spreadPips?: number;
  signalAgeMs?: number;
  rrRatio?: string;
  riskChecksPassed?: boolean;
  decision: string;
  brokerOrderAction: 'CALLED' | 'NOT_CALLED' | 'LIMIT_PLACED';
}

export class ExecutionEligibilityGate {
  private static instance: ExecutionEligibilityGate;
  private executedSignalLedger: Map<string, { executedAt: number; brokerOrderId?: string }> = new Map();
  private inFlightExecutionLocks: Set<string> = new Set();

  public static getInstance(): ExecutionEligibilityGate {
    if (!ExecutionEligibilityGate.instance) {
      ExecutionEligibilityGate.instance = new ExecutionEligibilityGate();
    }
    return ExecutionEligibilityGate.instance;
  }

  /**
   * Maximum timeframe TTL before signal is strictly expired
   */
  public getTimeframeTtlMs(timeframe: string): number {
    switch (timeframe) {
      case 'M1':
      case 'M5':
        return 30 * 60 * 1000; // 30 mins
      case 'M15':
        return 2 * 60 * 60 * 1000; // 2 hours
      case 'H1':
        return 6 * 60 * 60 * 1000; // 6 hours
      case 'H4':
        return 24 * 60 * 60 * 1000; // 24 hours
      default:
        return 2 * 60 * 60 * 1000;
    }
  }

  /**
   * Maximum acceptable spread in pips per asset class
   */
  public getMaxSpreadPips(symbol: string): number {
    const sym = symbol.toUpperCase().replace(/[\/\-_]/g, '');
    if (sym.includes('XAU') || sym.includes('GOLD')) return 45.0; // 45 pips on gold ($4.50)
    if (sym.includes('JPY')) return 3.5;
    if (sym.includes('BTC')) return 200.0;
    if (sym.includes('NAS')) return 15.0;
    return 2.5; // 2.5 pips for major FX
  }

  /**
   * Configured trigger tolerance for market execution eligibility (in pips)
   */
  public getExecutionTolerancePips(symbol: string): number {
    const sym = symbol.toUpperCase().replace(/[\/\-_]/g, '');
    if (sym.includes('XAU') || sym.includes('GOLD')) return 5.0; // $0.50 on Gold
    if (sym.includes('JPY')) return 1.5;
    return 1.2; // 1.2 pips on standard FX
  }

  /**
   * Deterministically evaluates whether a signal is eligible for broker execution
   */
  public evaluateEligibility(
    signal: CanonicalSignal,
    marketContext: LiveMarketContext
  ): ExecutionEligibilityEvaluation {
    const now = Date.now();
    const symbol = signal.symbol;
    const currentPrice = marketContext.currentPrice || signal.currentPrice;
    const plannedEntry = signal.entryPrice;
    const pipMultiplier = signalValidationGate.getPipMultiplier(symbol);
    const distancePrice = Math.abs(currentPrice - plannedEntry);
    const distancePips = Number((distancePrice / pipMultiplier).toFixed(1));
    const signalAgeMs = now - (signal.generatedAt || now);
    const ttlMs = this.getTimeframeTtlMs(signal.timeframe);
    const spreadPips = marketContext.spreadPips ?? 1.2;
    const tolerancePips = this.getExecutionTolerancePips(symbol);

    // 1. Idempotency Check (One Signal Trigger -> Maximum One Execution)
    if (this.executedSignalLedger.has(signal.signalId)) {
      const execRecord = this.executedSignalLedger.get(signal.signalId)!;
      return {
        signalId: signal.signalId,
        symbol,
        direction: signal.direction,
        entryMode: signal.entryMode,
        currentPrice,
        plannedEntry,
        distancePips,
        executionEligibility: 'EXECUTED',
        decision: `BLOCKED — ALREADY EXECUTED (Broker Order: ${execRecord.brokerOrderId || 'CONFIRMED'})`,
        isMarketExecutable: false,
        isPendingLimitEligible: false,
        spreadPips,
        signalAgeMs
      };
    }

    // 2. Expiry Check
    if (signalAgeMs > ttlMs || (signal.expiryTime && now > signal.expiryTime)) {
      return {
        signalId: signal.signalId,
        symbol,
        direction: signal.direction,
        entryMode: signal.entryMode,
        currentPrice,
        plannedEntry,
        distancePips,
        executionEligibility: 'EXPIRED',
        decision: `BLOCKED — SIGNAL EXPIRED (Age ${Math.round(signalAgeMs / 60000)}m > TTL ${Math.round(ttlMs / 60000)}m)`,
        isMarketExecutable: false,
        isPendingLimitEligible: false,
        spreadPips,
        signalAgeMs
      };
    }

    // 3. Technical Validation Status Check (Fail-closed)
    if (signal.validationStatus === 'REJECTED' || (signal.validationErrors && signal.validationErrors.length > 0)) {
      return {
        signalId: signal.signalId,
        symbol,
        direction: signal.direction,
        entryMode: signal.entryMode,
        currentPrice,
        plannedEntry,
        distancePips,
        executionEligibility: 'BLOCKED',
        decision: `BLOCKED — VALIDATION FAILED (${signal.validationErrors?.join(' | ') || 'Signal rejected'})`,
        isMarketExecutable: false,
        isPendingLimitEligible: false,
        spreadPips,
        signalAgeMs
      };
    }

    // 4. Spread Check
    const maxSpread = this.getMaxSpreadPips(symbol);
    if (spreadPips > maxSpread) {
      return {
        signalId: signal.signalId,
        symbol,
        direction: signal.direction,
        entryMode: signal.entryMode,
        currentPrice,
        plannedEntry,
        distancePips,
        executionEligibility: 'BLOCKED',
        decision: `BLOCKED — SPREAD TOO WIDE (${spreadPips.toFixed(1)} pips > Max ${maxSpread.toFixed(1)} pips)`,
        isMarketExecutable: false,
        isPendingLimitEligible: false,
        spreadPips,
        signalAgeMs
      };
    }

    // 5. Entry Mode & Price Condition Check
    const isBuy = signal.direction === 'BUY';
    const isSell = signal.direction === 'SELL';

    if (signal.entryMode === 'BUY_MARKET' || signal.entryMode === 'SELL_MARKET') {
      // Market entry requires price to be within execution tolerance
      if (distancePips <= tolerancePips) {
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'ELIGIBLE_FOR_EXECUTION',
          decision: `ELIGIBLE — MARKET ENTRY CONDITION SATISFIED (Distance: ${distancePips} pips <= Tolerance: ${tolerancePips} pips)`,
          isMarketExecutable: true,
          isPendingLimitEligible: false,
          spreadPips,
          signalAgeMs
        };
      } else {
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'WAITING_FOR_ENTRY',
          decision: `WAITING — MARKET PRICE MOVED AWAY FROM ENTRY (${distancePips} pips > ${tolerancePips} pips)`,
          isMarketExecutable: false,
          isPendingLimitEligible: false,
          spreadPips,
          signalAgeMs
        };
      }
    }

    if (signal.entryMode === 'BUY_PULLBACK') {
      // Pullback BUY: Planned entry is below current market price
      // If current price is still above planned entry (by more than tolerance): WAITING FOR ENTRY
      if (currentPrice > plannedEntry + (tolerancePips * pipMultiplier)) {
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'WAITING_FOR_ENTRY',
          decision: `WAITING — PULLBACK ENTRY NOT REACHED (Current: ${currentPrice} > Planned: ${plannedEntry}, Distance: ${distancePips} pips)`,
          isMarketExecutable: false,
          isPendingLimitEligible: true, // Eligible for pending limit order placement if configured
          spreadPips,
          signalAgeMs
        };
      } else if (currentPrice < signal.stopLoss) {
        // Price breached Stop Loss before entry -> INVALIDATED / BLOCKED
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'BLOCKED',
          decision: `BLOCKED — PRICE BREACHED STOP LOSS BEFORE ENTRY (Current: ${currentPrice} <= SL: ${signal.stopLoss})`,
          isMarketExecutable: false,
          isPendingLimitEligible: false,
          spreadPips,
          signalAgeMs
        };
      } else {
        // Price has retraced down to planned entry!
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'ELIGIBLE_FOR_EXECUTION',
          decision: `ELIGIBLE — PULLBACK RETRACEMENT REACHED ENTRY ZONE (Current: ${currentPrice} ≈ Entry: ${plannedEntry})`,
          isMarketExecutable: true,
          isPendingLimitEligible: false,
          spreadPips,
          signalAgeMs
        };
      }
    }

    if (signal.entryMode === 'SELL_PULLBACK') {
      // Pullback SELL: Planned entry is above current market price
      // If current price is still below planned entry (by more than tolerance): WAITING FOR ENTRY
      if (currentPrice < plannedEntry - (tolerancePips * pipMultiplier)) {
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'WAITING_FOR_ENTRY',
          decision: `WAITING — PULLBACK ENTRY NOT REACHED (Current: ${currentPrice} < Planned: ${plannedEntry}, Distance: ${distancePips} pips)`,
          isMarketExecutable: false,
          isPendingLimitEligible: true,
          spreadPips,
          signalAgeMs
        };
      } else if (currentPrice > signal.stopLoss) {
        // Price breached Stop Loss before entry -> BLOCKED
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'BLOCKED',
          decision: `BLOCKED — PRICE BREACHED STOP LOSS BEFORE ENTRY (Current: ${currentPrice} >= SL: ${signal.stopLoss})`,
          isMarketExecutable: false,
          isPendingLimitEligible: false,
          spreadPips,
          signalAgeMs
        };
      } else {
        // Price has retraced up to planned entry!
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'ELIGIBLE_FOR_EXECUTION',
          decision: `ELIGIBLE — PULLBACK RETRACEMENT REACHED ENTRY ZONE (Current: ${currentPrice} ≈ Entry: ${plannedEntry})`,
          isMarketExecutable: true,
          isPendingLimitEligible: false,
          spreadPips,
          signalAgeMs
        };
      }
    }

    if (signal.entryMode === 'BUY_BREAKOUT') {
      if (currentPrice < plannedEntry - (tolerancePips * pipMultiplier)) {
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'WAITING_FOR_ENTRY',
          decision: `WAITING — BREAKOUT TRIGGER NOT REACHED (Current: ${currentPrice} < Planned: ${plannedEntry})`,
          isMarketExecutable: false,
          isPendingLimitEligible: false,
          spreadPips,
          signalAgeMs
        };
      } else {
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'ELIGIBLE_FOR_EXECUTION',
          decision: `ELIGIBLE — BREAKOUT TRIGGER REACHED (Current: ${currentPrice} >= Planned: ${plannedEntry})`,
          isMarketExecutable: true,
          isPendingLimitEligible: false,
          spreadPips,
          signalAgeMs
        };
      }
    }

    if (signal.entryMode === 'SELL_BREAKOUT') {
      if (currentPrice > plannedEntry + (tolerancePips * pipMultiplier)) {
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'WAITING_FOR_ENTRY',
          decision: `WAITING — BREAKOUT TRIGGER NOT REACHED (Current: ${currentPrice} > Planned: ${plannedEntry})`,
          isMarketExecutable: false,
          isPendingLimitEligible: false,
          spreadPips,
          signalAgeMs
        };
      } else {
        return {
          signalId: signal.signalId,
          symbol,
          direction: signal.direction,
          entryMode: signal.entryMode,
          currentPrice,
          plannedEntry,
          distancePips,
          executionEligibility: 'ELIGIBLE_FOR_EXECUTION',
          decision: `ELIGIBLE — BREAKOUT TRIGGER REACHED (Current: ${currentPrice} <= Planned: ${plannedEntry})`,
          isMarketExecutable: true,
          isPendingLimitEligible: false,
          spreadPips,
          signalAgeMs
        };
      }
    }

    return {
      signalId: signal.signalId,
      symbol,
      direction: signal.direction,
      entryMode: signal.entryMode,
      currentPrice,
      plannedEntry,
      distancePips,
      executionEligibility: 'NOT_ELIGIBLE',
      decision: 'NOT ELIGIBLE — UNKNOWN ENTRY MODE',
      isMarketExecutable: false,
      isPendingLimitEligible: false,
      spreadPips,
      signalAgeMs
    };
  }

  /**
   * Revalidates a signal before live broker order execution
   */
  public revalidateBeforeOrder(
    signal: CanonicalSignal,
    marketContext: LiveMarketContext
  ): {
    canExecute: boolean;
    revalidatedSignal?: CanonicalSignal;
    eligibilityEvaluation: ExecutionEligibilityEvaluation;
    rejectionReason?: string;
  } {
    const evalResult = this.evaluateEligibility(signal, marketContext);

    // Hard fail if not eligible for market execution
    if (evalResult.executionEligibility !== 'ELIGIBLE_FOR_EXECUTION' || !evalResult.isMarketExecutable) {
      return {
        canExecute: false,
        eligibilityEvaluation: evalResult,
        rejectionReason: evalResult.decision
      };
    }

    // Re-run full SignalValidationGate with fresh market data & fresh indicators
    const freshInd = marketContext.freshIndicators || signal.indicators;
    const reval = signalValidationGate.validateSignal({
      signalId: signal.signalId,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      direction: signal.direction,
      currentPrice: marketContext.currentPrice,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit1: signal.takeProfit1,
      takeProfit2: signal.takeProfit2,
      recommendedLot: signal.recommendedLot,
      modelConfidence: signal.modelConfidence,
      indicators: freshInd,
      reasoningEvidence: signal.reasoningEvidence
    });

    if (!reval.isExecutable || reval.canonicalSignal.validationStatus === 'REJECTED') {
      return {
        canExecute: false,
        eligibilityEvaluation: {
          ...evalResult,
          executionEligibility: 'BLOCKED',
          decision: `BLOCKED — REVALIDATION FAILED: ${reval.validationReport.errors.join(' | ')}`
        },
        rejectionReason: `Revalidation failed: ${reval.validationReport.errors.join(' | ')}`
      };
    }

    return {
      canExecute: true,
      revalidatedSignal: reval.canonicalSignal,
      eligibilityEvaluation: evalResult
    };
  }

  /**
   * HARD EXECUTION INVARIANT ASSERTION
   * Throws a hard error if placeOrder() is called without ELIGIBLE_FOR_EXECUTION status.
   */
  public assertExecutionInvariant(
    signal: CanonicalSignal,
    eligibility: ExecutionEligibilityState,
    orderType: 'MARKET' | 'LIMIT' = 'MARKET'
  ): void {
    if (orderType === 'MARKET') {
      if (eligibility !== 'ELIGIBLE_FOR_EXECUTION') {
        const errMsg = `EXECUTION_INVARIANT_VIOLATION: Attempted to call placeOrder(MARKET) for ${signal.symbol} when executionEligibility is '${eligibility}'. Expected 'ELIGIBLE_FOR_EXECUTION'. Execution blocked.`;
        console.error(`🚨 [ExecutionEligibilityGate] ${errMsg}`);
        throw new Error(errMsg);
      }
    } else if (orderType === 'LIMIT') {
      if (eligibility === 'BLOCKED' || eligibility === 'EXPIRED' || eligibility === 'NOT_ELIGIBLE') {
        const errMsg = `EXECUTION_INVARIANT_VIOLATION: Attempted to place LIMIT order for ${signal.symbol} when signal is '${eligibility}'. Execution blocked.`;
        console.error(`🚨 [ExecutionEligibilityGate] ${errMsg}`);
        throw new Error(errMsg);
      }
    }
  }

  /**
   * Record successful execution for idempotency protection
   */
  public recordExecution(signalId: string, brokerOrderId?: string): void {
    this.executedSignalLedger.set(signalId, {
      executedAt: Date.now(),
      brokerOrderId
    });
    this.inFlightExecutionLocks.delete(signalId);
  }

  /**
   * Acquire in-flight lock
   */
  public acquireExecutionLock(signalId: string): boolean {
    if (this.inFlightExecutionLocks.has(signalId) || this.executedSignalLedger.has(signalId)) {
      return false;
    }
    this.inFlightExecutionLocks.add(signalId);
    return true;
  }

  /**
   * Release in-flight lock
   */
  public releaseExecutionLock(signalId: string): void {
    this.inFlightExecutionLocks.delete(signalId);
  }

  /**
   * Format structured logging block
   */
  public formatExecutionGateLog(data: ExecutionGateLogData): string {
    const rrStr = data.rrRatio || '1:2.0';
    return [
      `==================================================`,
      `EXECUTION GATE AUDIT`,
      `==================================================`,
      `Signal: ${data.signalId} (${data.symbol})`,
      `Direction: ${data.direction}`,
      `Entry Mode: ${data.entryMode}`,
      ``,
      `Current: ${data.currentPrice}`,
      `Entry: ${data.plannedEntry}${data.distancePips !== undefined ? ` (Distance: ${data.distancePips} pips)` : ''}`,
      ``,
      `Validation: ${data.validationStatus} (Conf: ${data.validationConfidence}%)`,
      `Execution Eligibility: ${data.executionEligibility}`,
      data.spreadPips !== undefined ? `Spread: ${data.spreadPips.toFixed(1)} pips` : '',
      data.signalAgeMs !== undefined ? `Signal Age: ${Math.round(data.signalAgeMs / 1000)}s` : '',
      `Risk/Reward: ${rrStr}`,
      `Risk Checks: ${data.riskChecksPassed !== false ? 'PASS' : 'FAIL'}`,
      ``,
      `Decision: ${data.decision}`,
      `Broker Order: ${data.brokerOrderAction === 'CALLED' ? 'EXECUTING LIVE' : (data.brokerOrderAction === 'LIMIT_PLACED' ? 'PENDING LIMIT PLACED' : 'NOT CALLED')}`,
      `==================================================`
    ].filter(Boolean).join('\n');
  }
}

export const executionEligibilityGate = ExecutionEligibilityGate.getInstance();
