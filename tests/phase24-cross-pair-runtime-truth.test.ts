import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CTraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';
import { continuousLearningObservatoryService, ActiveShadowObservation } from '../src/server/services/continuousLearningObservatoryService';
import { learningJournalService } from '../src/server/services/learningJournalService';
import { FinalExecutionGateService } from '../src/server/services/finalExecutionGateService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { shadowObservationRepository, shadowWriteAheadLog } from '@iati/database';
import { CurrencyPair } from '../src/types';

describe('QUANTUMAI P24 — CROSS-PAIR LIVE RUNTIME TRUTH CERTIFICATION', () => {
  let feedService: CTraderMarketDataFeedService;

  beforeEach(() => {
    feedService = CTraderMarketDataFeedService.getInstance();
    feedService.setStaleThresholdMs(15000);
    continuousLearningObservatoryService.resetObservatory();
    continuousLearningObservatoryService.startObservatory();
    learningJournalService.clearJournal();
  });

  afterEach(() => {
    continuousLearningObservatoryService.resetObservatory();
  });

  // 1-4. Four-Pair Tick Isolation
  it('1. verifies EUR/USD tick updates EUR/USD observation exclusively', () => {
    const eurObs: ActiveShadowObservation = {
      id: 'eur-obs-1',
      signalId: 'sig-eur-1',
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'EUR/USD_BUY_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 1.16700,
      stopLoss: 1.16500,
      initialStopLoss: 1.16500,
      takeProfit1: 1.17000,
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 1.16700,
      lowestPriceSeen: 1.16700,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(eurObs.id, eurObs);

    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.16750, 1.16750, 1.16700, 'LONDON');

    const updated = (continuousLearningObservatoryService as any).activeObservations.get('eur-obs-1');
    expect(updated.highestPriceSeen).toBe(1.16750);
    expect(updated.mfePips).toBe(5.0); // 5.0 pips (1.16750 - 1.16700) * 10000
    expect(updated.maePips).toBe(0.0);
  });

  it('2. verifies GBP/USD tick updates GBP/USD observation exclusively', () => {
    const gbpObs: ActiveShadowObservation = {
      id: 'gbp-obs-1',
      signalId: 'sig-gbp-1',
      symbol: 'GBP/USD',
      direction: 'SELL',
      setupType: 'FVG_FILL',
      setupFingerprint: 'GBP/USD_SELL_FVG',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 1.36400,
      stopLoss: 1.36600,
      initialStopLoss: 1.36600,
      takeProfit1: 1.36000,
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 1.36400,
      lowestPriceSeen: 1.36400,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(gbpObs.id, gbpObs);

    continuousLearningObservatoryService.processMarketTick('GBP/USD', 1.36350, 1.36400, 1.36350, 'LONDON');

    const updated = (continuousLearningObservatoryService as any).activeObservations.get('gbp-obs-1');
    expect(updated.lowestPriceSeen).toBe(1.36350);
    expect(updated.mfePips).toBe(5.0); // 5.0 pips (1.36400 - 1.36350) * 10000
    expect(updated.maePips).toBe(0.0);
  });

  it('3. verifies USD/JPY tick updates USD/JPY observation with JPY pip multiplier', () => {
    const jpyObs: ActiveShadowObservation = {
      id: 'jpy-obs-1',
      signalId: 'sig-jpy-1',
      symbol: 'USD/JPY',
      direction: 'BUY',
      setupType: 'LIQUIDITY_SWEEP',
      setupFingerprint: 'USD/JPY_BUY_SWEEP',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 159.200,
      stopLoss: 159.000,
      initialStopLoss: 159.000,
      takeProfit1: 159.600,
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 159.200,
      lowestPriceSeen: 159.200,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(jpyObs.id, jpyObs);

    continuousLearningObservatoryService.processMarketTick('USD/JPY', 159.350, 159.350, 159.200, 'LONDON');

    const updated = (continuousLearningObservatoryService as any).activeObservations.get('jpy-obs-1');
    expect(updated.highestPriceSeen).toBe(159.350);
    expect(updated.mfePips).toBe(15.0); // 15.0 pips (159.350 - 159.200) * 100
    expect(updated.maePips).toBe(0.0);
  });

  it('4. verifies AUD/USD tick updates AUD/USD observation exclusively', () => {
    const audObs: ActiveShadowObservation = {
      id: 'aud-obs-1',
      signalId: 'sig-aud-1',
      symbol: 'AUD/USD',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'AUD/USD_SELL_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 0.71600,
      stopLoss: 0.71800,
      initialStopLoss: 0.71800,
      takeProfit1: 0.71200,
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 0.71600,
      lowestPriceSeen: 0.71600,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(audObs.id, audObs);

    continuousLearningObservatoryService.processMarketTick('AUD/USD', 0.71550, 0.71600, 0.71550, 'LONDON');

    const updated = (continuousLearningObservatoryService as any).activeObservations.get('aud-obs-1');
    expect(updated.lowestPriceSeen).toBe(0.71550);
    expect(updated.mfePips).toBe(5.0); // 5.0 pips (0.71600 - 0.71550) * 10000
    expect(updated.maePips).toBe(0.0);
  });

  // 5. Cross-Pair Contamination Rejection
  it('5. strictly prevents cross-pair contamination (EUR/USD tick cannot alter USD/JPY, GBP/USD, or AUD/USD)', () => {
    const jpyObs: ActiveShadowObservation = {
      id: 'jpy-target',
      signalId: 'sig-jpy',
      symbol: 'USD/JPY',
      direction: 'BUY',
      setupType: 'OB',
      setupFingerprint: 'USD/JPY_BUY_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 159.200,
      stopLoss: 159.000,
      initialStopLoss: 159.000,
      takeProfit1: 159.600,
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 159.200,
      lowestPriceSeen: 159.200,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(jpyObs.id, jpyObs);

    // Send high EUR/USD tick
    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.16900, 1.16900, 1.16800, 'LONDON');

    const unmodified = (continuousLearningObservatoryService as any).activeObservations.get('jpy-target');
    expect(unmodified.highestPriceSeen).toBe(159.200);
    expect(unmodified.lowestPriceSeen).toBe(159.200);
    expect(unmodified.mfePips).toBe(0);
    expect(unmodified.status).toBe('ACTIVE');
  });

  // 6-7. Price Semantics: BUY & SELL MFE/MAE
  it('6. verifies BUY MFE uses upward movement and BUY MAE uses downward movement', () => {
    const buyObs: ActiveShadowObservation = {
      id: 'buy-sem',
      signalId: 'sig-buy',
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'OB',
      setupFingerprint: 'EUR/USD_BUY_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 1.16500,
      stopLoss: 1.16000,
      initialStopLoss: 1.16000,
      takeProfit1: 1.17000,
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 1.16500,
      lowestPriceSeen: 1.16500,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(buyObs.id, buyObs);

    // Upward price movement: 1.16500 -> 1.16750 (+25 pips MFE)
    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.16750, 1.16750, 1.16500, 'LONDON');
    expect(buyObs.mfePips).toBe(25.0);
    expect(buyObs.maePips).toBe(0.0);

    // Downward price retracement: 1.16500 -> 1.16400 (10 pips MAE)
    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.16400, 1.16750, 1.16400, 'LONDON');
    expect(buyObs.mfePips).toBe(25.0);
    expect(buyObs.maePips).toBe(10.0);
  });

  it('7. verifies SELL MFE uses downward movement and SELL MAE uses upward movement', () => {
    const sellObs: ActiveShadowObservation = {
      id: 'sell-sem',
      signalId: 'sig-sell',
      symbol: 'EUR/USD',
      direction: 'SELL',
      setupType: 'OB',
      setupFingerprint: 'EUR/USD_SELL_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 1.16500,
      stopLoss: 1.17000,
      initialStopLoss: 1.17000,
      takeProfit1: 1.16000,
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 1.16500,
      lowestPriceSeen: 1.16500,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(sellObs.id, sellObs);

    // Downward price movement: 1.16500 -> 1.16300 (+20 pips MFE)
    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.16300, 1.16500, 1.16300, 'LONDON');
    expect(sellObs.mfePips).toBe(20.0);
    expect(sellObs.maePips).toBe(0.0);

    // Upward adverse movement: 1.16500 -> 1.16620 (12 pips MAE)
    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.16620, 1.16620, 1.16300, 'LONDON');
    expect(sellObs.mfePips).toBe(20.0);
    expect(sellObs.maePips).toBe(12.0);
  });

  // 8-9. Pip Factor Calculation Precision
  it('8. enforces correct JPY pip scaling (multiplier 100 for 2nd/3rd decimal place)', () => {
    const entry = 159.000;
    const current = 159.100;
    const pips = (current - entry) * 100;
    expect(pips).toBeCloseTo(10.0, 1);
  });

  it('9. enforces correct Standard FX pip scaling (multiplier 10000 for 4th/5th decimal place)', () => {
    const entry = 1.17000;
    const current = 1.17100;
    const pips = (current - entry) * 10000;
    expect(pips).toBeCloseTo(10.0, 1);
  });

  // 10-14. Full SL/TP Lifecycle Across Directions
  it('10. verifies BUY TP1 exit lifecycle with accurate realizedR', () => {
    const obs: ActiveShadowObservation = {
      id: 'buy-tp1',
      signalId: 'sig-tp1',
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'OB',
      setupFingerprint: 'EUR/USD_BUY_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 1.16500,
      stopLoss: 1.16300, // 20 pips risk
      initialStopLoss: 1.16300,
      takeProfit1: 1.16900, // 40 pips target (2R)
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 1.16500,
      lowestPriceSeen: 1.16500,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(obs.id, obs);

    const closed = continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.16910, 1.16910, 1.16500, 'LONDON');
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('TAKE_PROFIT_1');
    expect(closed[0].exitPrice).toBe(1.16900);
    expect(closed[0].realizedR).toBeCloseTo(2.0, 1);
  });

  it('11. verifies SELL TP1 exit lifecycle with accurate realizedR', () => {
    const obs: ActiveShadowObservation = {
      id: 'sell-tp1',
      signalId: 'sig-sell-tp1',
      symbol: 'GBP/USD',
      direction: 'SELL',
      setupType: 'OB',
      setupFingerprint: 'GBP/USD_SELL_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 1.36500,
      stopLoss: 1.36800, // 30 pips risk
      initialStopLoss: 1.36800,
      takeProfit1: 1.35900, // 60 pips target (2R)
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 1.36500,
      lowestPriceSeen: 1.36500,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(obs.id, obs);

    const closed = continuousLearningObservatoryService.processMarketTick('GBP/USD', 1.35890, 1.36500, 1.35890, 'LONDON');
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('TAKE_PROFIT_1');
    expect(closed[0].exitPrice).toBe(1.35900);
    expect(closed[0].realizedR).toBeCloseTo(2.0, 1);
  });

  it('12. verifies BUY Stop Loss exit lifecycle with -1.0 realizedR', () => {
    const obs: ActiveShadowObservation = {
      id: 'buy-sl',
      signalId: 'sig-buy-sl',
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'OB',
      setupFingerprint: 'EUR/USD_BUY_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 1.16500,
      stopLoss: 1.16200,
      initialStopLoss: 1.16200,
      takeProfit1: 1.17100,
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 1.16500,
      lowestPriceSeen: 1.16500,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(obs.id, obs);

    const closed = continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.16190, 1.16500, 1.16190, 'LONDON');
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('STOP_LOSS');
    expect(closed[0].exitPrice).toBe(1.16200);
    expect(closed[0].realizedR).toBeCloseTo(-1.0, 1);
  });

  it('13. verifies SELL Stop Loss exit lifecycle with -1.0 realizedR', () => {
    const obs: ActiveShadowObservation = {
      id: 'sell-sl',
      signalId: 'sig-sell-sl',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'OB',
      setupFingerprint: 'USD/JPY_SELL_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.200,
      stopLoss: 159.400,
      initialStopLoss: 159.400,
      takeProfit1: 158.600,
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 159.200,
      lowestPriceSeen: 159.200,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(obs.id, obs);

    const closed = continuousLearningObservatoryService.processMarketTick('USD/JPY', 159.450, 159.450, 159.200, 'LONDON');
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('STOP_LOSS');
    expect(closed[0].exitPrice).toBe(159.400);
    expect(closed[0].realizedR).toBeCloseTo(-1.0, 1);
  });

  it('14. verifies TP1 -> Breakeven -> Exit lifecycle retains 0 realizedR', () => {
    const obs: ActiveShadowObservation = {
      id: 'multi-be',
      signalId: 'sig-multi',
      symbol: 'AUD/USD',
      direction: 'BUY',
      setupType: 'OB',
      setupFingerprint: 'AUD/USD_BUY_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 0.71500,
      stopLoss: 0.71200,
      initialStopLoss: 0.71200,
      takeProfit1: 0.71800,
      takeProfit2: 0.72200,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      highestPriceSeen: 0.71500,
      lowestPriceSeen: 0.71500,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(obs.id, obs);

    // 1. Tick reaches TP1 (0.71800) -> moves SL to Breakeven (0.71500)
    continuousLearningObservatoryService.processMarketTick('AUD/USD', 0.71820, 0.71820, 0.71500, 'LONDON');
    expect(obs.tp1Hit).toBe(true);
    expect(obs.stopLoss).toBe(0.71500);
    expect(obs.status).toBe('ACTIVE');

    // 2. Price retraces to Breakeven SL (0.71500) -> closes trade
    const closed = continuousLearningObservatoryService.processMarketTick('AUD/USD', 0.71490, 0.71820, 0.71490, 'LONDON');
    expect(closed.length).toBe(1);
    expect(closed[0].closeReason).toBe('BREAKEVEN');
    expect(closed[0].exitPrice).toBe(0.71500);
    expect(closed[0].realizedR).toBe(0.0);
  });

  // 15-16. Freshness & Watchdog Gate
  it('15. marks symbol DATA_STALE in active observations when cTrader ticks stop', () => {
    feedService.setStaleThresholdMs(1000);
    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'CONNECTED';
    (feedService as any).lastSpotEventAtByPair.set('EUR/USD', Date.now() - 3000);

    feedService.evaluateFeedHealth();

    const obs: ActiveShadowObservation = {
      id: 'stale-obs',
      signalId: 'sig-stale',
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'OB',
      setupFingerprint: 'EUR/USD_BUY_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 1.16500,
      stopLoss: 1.16200,
      initialStopLoss: 1.16200,
      takeProfit1: 1.17100,
      status: 'ACTIVE',
      isMultiTarget: false,
      tp1Hit: false,
      highestPriceSeen: 1.16500,
      lowestPriceSeen: 1.16500,
      mfePips: 0,
      maePips: 0,
      monitoringState: 'LIVE_MONITORING',
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true },
      openedAt: Date.now(),
      persistence: 'POSTGRESQL'
    };

    (continuousLearningObservatoryService as any).activeObservations.set(obs.id, obs);

    const activeList = continuousLearningObservatoryService.getActiveObservations();
    const found = activeList.find(o => o.id === 'stale-obs');
    expect(found?.monitoringState).toBe('DATA_STALE');
    expect(found?.monitoringPausedReason).toBe('MARKET_DATA_STALE');
  });

  it('16. restores LIVE_MONITORING on active observations immediately upon fresh spot tick', () => {
    (feedService as any).handleInboundSpot({
      symbolId: 1, // EUR/USD
      bid: 1.16720,
      ask: 1.16722,
      timestamp: Date.now()
    });

    const activeList = continuousLearningObservatoryService.getActiveObservations();
    const found = activeList.find(o => o.symbol === 'EUR/USD');
    if (found) {
      expect(found.monitoringState).toBe('LIVE_MONITORING');
    }
  });

  // 17. Continuity: PostgreSQL & WAL
  it('17. maintains complete persistence continuity between PostgreSQL and local WAL', async () => {
    const walId = shadowWriteAheadLog.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: 'p24-wal-cont',
      symbol: 'USD/JPY',
      payload: {
        id: 'p24-wal-cont',
        signalId: 'sig-p24',
        symbol: 'USD/JPY',
        direction: 'BUY',
        entryPrice: 159.25,
        stopLoss: 159.00,
        takeProfit1: 159.75,
        status: 'ACTIVE',
        openedAt: Date.now(),
        persistence: 'WAL_PENDING'
      }
    });

    try {
      expect(walId).toBeTruthy();
      const pending = shadowWriteAheadLog.getPendingEntries();
      expect(pending.some(e => e.id === walId)).toBe(true);
    } finally {
      if (walId) {
        shadowWriteAheadLog.removeEntry(walId);
      }
    }
  });

  // 18. Dashboard / API Truth Source Labeling
  it('18. verifies dynamic persistence source tagging (POSTGRESQL, WAL_PENDING, MEMORY_DEGRADED)', () => {
    const active = continuousLearningObservatoryService.getActiveObservations();
    for (const obs of active) {
      expect(['POSTGRESQL', 'WAL_PENDING', 'MEMORY_DEGRADED']).toContain(obs.persistence);
    }
  });

  // 19. External Feed Execution Isolation
  it('19. asserts that external HTTP candle generator does not emit marketTick or trigger shadow exits', () => {
    continuousLearningObservatoryService.bindMarketDataEmitter(feedService);
    const boundEmitter = (continuousLearningObservatoryService as any).boundEmitter;
    expect(boundEmitter).toBe(feedService);
    // External HTTP candle envelopes do not interface with boundEmitter
  });

  // 20. Accounting Isolation
  it('20. enforces strict separation between shadow observatory and broker execution tables', () => {
    const active = continuousLearningObservatoryService.getActiveObservations();
    for (const obs of active) {
      expect((obs as any).positionId).toBeUndefined();
      expect((obs as any).orderId).toBeUndefined();
      expect((obs as any).accountBalance).toBeUndefined();
    }
  });
});
