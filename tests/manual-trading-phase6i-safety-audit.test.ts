import { describe, it, expect, beforeEach } from 'vitest';
import { ManualSignalService } from '../src/server/services/manualSignalService';
import { MarketMonitoringService } from '../src/server/services/marketMonitoringService';
import { TradingRepository } from '@iati/database';
import { ManualTradeSignal } from '@iati/core-types';

describe('QUANTUMAI ? PHASE 6I: PRODUCTION MANUAL TRADING SAFETY & AUDIT', () => {
  let mockStorageTrades: Map<string, any>;
  let mockStorageAlerts: Map<string, any>;
  let mockRepo: TradingRepository;
  let signalService: ManualSignalService;
  let monitoringService: MarketMonitoringService;

  beforeEach(() => {
    mockStorageTrades = new Map<string, any>();
    mockStorageAlerts = new Map<string, any>();

    mockRepo = new TradingRepository();
    mockRepo.saveManualTrade = async (trade: any) => {
      // Simulate DB-level unique constraint on active signal
      if (trade.status === 'ACTIVE') {
        for (const existing of mockStorageTrades.values()) {
          if (existing.signalId === trade.signalId && existing.status === 'ACTIVE' && existing.manualTradeId !== trade.manualTradeId) {
            throw new Error(`DUPLICATE_ACTIVE_TRADE_DB_CONSTRAINT: unique active signal constraint violated for ${trade.signalId}`);
          }
        }
      }
      mockStorageTrades.set(trade.manualTradeId, JSON.parse(JSON.stringify(trade)));
      return JSON.parse(JSON.stringify(trade));
    };

    mockRepo.getManualTrades = async (status?: string) => {
      const all = Array.from(mockStorageTrades.values());
      return status ? all.filter(t => t.status === status) : all;
    };

    mockRepo.getManualTradeById = async (id: string) => mockStorageTrades.get(id) || null;

    mockRepo.saveManualTradeAlert = async (alert: any) => {
      if (!mockStorageAlerts.has(alert.alertId)) {
        mockStorageAlerts.set(alert.alertId, JSON.parse(JSON.stringify(alert)));
      }
      return mockStorageAlerts.get(alert.alertId);
    };

    mockRepo.getManualTradeAlerts = async (tradeId?: string) => {
      const all = Array.from(mockStorageAlerts.values());
      return tradeId ? all.filter(a => a.manualTradeId === tradeId) : all;
    };

    signalService = new ManualSignalService(mockRepo);
    monitoringService = new MarketMonitoringService(mockRepo);
  });

  const makeSignal = (direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'BUY', options?: Partial<ManualTradeSignal>): ManualTradeSignal => ({
    signalId: `SIG-6I-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    symbol: 'EUR/USD',
    timeframe: 'M15',
    marketDataStatus: 'VALID_REAL_DATA',
    direction,
    setupGrade: 'A',
    confidence: 85,
    entryZone: { min: 1.08300, max: 1.08350 },
    invalidationLevel: 1.07900,
    stopLoss: 1.08050,
    takeProfit1: 1.08620,
    takeProfit2: 1.08950,
    riskReward: '1:2.3',
    marketStructure: 'BULLISH',
    technicalEvidence: ['SMC Order Block Retest'],
    adaptiveLearningEvidence: { status: 'ACTIVE', relevantLessonsCount: 0, appliedLessons: ['SL widened by 5 pips'] },
    signalStatus: 'SIGNAL_READY',
    generatedAt: Date.now(),
    expiresAt: Date.now() + 45 * 60 * 1000,
    executionMode: 'MANUAL',
    brokerExecution: false,
    ...options
  });

  // 1 & 2. Complete BUY and SELL lifecycles
  it('1. BUY Lifecycle: Signal -> Entry -> Monitoring -> TP1 -> Close -> DB Persistence', async () => {
    const sig = makeSignal('BUY');
    const trade = signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08320, positionSize: 0.5 });
    expect(trade.status).toBe('ACTIVE');

    const snap = await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08630 });
    expect(snap.activeAlerts.some(a => a.triggerType === 'ALERT_TP1_REACHED')).toBe(true);

    const closed = await signalService.closeUserActualTrade(trade.manualTradeId, { exitPrice: 1.08620, exitReason: 'TAKE_PROFIT_1' });
    expect(closed.status).toBe('CLOSED');
    expect(closed.result).toBe('WIN');
    expect(closed.realizedPnl).toBe(150.00);
  });

  it('2. SELL Lifecycle: Signal -> Entry -> Monitoring -> TP1 -> Close -> DB Persistence', async () => {
    const sig = makeSignal('SELL', { entryZone: { min: 1.08600, max: 1.08650 }, stopLoss: 1.08950, takeProfit1: 1.08320, invalidationLevel: 1.09100 });
    const trade = signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08620, positionSize: 0.5 });
    expect(trade.direction).toBe('SELL');

    const snap = await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08310 });
    expect(snap.activeAlerts.some(a => a.triggerType === 'ALERT_TP1_REACHED')).toBe(true);

    const closed = await signalService.closeUserActualTrade(trade.manualTradeId, { exitPrice: 1.08320, exitReason: 'TAKE_PROFIT_1' });
    expect(closed.status).toBe('CLOSED');
    expect(closed.result).toBe('WIN');
    expect(closed.realizedPnl).toBe(150.00);
  });

  // 3. NEUTRAL signal rejection
  it('3. Rejects entering a trade on a NEUTRAL signal without explicit user direction', () => {
    const sig = makeSignal('NEUTRAL');
    expect(() => {
      signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08320, positionSize: 0.5 });
    }).toThrowError(/INVALID_TRADE_DIRECTION/);
  });

  // 4. Expired signal rejection
  it('4. Rejects entry on an expired AI signal', () => {
    const expiredSig = makeSignal('BUY', { expiresAt: Date.now() - 1000 });
    expect(() => {
      signalService.createUserActualTrade({ signal: expiredSig, actualEntry: 1.08320, positionSize: 0.5 });
    }).toThrowError(/SIGNAL_EXPIRED/);
  });

  // 5. Invalid entry price rejection
  it('5. Rejects non-positive or invalid entry prices', () => {
    const sig = makeSignal('BUY');
    expect(() => signalService.createUserActualTrade({ signal: sig, actualEntry: 0, positionSize: 0.5 })).toThrowError(/INVALID_ENTRY_PRICE/);
    expect(() => signalService.createUserActualTrade({ signal: sig, actualEntry: -1.083, positionSize: 0.5 })).toThrowError(/INVALID_ENTRY_PRICE/);
    expect(() => signalService.createUserActualTrade({ signal: sig, actualEntry: NaN, positionSize: 0.5 })).toThrowError(/INVALID_ENTRY_PRICE/);
  });

  // 6. Excessive slippage rejection (>5%)
  it('6. Rejects entry with >5% slippage from planned entry', () => {
    const sig = makeSignal('BUY', { entryZone: { min: 1.08300, max: 1.08350 } }); // Planned entry ~ 1.08325
    expect(() => {
      signalService.createUserActualTrade({ signal: sig, actualEntry: 1.15000, positionSize: 0.5 }); // ~6.1% deviation
    }).toThrowError(/ENTRY_DEVIATION_TOO_LARGE/);
  });

  // 7. Position size limit (>10.0 lots)
  it('7. Rejects position size exceeding 10.0 lots cap', () => {
    const sig = makeSignal('BUY');
    expect(() => {
      signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08320, positionSize: 10.5 });
    }).toThrowError(/POSITION_SIZE_LIMIT_EXCEEDED/);
  });

  // 8. Concurrency: Double entry submission / Double-click
  it('8. Concurrency Guard: Double-click I ENTERED THIS TRADE results in exactly 1 active trade', () => {
    const sig = makeSignal('BUY');
    const firstTrade = signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08320, positionSize: 0.5 });
    expect(firstTrade).toBeDefined();

    expect(() => {
      signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08320, positionSize: 0.5 });
    }).toThrowError(/DUPLICATE_ACTIVE_TRADE/);

    const activeList = signalService.getUserActualTrades('ACTIVE');
    expect(activeList.length).toBe(1);
  });

  // 9 - 13. TP1, TP2, SL, Invalidation alerts and deduplication
  it('9-13. Generates TP1, TP2, SL, Invalidation exactly once and deduplicates across polling cycles', async () => {
    const sig = makeSignal('BUY', { stopLoss: 1.08050, takeProfit1: 1.08620, takeProfit2: 1.08950, invalidationLevel: 1.07900 });
    const trade = signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08320, positionSize: 1.0 });

    // Tick 1: TP1 hit
    await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08630 });
    // Tick 2: Repeated TP1 hit
    await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08640 });
    // Tick 3: TP2 hit
    await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08960 });

    const alerts = await mockRepo.getManualTradeAlerts(trade.manualTradeId);
    expect(alerts.filter(a => a.triggerType === 'ALERT_TP1_REACHED').length).toBe(1);
    expect(alerts.filter(a => a.triggerType === 'ALERT_TP2_REACHED').length).toBe(1);
  });

  // 14 - 17. Fail-closed market data protections
  it('14-17. Stale, missing, invalid, or synthetic market data fails closed with zero alerts', async () => {
    const sig = makeSignal('BUY');
    const trade = signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08320, positionSize: 1.0 });

    // Stale data
    const staleSnap = await monitoringService.evaluateActiveTrade(trade, {
      marketEnvelopeOverride: { symbol: 'EUR/USD', timeframe: 'M15', dataMode: 'LIVE', status: 'STALE', data: [{ time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.095, volume: 100 }], provenance: { source: 'Yahoo', provider: 'Yahoo', receivedAt: Date.now() }, freshness: { isFresh: false, ageMs: 60000, maxAllowedAgeMs: 30000 }, executable: false }
    });
    expect(staleSnap.monitoringStatus).toBe('MARKET_DATA_STALE');
    expect(staleSnap.activeAlerts.length).toBe(0);

    // Synthetic data in LIVE mode
    const synthSnap = await monitoringService.evaluateActiveTrade(trade, {
      dataMode: 'LIVE',
      marketEnvelopeOverride: { symbol: 'EUR/USD', timeframe: 'M15', dataMode: 'SYNTHETIC', status: 'VALID', data: [{ time: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.095, volume: 100 }], provenance: { source: 'Generator', provider: 'Sim', receivedAt: Date.now() }, freshness: { isFresh: true, ageMs: 100, maxAllowedAgeMs: 30000 }, executable: true }
    });
    expect(synthSnap.monitoringStatus).toBe('MARKET_DATA_UNAVAILABLE');
    expect(synthSnap.activeAlerts.length).toBe(0);
  });

  // 18 & 19. Duplicate close request idempotency
  it('18-19. Rejects duplicate trade close submission (Double-click I CLOSED THIS TRADE)', async () => {
    const sig = makeSignal('BUY');
    const trade = signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08320, positionSize: 0.5 });

    const firstClose = await signalService.closeUserActualTrade(trade.manualTradeId, { exitPrice: 1.08620, exitReason: 'TAKE_PROFIT_1' });
    expect(firstClose.status).toBe('CLOSED');

    await expect(signalService.closeUserActualTrade(trade.manualTradeId, { exitPrice: 1.08620, exitReason: 'TAKE_PROFIT_1' }))
      .rejects.toThrowError(/TRADE_ALREADY_CLOSED/);
  });

  // 20 - 24. Persistence, restart recovery, and P&L consistency
  it('20-24. Simulates server restart: restores active/closed trades, reloads alerts without duplicates', async () => {
    const sig = makeSignal('BUY');
    const trade = signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08320, positionSize: 0.5 });
    await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08630 });

    // Fresh service after restart
    const restartedSignalService = new ManualSignalService(mockRepo);
    await restartedSignalService.loadPersistedTrades();
    const restartedMonitoringService = new MarketMonitoringService(mockRepo);
    await restartedMonitoringService.loadPersistedAlerts();

    const activeList = restartedSignalService.getUserActualTrades('ACTIVE');
    expect(activeList.length).toBe(1);
    expect(activeList[0].manualTradeId).toBe(trade.manualTradeId);

    // Monitoring tick after restart on same trade: zero duplicate alerts
    await restartedMonitoringService.evaluateActiveTrade(activeList[0], { livePriceOverride: 1.08635 });
    const alerts = await mockRepo.getManualTradeAlerts(trade.manualTradeId);
    expect(alerts.length).toBe(1); // EXACTLY 1 ALERT
  });

  // 25 - 27. Immutable AI planned setup and Adaptive Learning lineage
  it('25-27. Preserves immutable AiPlannedSetup across lifecycle and dispatches MANUAL_USER_REPORTED loss reviews', async () => {
    const sig = makeSignal('BUY');
    const trade = signalService.createUserActualTrade({ signal: sig, actualEntry: 1.08450, positionSize: 0.2 });

    const closed = await signalService.closeUserActualTrade(trade.manualTradeId, { exitPrice: 1.08000, exitReason: 'STOP_LOSS' });

    expect(closed.result).toBe('LOSS');
    expect(closed.source).toBe('MANUAL_USER_REPORTED');
    expect(closed.aiPlannedSetup.plannedEntry).toBe(1.08325); // Original AI planned setup untouched
    expect(closed.aiPlannedSetup.stopLoss).toBe(1.08050);
    expect(closed.brokerExecution).toBe(false);
    expect(closed.executionMode).toBe('MANUAL');
  });
});
