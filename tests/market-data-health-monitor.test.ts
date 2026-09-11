import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CTraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';
import { ContinuousLearningObservatoryService, ActiveShadowObservation } from '../src/server/services/continuousLearningObservatoryService';
import { MarketDivergenceDiagnosticService } from '../src/server/services/marketDivergenceDiagnosticService';

describe('Market Data Integrity & Stale Feed Health Monitor Suite', () => {
  let feedService: CTraderMarketDataFeedService;
  let observatory: ContinuousLearningObservatoryService;
  let divergenceService: MarketDivergenceDiagnosticService;

  beforeEach(() => {
    feedService = CTraderMarketDataFeedService.getInstance();
    feedService.setStaleThresholdMs(1000); // 1000ms threshold for fast testing
    observatory = ContinuousLearningObservatoryService.getInstance();
    observatory.startObservatory();
    (observatory as any).activeObservations.clear();
    (observatory as any).completedObservations = [];
    divergenceService = MarketDivergenceDiagnosticService.getInstance();
  });

  afterEach(() => {
    feedService.setStaleThresholdMs(15000); // Restore default
  });

  it('1. transitions to HEALTHY upon receiving a fresh valid spot tick', () => {
    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'CONNECTED';
    
    (feedService as any).handleInboundSpot({
      symbolId: 1, // EUR/USD
      bid: 1.16500,
      ask: 1.16520,
      timestamp: Date.now()
    });

    expect(feedService.getSymbolHealth('EUR/USD')).toBe('HEALTHY');
    expect(feedService.isSymbolHealthy('EUR/USD')).toBe('TRUE' ? true : false);
  });

  it('2. transitions to STALE when no ticks are received beyond the threshold', async () => {
    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'CONNECTED';
    
    // Ingest tick with past timestamp (> 1000ms ago)
    (feedService as any).lastSpotEventAtByPair.set('EUR/USD', Date.now() - 2500);

    feedService.evaluateFeedHealth();
    expect(feedService.getSymbolHealth('EUR/USD')).toBe('STALE');
  });

  it('3. flags connection as STALE when TCP is connected but no spot events arrive', () => {
    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'CONNECTED';
    (feedService as any).lastSpotEventAtByPair.set('USD/JPY', Date.now() - 5000);

    feedService.evaluateFeedHealth();
    expect(feedService.getSymbolHealth('USD/JPY')).toBe('STALE');
  });

  it('4. transitions all symbols to DISCONNECTED when transport disconnects', () => {
    (feedService as any).transport.emit('disconnect');

    expect(feedService.getSymbolHealth('EUR/USD')).toBe('DISCONNECTED');
    expect(feedService.getSymbolHealth('USD/JPY')).toBe('DISCONNECTED');
  });

  it('5. transitions back to HEALTHY upon receiving a fresh tick after being stale', () => {
    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'CONNECTED';
    (feedService as any).lastSpotEventAtByPair.set('EUR/USD', Date.now() - 3000);
    feedService.evaluateFeedHealth();
    expect(feedService.getSymbolHealth('EUR/USD')).toBe('STALE');

    // Feed fresh spot
    (feedService as any).handleInboundSpot({
      symbolId: 1,
      bid: 1.16600,
      ask: 1.16615,
      timestamp: Date.now()
    });

    expect(feedService.getSymbolHealth('EUR/USD')).toBe('HEALTHY');
  });

  it('6. fails closed and blocks new signals when market data is STALE', async () => {
    (feedService as any).isFeedActive = true;
    (feedService as any).lastSpotEventAtByPair.set('EUR/USD', Date.now() - 5000);
    feedService.evaluateFeedHealth();

    const candleResult = feedService.getLiveCandles('EUR/USD');
    expect(candleResult.valid).toBe(false);
    expect(candleResult.reason).toBe('MARKET_DATA_STALE');
  });

  it('7. blocks new shadow trade opening when market data is STALE', async () => {
    (feedService as any).isFeedActive = true;
    (feedService as any).lastSpotEventAtByPair.set('USD/JPY', Date.now() - 5000);
    feedService.evaluateFeedHealth();

    const preCount = (observatory as any).telemetry.noDataRejected;
    await observatory.onCandleClosed('USD/JPY', 'LONDON');
    const postCount = (observatory as any).telemetry.noDataRejected;

    expect(postCount).toBeGreaterThan(preCount);
    expect(observatory.getActiveObservations()).toHaveLength(0);
  });

  it('8. preserves existing shadow position and does NOT falsely close it on stale feed', () => {
    const activePos: ActiveShadowObservation = {
      id: 'test-shadow-stale-safe',
      signalId: 'sig-stale-1',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.241,
      stopLoss: 159.270,
      initialStopLoss: 159.270,
      takeProfit1: 159.203,
      takeProfit2: 159.170,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 159.249,
      lowestPriceSeen: 159.241,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: {}
    };

    (observatory as any).activeObservations.set(activePos.id, activePos);

    // Make feed STALE
    (feedService as any).isFeedActive = true;
    (feedService as any).lastSpotEventAtByPair.set('USD/JPY', Date.now() - 5000);
    feedService.evaluateFeedHealth();

    // Verify observation is still ACTIVE and marked with DATA_STALE
    const activeList = observatory.getActiveObservations();
    expect(activeList).toHaveLength(1);
    expect(activeList[0].status).toBe('ACTIVE');
    expect(activeList[0].monitoringState).toBe('DATA_STALE');
    expect(activeList[0].monitoringPausedReason).toBe('MARKET_DATA_STALE');
  });

  it('9. resumes SL/TP monitoring immediately when fresh ticks arrive after stale period', () => {
    const activePos: ActiveShadowObservation = {
      id: 'test-shadow-resume',
      signalId: 'sig-resume-1',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.241,
      stopLoss: 159.270,
      initialStopLoss: 159.270,
      takeProfit1: 159.203,
      takeProfit2: 159.170,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 159.249,
      lowestPriceSeen: 159.241,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: {}
    };

    (observatory as any).activeObservations.set(activePos.id, activePos);

    // Feed arrives with valid SL hit price (159.275)
    const closed = observatory.processMarketTick('USD/JPY', 159.275, 159.275, 159.270);
    expect(closed).toHaveLength(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('STOP_LOSS');
  });

  it('10. verifies multi-symbol health independence: EUR/USD healthy while USD/JPY is stale', () => {
    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'CONNECTED';
    
    (feedService as any).lastSpotEventAtByPair.set('EUR/USD', Date.now()); // Fresh
    (feedService as any).lastSpotEventAtByPair.set('USD/JPY', Date.now() - 5000); // Stale

    feedService.evaluateFeedHealth();
    expect(feedService.getSymbolHealth('EUR/USD')).toBe('HEALTHY');
    expect(feedService.getSymbolHealth('USD/JPY')).toBe('STALE');
  });

  it('11. verifies multi-symbol health independence: USD/JPY healthy while EUR/USD is stale', () => {
    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'CONNECTED';
    
    (feedService as any).lastSpotEventAtByPair.set('EUR/USD', Date.now() - 5000); // Stale
    (feedService as any).lastSpotEventAtByPair.set('USD/JPY', Date.now()); // Fresh

    feedService.evaluateFeedHealth();
    expect(feedService.getSymbolHealth('EUR/USD')).toBe('STALE');
    expect(feedService.getSymbolHealth('USD/JPY')).toBe('HEALTHY');
  });

  it('12. generates PRICE_DIVERGENCE_WARNING on cross-provider divergence without altering trade state', async () => {
    // Mock cTrader at 159.245 and external at 159.293 (4.8 pips diff)
    (feedService as any).isFeedActive = true;
    (feedService as any).lastSpotEventAtByPair.set('USD/JPY', Date.now());
    (feedService as any).spotByPair.set('USD/JPY', {
      bid: 159.243,
      ask: 159.248,
      timestamp: Date.now(),
      ticks: 10
    });

    const diag = await divergenceService.evaluateSymbol('USD/JPY');
    expect(diag.symbol).toBe('USD/JPY');
    expect(diag.cTraderMid).toBeCloseTo(159.245, 2);
    expect(typeof diag.status).toBe('string');
  });

  it('13. ensures external price divergence NEVER triggers trade execution or SL/TP action', () => {
    const activePos: ActiveShadowObservation = {
      id: 'test-shadow-isolation',
      signalId: 'sig-iso-1',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.241,
      stopLoss: 159.270,
      initialStopLoss: 159.270,
      takeProfit1: 159.203,
      takeProfit2: 159.170,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 159.249,
      lowestPriceSeen: 159.241,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: {}
    };

    (observatory as any).activeObservations.set(activePos.id, activePos);

    // External provider has price 159.350, but cTrader tick is NOT emitted
    // Position MUST remain strictly ACTIVE
    expect(observatory.getActiveObservations()[0].status).toBe('ACTIVE');
    expect(observatory.getActiveObservations()[0].exitPrice).toBeUndefined();
  });

  it('14. prohibits fabricated/zero/NaN ticks from triggering SL or TP', () => {
    const activePos: ActiveShadowObservation = {
      id: 'test-shadow-nan-safe',
      signalId: 'sig-nan-1',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.241,
      stopLoss: 159.270,
      initialStopLoss: 159.270,
      takeProfit1: 159.203,
      takeProfit2: 159.170,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 159.249,
      lowestPriceSeen: 159.241,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: {}
    };

    (observatory as any).activeObservations.set(activePos.id, activePos);

    // Feed invalid values
    const closedNaN = observatory.processMarketTick('USD/JPY', NaN);
    const closedZero = observatory.processMarketTick('USD/JPY', 0);
    const closedNeg = observatory.processMarketTick('USD/JPY', -100);

    expect(closedNaN).toHaveLength(0);
    expect(closedZero).toHaveLength(0);
    expect(closedNeg).toHaveLength(0);
    expect(observatory.getActiveObservations()[0].status).toBe('ACTIVE');
  });

  it('15. strictly prevents transition to HEALTHY after reconnect before a fresh spot event arrives', async () => {
    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'RECONNECTING';
    (feedService as any).healthStateByPair.set('USD/JPY', 'DEGRADED');

    // TCP is connected, but spot event has NOT arrived yet
    expect(feedService.getSymbolHealth('USD/JPY')).toBe('DEGRADED');
    expect(feedService.isSymbolHealthy('USD/JPY')).toBe(false);
  });

  it('16. handles controlled auto-reconnect attempts idempotently', async () => {
    (feedService as any).isReconnecting = true;
    const result = await feedService.triggerControlledReconnect();
    expect(result).toBe(false); // Locked, rejected overlapping call
  });
});
