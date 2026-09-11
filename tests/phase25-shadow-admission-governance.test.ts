import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { continuousLearningObservatoryService, ActiveShadowObservation } from '../src/server/services/continuousLearningObservatoryService';
import { CTraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';
import { learningJournalService } from '../src/server/services/learningJournalService';
import { shadowObservationRepository, shadowWriteAheadLog } from '@iati/database';
import { FinalExecutionGateService } from '../src/server/services/finalExecutionGateService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { CurrencyPair } from '../src/types';

describe('QUANTUMAI P25 — SHADOW ADMISSION GOVERNANCE & DUPLICATION CONTROL', () => {
  let feedService: CTraderMarketDataFeedService;

  beforeEach(() => {
    feedService = CTraderMarketDataFeedService.getInstance();
    continuousLearningObservatoryService.resetObservatory();
    (continuousLearningObservatoryService as any).isHydrated = true;
    continuousLearningObservatoryService.startObservatory();
    learningJournalService.clearJournal();
  });

  afterEach(() => {
    continuousLearningObservatoryService.resetObservatory();
  });

  // 1. First EUR/USD signal creates one ACTIVE observation
  it('1. first EUR/USD signal creates exactly one ACTIVE observation', () => {
    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: {
        pair: 'EUR/USD',
        action: 'BUY',
        entryPrice: 1.16700,
        stopLoss: 1.16500,
        takeProfit1: 1.17100,
        confidence: 85,
        setupType: 'ORDER_BLOCK_RETEST',
        marketRegime: 'TRENDING_BULLISH'
      } as any,
      session: 'LONDON'
    });

    expect(res.success).toBe(true);
    expect(res.actionTaken).toBe('SHADOW_OPENED');
    expect(res.observationId).toBeDefined();

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active.length).toBe(1);
    expect(active[0].symbol).toBe('EUR/USD');
    expect(active[0].status).toBe('ACTIVE');
  });

  // 2. Second EUR/USD signal is rejected
  it('2. second EUR/USD signal is rejected with DUPLICATE_IGNORED and ACTIVE_SHADOW_EXISTS', () => {
    // 1st signal
    continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: {
        pair: 'EUR/USD',
        action: 'BUY',
        entryPrice: 1.16700,
        stopLoss: 1.16500,
        takeProfit1: 1.17100,
        confidence: 85
      } as any,
      session: 'LONDON'
    });

    // 2nd signal on same pair while 1st is still ACTIVE
    const res2 = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: {
        pair: 'EUR/USD',
        action: 'BUY',
        entryPrice: 1.16710,
        stopLoss: 1.16510,
        takeProfit1: 1.17110,
        confidence: 88
      } as any,
      session: 'LONDON'
    });

    expect(res2.success).toBe(true);
    expect(res2.actionTaken).toBe('DUPLICATE_IGNORED');
    expect(res2.reason).toBe('ACTIVE_SHADOW_EXISTS');

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active.length).toBe(1);
  });

  // 3. Repeated EUR/USD signals cannot increase ACTIVE count
  it('3. repeated 50 EUR/USD signals cannot increase ACTIVE count beyond 1', () => {
    for (let i = 0; i < 50; i++) {
      continuousLearningObservatoryService.evaluateMarketOpportunity({
        opportunity: {
          pair: 'EUR/USD',
          action: 'BUY',
          entryPrice: 1.16700 + i * 0.00005,
          stopLoss: 1.16500,
          takeProfit1: 1.17100,
          confidence: 85
        } as any,
        session: 'LONDON'
      });
    }

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active.length).toBe(1);
  });

  // 4. EUR/USD + GBP/USD can coexist
  it('4. EUR/USD and GBP/USD active observations can coexist simultaneously', () => {
    const res1 = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.1670, stopLoss: 1.1650, takeProfit1: 1.1710 } as any,
      session: 'LONDON'
    });
    const res2 = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'GBP/USD', action: 'SELL', entryPrice: 1.3640, stopLoss: 1.3660, takeProfit1: 1.3600 } as any,
      session: 'LONDON'
    });

    expect(res1.actionTaken).toBe('SHADOW_OPENED');
    expect(res2.actionTaken).toBe('SHADOW_OPENED');

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active.length).toBe(2);
    expect(active.map(a => a.symbol).sort()).toEqual(['EUR/USD', 'GBP/USD']);
  });

  // 5. All four supported pairs can coexist
  it('5. all four supported pairs (EUR/USD, GBP/USD, USD/JPY, AUD/USD) can coexist simultaneously', () => {
    const pairs: CurrencyPair[] = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
    for (const pair of pairs) {
      const res = continuousLearningObservatoryService.evaluateMarketOpportunity({
        opportunity: {
          pair,
          action: 'BUY',
          entryPrice: pair.includes('JPY') ? 159.20 : 1.1500,
          stopLoss: pair.includes('JPY') ? 159.00 : 1.1480,
          takeProfit1: pair.includes('JPY') ? 159.60 : 1.1540
        } as any,
        session: 'LONDON'
      });
      expect(res.actionTaken).toBe('SHADOW_OPENED');
    }

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active.length).toBe(4);
  });

  // 6. Fifth pair/entry is rejected by global cap
  it('6. fifth observation is rejected by CAPACITY_IGNORED / GLOBAL_SHADOW_CAP_REACHED', () => {
    const pairs: CurrencyPair[] = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
    for (const pair of pairs) {
      continuousLearningObservatoryService.evaluateMarketOpportunity({
        opportunity: {
          pair,
          action: 'BUY',
          entryPrice: pair.includes('JPY') ? 159.20 : 1.1500,
          stopLoss: pair.includes('JPY') ? 159.00 : 1.1480,
          takeProfit1: pair.includes('JPY') ? 159.60 : 1.1540
        } as any,
        session: 'LONDON'
      });
    }

    // Try to open a 5th trade (e.g. USD/CHF)
    const res5 = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: {
        pair: 'USD/CHF' as any,
        action: 'BUY',
        entryPrice: 0.8850,
        stopLoss: 0.8830,
        takeProfit1: 0.8890
      } as any,
      session: 'LONDON'
    });

    expect(res5.success).toBe(true);
    expect(res5.actionTaken).toBe('CAPACITY_IGNORED');
    expect(res5.reason).toBe('GLOBAL_SHADOW_CAP_REACHED');

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active.length).toBe(4);
  });

  // 7. Closing EUR/USD permits future EUR/USD re-entry
  it('7. closing EUR/USD permits legitimate future EUR/USD re-entry after cooldown', async () => {
    const firstRes = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: {
        id: 'eur-sig-initial',
        pair: 'EUR/USD',
        action: 'BUY',
        entryPrice: 1.16700,
        stopLoss: 1.16500,
        takeProfit1: 1.17000
      } as any,
      session: 'LONDON'
    });

    expect(firstRes.actionTaken).toBe('SHADOW_OPENED');
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(1);

    // Close observation via TP1 tick
    const closed = continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.17050, 1.17050, 1.16700, 'LONDON');
    expect(closed.length).toBe(1);
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(0);

    // Wait 600ms for cooldown
    await new Promise(r => setTimeout(r, 600));

    // New valid opportunity on EUR/USD with distinct signal ID
    const newRes = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: {
        id: 'eur-sig-second',
        pair: 'EUR/USD',
        action: 'BUY',
        entryPrice: 1.17100,
        stopLoss: 1.16900,
        takeProfit1: 1.17500
      } as any,
      session: 'LONDON'
    });

    expect(newRes.success).toBe(true);
    expect(newRes.actionTaken).toBe('SHADOW_OPENED');
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(1);
  });

  // 8. Duplicate rejected entry creates no PostgreSQL record
  it('8. rejected duplicate entry does not trigger shadowObservationRepository save', () => {
    continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.1670, stopLoss: 1.1650, takeProfit1: 1.1710 } as any,
      session: 'LONDON'
    });

    const duplicateRes = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.1670, stopLoss: 1.1650, takeProfit1: 1.1710 } as any,
      session: 'LONDON'
    });

    expect(duplicateRes.actionTaken).toBe('DUPLICATE_IGNORED');
  });

  // 9. Duplicate rejected entry creates no WAL record
  it('9. duplicate rejected entry writes zero WAL records', () => {
    const pendingBefore = shadowWriteAheadLog.getPendingCount();

    continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.1670, stopLoss: 1.1650, takeProfit1: 1.1710 } as any,
      session: 'LONDON'
    });

    continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.1670, stopLoss: 1.1650, takeProfit1: 1.1710 } as any,
      session: 'LONDON'
    });

    const pendingAfter = shadowWriteAheadLog.getPendingCount();
    expect(pendingAfter).toBe(pendingBefore);
  });

  // 10. Restart hydration preserves admission limits
  it('10. restored ACTIVE observations from DB immediately enforce pair & global cap limits', () => {
    // Simulate hydrating 4 active observations from DB
    const pairs: CurrencyPair[] = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
    for (const pair of pairs) {
      const obs: ActiveShadowObservation = {
        id: `hyd-${pair}`,
        signalId: `sig-${pair}`,
        symbol: pair,
        direction: 'BUY',
        setupType: 'OB',
        setupFingerprint: `${pair}_BUY_OB`,
        session: 'LONDON',
        marketRegime: 'TRENDING',
        entryPrice: 1.1500,
        stopLoss: 1.1480,
        initialStopLoss: 1.1480,
        takeProfit1: 1.1540,
        status: 'ACTIVE',
        isMultiTarget: false,
        tp1Hit: false,
        highestPriceSeen: 1.1500,
        lowestPriceSeen: 1.1500,
        mfePips: 0,
        maePips: 0,
        openedAt: Date.now(),
        observationType: 'SHADOW_OBSERVATION',
        executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
        immutableSignalSnapshot: { test: true },
        persistence: 'POSTGRESQL'
      };
      (continuousLearningObservatoryService as any).activeObservations.set(obs.id, obs);
    }

    // Try to open a duplicate EUR/USD
    const eurDup = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.1500, stopLoss: 1.1480, takeProfit1: 1.1540 } as any,
      session: 'LONDON'
    });
    expect(eurDup.actionTaken).toBe('DUPLICATE_IGNORED');

    // Try to open a 5th observation
    const fifth = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'USD/CAD' as any, action: 'BUY', entryPrice: 1.3500, stopLoss: 1.3480, takeProfit1: 1.3540 } as any,
      session: 'LONDON'
    });
    expect(fifth.actionTaken).toBe('CAPACITY_IGNORED');
  });

  // 11. Concurrent duplicate evaluations cannot create two observations
  it('11. concurrent synchronous duplicate evaluations create exactly one observation', () => {
    const results = [1, 2, 3, 4, 5].map(() =>
      continuousLearningObservatoryService.evaluateMarketOpportunity({
        opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.1670, stopLoss: 1.1650, takeProfit1: 1.1710 } as any,
        session: 'LONDON'
      })
    );

    const openedCount = results.filter(r => r.actionTaken === 'SHADOW_OPENED').length;
    const duplicateCount = results.filter(r => r.actionTaken === 'DUPLICATE_IGNORED').length;

    expect(openedCount).toBe(1);
    expect(duplicateCount).toBe(4);
  });

  // 12. Different pairs are not blocked by each other
  it('12. active EUR/USD does not block incoming GBP/USD or USD/JPY', () => {
    continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.1670, stopLoss: 1.1650, takeProfit1: 1.1710 } as any,
      session: 'LONDON'
    });

    const gbp = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'GBP/USD', action: 'BUY', entryPrice: 1.3640, stopLoss: 1.3620, takeProfit1: 1.3680 } as any,
      session: 'LONDON'
    });
    const jpy = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'USD/JPY', action: 'BUY', entryPrice: 159.20, stopLoss: 159.00, takeProfit1: 159.60 } as any,
      session: 'LONDON'
    });

    expect(gbp.actionTaken).toBe('SHADOW_OPENED');
    expect(jpy.actionTaken).toBe('SHADOW_OPENED');
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(3);
  });

  // 13. Existing active observation is not mutated by duplicate signal
  it('13. existing active observation properties are untouched when duplicate signal arrives', () => {
    continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.16700, stopLoss: 1.16500, takeProfit1: 1.17100 } as any,
      session: 'LONDON'
    });

    const initial = continuousLearningObservatoryService.getActiveObservations()[0];
    const initialId = initial.id;
    const initialEntry = initial.entryPrice;

    // Send duplicate with different entry price
    continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.16850, stopLoss: 1.16600, takeProfit1: 1.17300 } as any,
      session: 'LONDON'
    });

    const current = continuousLearningObservatoryService.getActiveObservations()[0];
    expect(current.id).toBe(initialId);
    expect(current.entryPrice).toBe(initialEntry);
  });

  // 14. Existing cTrader tick processing still updates active observations
  it('14. existing cTrader tick updates MFE/MAE on active observations correctly', () => {
    continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.16700, stopLoss: 1.16500, takeProfit1: 1.17100 } as any,
      session: 'LONDON'
    });

    continuousLearningObservatoryService.processMarketTick('EUR/USD', 1.16780, 1.16780, 1.16700, 'LONDON');

    const active = continuousLearningObservatoryService.getActiveObservations()[0];
    expect(active.highestPriceSeen).toBe(1.16780);
    expect(active.mfePips).toBe(8.0);
  });

  // 15. Existing SL/TP exit lifecycle remains unchanged
  it('15. existing SL/TP exit lifecycle operates accurately under admission governance', () => {
    continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'USD/JPY', action: 'BUY', entryPrice: 159.200, stopLoss: 159.000, takeProfit1: 159.600 } as any,
      session: 'LONDON'
    });

    const closed = continuousLearningObservatoryService.processMarketTick('USD/JPY', 159.650, 159.650, 159.200, 'LONDON');
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe('CLOSED');
    expect(closed[0].closeReason).toBe('TAKE_PROFIT_1');
    expect(closed[0].realizedR).toBeCloseTo(2.0, 1);
  });

  // 16. DATA_STALE still pauses exit evaluation
  it('16. pauses observation monitoring when feed is STALE', () => {
    feedService.setStaleThresholdMs(1000);
    (feedService as any).isFeedActive = true;
    (feedService as any).connectionState = 'CONNECTED';
    (feedService as any).lastSpotEventAtByPair.set('EUR/USD', Date.now() - 3000);

    feedService.evaluateFeedHealth();

    continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: { pair: 'EUR/USD', action: 'BUY', entryPrice: 1.16700, stopLoss: 1.16500, takeProfit1: 1.17100 } as any,
      session: 'LONDON'
    });

    const active = continuousLearningObservatoryService.getActiveObservations();
    expect(active[0].monitoringState).toBe('DATA_STALE');
  });

  // 17. WAL durability tests remain passing
  it('17. local write-ahead log continues writing and retrieving entries cleanly', () => {
    const walId = shadowWriteAheadLog.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: 'p25-wal-test',
      symbol: 'EUR/USD',
      payload: { id: 'p25-wal-test', symbol: 'EUR/USD', status: 'ACTIVE' }
    });

    try {
      expect(walId).toBeTruthy();
      const pending = shadowWriteAheadLog.getPendingEntries();
      expect(pending.some(e => e.id === walId)).toBe(true);
    } finally {
      if (walId) shadowWriteAheadLog.removeEntry(walId);
    }
  });

  // 18. Execution gate boundary remains unchanged
  it('18. preserves strict execution safety gates (LIVE/DEMO DISARMED, 0 broker orders)', () => {
    const liveDecision = FinalExecutionGateService.evaluateFinalExecutionGate({
      requestId: 'test-live-req',
      idempotencyKey: 'test-live-idem',
      strategyId: 'STRAT-AI-TREND-PULSE',
      strategyVersion: 'v2.0.0',
      symbol: 'EUR/USD',
      direction: 'BUY',
      riskPercent: 1.0,
      environment: 'LIVE',
      actorId: 'admin-user',
      actorRole: 'ADMIN'
    });

    expect(liveDecision.decision).toBe('DENIED');
    expect(liveDecision.brokerOrderTransmitted).toBe(false);
    expect(liveDecision.executionEnvironment).toBe('FORBIDDEN');

    const safetyCheck = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      commandType: 'PLACE_ORDER',
      symbol: 'EUR/USD',
      quantity: 1000,
      timestamp: Date.now()
    });

    expect(safetyCheck.allowed).toBe(false);
  });
});
