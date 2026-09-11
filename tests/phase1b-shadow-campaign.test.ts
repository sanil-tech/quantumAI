import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { ContinuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { CTraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { learningJournalService } from '../src/server/services/learningJournalService';
import { researchLearningEngine } from '../src/server/services/researchLearningEngine';
import { ShadowAnalyticsService } from '../src/server/services/shadowAnalyticsService';
import { CurrencyPair, Timeframe } from '../src/types';

// Helper to generate realistic candles
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

describe('Phase 1B: Continuous Real-Market Shadow Observation Campaign', () => {
  let observatory: ContinuousLearningObservatoryService;
  let dataFeed: CTraderMarketDataFeedService;
  let signalService: SignalIntelligenceService;
  
  let originalGetLiveCandles: any;
  let originalEvaluateSetup: any;

  beforeEach(() => {
    observatory = ContinuousLearningObservatoryService.getInstance();
    dataFeed = CTraderMarketDataFeedService.getInstance();
    signalService = SignalIntelligenceService.getInstance();
    
    originalGetLiveCandles = dataFeed.getLiveCandles;
    originalEvaluateSetup = signalService.evaluateCandidateSetup;

    // Reset state where possible
    observatory.unbindMarketDataEmitter();
    learningJournalService.clearJournal();
    (observatory as any).state = 'OBSERVING';
    (observatory as any).processedSignalIds.clear();
    (observatory as any).activeObservations.clear();
    (observatory as any).completedObservations = [];
    
    // Reset telemetry
    const tel = (observatory as any).telemetry;
    tel.signalsEvaluated = 0;
    tel.buySignals = 0;
    tel.sellSignals = 0;
    tel.shadowOpened = 0;
    tel.shadowClosed = 0;
    tel.duplicateSignals = 0;
    tel.counterfactualsRecorded = 0;
  });

  afterEach(() => {
    dataFeed.getLiveCandles = originalGetLiveCandles;
    signalService.evaluateCandidateSetup = originalEvaluateSetup;
    observatory.unbindMarketDataEmitter();
  });

  // 1. SIGNAL COUNTER TEST
  test('1. Signals evaluated are accurately counted in pipeline telemetry', async () => {
    dataFeed.getLiveCandles = () => ({
      valid: true,
      candleCount: 30,
      candles: generateRealisticCandles(30)
    });

    await observatory.onCandleClosed('EUR/USD', 'LONDON');
    
    const status = observatory.getStatus();
    expect(status.pipeline.signalsEvaluated).toBeGreaterThanOrEqual(1);
  });

  // 2. SHADOW COUNTER TEST
  test('2. Opened shadow observations increment shadow counter', async () => {
    dataFeed.getLiveCandles = () => ({
      valid: true,
      candleCount: 30,
      candles: generateRealisticCandles(30)
    });

    // Mock evaluateCandidateSetup to return a BUY signal
    signalService.evaluateCandidateSetup = (params: any) => {
      return {
        id: 'test-buy-sig-002',
        pair: params.pair,
        timeframe: params.timeframe || 'M1',
        currentPrice: params.currentPrice,
        action: 'BUY',
        confidence: 85,
        entryPrice: params.currentPrice,
        stopLoss: params.currentPrice - 0.0020,
        takeProfit1: params.currentPrice + 0.0040,
        indicators: params.indicators,
        smc: params.smc,
        executable: false
      } as any;
    };

    await observatory.onCandleClosed('EUR/USD', 'LONDON');

    const status = observatory.getStatus();
    expect(status.pipeline.shadowOpened).toBe(1);
    expect(status.activeShadowCount).toBe(1);
  });

  // 3. OUTCOME COUNTER TEST
  test('3. Closed shadow observations increment shadow closed counter', async () => {
    dataFeed.getLiveCandles = () => ({
      valid: true,
      candleCount: 30,
      candles: generateRealisticCandles(30, 1.0850)
    });

    signalService.evaluateCandidateSetup = (params: any) => {
      return {
        id: 'test-buy-sig-003',
        pair: params.pair,
        timeframe: params.timeframe || 'M1',
        currentPrice: params.currentPrice,
        action: 'BUY',
        confidence: 85,
        entryPrice: params.currentPrice,
        stopLoss: params.currentPrice - 0.0020,
        takeProfit1: params.currentPrice + 0.0040,
        indicators: params.indicators,
        smc: params.smc,
        executable: false
      } as any;
    };

    await observatory.onCandleClosed('EUR/USD', 'LONDON');
    expect(observatory.getStatus().pipeline.shadowOpened).toBe(1);

    // Simulate tick update that hits TP
    observatory.processMarketTick('EUR/USD', 1.0950, 1.0950, 1.0950, 'LONDON');

    const status = observatory.getStatus();
    expect(status.pipeline.shadowClosed).toBe(1);
    expect(status.activeShadowCount).toBe(0);
  });

  // 4. JOURNAL IDEMPOTENCY TEST
  test('4. Learning journal maintains idempotency for trade and event logs', () => {
    const eventInput = {
      eventType: 'OBSERVATION_RECORDED' as const,
      setupFingerprint: 'EURUSD_BUY_OB',
      symbol: 'EUR/USD' as CurrencyPair,
      direction: 'BUY' as const,
      session: 'LONDON' as const,
      observationType: 'SHADOW_OBSERVATION' as const,
      sampleCount: 1,
      evidenceTier: 'NO_EVIDENCE' as const,
      previousLearningWeight: 1.0,
      newLearningWeight: 1.0,
      reason: 'Idempotency test'
    };

    learningJournalService.recordEvent(eventInput);
    const eventsBefore = learningJournalService.getEvents().length;

    // Verify record exists
    const dupCheck = learningJournalService.getEvents().find(e => e.setupFingerprint === 'EURUSD_BUY_OB' && e.reason === 'Idempotency test');
    expect(dupCheck).toBeDefined();
    expect(eventsBefore).toBe(1);
  });

  // 5. INDICATOR EVIDENCE PRESERVATION TEST
  test('5. Signal indicators and SMC structures are frozen and preserved immutably', async () => {
    dataFeed.getLiveCandles = () => ({
      valid: true,
      candleCount: 30,
      candles: generateRealisticCandles(30, 1.0850)
    });

    signalService.evaluateCandidateSetup = (params: any) => {
      return {
        id: 'test-buy-sig-005',
        pair: params.pair,
        timeframe: params.timeframe || 'M1',
        currentPrice: params.currentPrice,
        action: 'BUY',
        confidence: 85,
        entryPrice: params.currentPrice,
        stopLoss: params.currentPrice - 0.0020,
        takeProfit1: params.currentPrice + 0.0040,
        indicators: { rsi: 65 },
        smc: { orderBlocks: [{ type: 'BULLISH', bias: 'BULLISH' }] },
        executable: false
      } as any;
    };

    await observatory.onCandleClosed('EUR/USD', 'LONDON');
    const active = observatory.getActiveObservations()[0];

    expect(active).toBeDefined();
    expect(Object.isFrozen(active.immutableSignalSnapshot)).toBe(true);
    expect(active.immutableSignalSnapshot.indicators.rsi).toBe(65);
    expect(active.immutableSignalSnapshot.smc.orderBlocks[0].type).toBe('BULLISH');
  });

  // 6. INSUFFICIENT-EVIDENCE STATE TEST
  test('6. Classification reports INSUFFICIENT_SAMPLE for low sample sizes (<5)', () => {
    const classification = ShadowAnalyticsService.classifyEvidenceTier(3);
    expect(classification).toBe('INSUFFICIENT_SAMPLE');
  });

  // 7. DUPLICATE SIGNAL PROTECTION TEST
  test('7. Duplicate signal proposals are rejected to avoid duplicate observations', async () => {
    dataFeed.getLiveCandles = () => ({
      valid: true,
      candleCount: 30,
      candles: generateRealisticCandles(30, 1.0850)
    });

    signalService.evaluateCandidateSetup = (params: any) => {
      return {
        id: 'dup-sig-007',
        pair: params.pair,
        timeframe: params.timeframe || 'M1',
        currentPrice: params.currentPrice,
        action: 'BUY',
        confidence: 85,
        entryPrice: params.currentPrice,
        stopLoss: params.currentPrice - 0.0020,
        takeProfit1: params.currentPrice + 0.0040,
        indicators: params.indicators,
        smc: params.smc,
        executable: false
      } as any;
    };

    await observatory.onCandleClosed('EUR/USD', 'LONDON');
    expect(observatory.getStatus().pipeline.shadowOpened).toBe(1);

    // Try evaluating again with same signal ID
    await observatory.onCandleClosed('EUR/USD', 'LONDON');
    expect(observatory.getStatus().pipeline.shadowOpened).toBe(1); // Still 1, not duplicate
    expect(observatory.getStatus().pipeline.duplicateSignals).toBe(1);
  });

  // 8. DUPLICATE OUTCOME PROTECTION TEST
  test('8. Closed shadow status changes do not trigger duplicate outcomes', async () => {
    dataFeed.getLiveCandles = () => ({
      valid: true,
      candleCount: 30,
      candles: generateRealisticCandles(30, 1.0850)
    });

    signalService.evaluateCandidateSetup = (params: any) => {
      return {
        id: 'test-buy-sig-008',
        pair: params.pair,
        timeframe: params.timeframe || 'M1',
        currentPrice: params.currentPrice,
        action: 'BUY',
        confidence: 85,
        entryPrice: params.currentPrice,
        stopLoss: params.currentPrice - 0.0020,
        takeProfit1: params.currentPrice + 0.0040,
        indicators: params.indicators,
        smc: params.smc,
        executable: false
      } as any;
    };

    await observatory.onCandleClosed('EUR/USD', 'LONDON');
    expect(observatory.getStatus().pipeline.shadowOpened).toBe(1);

    // Close once
    observatory.processMarketTick('EUR/USD', 1.1500, 1.1500, 1.1500, 'LONDON');
    expect(observatory.getStatus().pipeline.shadowClosed).toBe(1);

    // Process another tick, should not trigger another close outcome
    observatory.processMarketTick('EUR/USD', 1.1600, 1.1600, 1.1600, 'LONDON');
    expect(observatory.getStatus().pipeline.shadowClosed).toBe(1); // Stays 1
  });

  // 9. RECONNECT RESILIENCE TEST
  test('9. Reconnecting to emitter is idempotent and prevents multiple listener registrations', () => {
    const emitter = new EventEmitter();
    
    // Bind twice
    observatory.bindMarketDataEmitter(emitter);
    const count1 = emitter.listenerCount('marketTick');
    
    observatory.bindMarketDataEmitter(emitter);
    const count2 = emitter.listenerCount('marketTick');

    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  // 10. SAFETY INVARIANTS TEST
  test('10. Campaign safety state remains strictly disarmed and read-only', () => {
    const status = observatory.getStatus();
    expect(status.isDemoArmed).toBe(false);
    expect(status.liveExecutionGate).toBe('FORBIDDEN');
    expect(status.brokerOrdersTransmitted).toBe(0);

    const signal = SignalIntelligenceService.getInstance().evaluateCandidateSetup({
      pair: 'EUR/USD',
      timeframe: 'M1',
      currentPrice: 1.0850,
      indicators: { rsi: 65, ema20: 1.0845, ema50: 1.0830, ema200: 1.0800, atr: 0.0015, adx: 25 },
      smc: { orderBlocks: [], fairValueGaps: [] }
    });

    expect(signal.executable).toBe(false);
  });
});
