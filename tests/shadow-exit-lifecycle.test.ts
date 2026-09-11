import { describe, it, expect, beforeEach } from 'vitest';
import { ContinuousLearningObservatoryService, ActiveShadowObservation } from '../src/server/services/continuousLearningObservatoryService';

describe('Shadow Position Exit / SL / TP Forensic Lifecycle Suite', () => {
  let observatory: ContinuousLearningObservatoryService;

  beforeEach(() => {
    observatory = ContinuousLearningObservatoryService.getInstance();
    observatory.startObservatory();
    // Clear any test active observations
    (observatory as any).activeObservations.clear();
    (observatory as any).completedObservations = [];
  });

  it('correctly triggers STOP_LOSS exit for a SELL position when price reaches or exceeds SL', () => {
    const testShadow: ActiveShadowObservation = {
      id: 'test-shadow-sell-sl',
      signalId: 'sig-test-1',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 100.00,
      stopLoss: 101.00,
      initialStopLoss: 101.00,
      takeProfit1: 99.00,
      takeProfit2: 98.00,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 100.00,
      lowestPriceSeen: 100.00,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION'
    };

    (observatory as any).activeObservations.set(testShadow.id, testShadow);

    // Feed price below SL: 100.50 (adverse move, but not SL)
    let closed = observatory.processMarketTick('USD/JPY', 100.50);
    expect(closed).toHaveLength(0);
    expect(testShadow.status).toBe('ACTIVE');
    expect(testShadow.highestPriceSeen).toBe(100.50);
    expect(testShadow.maePips).toBe(50); // 0.50 * 100 for JPY

    // Feed price below SL: 100.99
    closed = observatory.processMarketTick('USD/JPY', 100.99);
    expect(closed).toHaveLength(0);
    expect(testShadow.status).toBe('ACTIVE');

    // Feed price hitting SL: 101.00
    closed = observatory.processMarketTick('USD/JPY', 101.00);
    expect(closed).toHaveLength(1);
    expect(closed[0].id).toBe('test-shadow-sell-sl');
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('STOP_LOSS');
    expect(closed[0].exitPrice).toBe(101.00);
    expect(closed[0].realizedR).toBe(-1);
    expect((observatory as any).activeObservations.has('test-shadow-sell-sl')).toBe(false);
    expect((observatory as any).completedObservations[0].id).toBe('test-shadow-sell-sl');
  });

  it('correctly executes multi-stage TP for SELL: TP1 -> Move SL to BE -> TP2 Full Close', () => {
    const testShadow: ActiveShadowObservation = {
      id: 'test-shadow-sell-tp',
      signalId: 'sig-test-2',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 100.00,
      stopLoss: 101.00,
      initialStopLoss: 101.00,
      takeProfit1: 99.00,
      takeProfit2: 98.00,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 100.00,
      lowestPriceSeen: 100.00,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION'
    };

    (observatory as any).activeObservations.set(testShadow.id, testShadow);

    // 1. Price moves in favor to 99.50
    let closed = observatory.processMarketTick('USD/JPY', 99.50);
    expect(closed).toHaveLength(0);
    expect(testShadow.mfePips).toBe(50);

    // 2. Price hits TP1 (99.00)
    closed = observatory.processMarketTick('USD/JPY', 99.00);
    expect(closed).toHaveLength(0); // Multi-target does NOT close on TP1; it continues to TP2
    expect(testShadow.tp1Hit).toBe(true);
    expect(testShadow.stopLoss).toBe(100.00); // SL moved to breakeven (entryPrice)
    expect(testShadow.status).toBe('ACTIVE');

    // 3. Price pulls back to 99.50 (below BE, above TP2)
    closed = observatory.processMarketTick('USD/JPY', 99.50);
    expect(closed).toHaveLength(0);
    expect(testShadow.status).toBe('ACTIVE');

    // 4. Price reaches TP2 (98.00)
    closed = observatory.processMarketTick('USD/JPY', 98.00);
    expect(closed).toHaveLength(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('TAKE_PROFIT_2');
    expect(closed[0].exitPrice).toBe(98.00);
    expect(closed[0].realizedR).toBe(2); // (100 - 98) / (101 - 100) = +2R
  });

  it('correctly executes BREAKEVEN exit when price returns to Entry after TP1 is hit', () => {
    const testShadow: ActiveShadowObservation = {
      id: 'test-shadow-sell-be',
      signalId: 'sig-test-3',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 100.00,
      stopLoss: 101.00,
      initialStopLoss: 101.00,
      takeProfit1: 99.00,
      takeProfit2: 98.00,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 100.00,
      lowestPriceSeen: 100.00,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION'
    };

    (observatory as any).activeObservations.set(testShadow.id, testShadow);

    // Hit TP1
    observatory.processMarketTick('USD/JPY', 99.00);
    expect(testShadow.tp1Hit).toBe(true);
    expect(testShadow.stopLoss).toBe(100.00);

    // Price reverses back up to Entry price (100.00)
    const closed = observatory.processMarketTick('USD/JPY', 100.00);
    expect(closed).toHaveLength(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('BREAKEVEN');
    expect(closed[0].exitPrice).toBe(100.00);
    expect(closed[0].realizedR).toBe(0);
  });

  it('correctly executes STOP_LOSS and TAKE_PROFIT for a BUY position', () => {
    const testBuy: ActiveShadowObservation = {
      id: 'test-shadow-buy',
      signalId: 'sig-test-4',
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'EUR/USD_BUY_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 1.1000,
      stopLoss: 1.0950,
      initialStopLoss: 1.0950,
      takeProfit1: 1.1050,
      takeProfit2: 1.1100,
      isMultiTarget: false, // Single target test
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 1.1000,
      lowestPriceSeen: 1.1000,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION'
    };

    (observatory as any).activeObservations.set(testBuy.id, testBuy);

    // Price hits single TP1 (1.1050)
    const closed = observatory.processMarketTick('EUR/USD', 1.1050);
    expect(closed).toHaveLength(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('TAKE_PROFIT_1');
    expect(closed[0].exitPrice).toBe(1.1050);
    expect(closed[0].realizedR).toBe(1);
  });
});
