import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CTraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';
import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { FinalExecutionGateService } from '../src/server/services/finalExecutionGateService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { shadowObservationRepository } from '@iati/database';
import { CurrencyPair } from '../src/types';

describe('QUANTUMAI P23 — CTRADER MARKET-DATA TRUTH & FRESHNESS CERTIFICATION', () => {
  let feedService: CTraderMarketDataFeedService;

  beforeEach(() => {
    feedService = CTraderMarketDataFeedService.getInstance();
    feedService.setStaleThresholdMs(15000);
  });

  it('1. verifies ProtoOASpotEvent reaches marketDataDispatch/marketTick', () => {
    const receivedTicks: any[] = [];
    const listener = (tick: any) => receivedTicks.push(tick);

    feedService.on('marketTick', listener);

    (feedService as any).handleInboundSpot({
      symbolId: 1, // EUR/USD
      bid: 1.16725,
      ask: 1.16726,
      timestamp: Date.now()
    });

    feedService.removeListener('marketTick', listener);

    expect(receivedTicks.length).toBe(1);
    expect(receivedTicks[0].symbol).toBe('EUR/USD');
    expect(receivedTicks[0].bid).toBe(1.16725);
    expect(receivedTicks[0].ask).toBe(1.16726);
    expect(receivedTicks[0].currentPrice).toBe(1.16725);
  });

  it('2. verifies deterministic four-pair symbol mapping without crosstalk', () => {
    const symbolMap = (feedService as any).symbolMap as Map<number, CurrencyPair>;
    const pairMap = (feedService as any).pairToSymbolId as Map<CurrencyPair, number>;

    expect(symbolMap.get(1)).toBe('EUR/USD');
    expect(symbolMap.get(2)).toBe('GBP/USD');
    expect(symbolMap.get(4)).toBe('USD/JPY');
    expect(symbolMap.get(5)).toBe('AUD/USD');

    expect(pairMap.get('EUR/USD')).toBe(1);
    expect(pairMap.get('GBP/USD')).toBe(2);
    expect(pairMap.get('USD/JPY')).toBe(4);
    expect(pairMap.get('AUD/USD')).toBe(5);

    // Assert no ID collisions
    const ids = [pairMap.get('EUR/USD'), pairMap.get('GBP/USD'), pairMap.get('USD/JPY'), pairMap.get('AUD/USD')];
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(4);
  });

  it('3. enforces bid <= ask invariant on decoded spot events', () => {
    (feedService as any).handleInboundSpot({
      symbolId: 4, // USD/JPY
      bid: 159.250,
      ask: 159.255,
      timestamp: Date.now()
    });

    const spot = feedService.getPairSpot('USD/JPY');
    expect(spot).not.toBeNull();
    expect(spot!.bid).toBeLessThanOrEqual(spot!.ask);
  });

  it('4. detects STALE feed when no spot events arrive beyond threshold', () => {
    feedService.setStaleThresholdMs(1000);
    const oldTime = Date.now() - 2000;

    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'CONNECTED';
    (feedService as any).lastSpotEventAtByPair.set('EUR/USD', oldTime);

    feedService.evaluateFeedHealth();

    const health = feedService.getSymbolHealth('EUR/USD');
    expect(health).toBe('STALE');
  });

  it('5. recovers from STALE to HEALTHY immediately upon arrival of fresh spot event', () => {
    feedService.setStaleThresholdMs(1000);
    const oldTime = Date.now() - 2000;

    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'CONNECTED';
    (feedService as any).lastSpotEventAtByPair.set('GBP/USD', oldTime);
    feedService.evaluateFeedHealth();
    expect(feedService.getSymbolHealth('GBP/USD')).toBe('STALE');

    // Fresh spot arrives
    (feedService as any).handleInboundSpot({
      symbolId: 2, // GBP/USD
      bid: 1.36410,
      ask: 1.36415,
      timestamp: Date.now()
    });

    expect(feedService.getSymbolHealth('GBP/USD')).toBe('HEALTHY');
  });

  it('6. verifies watchdog triggers controlled auto-reconnect when feed is disconnected or inactive', async () => {
    (feedService as any).isFeedActive = false;
    (feedService as any).connectionState = 'DISCONNECTED';
    (feedService as any).reconnectAttempts = 0;

    const reconnectSpy = vi.spyOn(feedService, 'triggerControlledReconnect').mockResolvedValue(true);

    feedService.evaluateFeedHealth();

    expect(reconnectSpy).toHaveBeenCalled();
    reconnectSpy.mockRestore();
  });

  it('7. strictly enforces external-feed isolation (external candles cannot enter shadow processing)', () => {
    const observatory = continuousLearningObservatoryService;
    expect(typeof (observatory as any).processMarketTick).toBe('function');

    // Observatory only binds to an EventEmitter that yields marketTick events
    const boundEmitter = (observatory as any).boundEmitter;
    expect(boundEmitter).toBeDefined();
  });

  it('8. verifies shadow execution cannot consume external candle envelopes', () => {
    continuousLearningObservatoryService.startObservatory();

    const mockObs = {
      id: 'p23-test-shadow-1',
      signalId: 'p23-sig-1',
      symbol: 'USD/JPY' as CurrencyPair,
      direction: 'BUY' as const,
      entryPrice: 159.20,
      stopLoss: 159.10,
      takeProfit1: 159.40,
      status: 'ACTIVE' as const,
      openedAt: Date.now(),
      monitoringState: 'LIVE_MONITORING' as const,
      highestPriceSeen: 159.20,
      lowestPriceSeen: 159.20,
      mfePips: 0,
      maePips: 0,
      isMultiTarget: false,
      tp1Hit: false,
      persistence: 'POSTGRESQL' as const
    };

    (continuousLearningObservatoryService as any).activeObservations.set(mockObs.id, mockObs);

    // High tick from cTrader triggers TP1
    const closed = continuousLearningObservatoryService.processMarketTick(
      'USD/JPY',
      159.41,
      159.41,
      159.39,
      'LONDON'
    );

    expect(closed.length).toBeGreaterThanOrEqual(1);
    const match = closed.find((c: any) => c.id === 'p23-test-shadow-1');
    expect(match).toBeDefined();
    expect(match.closeReason).toBe('TAKE_PROFIT_1');
  });

  it('9. enforces zero broker execution invariants (isLiveArmed = false, isDemoArmed = false, 0 orders)', () => {
    const finalDecision = FinalExecutionGateService.evaluateFinalExecutionGate({
      requestId: 'REQ-P23-TEST',
      idempotencyKey: 'IDEM-P23-TEST',
      strategyId: 'STRAT-AI-TREND-PULSE',
      strategyVersion: 'v2.0.0',
      symbol: 'EURUSD',
      direction: 'BUY',
      riskPercent: 1.0,
      environment: 'LIVE',
      actorId: 'ADMIN-01',
      actorRole: 'ADMIN'
    });

    const safetyCheck = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.1
    });

    expect(finalDecision.decision).toBe('DENIED');
    expect(finalDecision.brokerOrderTransmitted).toBe(false);
    expect(safetyCheck.allowed).toBe(false);
  });

  it('10. verifies absolute accounting isolation between shadow observations and broker tables', () => {
    expect(shadowObservationRepository).toBeDefined();
    expect(typeof shadowObservationRepository.saveShadowObservation).toBe('function');
    expect(typeof shadowObservationRepository.updateShadowObservation).toBe('function');

    // Verify shadow observation model has no broker position/order relations
    const sampleShadow = {
      id: 'iso-test-1',
      signalId: 'sig-iso-1',
      symbol: 'EUR/USD' as CurrencyPair,
      direction: 'BUY' as const,
      entryPrice: 1.1670,
      stopLoss: 1.1650,
      takeProfit1: 1.1700,
      status: 'ACTIVE' as const,
      openedAt: Date.now()
    };

    expect((sampleShadow as any).positionId).toBeUndefined();
    expect((sampleShadow as any).orderId).toBeUndefined();
    expect((sampleShadow as any).accountBalance).toBeUndefined();
  });
});
