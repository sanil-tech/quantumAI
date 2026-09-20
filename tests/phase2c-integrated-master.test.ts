import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  TradeObservationService,
  InMemoryTradeObservationRepository
} from '../src/server/services/observation/tradeObservationService';
import { CurrencyShadowEventBridge } from '../src/server/services/shadow/currencyShadowEventBridge';
import {
  CurrencyShadowObserverService,
  InMemoryCurrencyShadowRepository
} from '../src/server/services/shadow/currencyShadowObserverService';

describe('Phase 2C.6 - 2C.9 Master Integrated Engineering Suite', () => {
  let observationRepo: InMemoryTradeObservationRepository;
  let shadowRepo: InMemoryCurrencyShadowRepository;
  let observationService: TradeObservationService;
  let shadowService: CurrencyShadowObserverService;
  let eventBridge: CurrencyShadowEventBridge;
  let mockFeed: EventEmitter;
  let mockScanner: EventEmitter;

  beforeEach(() => {
    observationRepo = new InMemoryTradeObservationRepository();
    shadowRepo = new InMemoryCurrencyShadowRepository();
    observationService = new TradeObservationService(observationRepo);
    shadowService = new CurrencyShadowObserverService(shadowRepo);
    eventBridge = new CurrencyShadowEventBridge(shadowService, undefined, observationService);
    mockFeed = new EventEmitter();
    mockScanner = new EventEmitter();
    eventBridge.bindMarketDataFeed(mockFeed);
    eventBridge.bindScannerService(mockScanner);
  });

  // Test 1: Full lifecycle integration: Proposal -> Position Open -> Position Close -> Analytics -> Patterns -> Proposals
  it('Test 1: Full end-to-end lifecycle executes seamlessly from bridge to improvement proposals', async () => {
    // 1. Scanner creates proposal
    mockScanner.emit('tradeExecuted', {
      proposalId: 'prop-master-1',
      signalId: 'sig-master-1',
      pair: 'EUR/USD',
      direction: 'BUY',
      volumeLots: 0.02,
      riskPercent: 0.5,
      strategy: 'SMC_ORDER_BLOCK',
      timeframe: 'H1'
    });
    await new Promise(r => setTimeout(r, 20));

    // 2. Add Second Opinion AI advisory
    await observationService.recordSecondOpinion({
      proposalId: 'prop-master-1',
      secondOpinion: {
        opinionId: 'ai-master-1',
        macroRisk: 'LOW',
        thesisAlignment: 'SUPPORTIVE',
        eventRisk: [],
        explanation: 'Strong structural trend alignment.',
        assessmentTimestamp: new Date().toISOString()
      }
    });

    // 3. Broker position opens
    mockFeed.emit('brokerPositionsUpdated', [
      { positionId: 290999001, symbol: 'EURUSD', tradeSide: 'BUY', volumeLots: 0.02 }
    ]);
    await new Promise(r => setTimeout(r, 20));

    // 4. Broker position closes with profit
    mockFeed.emit('brokerClosedDealsUpdated', [
      { dealId: 331999001, positionId: 290999001, symbol: 'EURUSD', grossProfit: 18.40, commission: -0.40, swap: 0 }
    ]);
    await new Promise(r => setTimeout(r, 20));

    // 5. Run Analytics
    const analytics = await observationService.generateOutcomeAnalytics();
    expect(analytics.totalObservationsAnalyzed).toBeGreaterThan(0);

    // 6. Run Pattern Discovery
    const patterns = await observationService.discoverPatterns({ minSampleThreshold: 1 });
    expect(patterns.featureEvaluations.length).toBeGreaterThan(0);

    // 7. Generate Validated Improvement Proposals
    const proposalSummary = await observationService.generateImprovementProposals({ minSampleThreshold: 1 });
    expect(proposalSummary.totalProposalsGenerated).toBeGreaterThan(0);
    expect(proposalSummary.proposals.every(p => p.productionChange === false)).toBe(true);
    expect(proposalSummary.proposals.every(p => p.humanReviewStatus === 'PENDING_HUMAN_REVIEW')).toBe(true);
  });

  // Test 2: Absolute safety check: zero broker write methods across all observation & shadow services
  it('Test 2: Zero broker-write APIs exist across observation, shadow, and analytics systems', () => {
    expect((observationService as any).placeOrder).toBeUndefined();
    expect((observationService as any).cancelOrder).toBeUndefined();
    expect((observationService as any).modifyPosition).toBeUndefined();
    expect((eventBridge as any).placeOrder).toBeUndefined();
    expect((eventBridge as any).cancelOrder).toBeUndefined();
    expect((eventBridge as any).modifyPosition).toBeUndefined();
    expect((shadowService as any).placeOrder).toBeUndefined();
    expect((shadowService as any).cancelOrder).toBeUndefined();
    expect((shadowService as any).modifyPosition).toBeUndefined();
  });
});
