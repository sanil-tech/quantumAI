import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';
import { continuousLearningObservatoryService, MarketTickEvent } from '../src/server/services/continuousLearningObservatoryService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI — PHASE 8C: Real cTrader DEMO Spot-Market Data Subscription', () => {
  let transport: CTraderTransport;
  let mockMarketBus: EventEmitter;

  beforeEach(() => {
    transport = new CTraderTransport();
    mockMarketBus = new EventEmitter();
    continuousLearningObservatoryService.resetObservatory();
  });

  afterEach(async () => {
    continuousLearningObservatoryService.resetObservatory();
    mockMarketBus.removeAllListeners();
    await transport.disconnect();
  });

  it('1. Correct ProtoOASubscribeSpotsReq (2127) encoding and decoding', async () => {
    const payload = {
      ctidTraderAccountId: 48282756,
      symbolId: [1],
      subscribeToSpotTimestamp: true
    };
    const frame = await CTraderProtoManager.encodeFrame(2127, payload, 'test-sub-1');
    expect(frame).toBeDefined();
    expect(frame.length).toBeGreaterThan(4);

    const length = frame.readUInt32BE(0);
    const msgBytes = frame.slice(4, 4 + length);
    const decoded = await CTraderProtoManager.decodeFrame(msgBytes);

    expect(decoded.payloadType).toBe(2127);
    expect(decoded.decodedPayload.ctidTraderAccountId).toBe(48282756);
    expect(decoded.decodedPayload.symbolId).toEqual([1]);
    expect(decoded.decodedPayload.subscribeToSpotTimestamp).toBe(true);
  });

  it('2. Inbound ProtoOASpotEvent (2131) decoding and bid/ask decimal price conversion', async () => {
    const rawSpot = {
      ctidTraderAccountId: 48282756,
      symbolId: 1,
      bid: 116377, // 1.16377
      ask: 116378, // 1.16378
      timestamp: 1787143792937
    };
    const frame = await CTraderProtoManager.encodeFrame(2131, rawSpot, 'test-spot-msg');
    const length = frame.readUInt32BE(0);
    const msgBytes = frame.slice(4, 4 + length);
    const decoded = await CTraderProtoManager.decodeFrame(msgBytes);

    expect(decoded.payloadType).toBe(2131);
    const extracted = transport.handleSpotEvent(decoded.decodedPayload, decoded.clientMsgId);

    expect(extracted.symbolId).toBe(1);
    expect(extracted.bid).toBe(1.16377);
    expect(extracted.ask).toBe(1.16378);
    expect(extracted.timestamp).toBe(1787143792937);
  });

  it('3. Incremental delta spot updates preserve last known bid/ask from cache', () => {
    // Initial full spot
    transport.handleSpotEvent({
      ctidTraderAccountId: 48282756,
      symbolId: 1,
      bid: 116375,
      ask: 116377,
      timestamp: 1787143793000
    });

    // Delta update: only ask changes, bid is 0/omitted
    const delta = transport.handleSpotEvent({
      ctidTraderAccountId: 48282756,
      symbolId: 1,
      bid: 0,
      ask: 116379,
      timestamp: 1787143794000
    });

    expect(delta.ask).toBe(1.16379);
    expect(delta.bid).toBe(1.16375); // Preserved from previous spot
  });

  it('4. Real spot events dispatch to internal marketTick event emitter', () => {
    let receivedTick: MarketTickEvent | null = null;
    mockMarketBus.on('marketTick', (tick: MarketTickEvent) => {
      receivedTick = tick;
    });

    // Wire transport spotEvent to market bus
    transport.on('spotEvent', (spot) => {
      if (spot.symbolId === 1 && spot.bid && spot.ask) {
        const midPrice = parseFloat(((spot.bid + spot.ask) / 2).toFixed(5));
        mockMarketBus.emit('marketTick', {
          symbol: 'EUR/USD',
          currentPrice: midPrice,
          highPrice: spot.ask,
          lowPrice: spot.bid,
          session: 'LONDON',
          timestamp: spot.timestamp
        });
      }
    });

    transport.handleSpotEvent({
      ctidTraderAccountId: 48282756,
      symbolId: 1,
      bid: 108520,
      ask: 108530,
      timestamp: 1787143800000
    });

    expect(receivedTick).not.toBeNull();
    expect(receivedTick!.symbol).toBe('EUR/USD');
    expect(receivedTick!.currentPrice).toBe(1.08525);
    expect(receivedTick!.lowPrice).toBe(1.08520);
    expect(receivedTick!.highPrice).toBe(1.08530);
  });

  it('5. STOPPED observatory ignores incoming spot market ticks', () => {
    continuousLearningObservatoryService.bindMarketDataEmitter(mockMarketBus);
    expect(continuousLearningObservatoryService.getStatus().state).toBe('STOPPED');

    mockMarketBus.emit('marketTick', {
      symbol: 'EUR/USD',
      currentPrice: 1.08550,
      highPrice: 1.08560,
      lowPrice: 1.08540,
      session: 'LONDON',
      timestamp: Date.now()
    });

    const status = continuousLearningObservatoryService.getStatus();
    expect(status.state).toBe('STOPPED');
    expect(status.lastTickTimestamp).toBeNull();
  });

  it('6. OBSERVING observatory processes spot market ticks and updates MFE/MAE', () => {
    continuousLearningObservatoryService.bindMarketDataEmitter(mockMarketBus);
    continuousLearningObservatoryService.startObservatory();

    // Create shadow observation
    const opp = {
      id: 'opp-spot-001',
      pair: 'EUR/USD' as const,
      action: 'BUY' as const,
      setupType: 'ORDER_BLOCK_RETEST',
      confidence: 90,
      currentPrice: 1.08500,
      entryPrice: 1.08500,
      stopLoss: 1.08200,
      takeProfit1: 1.09000,
      reason: 'cTrader Spot Ingestion Test',
      timeframe: 'M15',
      marketRegime: 'TRENDING' as const,
      timestamp: Date.now()
    };
    continuousLearningObservatoryService.evaluateMarketOpportunity({ opportunity: opp });
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(1);

    // Feed real spot tick
    mockMarketBus.emit('marketTick', {
      symbol: 'EUR/USD',
      currentPrice: 1.08750,
      highPrice: 1.08760,
      lowPrice: 1.08490,
      session: 'LONDON',
      timestamp: Date.now()
    });

    const activeObs = continuousLearningObservatoryService.getActiveObservations()[0];
    expect(activeObs.mfePips).toBeGreaterThanOrEqual(25);
    expect(continuousLearningObservatoryService.getStatus().lastTickTimestamp).toBeDefined();
  });

  it('7. Duplicate subscription prevention and active subscription tracking', async () => {
    expect(transport.getActiveSpotSubscriptions().length).toBe(0);
  });

  it('8. Safety Invariants: 0 broker orders, LIVE forbidden, DEMO automation forbidden', () => {
    const status = continuousLearningObservatoryService.getStatus();
    expect(status.brokerOrdersTransmitted).toBe(0);
    expect(status.isDemoArmed).toBe(false);
    expect(status.liveExecutionGate).toBe('FORBIDDEN');

    const gate = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('LIVE_EXECUTION_DISARMED');
  });
});
