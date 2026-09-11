import { describe, it, expect, beforeEach } from 'vitest';
import { manualSignalService } from '../src/server/services/manualSignalService';
import { marketMonitoringService } from '../src/server/services/marketMonitoringService';
import { UserActualTrade, ManualTradeSignal, MarketDataEnvelope, CandleData } from '@iati/core-types';

describe('QUANTUMAI ? PHASE 6D: ACTIVE MANUAL TRADE MONITORING & ALERT ENGINE', () => {
  beforeEach(() => {
    marketMonitoringService.clearAlerts();
  });

  const createMockTrade = (direction: 'BUY' | 'SELL', overrides?: Partial<UserActualTrade>): UserActualTrade => {
    const isBuy = direction === 'BUY';
    return {
      manualTradeId: `MTR-TEST-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      signalId: `SIG-TEST-${Date.now()}`,
      symbol: 'EUR/USD',
      direction,
      actualEntry: isBuy ? 1.08300 : 1.08700,
      positionSize: 1.0,
      enteredAt: new Date().toISOString(),
      status: 'ACTIVE',
      executionMode: 'MANUAL',
      brokerExecution: false,
      source: 'MANUAL_USER_REPORTED',
      aiPlannedSetup: {
        signalId: `SIG-TEST-${Date.now()}`,
        symbol: 'EUR/USD',
        direction,
        timeframe: 'M15',
        plannedEntry: isBuy ? 1.08300 : 1.08700,
        entryZone: { min: isBuy ? 1.08280 : 1.08680, max: isBuy ? 1.08320 : 1.08720 },
        stopLoss: isBuy ? 1.08000 : 1.09000,
        takeProfit1: isBuy ? 1.08600 : 1.08400,
        takeProfit2: isBuy ? 1.08900 : 1.08100,
        invalidationLevel: isBuy ? 1.07900 : 1.09100,
        riskReward: '1:2',
        confidence: 85,
        setupGrade: 'A',
        createdAt: new Date().toISOString()
      },
      ...overrides
    };
  };

  // =========================================================================
  // 1. BUY TRADE EXIT CONDITION DETECTIONS
  // =========================================================================

  it('1. BUY: Detects TP1 reached when currentPrice >= takeProfit1', async () => {
    const buyTrade = createMockTrade('BUY');
    const snapshot = await marketMonitoringService.evaluateActiveTrade(buyTrade, {
      livePriceOverride: 1.08620 // >= TP1 1.08600
    });

    expect(snapshot.currentPrice).toBe(1.08620);
    expect(snapshot.unrealizedPips).toBe(32.0); // (1.08620 - 1.08300) * 10000
    expect(snapshot.unrealizedPnl).toBe(320.00); // 32 pips * $10 * 1.0 lot
    expect(snapshot.activeAlerts.length).toBe(1);
    expect(snapshot.activeAlerts[0].triggerType).toBe('ALERT_TP1_REACHED');
    expect(snapshot.activeAlerts[0].triggerPrice).toBe(1.08620);
  });

  it('2. BUY: Detects TP2 reached when currentPrice >= takeProfit2', async () => {
    const buyTrade = createMockTrade('BUY');
    const snapshot = await marketMonitoringService.evaluateActiveTrade(buyTrade, {
      livePriceOverride: 1.08950 // >= TP2 1.08900
    });

    expect(snapshot.currentPrice).toBe(1.08950);
    expect(snapshot.unrealizedPips).toBe(65.0);
    // Emits TP1 and TP2 alerts
    expect(snapshot.activeAlerts.some(a => a.triggerType === 'ALERT_TP1_REACHED')).toBe(true);
    expect(snapshot.activeAlerts.some(a => a.triggerType === 'ALERT_TP2_REACHED')).toBe(true);
  });

  it('3. BUY: Detects STOP LOSS hit when currentPrice <= stopLoss', async () => {
    const buyTrade = createMockTrade('BUY');
    const snapshot = await marketMonitoringService.evaluateActiveTrade(buyTrade, {
      livePriceOverride: 1.07980 // <= SL 1.08000
    });

    expect(snapshot.currentPrice).toBe(1.07980);
    expect(snapshot.unrealizedPips).toBe(-32.0);
    expect(snapshot.unrealizedPnl).toBe(-320.00);
    expect(snapshot.activeAlerts.some(a => a.triggerType === 'ALERT_STOP_LOSS_HIT')).toBe(true);
  });

  it('4. BUY: Detects Invalidation triggered when currentPrice <= invalidationLevel', async () => {
    const buyTrade = createMockTrade('BUY');
    const snapshot = await marketMonitoringService.evaluateActiveTrade(buyTrade, {
      livePriceOverride: 1.07850 // <= Invalidation 1.07900
    });

    expect(snapshot.activeAlerts.some(a => a.triggerType === 'ALERT_INVALIDATION_TRIGGERED')).toBe(true);
  });

  // =========================================================================
  // 2. SELL TRADE EXIT CONDITION DETECTIONS
  // =========================================================================

  it('5. SELL: Detects TP1 reached when currentPrice <= takeProfit1', async () => {
    const sellTrade = createMockTrade('SELL');
    const snapshot = await marketMonitoringService.evaluateActiveTrade(sellTrade, {
      livePriceOverride: 1.08380 // <= TP1 1.08400
    });

    expect(snapshot.currentPrice).toBe(1.08380);
    expect(snapshot.unrealizedPips).toBe(32.0); // (1.08700 - 1.08380) * 10000
    expect(snapshot.unrealizedPnl).toBe(320.00);
    expect(snapshot.activeAlerts.some(a => a.triggerType === 'ALERT_TP1_REACHED')).toBe(true);
  });

  it('6. SELL: Detects TP2 reached when currentPrice <= takeProfit2', async () => {
    const sellTrade = createMockTrade('SELL');
    const snapshot = await marketMonitoringService.evaluateActiveTrade(sellTrade, {
      livePriceOverride: 1.08050 // <= TP2 1.08100
    });

    expect(snapshot.activeAlerts.some(a => a.triggerType === 'ALERT_TP1_REACHED')).toBe(true);
    expect(snapshot.activeAlerts.some(a => a.triggerType === 'ALERT_TP2_REACHED')).toBe(true);
  });

  it('7. SELL: Detects STOP LOSS hit when currentPrice >= stopLoss', async () => {
    const sellTrade = createMockTrade('SELL');
    const snapshot = await marketMonitoringService.evaluateActiveTrade(sellTrade, {
      livePriceOverride: 1.09050 // >= SL 1.09000
    });

    expect(snapshot.unrealizedPips).toBe(-35.0);
    expect(snapshot.activeAlerts.some(a => a.triggerType === 'ALERT_STOP_LOSS_HIT')).toBe(true);
  });

  it('8. SELL: Detects Invalidation triggered when currentPrice >= invalidationLevel', async () => {
    const sellTrade = createMockTrade('SELL');
    const snapshot = await marketMonitoringService.evaluateActiveTrade(sellTrade, {
      livePriceOverride: 1.09150 // >= Invalidation 1.09100
    });

    expect(snapshot.activeAlerts.some(a => a.triggerType === 'ALERT_INVALIDATION_TRIGGERED')).toBe(true);
  });

  // =========================================================================
  // 3. ALERT DEDUPLICATION
  // =========================================================================

  it('9. Deduplicates TP1 alerts across multiple consecutive polling cycles', async () => {
    const buyTrade = createMockTrade('BUY');

    // Cycle 1: TP1 hit
    await marketMonitoringService.evaluateActiveTrade(buyTrade, { livePriceOverride: 1.08620 });
    const alertsAfter1 = marketMonitoringService.getTriggeredAlerts(buyTrade.manualTradeId);
    expect(alertsAfter1.length).toBe(1);

    // Cycle 2: Price moves higher (1.08650), still above TP1
    await marketMonitoringService.evaluateActiveTrade(buyTrade, { livePriceOverride: 1.08650 });
    const alertsAfter2 = marketMonitoringService.getTriggeredAlerts(buyTrade.manualTradeId);
    expect(alertsAfter2.length).toBe(1); // EXACTLY 1, NOT 2

    // Cycle 3: Price moves even higher
    await marketMonitoringService.evaluateActiveTrade(buyTrade, { livePriceOverride: 1.08670 });
    const alertsAfter3 = marketMonitoringService.getTriggeredAlerts(buyTrade.manualTradeId);
    expect(alertsAfter3.length).toBe(1); // Still 1
  });

  it('10. Deduplicates SL alerts across multiple consecutive polling cycles', async () => {
    const buyTrade = createMockTrade('BUY');

    await marketMonitoringService.evaluateActiveTrade(buyTrade, { livePriceOverride: 1.07950 });
    await marketMonitoringService.evaluateActiveTrade(buyTrade, { livePriceOverride: 1.07920 });
    await marketMonitoringService.evaluateActiveTrade(buyTrade, { livePriceOverride: 1.07900 });

    const alerts = marketMonitoringService.getTriggeredAlerts(buyTrade.manualTradeId);
    const slAlerts = alerts.filter(a => a.triggerType === 'ALERT_STOP_LOSS_HIT');
    expect(slAlerts.length).toBe(1);
  });

  // =========================================================================
  // 4. FAIL-CLOSED MARKET DATA PROTECTION
  // =========================================================================

  it('11. Fails closed when live market price is missing or undefined (zero alerts generated)', async () => {
    const buyTrade = createMockTrade('BUY');
    const snapshot = await marketMonitoringService.evaluateActiveTrade(buyTrade, {
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

    expect(snapshot.currentPrice).toBeNull();
    expect(snapshot.monitoringStatus).toBe('MARKET_DATA_UNAVAILABLE');
    expect(snapshot.activeAlerts.length).toBe(0);
  });

  it('12. Fails closed when market data envelope is STALE (zero exit alerts generated)', async () => {
    const buyTrade = createMockTrade('BUY');
    const staleCandles: CandleData[] = [{
      time: Date.now() - 3600000,
      open: 1.08600,
      high: 1.08700,
      low: 1.08500,
      close: 1.08650, // Price would trigger TP1 if valid, but data is STALE
      volume: 100
    }];

    const snapshot = await marketMonitoringService.evaluateActiveTrade(buyTrade, {
      marketEnvelopeOverride: {
        symbol: 'EUR/USD',
        timeframe: 'M15',
        dataMode: 'LIVE',
        status: 'STALE',
        data: staleCandles,
        provenance: { source: 'Yahoo', provider: 'Yahoo', receivedAt: Date.now() },
        freshness: { isFresh: false, ageMs: 60000, maxAllowedAgeMs: 30000 },
        executable: false
      }
    });

    expect(snapshot.monitoringStatus).toBe('MARKET_DATA_STALE');
    expect(snapshot.marketDataStatus).toBe('STALE');
    // GUARANTEE: Zero exit alerts emitted for stale market data
    expect(snapshot.activeAlerts.length).toBe(0);
  });

  it('13. Rejects SYNTHETIC market data during LIVE monitoring mode (fails closed)', async () => {
    const buyTrade = createMockTrade('BUY');
    const syntheticCandles: CandleData[] = [{
      time: Date.now(),
      open: 1.08650,
      high: 1.08700,
      low: 1.08600,
      close: 1.08650,
      volume: 100
    }];

    const snapshot = await marketMonitoringService.evaluateActiveTrade(buyTrade, {
      dataMode: 'LIVE',
      marketEnvelopeOverride: {
        symbol: 'EUR/USD',
        timeframe: 'M15',
        dataMode: 'SYNTHETIC', // Synthetic!
        status: 'VALID',
        data: syntheticCandles,
        provenance: { source: 'SyntheticGenerator', provider: 'Synthetic', receivedAt: Date.now() },
        freshness: { isFresh: true, ageMs: 0, maxAllowedAgeMs: 30000 },
        executable: false
      }
    });

    expect(snapshot.monitoringStatus).toBe('MARKET_DATA_UNAVAILABLE');
    expect(snapshot.activeAlerts.length).toBe(0);
  });

  // =========================================================================
  // 5. MULTI-SYMBOL & PIP PRECISION VERIFICATION
  // =========================================================================

  it('14. Correctly computes USD/JPY pip value and multiplier (100 multiplier, 3 decimals)', async () => {
    const jpyTrade = createMockTrade('BUY', {
      symbol: 'USD/JPY',
      actualEntry: 155.000,
      positionSize: 1.0,
      aiPlannedSetup: {
        ...createMockTrade('BUY').aiPlannedSetup,
        symbol: 'USD/JPY',
        plannedEntry: 155.000,
        stopLoss: 154.000,
        takeProfit1: 156.000
      }
    });

    const snapshot = await marketMonitoringService.evaluateActiveTrade(jpyTrade, {
      livePriceOverride: 155.500 // +50 pips (155.500 - 155.000 = 0.500 * 100 = 50 pips)
    });

    expect(snapshot.unrealizedPips).toBe(50.0);
    expect(snapshot.unrealizedPnl).toBe(350.00); // 50 pips * $7/pip * 1.0 lot = $350
  });

  it('15. Correctly computes Gold XAU/USD points and PnL (1 multiplier, $10/pt)', async () => {
    const goldTrade = createMockTrade('BUY', {
      symbol: 'XAU/USD',
      actualEntry: 2380.00,
      positionSize: 0.5,
      aiPlannedSetup: {
        ...createMockTrade('BUY').aiPlannedSetup,
        symbol: 'XAU/USD',
        plannedEntry: 2380.00,
        stopLoss: 2365.00,
        takeProfit1: 2400.00
      }
    });

    const snapshot = await marketMonitoringService.evaluateActiveTrade(goldTrade, {
      livePriceOverride: 2390.00 // +10 points
    });

    expect(snapshot.unrealizedPips).toBe(10.0);
    expect(snapshot.unrealizedPnl).toBe(50.00); // 10 pts * $10 * 0.5 lot = $50
  });

  // =========================================================================
  // 6. ZERO BROKER EXECUTION INVARIANTS
  // =========================================================================

  it('16. Invariant: Monitoring engine never changes brokerExecution flag or transmits orders', async () => {
    const buyTrade = createMockTrade('BUY');
    const snapshot = await marketMonitoringService.evaluateActiveTrade(buyTrade, {
      livePriceOverride: 1.08650 // TP1 hit
    });

    // Trade status remains ACTIVE (user must manually close)
    expect(buyTrade.status).toBe('ACTIVE');
    expect(buyTrade.brokerExecution).toBe(false);
    expect(buyTrade.executionMode).toBe('MANUAL');
  });
});
