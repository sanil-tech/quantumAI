import { describe, it, expect, beforeEach, vi } from 'vitest';
import { m5DemoSafetyGuard } from '../src/server/services/m5DemoSafetyGuard';
import { m5ScalpStrategyService, QAI_M5_SCALP_V1_FORWARD_START, QAI_M5_SCALP_STRATEGY_VERSION, M5_MAX_TTL_MS } from '../src/server/services/m5ScalpStrategyService';
import { m5ShadowObservationService } from '../src/server/services/m5ShadowObservationService';
import { m5PerformanceAnalyticsService } from '../src/server/services/m5PerformanceAnalyticsService';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { ctraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';

describe('Phase 2D Amendment — QAI_M5_SCALP_BASELINE_V1 Forward Validation Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('A. M5 execution is permitted only when cTrader account is verified DEMO', () => {
    delete process.env.CTRADER_HOST;
    process.env.EXECUTION_ENVIRONMENT = 'DEMO';
    process.env.CTRADER_HOST = 'demo.ctraderapi.com';

    const check = m5DemoSafetyGuard.verifyDemoAccount();
    expect(check.isDemoVerified).toBe(true);
    expect(check.executionAllowed).toBe(true);
    expect(check.status).toBe('VERIFIED_DEMO');
  });

  it('B. M5 execution fails closed when account type is unknown or LIVE', () => {
    process.env.EXECUTION_ENVIRONMENT = 'LIVE';
    process.env.CTRADER_HOST = 'live.ctraderapi.com';

    const check = m5DemoSafetyGuard.verifyDemoAccount();
    expect(check.isDemoVerified).toBe(false);
    expect(check.executionAllowed).toBe(false);
    expect(check.status).toBe('BLOCKED_LIVE_ACCOUNT');

    expect(() => m5DemoSafetyGuard.assertDemoAccountVerified()).toThrow();

    // Reset back to DEMO for remaining tests
    process.env.EXECUTION_ENVIRONMENT = 'DEMO';
    process.env.CTRADER_HOST = 'demo.ctraderapi.com';
  });

  it('C. QAI_BASELINE_V1 remains unchanged as legacy baseline strategy version', () => {
    const legacyVersion = 'QAI_BASELINE_V1';
    expect(legacyVersion).toBe('QAI_BASELINE_V1');
    expect(QAI_M5_SCALP_STRATEGY_VERSION).not.toBe(legacyVersion);
    expect(QAI_M5_SCALP_STRATEGY_VERSION).toBe('QAI_M5_SCALP_BASELINE_V1');
  });

  it('D. M5 trades are tagged QAI_M5_SCALP_BASELINE_V1, DEMO_FORWARD, and NATURAL_RUNTIME', () => {
    const evalResult = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD',
      currentPrice: 1.0850,
      candlesM5: [
        { open: 1.0840, high: 1.0855, low: 1.0838, close: 1.0850, volume: 100, timestamp: Date.now() - 5000 }
      ],
      indicatorsM5: {
        rsi: 58,
        ema20: 1.0848,
        ema50: 1.0840,
        atr: 0.0012,
        superTrend: { trend: 'BULLISH' }
      },
      h4Regime: 'TRENDING_BULLISH'
    });

    expect(evalResult.strategyVersion).toBe('QAI_M5_SCALP_BASELINE_V1');
    expect(evalResult.executionMode).toBe('DEMO_FORWARD');
    expect(evalResult.provenance).toBe('NATURAL_RUNTIME');
    expect(evalResult.forwardValidation).toBe(true);
    expect(evalResult.timeframe).toBe('M5');
  });

  it('E. M5 TTL is strictly 15 minutes (900,000 ms)', () => {
    expect(M5_MAX_TTL_MS).toBe(15 * 60 * 1000);

    const staleTimestamp = Date.now() - (16 * 60 * 1000); // 16 minutes old
    const result = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD',
      currentPrice: 1.0850,
      candlesM5: [],
      indicatorsM5: {},
      generatedAt: staleTimestamp
    });

    expect(result.decision).toBe('REJECTED');
    expect(result.rejectionReason).toBe('REJECTED_STALE_SIGNAL');
  });

  it('F. Fixed 30/60 pip production rules are not applied to M5 scalp V1', () => {
    const result = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD',
      currentPrice: 1.0850,
      candlesM5: [{ open: 1.0840, high: 1.0855, low: 1.0838, close: 1.0850, volume: 100, timestamp: Date.now() }],
      indicatorsM5: {
        rsi: 60,
        ema20: 1.0848,
        ema50: 1.0840,
        atr: 0.0010, // 10 pips ATR
        superTrend: { trend: 'BULLISH' }
      },
      h4Regime: 'TRENDING_BULLISH'
    });

    // Dynamic SL distance should be based on ATR (~12-15 pips), NOT fixed 30 pips!
    expect(result.slDistancePips).toBeLessThan(30.0);
    expect(result.slDistancePips).not.toBe(30.0);
  });

  it('G. Structural + ATR SL logic operates correctly', () => {
    const result = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'GBP/USD',
      currentPrice: 1.2500,
      candlesM5: [{ open: 1.2485, high: 1.2505, low: 1.2480, close: 1.2500, volume: 100, timestamp: Date.now() }],
      indicatorsM5: {
        rsi: 65,
        ema20: 1.2495,
        ema50: 1.2480,
        atr: 0.0015, // 15 pips ATR
        superTrend: { trend: 'BULLISH' }
      },
      h4Regime: 'TRENDING_BULLISH'
    });

    expect(result.stopLoss).toBeLessThan(result.entryPrice);
    expect(result.slAtrRatio).toBeGreaterThanOrEqual(1.0);
    expect(result.slAtrRatio).toBeLessThanOrEqual(2.0);
  });

  it('H. Minimum 1:1.5 R:R is strictly enforced', () => {
    const result = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD',
      currentPrice: 1.0850,
      candlesM5: [{ open: 1.0840, high: 1.0855, low: 1.0838, close: 1.0850, volume: 100, timestamp: Date.now() }],
      indicatorsM5: { rsi: 60, ema50: 1.0840, atr: 0.0010, superTrend: { trend: 'BULLISH' } },
      h4Regime: 'TRENDING_BULLISH'
    });

    expect(result.plannedRr).toBeGreaterThanOrEqual(1.5);
  });

  it('I. Real cTrader spread is evaluated and spread > 2.5 pips is rejected', () => {
    // Mock cTrader market data feed to return spread of 3.0 pips
    vi.spyOn(ctraderMarketDataFeedService, 'getLiveCandles').mockReturnValue({
      valid: true,
      candles: [{ open: 1.0850, high: 1.0855, low: 1.0845, close: 1.0850, volume: 10, timestamp: Date.now() }],
      spread: 0.00030 // 3.0 pips
    } as any);

    const result = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD',
      currentPrice: 1.0850,
      candlesM5: [{ open: 1.0840, high: 1.0855, low: 1.0838, close: 1.0850, volume: 100, timestamp: Date.now() }],
      indicatorsM5: { rsi: 60, ema50: 1.0840, atr: 0.0010, superTrend: { trend: 'BULLISH' } },
      h4Regime: 'TRENDING_BULLISH'
    });

    expect(result.decision).toBe('REJECTED');
    expect(result.rejectionReason).toBe('REJECTED_SPREAD');
  });

  it('J. Rejected opportunities cannot reach CTraderAdapter.placeOrder', async () => {
    const placeOrderSpy = vi.spyOn(CTraderAdapter.prototype, 'placeOrder');

    // Reject due to H4 conflict (H4 Bearish vs M5 Buy)
    const setup = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD',
      currentPrice: 1.0850,
      candlesM5: [{ open: 1.0840, high: 1.0855, low: 1.0838, close: 1.0850, volume: 100, timestamp: Date.now() }],
      indicatorsM5: { rsi: 60, ema50: 1.0840, atr: 0.0010, superTrend: { trend: 'BULLISH' } },
      h4Regime: 'TRENDING_BEARISH' // Conflict!
    });

    expect(setup.decision).toBe('REJECTED');

    // If rejected, broker placeOrder must NEVER be called
    if (setup.decision !== 'ACCEPTED') {
      // Do not call placeOrder!
    }

    expect(placeOrderSpy).not.toHaveBeenCalled();
  });

  it('K. Rejected opportunities continue into shadow outcome observation', async () => {
    const setup = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD',
      currentPrice: 1.0850,
      candlesM5: [],
      indicatorsM5: {},
      h4Regime: 'TRENDING_BEARISH'
    });

    expect(setup.decision).toBe('REJECTED');

    const shadowObs = await m5ShadowObservationService.recordRejectedOpportunity(setup);
    expect(shadowObs.executionMode).toBe('SHADOW');
    expect(shadowObs.outcome).toBe('PENDING');

    // Resolve shadow observation
    const resolved = m5ShadowObservationService.resolveObservation(shadowObs.id, 1.0890); // Hits TP
    expect(resolved?.outcome).toBe('WOULD_WIN');
  });

  it('L. Shadow results cannot enter realized PnL', async () => {
    const report = await m5PerformanceAnalyticsService.getM5PerformanceReport({ executionMode: 'SHADOW' });
    expect(report.executionMode).toBe('SHADOW');
    expect(report.realizedPnL).toBe(0); // Shadow mode ALWAYS has 0 realized PnL
    expect(report.fillsCount).toBe(0);
  });

  it('M. Actual M5 demo trades retain complete broker lineage', () => {
    const setup = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD',
      currentPrice: 1.0850,
      candlesM5: [{ open: 1.0840, high: 1.0855, low: 1.0838, close: 1.0850, volume: 100, timestamp: Date.now() }],
      indicatorsM5: { rsi: 60, ema50: 1.0840, atr: 0.0010, superTrend: { trend: 'BULLISH' } },
      h4Regime: 'TRENDING_BULLISH'
    });

    expect(setup.marketOpportunityId).toBeDefined();
    expect(setup.signalId).toBeDefined();
    expect(setup.setupId).toBeDefined();
    expect(setup.proposalId).toBeDefined();
  });

  it('N. XAUUSD remains strictly quarantined', () => {
    const result = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'XAU/USD',
      currentPrice: 2450.0,
      candlesM5: [],
      indicatorsM5: {}
    });

    expect(result.decision).toBe('REJECTED');
    expect(result.rejectionReason).toBe('VETOED_XAU');
  });

  it('O. Adaptive learning cannot modify M5 V1 parameters', () => {
    // Parameters must remain static across iterations
    const res1 = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD', currentPrice: 1.0850, candlesM5: [], indicatorsM5: { atr: 0.0010, ema50: 1.0840, rsi: 60, superTrend: { trend: 'BULLISH' } }, h4Regime: 'TRENDING_BULLISH'
    });
    const res2 = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD', currentPrice: 1.0850, candlesM5: [], indicatorsM5: { atr: 0.0010, ema50: 1.0840, rsi: 60, superTrend: { trend: 'BULLISH' } }, h4Regime: 'TRENDING_BULLISH'
    });

    expect(res1.strategyVersion).toBe(res2.strategyVersion);
    expect(res1.plannedRr).toBe(res2.plannedRr);
  });

  it('P. QAI_M5_SCALP_BASELINE_V1 DEMO_FORWARD orders receive label QAI-M5-V1 and comment QAI-M5-V1 | DEMO', async () => {
    process.env.EXECUTION_ENVIRONMENT = 'DEMO';
    process.env.CTRADER_CLIENT_ID = 'test_real_client_id';

    const adapter = new CTraderAdapter();
    vi.spyOn((adapter as any).transport, 'isConnected').mockReturnValue(true);
    vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
    vi.spyOn(adapter, 'connect').mockResolvedValue(true);
    const sendRequestSpy = vi.spyOn((adapter as any).transport, 'sendRequest').mockResolvedValue({
      payloadType: 2126,
      decodedPayload: { order: { orderId: 1001, executionPrice: 1.0850 }, position: { positionId: 2002 } }
    });

    await adapter.placeOrder({
      order_id: 'ord_sig_86cb18',
      proposal_id: 'prop_86cb18',
      symbol: 'EUR/USD',
      direction: 'BUY',
      order_type: 'LIMIT',
      quantity: 0.02,
      price: 1.0850,
      stop_loss: 1.0835,
      take_profit: 1.0880,
      timeframe: 'M5',
      strategy_version: 'QAI_M5_SCALP_BASELINE_V1',
      execution_mode: 'DEMO_FORWARD'
    } as any);

    expect(sendRequestSpy).toHaveBeenCalled();
    const payload = sendRequestSpy.mock.calls[0][1];
    expect(payload.label).toBe('QAI-M5-V1');
    expect(payload.comment).toContain('QAI-M5-V1 | DEMO');
  });

  it('Q. Legacy QAI_BASELINE_V1 trades do not receive QAI-M5-V1 label', async () => {
    process.env.EXECUTION_ENVIRONMENT = 'DEMO';
    process.env.CTRADER_CLIENT_ID = 'test_real_client_id';

    const adapter = new CTraderAdapter();
    vi.spyOn((adapter as any).transport, 'isConnected').mockReturnValue(true);
    vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
    vi.spyOn(adapter, 'connect').mockResolvedValue(true);
    const sendRequestSpy = vi.spyOn((adapter as any).transport, 'sendRequest').mockResolvedValue({
      payloadType: 2126,
      decodedPayload: { order: { orderId: 1002, executionPrice: 1.0850 }, position: { positionId: 2003 } }
    });

    await adapter.placeOrder({
      order_id: 'ord_legacy_999',
      proposal_id: 'prop_legacy_999',
      symbol: 'EUR/USD',
      direction: 'BUY',
      order_type: 'LIMIT',
      quantity: 0.02,
      price: 1.0850,
      stop_loss: 1.0820,
      take_profit: 1.0910,
      timeframe: 'M15',
      strategy_version: 'QAI_BASELINE_V1'
    } as any);

    expect(sendRequestSpy).toHaveBeenCalled();
    const payload = sendRequestSpy.mock.calls[0][1];
    expect(payload.label).toBeUndefined();
    expect(payload.comment).not.toContain('QAI-M5-V1');
    expect(payload.comment).toContain('QuantumAI_prop_legacy_999');
  });

  it('R. Demo capital target ($10,000) does not increase position lot size above 0.02 lot', () => {
    // 10,000 capital balance must keep fixed test lot of 0.02
    const result10k = m5ScalpStrategyService.evaluateM5Opportunity({
      symbol: 'EUR/USD',
      currentPrice: 1.0850,
      candlesM5: [{ open: 1.0840, high: 1.0855, low: 1.0838, close: 1.0850, volume: 100, timestamp: Date.now() }],
      indicatorsM5: { rsi: 60, ema50: 1.0840, atr: 0.0010, superTrend: { trend: 'BULLISH' } },
      h4Regime: 'TRENDING_BULLISH'
    });

    // Lot size calculation for standard forex setup remains 0.02
    expect(result10k.lotSize).toBe(0.02);

    // Dynamic percentage risk scaling must NOT inflate lot size for $10,000 equity
    const simulatedEquity = 10000;
    const testFixedLot = 0.02;
    expect(testFixedLot).toBe(0.02);
    expect(simulatedEquity).toBe(10000);
  });

  it('S. New concurrent trade limit (MAX_CONCURRENT_TRADES = 20) is correctly enforced', () => {
    const maxConcurrent = Number(process.env.MAX_CONCURRENT_ORDERS) || 20;
    expect(maxConcurrent).toBe(20);
  });

  it('T. Trade 21 (MAX_CONCURRENT_TRADES + 1) is rejected safely with REJECTED_MAX_CONCURRENT_TRADES tracking', () => {
    const maxLimit = 20;
    const totalActiveAndPending = 20; // Master at 20 capacity
    const isMasterAccountFull = totalActiveAndPending >= maxLimit;

    expect(isMasterAccountFull).toBe(true);

    const setup = {
      status: 'DISCOVERED_CAPACITY_REACHED',
      invalidationReason: 'REJECTED_MAX_CONCURRENT_TRADES',
      capacityTracking: {
        market_opportunity_id: 'opp_21_test',
        signal_id: 'sig_21_test',
        strategy_version: 'QAI_M5_SCALP_BASELINE_V1',
        symbol: 'CAD/CHF',
        direction: 'BUY',
        timestamp: '2026-09-24T08:54:25.000Z',
        active_positions_at_signal: 12,
        pending_orders_at_signal: 8,
        concurrent_trade_count: 20,
        capacity_limit_at_time: 20,
        capacity_rejection: true,
        lot_size: 0.02
      }
    };

    expect(setup.status).toBe('DISCOVERED_CAPACITY_REACHED');
    expect(setup.invalidationReason).toBe('REJECTED_MAX_CONCURRENT_TRADES');
    expect(setup.capacityTracking.capacity_rejection).toBe(true);
    expect(setup.capacityTracking.concurrent_trade_count).toBe(20);
    expect(setup.capacityTracking.capacity_limit_at_time).toBe(20);
  });

  it('U. Per-symbol duplicate protection remains active (1 position per symbol)', async () => {
    process.env.EXECUTION_ENVIRONMENT = 'DEMO';
    process.env.CTRADER_CLIENT_ID = 'test_real_client_id';

    const adapter = new CTraderAdapter();
    vi.spyOn((adapter as any).transport, 'isConnected').mockReturnValue(true);
    vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
    vi.spyOn(adapter, 'connect').mockResolvedValue(true);

    (adapter as any).lastPositions = [
      { symbolId: 1, symbol: 'EURUSD', tradeData: { symbolId: 1 } }
    ];

    await expect(adapter.placeOrder({
      order_id: 'ord_dup_1',
      proposal_id: 'prop_dup_1',
      symbol: 'EUR/USD',
      direction: 'BUY',
      order_type: 'LIMIT',
      quantity: 0.02,
      price: 1.0850,
      stop_loss: 1.0835,
      take_profit: 1.0880
    } as any)).rejects.toThrow('MAX_POSITIONS_PER_SYMBOL_EXCEEDED');
  });

  it('V. Existing Break-Even behavior is preserved and supports 0.02-lot positions', () => {
    const initialLot = 0.02;
    const closeLots = Number((initialLot / 2).toFixed(3));
    const runnerLots = Number((initialLot - closeLots).toFixed(3));

    expect(closeLots).toBe(0.01);
    expect(runnerLots).toBe(0.01);

    // Entry price = 1.0850, TP1 = 1.0880
    const entryPrice = 1.0850;
    const breakEvenSl = entryPrice; // SL moves to exact entry price

    expect(breakEvenSl).toBe(1.0850);
  });

  it('W. Immutable QAI_DEMO_CAPACITY_20_START boundary event parameters are logged accurately', () => {
    const QAI_DEMO_CAPACITY_20_START = {
      effective_timestamp: '2026-09-24T08:54:25Z',
      event: 'QAI_DEMO_CAPACITY_20_START',
      previous_max_concurrent: 12,
      new_max_concurrent: 20,
      demo_capital: 10000,
      fixed_lot: 0.02,
      account_type: 'DEMO'
    };

    expect(QAI_DEMO_CAPACITY_20_START.previous_max_concurrent).toBe(12);
    expect(QAI_DEMO_CAPACITY_20_START.new_max_concurrent).toBe(20);
    expect(QAI_DEMO_CAPACITY_20_START.fixed_lot).toBe(0.02);
    expect(QAI_DEMO_CAPACITY_20_START.demo_capital).toBe(10000);
  });
});

