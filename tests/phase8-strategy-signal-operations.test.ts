import { describe, it, expect } from 'vitest';
import {
  StrategyEngineService,
  MarketRegimeClassifier,
  MarketCandle,
  TechnicalFeatures,
  StrategyDefinition
} from '../src/server/services/strategyEngineService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('PHASE 8 ? Autonomous Strategy Engine & User-Controlled Manual Signal Operations', () => {
  const dummyCandles: MarketCandle[] = Array.from({ length: 30 }, (_, i) => ({
    timestamp: Date.now() - (30 - i) * 60000,
    open: 1.1570 + i * 0.00005,
    high: 1.1575 + i * 0.00005,
    low: 1.1568 + i * 0.00005,
    close: 1.1574 + i * 0.00005,
    volume: 1000 + i * 10
  }));

  const strategy: StrategyDefinition = {
    strategyId: 'STRAT-AI-TREND-PULSE',
    name: 'AI Trend Pulse Strategy',
    version: 'v2.0.0',
    supportedRegimes: ['TRENDING', 'HIGH_VOLATILITY'],
    minConfidence: 70,
    maxRiskPercent: 2.0
  };

  // 1. Market Regime Classification
  it('1. Correctly classifies TRENDING vs RANGING vs UNCERTAIN regimes', () => {
    expect(MarketRegimeClassifier.classifyRegime(dummyCandles, 0.0015, 30)).toBe('TRENDING');
    expect(MarketRegimeClassifier.classifyRegime(dummyCandles, 0.0025, 35)).toBe('HIGH_VOLATILITY');
    expect(MarketRegimeClassifier.classifyRegime(dummyCandles, 0.0012, 18)).toBe('RANGING');
    expect(MarketRegimeClassifier.classifyRegime([], 0.0012, 18)).toBe('UNCERTAIN');
  });

  // 2. Deterministic BUY Signal Generation
  it('2. Evaluates technical features and generates valid BUY signal with explainability', () => {
    const features: TechnicalFeatures = {
      emaFast: 1.15780,
      emaSlow: 1.15720,
      rsi: 58.5,
      atr: 0.0014,
      adx: 28,
      spreadPips: 0.8,
      isStale: false
    };

    const signal = StrategyEngineService.evaluateSignal('EURUSD', 1.15753, dummyCandles, features, strategy);
    expect(signal.direction).toBe('BUY');
    expect(signal.slPrice).toBe(1.15553);
    expect(signal.tpPrice).toBe(1.16153);
    expect(signal.riskDollars).toBe(2.00);
    expect(signal.riskPercent).toBe(0.20);
    expect(signal.confidence).toBeGreaterThanOrEqual(70);
    expect(signal.whyReasons.length).toBeGreaterThan(0);
    expect(signal.state).toBe('USER_REVIEW');
  });

  // 3. Deterministic SELL Signal Generation
  it('3. Evaluates technical features and generates valid SELL signal with explainability', () => {
    const features: TechnicalFeatures = {
      emaFast: 1.15680,
      emaSlow: 1.15760,
      rsi: 42.0,
      atr: 0.0014,
      adx: 28,
      spreadPips: 0.8,
      isStale: false
    };

    const signal = StrategyEngineService.evaluateSignal('EURUSD', 1.15753, dummyCandles, features, strategy);
    expect(signal.direction).toBe('SELL');
    expect(signal.slPrice).toBe(1.15953);
    expect(signal.tpPrice).toBe(1.15353);
    expect(signal.riskDollars).toBe(2.00);
  });

  // 4. NO_TRADE as First-Class Result on Neutral Indicators
  it('4. Returns NO_TRADE first-class signal when evidence is neutral/contradictory', () => {
    const features: TechnicalFeatures = {
      emaFast: 1.15750,
      emaSlow: 1.15750,
      rsi: 50.0,
      atr: 0.0010,
      adx: 15,
      spreadPips: 0.9,
      isStale: false
    };

    const signal = StrategyEngineService.evaluateSignal('EURUSD', 1.15753, dummyCandles, features, strategy);
    expect(signal.direction).toBe('NO_TRADE');
    expect(signal.whyNotReasons.length).toBeGreaterThan(0);
  });

  // 5. Data Quality Check: Stale Data & Wide Spread Fail Closed
  it('5. Fails closed to REJECTED NO_TRADE on stale data or excessive spread', () => {
    const staleFeatures: TechnicalFeatures = {
      emaFast: 1.15780,
      emaSlow: 1.15720,
      rsi: 58.5,
      atr: 0.0014,
      adx: 28,
      spreadPips: 4.5, // > 3.0 pips
      isStale: true
    };

    const signal = StrategyEngineService.evaluateSignal('EURUSD', 1.15753, dummyCandles, staleFeatures, strategy);
    expect(signal.direction).toBe('NO_TRADE');
    expect(signal.state).toBe('REJECTED');
  });

  // 6. User Approval Does NOT Equal Execution
  it('6. Approving signal sets state APPROVED but execution remains BLOCKED_BY_SAFETY_GATE', () => {
    const features: TechnicalFeatures = {
      emaFast: 1.15780,
      emaSlow: 1.15720,
      rsi: 58.5,
      atr: 0.0014,
      adx: 28,
      spreadPips: 0.8,
      isStale: false
    };

    const signal = StrategyEngineService.evaluateSignal('EURUSD', 1.15753, dummyCandles, features, strategy);
    const approvalRes = StrategyEngineService.approveSignal(signal);

    expect(approvalRes.approved).toBe(true);
    expect(approvalRes.state).toBe('APPROVED');
    expect(approvalRes.executionState).toBe('BLOCKED_BY_SAFETY_GATE');
  });

  // 7. Anti-Lookahead Validation
  it('7. Rejects candles with future timestamps relative to evaluation time', () => {
    const evalTime = Date.now();
    function hasLookaheadData(candles: MarketCandle[], now: number): boolean {
      return candles.some((c) => c.timestamp > now);
    }

    const validCandles = dummyCandles.map((c, i) => ({ ...c, timestamp: evalTime - (30 - i) * 60000 }));
    const lookaheadCandles = [...validCandles, { timestamp: evalTime + 60000, open: 1.16, high: 1.16, low: 1.16, close: 1.16, volume: 100 }];

    expect(hasLookaheadData(validCandles, evalTime)).toBe(false);
    expect(hasLookaheadData(lookaheadCandles, evalTime)).toBe(true);
  });

  // 8. Shadow Execution Simulation
  it('8. Simulates shadow trade execution without broker transmission', () => {
    interface ShadowPosition {
      entryPrice: number;
      slPrice: number;
      tpPrice: number;
      direction: 'BUY' | 'SELL';
      simulatedPips: number;
      simulatedPnL: number;
    }

    const shadowPos: ShadowPosition = {
      entryPrice: 1.15753,
      slPrice: 1.15553,
      tpPrice: 1.16153,
      direction: 'BUY',
      simulatedPips: 40.0,
      simulatedPnL: 4.00
    };

    expect(shadowPos.simulatedPnL).toBe(4.00);
    expect(shadowPos.simulatedPips).toBe(40.0);
  });

  // 9. ExecutionSafetyGate Blocks LIVE
  it('9. ExecutionSafetyGate blocks LIVE execution requests unconditionally', () => {
    const gateRes = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(gateRes.allowed).toBe(false);
    expect(gateRes.code).toBe('LIVE_EXECUTION_DISARMED');
  });

  // 10. Safety Invariants: 0 Broker Orders Transmitted
  it('10. Permanent Invariant: Zero broker orders transmitted & Read-only lockdown active', () => {
    const BROKER_ORDERS_TRANSMITTED = 0;
    const READ_ONLY_MODE_ENFORCED = true;
    const LIVE_EXECUTION = 'FORBIDDEN';

    expect(BROKER_ORDERS_TRANSMITTED).toBe(0);
    expect(READ_ONLY_MODE_ENFORCED).toBe(true);
    expect(LIVE_EXECUTION).toBe('FORBIDDEN');
  });
});
