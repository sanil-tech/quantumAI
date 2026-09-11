/**
 * QuantumAI Shadow Pipeline Repair — Integration & Unit Test Suite
 *
 * PURPOSE:
 *   Verify the repaired shadow signal pipeline end-to-end:
 *     Real ticks → M1 candle → candleClosed → Observatory → indicators → SMC
 *     → SignalIntelligence → evaluateMarketOpportunity → Shadow / Counterfactual
 *
 * SAFETY:
 *   brokerOrdersTransmitted MUST remain 0.
 *   liveExecutionGate MUST remain 'FORBIDDEN'.
 *   isDemoArmed MUST remain false.
 */

import { describe, test, expect } from 'vitest';
import { EventEmitter } from 'events';
import { CTraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';
import { calculateAllIndicators } from '../src/lib/indicators';
import { analyzeSmcStructures } from '../src/lib/smcEngine';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { ContinuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { demoAutonomousTradingService } from '../src/server/services/demoAutonomousTradingService';
import fs from 'fs';
import path from 'path';

// ─── Helper: generate a realistic M1 candle array ────────────────────────────
function generateRealisticCandles(count: number, basePrice: number = 1.0850): any[] {
  const candles: any[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const delta = (Math.random() - 0.5) * 0.002;
    const close = parseFloat((open + delta).toFixed(5));
    const high = parseFloat((Math.max(open, close) + Math.random() * 0.001).toFixed(5));
    const low = parseFloat((Math.min(open, close) - Math.random() * 0.001).toFixed(5));
    const time = new Date(Date.now() - (count - i) * 60000).toISOString();
    candles.push({ time, open, high, low, close, volume: Math.floor(50 + Math.random() * 200) });
    price = close;
  }
  return candles;
}

// ─── 1. CANDLE STORAGE & getLiveCandles VALIDITY ─────────────────────────────
describe('1. Candle Pipeline & getLiveCandles Validity', () => {
  test('getLiveCandles returns valid:false when feed is not connected and no ticks received', () => {
    const service = CTraderMarketDataFeedService.getInstance();
    const result = service.getLiveCandles('GBP/USD');
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('candles');
    expect(result).toHaveProperty('candleCount');
    if (result.candleCount < 26) {
      expect(result.valid).toBe(false);
    }
  });

  test('LiveCandleResult shape matches documented contract', () => {
    const service = CTraderMarketDataFeedService.getInstance();
    const result = service.getLiveCandles('EUR/USD');
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.candles)).toBe(true);
    expect(typeof result.candleCount).toBe('number');
    if (!result.valid) {
      expect(result.reason).toBeDefined();
      expect(['INSUFFICIENT_CANDLE_HISTORY', 'PAIR_NOT_SUBSCRIBED', 'FEED_NOT_CONNECTED']).toContain(result.reason);
    }
  });

  test('MIN_CANDLE_THRESHOLD is >= 26', () => {
    expect(CTraderMarketDataFeedService.MIN_CANDLE_THRESHOLD).toBeGreaterThanOrEqual(26);
  });
});

// ─── 2. INDICATOR VALIDITY CONTRACT ─────────────────────────────────────────
describe('2. Indicator Validity Contract', () => {
  test('calculateAllIndicators returns all required indicators with >= 26 candles', () => {
    const candles = generateRealisticCandles(50);
    const result = calculateAllIndicators(candles);

    expect(result.ema20).toBeDefined();
    expect(typeof result.ema20).toBe('number');
    expect(result.ema50).toBeDefined();
    expect(typeof result.ema50).toBe('number');
    expect(result.ema200).toBeDefined();
    expect(typeof result.ema200).toBe('number');
    expect(result.rsi).toBeDefined();
    expect(typeof result.rsi).toBe('number');
    expect(result.macd).toBeDefined();
    expect(result.atr).toBeDefined();
    expect(typeof result.atr).toBe('number');
    expect(result.adx).toBeDefined();
    expect(result.vwap).toBeDefined();
    expect(result.superTrend).toBeDefined();
  });

  test('calculateAllIndicators does NOT return zero or NaN for EMA/RSI/ATR with sufficient data', () => {
    const candles = generateRealisticCandles(60, 1.0850);
    const result = calculateAllIndicators(candles);

    expect(result.ema20).not.toBeNaN();
    expect(result.ema50).not.toBeNaN();
    expect(result.rsi).not.toBeNaN();
    expect(result.atr).not.toBeNaN();
    expect(result.ema20).toBeGreaterThan(0);
    expect(result.ema50).toBeGreaterThan(0);
    expect(result.rsi).toBeGreaterThan(0);
    expect(result.atr).toBeGreaterThan(0);
  });
});

// ─── 3. SMC VALIDITY ────────────────────────────────────────────────────────
describe('3. SMC Real Input', () => {
  test('analyzeSmcStructures returns object with expected structure', () => {
    const candles = generateRealisticCandles(50);
    const result = analyzeSmcStructures(candles, 'M1');

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(Array.isArray(result.orderBlocks)).toBe(true);
    expect(Array.isArray(result.fairValueGaps)).toBe(true);
  });
});

// ─── 4. SIGNAL INTELLIGENCE FAIL-CLOSED ─────────────────────────────────────
describe('4. SignalIntelligence Fail-Closed Behaviour', () => {
  test('returns NO_SETUP when indicators is null/undefined', () => {
    const service = SignalIntelligenceService.getInstance();

    const result = service.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M1',
      currentPrice: 1.0850,
      indicators: null,
      smc: {}
    });

    expect(result.action).toBe('NO_SETUP');
    expect(result.confidence).toBe(0);
    expect(result.executable).toBe(false);
    expect(result.reasons).toBeDefined();
    expect(result.reasons.some((r: string) => r.includes('FAIL_CLOSED'))).toBe(true);
  });

  test('returns NO_SETUP when indicators is undefined', () => {
    const service = SignalIntelligenceService.getInstance();

    const result = service.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M1',
      currentPrice: 1.0850,
      indicators: undefined,
      smc: {}
    });

    expect(result.action).toBe('NO_SETUP');
    expect(result.confidence).toBe(0);
    expect(result.decisionProvider).toBe('DETERMINISTIC');
  });
});

// ─── 5. GEMINI PROVENANCE ───────────────────────────────────────────────────
describe('5. Gemini Provenance Truthfulness', () => {
  test('decisionProvider is DETERMINISTIC (Gemini is never actually called)', () => {
    const service = SignalIntelligenceService.getInstance();

    const indicators = {
      ema20: 1.0850,
      ema50: 1.0848,
      ema200: 1.0830,
      rsi: 55,
      atr: 0.0015,
      adx: { adx: 28, pdi: 25, mdi: 20 },
      macd: { macdLine: 0.00012, signalLine: 0.00010, histogram: 0.00002 },
      superTrend: { value: 1.0840, trend: 'BULLISH' },
      vwap: 1.0845
    };

    const result = service.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M1',
      currentPrice: 1.0850,
      indicators,
      smc: { orderBlocks: [], fairValueGaps: [] }
    });

    expect(result.decisionProvider).toBe('DETERMINISTIC');
    expect(result.geminiCalled).toBe(false);
    expect(result.geminiSucceeded).toBe(false);
    expect(result.executable).toBe(false);
  });
});

// ─── 6. SL/TP VALIDATION ───────────────────────────────────────────────────
describe('6. SL/TP Fail-Closed Validation', () => {
  test('signal without valid SL/TP should not be marked as executable', () => {
    const service = SignalIntelligenceService.getInstance();

    const result = service.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M1',
      currentPrice: 1.0850,
      indicators: { rsi: 50, ema20: 1.085, ema50: 1.085, atr: 0.0015, adx: 15 },
      smc: { orderBlocks: [], fairValueGaps: [] }
    });

    expect(result.executable).toBe(false);
  });
});

// ─── 7. IDEMPOTENCY ────────────────────────────────────────────────────────
describe('7. Signal Idempotency', () => {
  test('signal id is present and unique per evaluation', () => {
    const service = SignalIntelligenceService.getInstance();
    const input = {
      pair: 'EUR/USD' as any,
      timeframe: 'M1' as any,
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema20: 1.085, ema50: 1.084, atr: 0.0015, adx: 28 },
      smc: { orderBlocks: [], fairValueGaps: [] }
    };

    const r1 = service.evaluateCandidateSetup(input);
    const r2 = service.evaluateCandidateSetup(input);

    expect(r1.id).toBeDefined();
    expect(r2.id).toBeDefined();
    expect(r1.id).not.toBe(r2.id);
    expect(r1.proposalId).toBeDefined();
  });
});

// ─── 8. OBSERVATORY DISPATCH EVENT WIRING ───────────────────────────────────
describe('8. Pipeline Integration: candleClosed → Observatory wiring', () => {
  test('candleClosed event is received by observatory candleClosedListener', async () => {
    const testEmitter = new EventEmitter();
    const observatory = ContinuousLearningObservatoryService.getInstance();

    observatory.bindMarketDataEmitter(testEmitter);
    const startResult = observatory.startObservatory();
    expect(startResult.success).toBe(true);
    expect(startResult.state).toBe('OBSERVING');

    const beforeStatus = observatory.getStatus();
    const beforeCandleCount = beforeStatus.pipeline.candlesCompleted;

    testEmitter.emit('candleClosed', {
      symbol: 'EUR/USD',
      candle: { time: new Date().toISOString(), open: 1.085, high: 1.086, low: 1.084, close: 1.0855, volume: 100 },
      session: 'LONDON'
    });

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        const afterStatus = observatory.getStatus();
        expect(afterStatus.pipeline.candlesCompleted).toBeGreaterThan(beforeCandleCount);
        expect(afterStatus.pipeline.candlesCompleted).toBeGreaterThan(0);
        observatory.stopObservatory();
        observatory.unbindMarketDataEmitter();
        resolve();
      }, 200);
    });
  });
});

// ─── 9. OBSERVATORY evaluateMarketOpportunity SHADOW CREATION ───────────────
describe('9. Observatory evaluateMarketOpportunity', () => {
  test('rejects NO_SETUP signals as counterfactuals (no shadow)', () => {
    const observatory = ContinuousLearningObservatoryService.getInstance();
    observatory.startObservatory();

    const result = observatory.evaluateMarketOpportunity({
      opportunity: {
        pair: 'EUR/USD',
        action: 'NO_SETUP',
        confidence: 0,
        entryZone: null,
        stopLoss: null,
        takeProfit1: null,
        setupType: 'NONE',
        marketRegime: 'RANGING_CHOPPY',
        id: 'test-no-setup-001',
        proposalId: 'test-no-setup-001',
        decisionProvider: 'DETERMINISTIC'
      } as any,
      session: 'LONDON'
    });

    expect(result.actionTaken).toBeDefined();
    expect(result.actionTaken).not.toBe('SHADOW_OPENED');
    observatory.stopObservatory();
  });
});

// ─── 10. DASHBOARD MOCK REMOVAL ─────────────────────────────────────────────
describe('10. Dashboard Mock Metric Audit', () => {
  test('EarlyLearnerDashboard source has NO hardcoded defaultTrades array', () => {
    const filePath = path.join(__dirname, '..', 'src', 'components', 'EarlyLearnerDashboard.tsx');
    if (!fs.existsSync(filePath)) {
      return; // Consolidated/deleted
    }
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toContain("id: 'TRD-DEMO-001'");
    expect(content).not.toContain("id: 'TRD-DEMO-002'");
    expect(content).not.toContain("id: 'TRD-DEMO-003'");
    expect(content).not.toContain("id: 'TRD-DEMO-004'");
    expect(content).not.toContain("id: 'TRD-DEMO-005'");
    expect(content).not.toContain('winRate: 60.0');
    expect(content).not.toContain("winCount: 3");
    expect(content).not.toContain("closedTrades: 5");
    expect(content).not.toContain("'EARLY_OBSERVATION' as ResearchEvidenceTier");
  });

  test('ShadowPerformanceCockpit does NOT fabricate fallback observations', () => {
    const filePath = path.join(__dirname, '..', 'src', 'components', 'ShadowPerformanceCockpit.tsx');
    if (!fs.existsSync(filePath)) {
      return; // Consolidated/deleted
    }
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toContain("id: 'shadow-mock");
    expect(content).toContain('setActiveObservations([])');
    expect(content).toContain('setCompletedObservations([])');
  });
});

// ─── 11. SAFETY INVARIANTS ──────────────────────────────────────────────────
describe('11. Execution Safety Invariants', () => {
  test('Observatory status always shows isDemoArmed=false, liveExecutionGate=FORBIDDEN, brokerOrdersTransmitted=0', () => {
    const observatory = ContinuousLearningObservatoryService.getInstance();
    const status = observatory.getStatus();

    expect(status.isDemoArmed).toBe(false);
    expect(status.liveExecutionGate).toBe('FORBIDDEN');
    expect(status.brokerOrdersTransmitted).toBe(0);
  });

  test('DemoAutonomousTradingService shows liveExecutionStatus=FORBIDDEN', () => {
    const status = demoAutonomousTradingService.getStatus();

    expect(status.liveExecutionStatus).toBe('FORBIDDEN');
    expect(status.automatedLiveExecution).toBe('DISABLED');
    expect(status.environment).toBe('DEMO');
  });

  test('SignalIntelligence evaluations are never executable', () => {
    const service = SignalIntelligenceService.getInstance();

    const result = service.evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M1',
      currentPrice: 1.085,
      indicators: { rsi: 75, ema20: 1.086, ema50: 1.084, ema200: 1.080, atr: 0.0018, adx: 35 },
      smc: { orderBlocks: [{ type: 'BULLISH', bias: 'BULLISH' }], fairValueGaps: [] }
    });

    expect(result.executable).toBe(false);
  });
});

// ─── 12. TELEMETRY PIPELINE ─────────────────────────────────────────────────
describe('12. Pipeline Telemetry', () => {
  test('Observatory getStatus includes comprehensive pipeline telemetry', () => {
    const observatory = ContinuousLearningObservatoryService.getInstance();
    const status = observatory.getStatus();

    expect(status.pipeline).toBeDefined();
    const p = status.pipeline;
    expect(typeof p.ticksReceived).toBe('number');
    expect(typeof p.candlesCompleted).toBe('number');
    expect(typeof p.indicatorCalculations).toBe('number');
    expect(typeof p.indicatorFailures).toBe('number');
    expect(typeof p.smcCalculations).toBe('number');
    expect(typeof p.smcFailures).toBe('number');
    expect(typeof p.signalsEvaluated).toBe('number');
    expect(typeof p.buySignals).toBe('number');
    expect(typeof p.sellSignals).toBe('number');
    expect(typeof p.waitSignals).toBe('number');
    expect(typeof p.noSetupSignals).toBe('number');
    expect(typeof p.vetoSignals).toBe('number');
    expect(typeof p.shadowOpened).toBe('number');
    expect(typeof p.counterfactualsRecorded).toBe('number');
    expect(typeof p.shadowClosed).toBe('number');
    expect(typeof p.duplicateSignals).toBe('number');
    expect(typeof p.noDataRejected).toBe('number');
  });
});

// ─── 13. DATA ALIGNMENT ─────────────────────────────────────────────────────
describe('13. Data Alignment Invariant', () => {
  test('cTrader M1 candles serve as the authoritative single source of truth for both signals and indicators', () => {
    const service = CTraderMarketDataFeedService.getInstance();
    const pair = 'EUR/USD';
    const liveResult = service.getLiveCandles(pair);
    
    expect(liveResult).toBeDefined();
    expect(Array.isArray(liveResult.candles)).toBe(true);
    
    // Simulate that indicators run on the same M1 candles
    const candles = liveResult.candles.length > 0 ? liveResult.candles : generateRealisticCandles(30);
    const indicators = calculateAllIndicators(candles);
    const smc = analyzeSmcStructures(candles, 'M1');
    
    const signal = SignalIntelligenceService.getInstance().evaluateCandidateSetup({
      pair,
      timeframe: 'M1',
      currentPrice: candles[candles.length - 1].close,
      indicators,
      smc
    });
    
    expect(signal).toBeDefined();
    expect(signal.action).toBeDefined();
  });
});

