import { describe, it, expect, beforeEach } from 'vitest';
import { ManualSignalService } from '../src/server/services/manualSignalService';
import { MarketMonitoringService } from '../src/server/services/marketMonitoringService';
import { TradingRepository } from '@iati/database';
import { UserActualTrade, ManualTradeSignal, ManualTradeAlert } from '@iati/core-types';

describe('QUANTUMAI ? PHASE 6E: DURABLE MANUAL TRADING LEDGER & RESTART RECOVERY', () => {
  let mockStorageTrades: Map<string, any>;
  let mockStorageAlerts: Map<string, any>;
  let mockRepo: TradingRepository;
  let signalService: ManualSignalService;
  let monitoringService: MarketMonitoringService;

  beforeEach(() => {
    mockStorageTrades = new Map<string, any>();
    mockStorageAlerts = new Map<string, any>();

    // Create a mock TradingRepository simulating PostgreSQL table operations
    mockRepo = new TradingRepository();

    // Mock saveManualTrade
    mockRepo.saveManualTrade = async (trade: any) => {
      // Check duplicate active trade constraint for same signalId
      if (trade.status === 'ACTIVE') {
        for (const existing of mockStorageTrades.values()) {
          if (existing.signalId === trade.signalId && existing.status === 'ACTIVE' && existing.manualTradeId !== trade.manualTradeId) {
            throw new Error(`DUPLICATE_ACTIVE_TRADE_CONSTRAINT: unique_signal_active violated for ${trade.signalId}`);
          }
        }
      }
      mockStorageTrades.set(trade.manualTradeId, JSON.parse(JSON.stringify(trade)));
      return JSON.parse(JSON.stringify(trade));
    };

    // Mock getManualTrades
    mockRepo.getManualTrades = async (status?: string) => {
      const all = Array.from(mockStorageTrades.values());
      if (status) {
        return all.filter(t => t.status === status);
      }
      return all;
    };

    // Mock getManualTradeById
    mockRepo.getManualTradeById = async (id: string) => {
      return mockStorageTrades.get(id) || null;
    };

    // Mock saveManualTradeAlert
    mockRepo.saveManualTradeAlert = async (alert: any) => {
      if (!mockStorageAlerts.has(alert.alertId)) {
        mockStorageAlerts.set(alert.alertId, JSON.parse(JSON.stringify(alert)));
      }
      return mockStorageAlerts.get(alert.alertId);
    };

    // Mock getManualTradeAlerts
    mockRepo.getManualTradeAlerts = async (manualTradeId?: string) => {
      const all = Array.from(mockStorageAlerts.values());
      if (manualTradeId) {
        return all.filter(a => a.manualTradeId === manualTradeId);
      }
      return all;
    };

    // Mock clearManualTradeAlerts
    mockRepo.clearManualTradeAlerts = async (manualTradeId?: string) => {
      if (manualTradeId) {
        for (const [key, alert] of mockStorageAlerts.entries()) {
          if (alert.manualTradeId === manualTradeId) {
            mockStorageAlerts.delete(key);
          }
        }
      } else {
        mockStorageAlerts.clear();
      }
    };

    signalService = new ManualSignalService(mockRepo);
    monitoringService = new MarketMonitoringService(mockRepo);
  });

  const createSampleSignal = (): ManualTradeSignal => ({
    signalId: `SIG-6E-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    symbol: 'EUR/USD',
    timeframe: 'M15',
    marketDataStatus: 'VALID_REAL_DATA',
    direction: 'BUY',
    setupGrade: 'A',
    confidence: 85,
    entryZone: { min: 1.08300, max: 1.08350 },
    invalidationLevel: 1.07900,
    stopLoss: 1.08050,
    takeProfit1: 1.08650,
    takeProfit2: 1.08950,
    riskReward: '1:2.3',
    marketStructure: 'BULLISH',
    technicalEvidence: ['SMC Order Block Retest', 'Bullish Momentum'],
    adaptiveLearningEvidence: {
      status: 'ACTIVE',
      relevantLessonsCount: 0,
      appliedLessons: []
    },
    signalStatus: 'SIGNAL_READY',
    generatedAt: Date.now(),
    expiresAt: Date.now() + 45 * 60 * 1000,
    executionMode: 'MANUAL',
    brokerExecution: false
  });

  // 1. Create manual trade -> persisted
  it('1. Creates a manual trade and persists it to the durable repository', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({
      signal,
      actualEntry: 1.08320,
      positionSize: 0.5,
      notes: 'Executed manually on terminal'
    });

    expect(trade).toBeDefined();
    expect(trade.manualTradeId).toMatch(/^MTR-/);
    expect(trade.status).toBe('ACTIVE');

    // Verify stored in repository
    const stored = await mockRepo.getManualTradeById(trade.manualTradeId);
    expect(stored).toBeDefined();
    expect(stored.manualTradeId).toBe(trade.manualTradeId);
    expect(stored.actualEntry).toBe(1.08320);
    expect(stored.aiPlannedSetup.plannedEntry).toBe(1.08325);
  });

  // 2. Retrieve manual trade after service reload / restart
  it('2. Retrieves active manual trade after simulated service restart (hydrate from DB)', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({
      signal,
      actualEntry: 1.08320,
      positionSize: 0.5
    });

    // Simulate complete process restart by instantiating new service instance
    const freshServiceInstance = new ManualSignalService(mockRepo);
    await freshServiceInstance.loadPersistedTrades();

    const activeTrades = freshServiceInstance.getUserActualTrades('ACTIVE');
    expect(activeTrades.length).toBe(1);
    expect(activeTrades[0].manualTradeId).toBe(trade.manualTradeId);
    expect(activeTrades[0].symbol).toBe('EUR/USD');
    expect(activeTrades[0].direction).toBe('BUY');
  });

  // 3. Close manual trade -> persisted
  it('3. Closes manual trade and persists exit price, pips, and PnL to repository', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({
      signal,
      actualEntry: 1.08300,
      positionSize: 1.0
    });

    const closed = await signalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 1.08600,
      exitReason: 'TAKE_PROFIT_1',
      userNotes: 'Closed manually at TP1'
    });

    expect(closed.status).toBe('CLOSED');
    expect(closed.realizedPips).toBe(30.0);
    expect(closed.realizedPnl).toBe(300.00);

    // Verify persisted state in repository
    const stored = await mockRepo.getManualTradeById(trade.manualTradeId);
    expect(stored.status).toBe('CLOSED');
    expect(stored.exitPrice).toBe(1.08600);
    expect(stored.realizedPnl).toBe(300.00);
  });

  // 4. Retrieve closed trade after reload
  it('4. Retrieves closed trade and history after service reload', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({
      signal,
      actualEntry: 1.08300,
      positionSize: 0.1
    });

    await signalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 1.08000,
      exitReason: 'STOP_LOSS'
    });

    const freshService = new ManualSignalService(mockRepo);
    await freshService.loadPersistedTrades();

    const closedTrades = freshService.getUserActualTrades('CLOSED');
    expect(closedTrades.length).toBe(1);
    expect(closedTrades[0].status).toBe('CLOSED');
    expect(closedTrades[0].result).toBe('LOSS');
  });

  // 5. Active trade survives restart
  it('5. Verifies multiple active trades survive server re-instantiation', async () => {
    const sig1 = createSampleSignal();
    const sig2 = { ...createSampleSignal(), symbol: 'GBP/USD', entryZone: { min: 1.29000, max: 1.29050 } };

    signalService.createUserActualTrade({ signal: sig1, actualEntry: 1.08330, positionSize: 0.2 });
    signalService.createUserActualTrade({ signal: sig2, actualEntry: 1.29020, positionSize: 0.3 });

    const reloadedService = new ManualSignalService(mockRepo);
    await reloadedService.loadPersistedTrades();

    const activeList = reloadedService.getUserActualTrades('ACTIVE');
    expect(activeList.length).toBe(2);
    expect(activeList.some(t => t.symbol === 'EUR/USD')).toBe(true);
    expect(activeList.some(t => t.symbol === 'GBP/USD')).toBe(true);
  });

  // 6. Alert persists
  it('6. Persists triggered monitoring alerts to database repository', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({ signal, actualEntry: 1.08300, positionSize: 1.0 });

    await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08660 }); // >= TP1 1.08650

    const storedAlerts = await mockRepo.getManualTradeAlerts(trade.manualTradeId);
    expect(storedAlerts.length).toBe(1);
    expect(storedAlerts[0].triggerType).toBe('ALERT_TP1_REACHED');
    expect(storedAlerts[0].alertId).toBe(`${trade.manualTradeId}_ALERT_TP1_REACHED`);
  });

  // 7. Duplicate alert is rejected/prevented at repository & service level
  it('7. Guarantees deduplicated alert is not duplicated across repeated monitoring cycles', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({ signal, actualEntry: 1.08300, positionSize: 1.0 });

    // Tick 1
    await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08660 });
    // Tick 2 (higher price)
    await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08680 });
    // Tick 3
    await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08700 });

    const storedAlerts = await mockRepo.getManualTradeAlerts(trade.manualTradeId);
    expect(storedAlerts.length).toBe(1);
  });

  // 8. Monitoring after restart does not duplicate previous alerts
  it('8. Monitoring engine after restart reloads prior alerts and prevents alert duplication', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({ signal, actualEntry: 1.08300, positionSize: 1.0 });

    // Pre-restart: Alert generated and saved
    await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08660 });

    // Restart: Fresh monitoring service instance
    const freshMonitoringService = new MarketMonitoringService(mockRepo);
    await freshMonitoringService.loadPersistedAlerts();

    // Run monitoring again with price still above TP1
    await freshMonitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.08670 });

    const allAlerts = await mockRepo.getManualTradeAlerts(trade.manualTradeId);
    expect(allAlerts.length).toBe(1); // EXACTLY 1, NOT DUPLICATED
  });

  // 9. Duplicate active trade protection works at database level
  it('9. Rejects duplicate active trade for the same signal at database repository level', async () => {
    const signal = createSampleSignal();
    signalService.createUserActualTrade({ signal, actualEntry: 1.08300, positionSize: 0.1 });

    expect(() => {
      signalService.createUserActualTrade({ signal, actualEntry: 1.08300, positionSize: 0.1 });
    }).toThrowError(/DUPLICATE_ACTIVE_TRADE/);
  });

  // 10. AI planned setup remains immutable across persist / reload
  it('10. Guarantees immutable AiPlannedSetup layer is unchanged after database save & reload', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({
      signal,
      actualEntry: 1.08450, // User entered with slippage
      positionSize: 0.5
    });

    const freshService = new ManualSignalService(mockRepo);
    await freshService.loadPersistedTrades();

    const retrieved = freshService.getUserActualTrades().find(t => t.manualTradeId === trade.manualTradeId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.actualEntry).toBe(1.08450);
    // AI planned entry remains the original 1.08325, SL remains 1.08050
    expect(retrieved?.aiPlannedSetup.plannedEntry).toBe(1.08325);
    expect(retrieved?.aiPlannedSetup.stopLoss).toBe(1.08050);
    expect(retrieved?.aiPlannedSetup.takeProfit1).toBe(1.08650);
  });

  // 11. Adaptive Learning receives MANUAL_USER_REPORTED
  it('11. Guarantees manual trade source remains MANUAL_USER_REPORTED on closure and adaptive learning handoff', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({ signal, actualEntry: 1.08300, positionSize: 0.1 });

    const closed = await signalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 1.08000,
      exitReason: 'STOP_LOSS'
    });

    expect(closed.source).toBe('MANUAL_USER_REPORTED');
    expect(closed.executionMode).toBe('MANUAL');
    expect(closed.brokerExecution).toBe(false);
  });

  // 12 & 13. Fail-closed market data protections
  it('12 & 13. Stale or missing market data remains strictly fail-closed during monitoring', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({ signal, actualEntry: 1.08300, positionSize: 0.1 });

    const snapshot = await monitoringService.evaluateActiveTrade(trade, {
      marketEnvelopeOverride: {
        symbol: 'EUR/USD',
        timeframe: 'M15',
        dataMode: 'LIVE',
        status: 'UNAVAILABLE',
        data: [],
        provenance: { source: 'Yahoo', provider: 'Yahoo', receivedAt: Date.now() },
        freshness: { isFresh: false, ageMs: 99999, maxAllowedAgeMs: 30000 },
        executable: false
      }
    });

    expect(snapshot.monitoringStatus).toBe('MARKET_DATA_UNAVAILABLE');
    expect(snapshot.activeAlerts.length).toBe(0);
  });

  // 14. Zero broker execution invariant
  it('14. Guarantees zero broker orders transmitted across durable ledger operations', async () => {
    const signal = createSampleSignal();
    const trade = signalService.createUserActualTrade({ signal, actualEntry: 1.08300, positionSize: 0.1 });

    expect(trade.brokerExecution).toBe(false);
    expect(trade.executionMode).toBe('MANUAL');
  });
});
