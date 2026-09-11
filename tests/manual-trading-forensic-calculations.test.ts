import { describe, it, expect, beforeEach } from 'vitest';
import { ManualSignalService } from '../src/server/services/manualSignalService';
import { MarketMonitoringService } from '../src/server/services/marketMonitoringService';
import { TradingRepository } from '@iati/database';
import { ManualTradeSignal } from '@iati/core-types';

describe('QUANTUMAI ? PHASE 6H: MANUAL TRADING CALCULATION & FORENSIC AUDIT', () => {
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
      mockStorageTrades.set(trade.manualTradeId, JSON.parse(JSON.stringify(trade)));
      return JSON.parse(JSON.stringify(trade));
    };
    mockRepo.getManualTrades = async (status?: string) => {
      const all = Array.from(mockStorageTrades.values());
      return status ? all.filter(t => t.status === status) : all;
    };
    mockRepo.getManualTradeById = async (id: string) => mockStorageTrades.get(id) || null;
    mockRepo.saveManualTradeAlert = async (alert: any) => {
      mockStorageAlerts.set(alert.alertId, JSON.parse(JSON.stringify(alert)));
      return mockStorageAlerts.get(alert.alertId);
    };
    mockRepo.getManualTradeAlerts = async (tradeId?: string) => {
      const all = Array.from(mockStorageAlerts.values());
      return tradeId ? all.filter(a => a.manualTradeId === tradeId) : all;
    };

    signalService = new ManualSignalService(mockRepo);
    monitoringService = new MarketMonitoringService(mockRepo);
  });

  const createSignal = (direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'BUY'): ManualTradeSignal => ({
    signalId: `SIG-AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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
    adaptiveLearningEvidence: { status: 'ACTIVE', relevantLessonsCount: 0, appliedLessons: [] },
    signalStatus: 'SIGNAL_READY',
    generatedAt: Date.now(),
    expiresAt: Date.now() + 45 * 60 * 1000,
    executionMode: 'MANUAL',
    brokerExecution: false
  });

  // 1. EUR/USD BUY Profitable Trade
  it('1. EUR/USD BUY Profitable: actualEntry=1.08320, exitPrice=1.08620, size=0.5 -> +30 pips, +$150.00 WIN', async () => {
    const signal = createSignal('BUY');
    const trade = signalService.createUserActualTrade({
      signal,
      actualEntry: 1.08320,
      positionSize: 0.5
    });

    const closed = await signalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 1.08620,
      exitReason: 'TAKE_PROFIT_1'
    });

    expect(closed.direction).toBe('BUY');
    expect(closed.realizedPips).toBe(30.0);
    expect(closed.realizedPnl).toBe(150.00);
    expect(closed.result).toBe('WIN');
  });

  // 2. EUR/USD BUY Losing Trade
  it('2. EUR/USD BUY Losing: actualEntry=1.08320, exitPrice=1.08020, size=0.5 -> -30 pips, -$150.00 LOSS', async () => {
    const signal = createSignal('BUY');
    const trade = signalService.createUserActualTrade({
      signal,
      actualEntry: 1.08320,
      positionSize: 0.5
    });

    const closed = await signalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 1.08020,
      exitReason: 'STOP_LOSS'
    });

    expect(closed.direction).toBe('BUY');
    expect(closed.realizedPips).toBe(-30.0);
    expect(closed.realizedPnl).toBe(-150.00);
    expect(closed.result).toBe('LOSS');
  });

  // 3. EUR/USD SELL Profitable Trade
  it('3. EUR/USD SELL Profitable: actualEntry=1.08620, exitPrice=1.08320, size=0.5 -> +30 pips, +$150.00 WIN', async () => {
    const signal = createSignal('SELL');
    const trade = signalService.createUserActualTrade({
      signal,
      actualEntry: 1.08620,
      positionSize: 0.5
    });

    const closed = await signalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 1.08320,
      exitReason: 'TAKE_PROFIT_1'
    });

    expect(closed.direction).toBe('SELL');
    expect(closed.realizedPips).toBe(30.0);
    expect(closed.realizedPnl).toBe(150.00);
    expect(closed.result).toBe('WIN');
  });

  // 4. EUR/USD SELL Losing Trade
  it('4. EUR/USD SELL Losing: actualEntry=1.08620, exitPrice=1.08920, size=0.5 -> -30 pips, -$150.00 LOSS', async () => {
    const signal = createSignal('SELL');
    const trade = signalService.createUserActualTrade({
      signal,
      actualEntry: 1.08620,
      positionSize: 0.5
    });

    const closed = await signalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 1.08920,
      exitReason: 'STOP_LOSS'
    });

    expect(closed.direction).toBe('SELL');
    expect(closed.realizedPips).toBe(-30.0);
    expect(closed.realizedPnl).toBe(-150.00);
    expect(closed.result).toBe('LOSS');
  });

  // 5. Rejection of NEUTRAL trade entry without explicit direction
  it('5. Rejects trade creation on a NEUTRAL signal when user does not explicitly supply BUY or SELL', () => {
    const signal = createSignal('NEUTRAL');
    expect(() => {
      signalService.createUserActualTrade({
        signal,
        actualEntry: 1.08320,
        positionSize: 0.5
      });
    }).toThrowError(/INVALID_TRADE_DIRECTION/);
  });

  // 6. User overrides NEUTRAL signal with explicit BUY direction
  it('6. Allows user to explicitly specify BUY on a NEUTRAL signal', () => {
    const signal = createSignal('NEUTRAL');
    const trade = signalService.createUserActualTrade({
      signal,
      direction: 'BUY',
      actualEntry: 1.08320,
      positionSize: 0.5
    });

    expect(trade.direction).toBe('BUY');
  });

  // 7. USD/JPY pip calculation (multiplier 100, $7.00/pip/lot)
  it('7. USD/JPY BUY: entry=155.000, current=155.500, size=1.0 -> +50.0 pips, +$350.00', async () => {
    const sig = { ...createSignal('BUY'), symbol: 'USD/JPY', entryZone: { min: 155.000, max: 155.050 } };
    const trade = signalService.createUserActualTrade({ signal: sig, actualEntry: 155.000, positionSize: 1.0 });

    const snapshot = await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 155.500 });
    expect(snapshot.unrealizedPips).toBe(50.0);
    expect(snapshot.unrealizedPnl).toBe(350.00);
  });

  // 8. XAU/USD (Gold) point calculation (multiplier 1, $10.00/pt/lot)
  it('8. XAU/USD BUY: entry=2380.00, current=2390.00, size=0.5 -> +10.0 pts, +$50.00', async () => {
    const sig = { ...createSignal('BUY'), symbol: 'XAU/USD', entryZone: { min: 2380.00, max: 2385.00 } };
    const trade = signalService.createUserActualTrade({ signal: sig, actualEntry: 2380.00, positionSize: 0.5 });

    const snapshot = await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 2390.00 });
    expect(snapshot.unrealizedPips).toBe(10.0);
    expect(snapshot.unrealizedPnl).toBe(50.00);
  });

  // 9. Live monitoring with EUR/USD actual live market price
  it('9. Live EUR/USD BUY: entry=1.08320, current=1.15821, size=0.5 -> +750.1 pips, +$3750.50 (NOT negative)', async () => {
    const signal = createSignal('BUY');
    const trade = signalService.createUserActualTrade({ signal, actualEntry: 1.08320, positionSize: 0.5 });

    const snapshot = await monitoringService.evaluateActiveTrade(trade, { livePriceOverride: 1.15821 });
    expect(snapshot.unrealizedPips).toBe(750.1);
    expect(snapshot.unrealizedPnl).toBe(3750.50); // Positive profit for BUY above entry
  });
});
