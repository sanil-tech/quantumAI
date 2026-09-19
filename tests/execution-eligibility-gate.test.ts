import { describe, it, expect, beforeEach } from 'vitest';
import { signalValidationGate } from '../src/server/services/validation/signalValidationGate';
import { executionEligibilityGate, ExecutionEligibilityGate } from '../src/server/services/validation/executionEligibilityGate';
import { CanonicalSignal } from '../src/server/services/validation/signalValidationTypes';

describe('Execution Eligibility Gate & Invariant Audits', () => {
  let gate: ExecutionEligibilityGate;

  beforeEach(() => {
    gate = ExecutionEligibilityGate.getInstance();
    // Reset private state via fresh instance or clear maps if accessible
    (gate as any).executedSignalLedger?.clear?.();
    (gate as any).inFlightExecutionLocks?.clear?.();
  });

  // =========================================================================
  // TEST 1: EURJPY Regression Test (Original Setup from Audit Prompt)
  // =========================================================================
  it('EURJPY M15 regression: VALID/WARNING + WAITING_FOR_ENTRY strictly blocks market order', () => {
    const rawSignal = {
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY' as const,
      currentPrice: 180.489,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      modelConfidence: 85,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 86.7, // Overbought RSI
        adx: 20,     // ADX measures strength, not direction
        plusDI: 28.5,
        minusDI: 14.2,
        superTrendDirection: 'BULLISH' as const
      },
      reasoningEvidence: [
        'SuperTrend is BULLISH',
        'ADX (20.0) confirms trending market'
      ]
    };

    const { canonicalSignal, validationReport, isExecutable } = signalValidationGate.validateSignal(rawSignal);

    // 1. Validation Status & Semantics
    expect(canonicalSignal.validationStatus).toBe('WARNING');
    expect(validationReport.rsiInterpretation.status).toBe('WARNING');
    expect(validationReport.adxInterpretation.status).toBe('PASS');
    expect(canonicalSignal.entryMode).toBe('BUY_PULLBACK');
    expect(canonicalSignal.executionStatus).toBe('WAITING_FOR_ENTRY');

    // 2. Execution Eligibility evaluation
    const evalResult = gate.evaluateEligibility(canonicalSignal, {
      currentPrice: 180.489,
      spreadPips: 1.2
    });

    expect(evalResult.executionEligibility).toBe('WAITING_FOR_ENTRY');
    expect(evalResult.isMarketExecutable).toBe(false);
    expect(evalResult.isPendingLimitEligible).toBe(true);
    expect(evalResult.decision).toContain('WAITING');

    // 3. Execution Invariant Assertion: placeOrder(MARKET) MUST throw
    expect(() => {
      gate.assertExecutionInvariant(canonicalSignal, evalResult.executionEligibility, 'MARKET');
    }).toThrow(/EXECUTION_INVARIANT_VIOLATION/);

    // 4. Formatted Log output
    const logStr = gate.formatExecutionGateLog({
      signalId: canonicalSignal.signalId,
      symbol: canonicalSignal.symbol,
      direction: canonicalSignal.direction,
      entryMode: canonicalSignal.entryMode,
      currentPrice: 180.489,
      plannedEntry: 180.321,
      distancePips: canonicalSignal.distancePips,
      validationStatus: canonicalSignal.validationStatus,
      executionEligibility: evalResult.executionEligibility,
      validationConfidence: canonicalSignal.validationConfidence,
      spreadPips: 1.2,
      decision: evalResult.decision,
      brokerOrderAction: 'NOT_CALLED'
    });

    expect(logStr).toContain('EXECUTION GATE AUDIT');
    expect(logStr).toContain('Execution Eligibility: WAITING_FOR_ENTRY');
    expect(logStr).toContain('Broker Order: NOT CALLED');
  });

  // =========================================================================
  // TEST 2: Trigger Test (Price retraces to Planned Entry -> Revalidates -> Eligible)
  // =========================================================================
  it('Trigger Test: When price reaches planned entry, live revalidation grants ELIGIBLE_FOR_EXECUTION', () => {
    const rawSignal = {
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY' as const,
      currentPrice: 180.489,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      modelConfidence: 85,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 65.0, // Normal RSI after retracement
        adx: 22,
        plusDI: 28.0,
        minusDI: 15.0,
        superTrendDirection: 'BULLISH' as const
      }
    };

    const { canonicalSignal } = signalValidationGate.validateSignal(rawSignal);

    // Price retraces to planned entry zone (e.g. 180.321)
    const liveContext = {
      currentPrice: 180.321,
      spreadPips: 1.1,
      freshIndicators: {
        ema50: 180.205,
        ema200: 179.810,
        rsi14: 58.0,
        adx: 23,
        plusDI: 27.5,
        minusDI: 15.5,
        superTrendDirection: 'BULLISH' as const
      }
    };

    const reval = gate.revalidateBeforeOrder(canonicalSignal, liveContext);

    expect(reval.canExecute).toBe(true);
    expect(reval.eligibilityEvaluation.executionEligibility).toBe('ELIGIBLE_FOR_EXECUTION');
    expect(reval.eligibilityEvaluation.isMarketExecutable).toBe(true);

    // Invariant assertion succeeds without error
    expect(() => {
      gate.assertExecutionInvariant(canonicalSignal, reval.eligibilityEvaluation.executionEligibility, 'MARKET');
    }).not.toThrow();
  });

  // =========================================================================
  // TEST 3: Invalidation Test (SuperTrend turns Bearish before entry fill)
  // =========================================================================
  it('Invalidation Test: If market structure turns bearish before entry, signal is BLOCKED from execution', () => {
    const rawSignal = {
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY' as const,
      currentPrice: 180.489,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      modelConfidence: 85,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 70.0,
        adx: 22,
        plusDI: 28.0,
        minusDI: 15.0,
        superTrendDirection: 'BULLISH' as const
      }
    };

    const { canonicalSignal } = signalValidationGate.validateSignal(rawSignal);

    // Market price drops to 180.321 but SuperTrend flipped to BEARISH and -DI collapsed +DI
    const liveContext = {
      currentPrice: 180.321,
      spreadPips: 1.2,
      freshIndicators: {
        ema50: 180.350,
        ema200: 179.810,
        rsi14: 38.0,
        adx: 30,
        plusDI: 12.0,
        minusDI: 34.0, // Strong bearish dominance
        superTrendDirection: 'BEARISH' as const
      }
    };

    const reval = gate.revalidateBeforeOrder(canonicalSignal, liveContext);

    expect(reval.canExecute).toBe(false);
    expect(reval.eligibilityEvaluation.executionEligibility).toBe('BLOCKED');
    expect(reval.rejectionReason?.toUpperCase()).toContain('REVALIDATION FAILED');
  });

  // =========================================================================
  // TEST 4: Invalidation Test (Price breaches SL before entry)
  // =========================================================================
  it('Invalidation Test: If current price breaches Stop Loss before entry, execution is BLOCKED', () => {
    const rawSignal = {
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY' as const,
      currentPrice: 180.489,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 70.0,
        adx: 22,
        plusDI: 28.0,
        minusDI: 15.0,
        superTrendDirection: 'BULLISH' as const
      }
    };

    const { canonicalSignal } = signalValidationGate.validateSignal(rawSignal);

    // Flash crash price dropped below SL (179.900 < 179.971)
    const evalResult = gate.evaluateEligibility(canonicalSignal, {
      currentPrice: 179.900,
      spreadPips: 1.2
    });

    expect(evalResult.executionEligibility).toBe('BLOCKED');
    expect(evalResult.isMarketExecutable).toBe(false);
    expect(evalResult.decision).toContain('PRICE BREACHED STOP LOSS BEFORE ENTRY');
  });

  // =========================================================================
  // TEST 5: Signal Expiry Test (Age > Timeframe TTL)
  // =========================================================================
  it('Expiry Test: If signal age exceeds timeframe TTL, state is EXPIRED and execution is BLOCKED', () => {
    const now = Date.now();
    const staleGeneratedAt = now - (3 * 60 * 60 * 1000); // 3 hours ago (M15 TTL is 2 hours)

    const rawSignal = {
      symbol: 'EURJPY',
      timeframe: 'M15',
      generatedAt: staleGeneratedAt,
      direction: 'BUY' as const,
      currentPrice: 180.321,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 60.0,
        adx: 22,
        plusDI: 28.0,
        minusDI: 15.0,
        superTrendDirection: 'BULLISH' as const
      }
    };

    const { canonicalSignal } = signalValidationGate.validateSignal(rawSignal);
    canonicalSignal.generatedAt = staleGeneratedAt;

    const evalResult = gate.evaluateEligibility(canonicalSignal, {
      currentPrice: 180.321,
      spreadPips: 1.2
    });

    expect(evalResult.executionEligibility).toBe('EXPIRED');
    expect(evalResult.isMarketExecutable).toBe(false);
    expect(evalResult.decision).toContain('SIGNAL EXPIRED');
  });

  // =========================================================================
  // TEST 6: Duplicate Execution / Idempotency Protection
  // =========================================================================
  it('Duplicate Protection: One signal trigger produces maximum one execution event', () => {
    const rawSignal = {
      signalId: 'sig_eurjpy_unique_001',
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY' as const,
      currentPrice: 180.321,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 60.0,
        adx: 22,
        plusDI: 28.0,
        minusDI: 15.0,
        superTrendDirection: 'BULLISH' as const
      }
    };

    const { canonicalSignal } = signalValidationGate.validateSignal(rawSignal);

    // First evaluation: Eligible
    const eval1 = gate.evaluateEligibility(canonicalSignal, {
      currentPrice: 180.321,
      spreadPips: 1.2
    });
    expect(eval1.executionEligibility).toBe('ELIGIBLE_FOR_EXECUTION');

    // Simulate broker order placement & confirmation
    gate.recordExecution(canonicalSignal.signalId, 'CTR-998877');

    // Second evaluation: Must be EXECUTED and blocked
    const eval2 = gate.evaluateEligibility(canonicalSignal, {
      currentPrice: 180.321,
      spreadPips: 1.2
    });
    expect(eval2.executionEligibility).toBe('EXECUTED');
    expect(eval2.isMarketExecutable).toBe(false);
    expect(eval2.decision).toContain('ALREADY EXECUTED');
  });

  // =========================================================================
  // TEST 7: Spread Protection Check
  // =========================================================================
  it('Spread Protection: High spread exceeds threshold -> Execution BLOCKED', () => {
    const rawSignal = {
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY' as const,
      currentPrice: 180.321,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 60.0,
        adx: 22,
        plusDI: 28.0,
        minusDI: 15.0,
        superTrendDirection: 'BULLISH' as const
      }
    };

    const { canonicalSignal } = signalValidationGate.validateSignal(rawSignal);

    // Spread is 4.5 pips on JPY (max allowed is 3.5 pips)
    const evalResult = gate.evaluateEligibility(canonicalSignal, {
      currentPrice: 180.321,
      spreadPips: 4.5
    });

    expect(evalResult.executionEligibility).toBe('BLOCKED');
    expect(evalResult.isMarketExecutable).toBe(false);
    expect(evalResult.decision).toContain('SPREAD TOO WIDE');
  });

  // =========================================================================
  // TEST 8: AI Model Confidence 99% MUST NOT bypass Execution Gates
  // =========================================================================
  it('Confidence Invariance: 99% AI confidence cannot bypass WAITING_FOR_ENTRY or REJECTED status', () => {
    const rawSignal = {
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY' as const,
      currentPrice: 180.489,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      modelConfidence: 99, // Super high AI confidence!
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 86.7,
        adx: 20,
        plusDI: 28.5,
        minusDI: 14.2,
        superTrendDirection: 'BULLISH' as const
      }
    };

    const { canonicalSignal } = signalValidationGate.validateSignal(rawSignal);
    expect(canonicalSignal.modelConfidence).toBe(99);

    const evalResult = gate.evaluateEligibility(canonicalSignal, {
      currentPrice: 180.489,
      spreadPips: 1.2
    });

    // Despite 99% confidence, market order is strictly blocked
    expect(evalResult.executionEligibility).toBe('WAITING_FOR_ENTRY');
    expect(evalResult.isMarketExecutable).toBe(false);

    expect(() => {
      gate.assertExecutionInvariant(canonicalSignal, evalResult.executionEligibility, 'MARKET');
    }).toThrow(/EXECUTION_INVARIANT_VIOLATION/);
  });

  // =========================================================================
  // TEST 9: SELL PULLBACK and BREAKOUT Modes
  // =========================================================================
  it('SELL PULLBACK: Waiting when price is below entry, eligible when price reaches entry', () => {
    const rawSell = {
      symbol: 'EURUSD',
      timeframe: 'M15',
      direction: 'SELL' as const,
      currentPrice: 1.08500,
      entryPrice: 1.08700, // Pullback SELL entry is above current price
      stopLoss: 1.09000,
      takeProfit1: 1.08100,
      recommendedLot: 0.01,
      indicators: {
        ema50: 1.08800,
        ema200: 1.09200,
        rsi14: 35.0,
        adx: 25,
        plusDI: 15.0,
        minusDI: 29.0,
        superTrendDirection: 'BEARISH' as const
      }
    };

    const { canonicalSignal } = signalValidationGate.validateSignal(rawSell);
    expect(canonicalSignal.entryMode).toBe('SELL_PULLBACK');

    // Price at 1.08500: Waiting
    const evalWaiting = gate.evaluateEligibility(canonicalSignal, {
      currentPrice: 1.08500,
      spreadPips: 1.0
    });
    expect(evalWaiting.executionEligibility).toBe('WAITING_FOR_ENTRY');
    expect(evalWaiting.isMarketExecutable).toBe(false);

    // Price retraces up to 1.08700: Eligible
    const evalTriggered = gate.evaluateEligibility(canonicalSignal, {
      currentPrice: 1.08700,
      spreadPips: 1.0
    });
    expect(evalTriggered.executionEligibility).toBe('ELIGIBLE_FOR_EXECUTION');
    expect(evalTriggered.isMarketExecutable).toBe(true);
  });
});
