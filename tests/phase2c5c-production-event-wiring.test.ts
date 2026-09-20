import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { CurrencyShadowEventBridge } from '../src/server/services/shadow/currencyShadowEventBridge';
import {
  CurrencyShadowObserverService,
  InMemoryCurrencyShadowRepository,
  IBrokerReadOnlyProvider
} from '../src/server/services/shadow/currencyShadowObserverService';

describe('Phase 2C.5C — Production Observational Event Wiring Suite', () => {
  let memoryRepo: InMemoryCurrencyShadowRepository;
  let mockBrokerProvider: IBrokerReadOnlyProvider;
  let observerService: CurrencyShadowObserverService;
  let eventBridge: CurrencyShadowEventBridge;
  let mockFeed: EventEmitter;
  let mockScanner: EventEmitter;

  beforeEach(() => {
    memoryRepo = new InMemoryCurrencyShadowRepository();
    mockBrokerProvider = {
      getOpenPositions: vi.fn().mockResolvedValue([
        { positionId: 290221010, symbol: 'GBPUSD', direction: 'BUY', volumeLots: 0.01 },
        { positionId: 290156459, symbol: 'AUDUSD', direction: 'SELL', volumeLots: 0.02 },
        { positionId: 289771514, symbol: 'USDCAD', direction: 'BUY', volumeLots: 0.02 },
        { positionId: 289642167, symbol: 'EURUSD', direction: 'SELL', volumeLots: 0.01 },
        { positionId: 289686652, symbol: 'NZDUSD', direction: 'SELL', volumeLots: 0.02 }
      ])
    };
    observerService = new CurrencyShadowObserverService(memoryRepo, mockBrokerProvider);
    eventBridge = new CurrencyShadowEventBridge(observerService, mockBrokerProvider);
    mockFeed = new EventEmitter();
    mockScanner = new EventEmitter();

    eventBridge.bindMarketDataFeed(mockFeed);
    eventBridge.bindScannerService(mockScanner);
  });

  // Test 1: Broker positions updated event triggers position observation
  it('Test 1: Real brokerPositionsUpdated event from feed triggers shadow position observation', async () => {
    const rawPositions = [
      { positionId: 290221010, symbol: 'GBPUSD', tradeSide: 'BUY', volumeLots: 0.01 },
      { positionId: 289642167, symbol: 'EURUSD', tradeSide: 'SELL', volumeLots: 0.01 }
    ];

    mockFeed.emit('brokerPositionsUpdated', rawPositions);

    // Wait a tick for async side-channel completion
    await new Promise(r => setTimeout(r, 20));

    const evs = await memoryRepo.getEvaluations();
    expect(evs.length).toBeGreaterThan(0);
    const latest = evs[0];
    expect(latest.eventType).toBe('POSITION_OPENED');
    expect(latest.dataAuthority).toBe('BROKER');
    expect(latest.executionAuthority).toBe(false);
  });

  // Test 2: Broker closed deals event triggers position closed observation
  it('Test 2: Real brokerClosedDealsUpdated event triggers POSITION_CLOSED shadow observation', async () => {
    const rawClosedDeals = [
      { dealId: 331760114, positionId: 285909080, symbol: 'EURJPY', grossProfit: 2.28 }
    ];

    mockFeed.emit('brokerClosedDealsUpdated', rawClosedDeals);
    await new Promise(r => setTimeout(r, 20));

    const evs = await memoryRepo.getEvaluations();
    expect(evs.length).toBeGreaterThan(0);
    const closedEv = evs.find(e => e.eventType === 'POSITION_CLOSED');
    expect(closedEv).toBeDefined();
    expect(closedEv?.brokerPositionId).toBe('285909080');
    expect(closedEv?.decision).toBe('SHADOW_ALLOW');
  });

  // Test 3: Scanner tradeExecuted event triggers proposal shadow evaluation
  it('Test 3: Scanner tradeExecuted event triggers PROPOSAL_CREATED shadow evaluation', async () => {
    const tradeSetup = {
      setupId: 'setup-eurjpy-breakout-1',
      proposalId: 'prop-eurjpy-scan-1',
      signalId: 'sig-eurjpy-scan-1',
      pair: 'EUR/JPY',
      direction: 'BUY',
      volumeLots: 0.02,
      riskPercent: 0.5
    };

    mockScanner.emit('tradeExecuted', tradeSetup);
    await new Promise(r => setTimeout(r, 20));

    const evs = await memoryRepo.getEvaluations();
    const propEv = evs.find(e => e.proposalId === 'prop-eurjpy-scan-1');
    expect(propEv).toBeDefined();
    expect(propEv?.symbol).toBe('EURJPY');
    expect(propEv?.direction).toBe('BUY');
    expect(propEv?.volumeLots).toBe(0.02);
    expect(propEv?.hypotheticalExposure?.currencies['JPY'].netUnits).toBe(-0.02);
  });

  // Test 4: Observer failure does not break or throw in emitter loop
  it('Test 4: Non-blocking isolation: Observer repository error does not break event emitter', async () => {
    const failingRepo = {
      saveEvaluation: vi.fn().mockRejectedValue(new Error('Postgres connection lost')),
      getEvaluations: vi.fn().mockResolvedValue([]),
      getEvaluationById: vi.fn().mockResolvedValue(null),
      getEvaluationsByPositionId: vi.fn().mockResolvedValue([])
    };
    const isolatedService = new CurrencyShadowObserverService(failingRepo, mockBrokerProvider);
    const isolatedBridge = new CurrencyShadowEventBridge(isolatedService, mockBrokerProvider);
    const errorFeed = new EventEmitter();
    isolatedBridge.bindMarketDataFeed(errorFeed);

    // Should emit without throwing any unhandled exception
    expect(() => {
      errorFeed.emit('brokerPositionsUpdated', [{ positionId: 101, symbol: 'EURUSD', tradeSide: 'BUY', volumeLots: 0.01 }]);
    }).not.toThrow();

    await new Promise(r => setTimeout(r, 20));
  });

  // Test 5: Idempotency across duplicate event emissions
  it('Test 5: Idempotency is preserved on repeated duplicate event emissions', async () => {
    const tradeSetup = {
      proposalId: 'prop-idem-1',
      pair: 'GBP/USD',
      direction: 'BUY',
      volumeLots: 0.01
    };

    mockScanner.emit('tradeExecuted', tradeSetup);
    mockScanner.emit('tradeExecuted', tradeSetup);
    await new Promise(r => setTimeout(r, 20));

    const evs = await memoryRepo.getEvaluations();
    const matches = evs.filter(e => e.proposalId === 'prop-idem-1');
    expect(matches.length).toBe(1);
  });

  // Test 6: Zero broker write operations exposed or possible
  it('Test 6: Static assertion: CurrencyShadowEventBridge exposes zero write capabilities', () => {
    const keys = Object.keys(eventBridge);
    expect(keys).toEqual(['observerService', 'brokerProvider', 'observationService', 'boundFeed', 'boundScanner', 'isProcessing']);
    expect((eventBridge as any).placeOrder).toBeUndefined();
    expect((eventBridge as any).cancelOrder).toBeUndefined();
    expect((eventBridge as any).closePosition).toBeUndefined();
  });

  // Test 7: Zero execution decision returned to event emitter
  it('Test 7: Event emitter listeners do not receive or consume execution decisions', () => {
    let capturedResult: any = undefined;
    mockScanner.on('tradeExecuted', (res: any) => {
      capturedResult = res;
    });

    const setup = { proposalId: 'prop-no-callback', pair: 'EUR/USD', direction: 'BUY', lots: 0.01 };
    mockScanner.emit('tradeExecuted', setup);

    // The emitted object remains the unmodified setup object
    expect(capturedResult).toEqual(setup);
    expect(capturedResult.shadowDecision).toBeUndefined();
  });

  // Test 8: Observability summary reflects events delivered via bridge
  it('Test 8: Dashboard observability summary accurately reflects bridge-delivered events', async () => {
    mockScanner.emit('tradeExecuted', { proposalId: 'prop-summ-1', pair: 'EUR/USD', direction: 'BUY', lots: 0.01 });
    mockScanner.emit('tradeExecuted', { proposalId: 'prop-summ-2', pair: 'GBP/USD', direction: 'SELL', lots: 0.02 });
    await new Promise(r => setTimeout(r, 20));

    const summary = await observerService.getObservabilitySummary();
    expect(summary.totalEvaluations).toBe(2);
    expect(summary.currentLivePortfolio.openPositionsCount).toBe(5);
  });
});
