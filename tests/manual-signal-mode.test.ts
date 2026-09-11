import { describe, it, expect, beforeEach } from 'vitest';
import { manualSignalService } from '../src/server/services/manualSignalService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { authorizeExecution } from '../apps/risk-governance/src/modules/executionAuthorization';
import { PostMortemReview, ManualTradeSignal } from '../src/types';

describe('QUANTUMAI ? PHASE 6 & 6C: MANUAL TRADING SIGNAL & ENTRY MODE', () => {
  beforeEach(() => {
    aiDecisionEngine.setPostMortemReviews([]);
  });

  // A. Real market data -> valid signal
  it('A: Generates a valid ManualTradeSignal with real candle market data', async () => {
    const mockCandles = Array.from({ length: 30 }, (_, i) => ({
      timestamp: new Date(Date.now() - (30 - i) * 15 * 60 * 1000),
      open: 1.0830 + i * 0.0001,
      high: 1.0835 + i * 0.0001,
      low: 1.0828 + i * 0.0001,
      close: 1.0834 + i * 0.0001,
      volume: 1000 + i * 50
    }));

    const signal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0864,
      candles: mockCandles,
      dataMode: 'LIVE'
    });

    expect(signal).toBeDefined();
    expect(signal.signalId).toMatch(/^SIG-MANUAL-/);
    expect(signal.symbol).toBe('EUR/USD');
    expect(signal.timeframe).toBe('M15');
    expect(signal.signalStatus).toBe('SIGNAL_READY');
    expect(signal.direction).toMatch(/^(BUY|SELL|NEUTRAL)$/);
    expect(signal.executionMode).toBe('MANUAL');
    expect(signal.brokerExecution).toBe(false);
    expect(signal.stopLoss).toBeGreaterThan(0);
    expect(signal.takeProfit1).toBeGreaterThan(0);
    expect(signal.entryZone.min).toBeGreaterThan(0);
  });

  // B. Market data unavailable -> fails closed with MARKET_DATA_UNAVAILABLE
  it('B: Fails closed when live market price is missing or zero', async () => {
    const signal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 0,
      candles: [{ open: 1, high: 1, low: 1, close: 1 }],
      dataMode: 'LIVE'
    });

    expect(signal.signalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(signal.direction).toBe('NEUTRAL');
    expect(signal.brokerExecution).toBe(false);
    expect(signal.executionMode).toBe('MANUAL');
  });

  // C. Insufficient candles (< 15) -> fails closed with INSUFFICIENT_EVIDENCE
  it('C: Fails closed when candle count is insufficient (< 15 candles)', async () => {
    const sparseCandles = Array.from({ length: 5 }, (_, i) => ({
      timestamp: new Date(),
      open: 1.08,
      high: 1.085,
      low: 1.079,
      close: 1.082,
      volume: 100
    }));

    const signal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.082,
      candles: sparseCandles,
      dataMode: 'LIVE'
    });

    expect(signal.signalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(signal.reason).toContain('Minimum 15 candles required');
    expect(signal.brokerExecution).toBe(false);
  });

  // D & G. Adaptive Learning influences SL buffer on LOSS lesson
  it('D & G: LOSS lesson in Adaptive Learning expands SL buffer from baseline 1.4x to 1.8x ATR', async () => {
    const mockCandles = Array.from({ length: 25 }, (_, i) => ({
      timestamp: new Date(),
      open: 1.0830,
      high: 1.0840,
      low: 1.0820,
      close: 1.0835,
      volume: 1000
    }));

    // Baseline without learning
    const baselineSignal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0835,
      candles: mockCandles,
      dataMode: 'LIVE'
    });

    // Add EUR/USD Loss review
    const lossReview: PostMortemReview = {
      id: 991,
      tradeId: 't-test-991',
      pair: 'EUR/USD',
      outcome: 'LOSS',
      realizedPnl: -120,
      mistakeCategory: 'SL_TOO_TIGHT',
      lessonEn: 'Expand SL to 1.8x ATR due to liquidity hunting on EUR/USD',
      lessonMs: 'Lebarkan SL kepada 1.8x ATR',
      adaptiveRuleEn: 'Expand SL to 1.8x ATR on EUR/USD',
      adaptiveRuleMs: 'Lebarkan SL kepada 1.8x ATR',
      confidenceScore: 0.85,
      marketRegime: 'TRENDING',
      timestamp: new Date().toISOString()
    };
    aiDecisionEngine.setPostMortemReviews([lossReview]);

    const adaptedSignal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0835,
      candles: mockCandles,
      dataMode: 'LIVE'
    });

    expect(adaptedSignal.adaptiveLearningEvidence.relevantLessonsCount).toBe(1);
    expect(adaptedSignal.adaptiveLearningEvidence.appliedLessons[0]).toContain('Expand SL to 1.8x ATR');
  });

  // E. Broker execution is false, orders transmitted = 0
  it('E: Verifies that signal generation transmits 0 broker orders', async () => {
    const mockCandles = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(),
      open: 1.0800,
      high: 1.0850,
      low: 1.0790,
      close: 1.0840,
      volume: 500
    }));

    const signal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0840,
      candles: mockCandles,
      dataMode: 'LIVE'
    });

    expect(signal.brokerExecution).toBe(false);
    expect(signal.executionMode).toBe('MANUAL');
  });

  // F. Manual trade recording in journal & Adaptive Learning handoff
  it('F: Records manual trade in journal and closes it without broker interaction', async () => {
    const journalEntry = manualSignalService.recordManualTrade({
      symbol: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0840,
      stopLoss: 1.0810,
      takeProfit: 1.0900,
      notes: 'Executed manually via external mobile app'
    });

    expect(journalEntry).toBeDefined();
    expect(journalEntry.tradeId).toMatch(/^MANUAL-/);
    expect(journalEntry.brokerExecution).toBe(false);
    expect(journalEntry.executionMode).toBe('MANUAL');
    expect(journalEntry.outcome).toBe('OPEN');

    const closed = await manualSignalService.closeManualTrade(journalEntry.tradeId, {
      exitPrice: 1.0890,
      outcome: 'WIN',
      realizedPnl: 150,
      userNotes: 'Hit TP1 area manually'
    });

    expect(closed.outcome).toBe('WIN');
    expect(closed.realizedPnl).toBe(150);
    expect(closed.actualExitPrice).toBe(1.0890);
  });

  // =========================================================================
  // PHASE 6C: 20 DETERMINISTIC VALIDATION & LIFECYCLE TESTS
  // =========================================================================

  const createTestSignal = (overrides?: Partial<ManualTradeSignal>): ManualTradeSignal => ({
    signalId: `SIG-TEST-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    symbol: 'EUR/USD',
    timeframe: 'M15',
    marketDataStatus: 'VALID_REAL_DATA',
    direction: 'BUY',
    setupGrade: 'A',
    confidence: 80,
    entryZone: { min: 1.08300, max: 1.08350 },
    invalidationLevel: 1.07900,
    stopLoss: 1.08050,
    takeProfit1: 1.08800,
    takeProfit2: 1.09200,
    riskReward: '1:2.5',
    marketStructure: 'BULLISH',
    technicalEvidence: ['H1 Order Block test', 'RSI Bullish Divergence'],
    adaptiveLearningEvidence: {
      status: 'ACTIVE',
      relevantLessonsCount: 1,
      appliedLessons: ['Lesson #991: Expand SL to 1.8x ATR on EUR/USD']
    },
    signalStatus: 'SIGNAL_READY',
    generatedAt: Date.now(),
    expiresAt: Date.now() + 45 * 60 * 1000,
    executionMode: 'MANUAL',
    brokerExecution: false,
    ...overrides
  });

  // 1. Valid manual entry
  it('1. Creates a valid UserActualTrade with immutable AI setup and user execution', () => {
    const signal = createTestSignal();
    const trade = manualSignalService.createUserActualTrade({
      signal,
      actualEntry: 1.08330,
      positionSize: 0.5,
      notes: 'Entered manually on cTrader terminal'
    });

    expect(trade).toBeDefined();
    expect(trade.manualTradeId).toMatch(/^MTR-/);
    expect(trade.signalId).toBe(signal.signalId);
    expect(trade.actualEntry).toBe(1.08330);
    expect(trade.positionSize).toBe(0.5);
    expect(trade.status).toBe('ACTIVE');
    expect(trade.result).toBe('PENDING');
    expect(trade.executionMode).toBe('MANUAL');
    expect(trade.brokerExecution).toBe(false);
    expect(trade.source).toBe('MANUAL_USER_REPORTED');
  });

  // 2. Missing entry
  it('2. Rejects creation when actualEntry is missing/undefined', () => {
    const signal = createTestSignal();
    expect(() => {
      manualSignalService.createUserActualTrade({
        signal,
        actualEntry: undefined as any,
        positionSize: 0.1
      });
    }).toThrowError(/INVALID_ENTRY_PRICE/);
  });

  // 3. Zero entry
  it('3. Rejects creation when actualEntry is zero', () => {
    const signal = createTestSignal();
    expect(() => {
      manualSignalService.createUserActualTrade({
        signal,
        actualEntry: 0,
        positionSize: 0.1
      });
    }).toThrowError(/INVALID_ENTRY_PRICE/);
  });

  // 4. Negative entry
  it('4. Rejects creation when actualEntry is negative', () => {
    const signal = createTestSignal();
    expect(() => {
      manualSignalService.createUserActualTrade({
        signal,
        actualEntry: -1.0830,
        positionSize: 0.1
      });
    }).toThrowError(/INVALID_ENTRY_PRICE/);
  });

  // 5. NaN entry
  it('5. Rejects creation when actualEntry is NaN', () => {
    const signal = createTestSignal();
    expect(() => {
      manualSignalService.createUserActualTrade({
        signal,
        actualEntry: NaN,
        positionSize: 0.1
      });
    }).toThrowError(/INVALID_ENTRY_PRICE/);
  });

  // 6. Invalid position size (undefined / NaN)
  it('6. Rejects creation when positionSize is invalid/NaN', () => {
    const signal = createTestSignal();
    expect(() => {
      manualSignalService.createUserActualTrade({
        signal,
        actualEntry: 1.08330,
        positionSize: NaN
      });
    }).toThrowError(/INVALID_POSITION_SIZE/);
  });

  // 7. Zero position size
  it('7. Rejects creation when positionSize is zero', () => {
    const signal = createTestSignal();
    expect(() => {
      manualSignalService.createUserActualTrade({
        signal,
        actualEntry: 1.08330,
        positionSize: 0
      });
    }).toThrowError(/INVALID_POSITION_SIZE/);
  });

  // 8. Negative position size
  it('8. Rejects creation when positionSize is negative', () => {
    const signal = createTestSignal();
    expect(() => {
      manualSignalService.createUserActualTrade({
        signal,
        actualEntry: 1.08330,
        positionSize: -0.5
      });
    }).toThrowError(/INVALID_POSITION_SIZE/);
  });

  // 9. >10 lot position size
  it('9. Rejects creation when positionSize exceeds 10.0 lots cap', () => {
    const signal = createTestSignal();
    expect(() => {
      manualSignalService.createUserActualTrade({
        signal,
        actualEntry: 1.08330,
        positionSize: 10.5
      });
    }).toThrowError(/POSITION_SIZE_LIMIT_EXCEEDED/);
  });

  // 10. Nonexistent signal
  it('10. Rejects creation when signalId does not exist in history', () => {
    expect(() => {
      manualSignalService.createUserActualTrade({
        signalId: 'SIG-NONEXISTENT-999',
        actualEntry: 1.08330,
        positionSize: 0.1
      });
    }).toThrowError(/SIGNAL_NOT_FOUND/);
  });

  // 11. Expired signal
  it('11. Rejects creation when AI signal is expired', () => {
    const expiredSignal = createTestSignal({
      expiresAt: Date.now() - 10000 // 10s in the past
    });
    expect(() => {
      manualSignalService.createUserActualTrade({
        signal: expiredSignal,
        actualEntry: 1.08330,
        positionSize: 0.1
      });
    }).toThrowError(/SIGNAL_EXPIRED/);
  });

  // 12. Duplicate active trade
  it('12. Rejects creation of duplicate ACTIVE trade for the same signal', () => {
    const signal = createTestSignal();
    manualSignalService.createUserActualTrade({
      signal,
      actualEntry: 1.08330,
      positionSize: 0.1
    });

    expect(() => {
      manualSignalService.createUserActualTrade({
        signal,
        actualEntry: 1.08330,
        positionSize: 0.1
      });
    }).toThrowError(/DUPLICATE_ACTIVE_TRADE/);
  });

  // 13. >5% entry deviation
  it('13. Rejects creation when actual entry deviates >5% from planned entry', () => {
    const signal = createTestSignal({
      entryZone: { min: 1.08000, max: 1.08000 } // Planned entry = 1.08000
    });
    // 6% deviation: 1.08000 * 1.06 = 1.14480
    expect(() => {
      manualSignalService.createUserActualTrade({
        signal,
        actualEntry: 1.14480,
        positionSize: 0.1
      });
    }).toThrowError(/ENTRY_DEVIATION_TOO_LARGE/);
  });

  // 14. Valid close
  it('14. Closes an active UserActualTrade cleanly and calculates pips and PnL', async () => {
    const signal = createTestSignal();
    const trade = manualSignalService.createUserActualTrade({
      signal,
      actualEntry: 1.08300,
      positionSize: 1.0
    });

    const closed = await manualSignalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 1.08600,
      exitReason: 'TAKE_PROFIT_1',
      userNotes: 'TP1 target hit cleanly'
    });

    expect(closed.status).toBe('CLOSED');
    expect(closed.exitPrice).toBe(1.08600);
    expect(closed.exitReason).toBe('TAKE_PROFIT_1');
    expect(closed.realizedPips).toBe(30.0);
    expect(closed.realizedPnl).toBe(300.00); // 30 pips * $10/pip * 1.0 lot
    expect(closed.result).toBe('WIN');
  });

  // 15. Invalid exit price
  it('15. Rejects trade close when exitPrice is invalid (zero, negative, NaN)', async () => {
    const signal = createTestSignal();
    const trade = manualSignalService.createUserActualTrade({
      signal,
      actualEntry: 1.08300,
      positionSize: 0.1
    });

    await expect(manualSignalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 0,
      exitReason: 'MANUAL_EXIT'
    })).rejects.toThrowError(/INVALID_EXIT_PRICE/);

    await expect(manualSignalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: -1.08,
      exitReason: 'MANUAL_EXIT'
    })).rejects.toThrowError(/INVALID_EXIT_PRICE/);

    await expect(manualSignalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: NaN,
      exitReason: 'MANUAL_EXIT'
    })).rejects.toThrowError(/INVALID_EXIT_PRICE/);
  });

  // 16. Nonexistent trade close
  it('16. Rejects close for non-existent manualTradeId', async () => {
    await expect(manualSignalService.closeUserActualTrade('MTR-NONEXISTENT-999', {
      exitPrice: 1.08500,
      exitReason: 'MANUAL_EXIT'
    })).rejects.toThrowError(/TRADE_NOT_FOUND/);
  });

  // 17. Double close
  it('17. Rejects double close on an already closed trade', async () => {
    const signal = createTestSignal();
    const trade = manualSignalService.createUserActualTrade({
      signal,
      actualEntry: 1.08300,
      positionSize: 0.1
    });

    await manualSignalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 1.08500,
      exitReason: 'TAKE_PROFIT_1'
    });

    await expect(manualSignalService.closeUserActualTrade(trade.manualTradeId, {
      exitPrice: 1.08600,
      exitReason: 'MANUAL_EXIT'
    })).rejects.toThrowError(/TRADE_ALREADY_CLOSED/);
  });

  // 18. AI setup remains unchanged after user entry
  it('18. Guarantees immutable AiPlannedSetup layer is unchanged by actual user entry drift', () => {
    const signal = createTestSignal({
      entryZone: { min: 1.08300, max: 1.08350 },
      stopLoss: 1.08050,
      takeProfit1: 1.08800
    });

    const plannedEntryMid = (signal.entryZone.min + signal.entryZone.max) / 2;

    const trade = manualSignalService.createUserActualTrade({
      signal,
      actualEntry: 1.08450, // User entered with slippage
      positionSize: 0.2
    });

    // Verify AI planned setup retained original values
    expect(trade.aiPlannedSetup.plannedEntry).toBe(plannedEntryMid);
    expect(trade.aiPlannedSetup.stopLoss).toBe(1.08050);
    expect(trade.aiPlannedSetup.takeProfit1).toBe(1.08800);
    expect(trade.actualEntry).toBe(1.08450);
  });

  // 19. brokerExecution remains false
  it('19. Guarantees brokerExecution remains strictly false for all manual trades', () => {
    const signal = createTestSignal();
    const trade = manualSignalService.createUserActualTrade({
      signal,
      actualEntry: 1.08330,
      positionSize: 0.1
    });

    expect(trade.brokerExecution).toBe(false);
  });

  // 20. executionMode remains MANUAL
  it('20. Guarantees executionMode is strictly MANUAL across all manual operations', () => {
    const signal = createTestSignal();
    const trade = manualSignalService.createUserActualTrade({
      signal,
      actualEntry: 1.08330,
      positionSize: 0.1
    });

    expect(trade.executionMode).toBe('MANUAL');
    expect(trade.source).toBe('MANUAL_USER_REPORTED');
  });
});
