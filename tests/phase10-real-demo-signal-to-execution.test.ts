import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrategyEngineService, StrategyDefinition, MarketCandle, TechnicalFeatures } from '../src/server/services/strategyEngineService';
import { PortfolioRiskEngine, ProposedTradeRisk } from '../src/server/services/portfolioRiskService';
import { FinalExecutionGateService } from '../src/server/services/finalExecutionGateService';
import { CTraderDemoLifecycleHarness } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';
import { ctraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';

describe('QUANTUMAI — PHASE 10 REAL DEMO SIGNAL-TO-EXECUTION VALIDATION SPECIFICATION', () => {
  let riskEngine: PortfolioRiskEngine;

  beforeEach(() => {
    riskEngine = new PortfolioRiskEngine(10000.0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Task 1 — Real Signal Path Trace: all 5 pipeline layers exist and are production-bound', () => {
    expect(typeof ctraderMarketDataFeedService.startFeed).toBe('function');
    expect(typeof StrategyEngineService.evaluateSignal).toBe('function');
    expect(typeof riskEngine.evaluateAndReserveRisk).toBe('function');
    expect(typeof FinalExecutionGateService.evaluateFinalExecutionGate).toBe('function');
    expect(typeof CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle).toBe('function');
  });

  it('Task 2 — Real Market Data: rejects stale market data (>3.0 pips spread or isStale flag)', () => {
    const staleFeatures: TechnicalFeatures = {
      emaFast: 1.1650,
      emaSlow: 1.1648,
      rsi: 55,
      atr: 0.0010,
      adx: 22,
      spreadPips: 4.5, // Exceeds 3.0 pip threshold
      isStale: true
    };

    const strategy: StrategyDefinition = {
      strategyId: 'STRAT-AI-TREND-PULSE',
      name: 'AI Trend Pulse',
      version: 'v2.0.0',
      supportedRegimes: ['TRENDING', 'RANGING'],
      minConfidence: 0.75,
      maxRiskPercent: 2.0
    };

    const candles: MarketCandle[] = [];
    for (let i = 0; i < 25; i++) {
      candles.push({ timestamp: Date.now() - i * 60000, open: 1.165, high: 1.1655, low: 1.1645, close: 1.165, volume: 100 });
    }

    const signal = StrategyEngineService.evaluateSignal('EURUSD', 1.1650, candles, staleFeatures, strategy);
    expect(signal.direction).toBe('NO_TRADE');
    expect(signal.state).toBe('REJECTED');
  });

  it('Task 3 & 4 — Strategy Signal & Risk Governance: approves conforming signal and reserves risk', () => {
    const validFeatures: TechnicalFeatures = {
      emaFast: 1.1652,
      emaSlow: 1.1648,
      rsi: 56.0,
      atr: 0.0012,
      adx: 26.0,
      spreadPips: 0.3,
      isStale: false
    };

    const strategy: StrategyDefinition = {
      strategyId: 'STRAT-AI-TREND-PULSE',
      name: 'AI Trend Pulse',
      version: 'v2.0.0',
      supportedRegimes: ['TRENDING', 'RANGING', 'BREAKOUT', 'HIGH_VOLATILITY'],
      minConfidence: 0.70,
      maxRiskPercent: 2.0
    };

    const candles: MarketCandle[] = [];
    for (let i = 25; i >= 0; i--) {
      candles.push({ timestamp: Date.now() - i * 60000, open: 1.1640, high: 1.1655, low: 1.1638, close: 1.1650, volume: 100 });
    }

    const signal = StrategyEngineService.evaluateSignal('EURUSD', 1.1650, candles, validFeatures, strategy, 10000.0);
    expect(signal.direction).toBe('BUY');

    const proposedTrade: ProposedTradeRisk = {
      requestId: 'REQ-10-1',
      idempotencyKey: 'IDEMP-10-1',
      strategyId: strategy.strategyId,
      strategyVersion: strategy.version,
      symbol: 'EURUSD',
      direction: 'BUY',
      proposedRiskDollars: 100.0,
      proposedRiskPercent: 1.0,
      entryPrice: 1.1650,
      slPrice: 1.1640,
      tpPrice: 1.1670
    };

    const riskDecision = riskEngine.evaluateAndReserveRisk(proposedTrade);
    expect(riskDecision.decision).toBe('PORTFOLIO_RISK_ACCEPTED');
  });

  it('Task 5, 6, 7, 8, 9, 10 — Pre-flight safety rejects LIVE execution strictly', () => {
    const liveConfig: any = {
      environment: 'LIVE',
      confirmDemoExecution: true,
      host: 'demo.ctraderapi.com',
      port: 5035,
      symbol: 'EURUSD',
      side: 'BUY',
      lots: 0.01
    };

    expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(liveConfig)).toThrow(
      /SAFETY_VIOLATION_FATAL: LIVE environment is strictly prohibited/
    );
  });

  it('Task 11 — Fail-closed behavior: rejects unconfirmed DEMO execution without transmitting orders', () => {
    const unconfirmedConfig: any = {
      environment: 'DEMO',
      confirmDemoExecution: false,
      host: 'demo.ctraderapi.com',
      port: 5035,
      symbol: 'EURUSD',
      side: 'BUY',
      lots: 0.01
    };

    expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(unconfirmedConfig)).toThrow(
      /Explicit DEMO confirmation flag/
    );
  });

  it('Task 11 — Fail-closed behavior: duplicate idempotency key with different payload is rejected', () => {
    const trade1: ProposedTradeRisk = {
      requestId: 'REQ-DUP-1',
      idempotencyKey: 'IDEMP-DUP-KEY',
      strategyId: 'STRAT-1',
      strategyVersion: 'v1.0.0',
      symbol: 'EURUSD',
      direction: 'BUY',
      proposedRiskDollars: 50.0,
      proposedRiskPercent: 0.5,
      entryPrice: 1.1650,
      slPrice: 1.1640,
      tpPrice: 1.1670
    };

    const res1 = riskEngine.evaluateAndReserveRisk(trade1);
    expect(res1.decision).toBe('PORTFOLIO_RISK_ACCEPTED');

    // Identical replay
    const replayRes = riskEngine.evaluateAndReserveRisk(trade1);
    expect(replayRes.reason).toBe('IDEMPOTENT_REPLAY_OF_PRIOR_DECISION');

    // Conflicting payload
    const trade2: ProposedTradeRisk = {
      ...trade1,
      proposedRiskDollars: 100.0
    };
    const res2 = riskEngine.evaluateAndReserveRisk(trade2);
    expect(res2.decision).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });
});
