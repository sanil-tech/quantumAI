import { describe, it, expect, beforeEach } from 'vitest';
import { manualSignalService } from '../src/server/services/manualSignalService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { authorizeExecution } from '../apps/risk-governance/src/modules/executionAuthorization';
import { PostMortemReview } from '../src/types';

describe('QUANTUMAI ? PHASE 6: MANUAL TRADING SIGNAL MODE', () => {
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
      indicators: { rsi: 55, ema50: 1.0820, atr: 0.0010 },
      dataMode: 'LIVE'
    });

    // Baseline SL distance should be approx 1.4 * 0.0010 = 0.00140 (SL = 1.08210)
    expect(baselineSignal.stopLoss).toBe(1.08210);

    // Insert LOSS lesson into Adaptive Learning memory
    const lossReview: PostMortemReview = {
      id: 'pm-loss-eurusd-p6',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0840,
      exitPrice: 1.0825,
      stopLoss: 1.0825,
      takeProfit: 1.0870,
      pnlDollars: -150,
      outcome: 'LOSS',
      rootCauseMs: 'Stop Loss buffer terlalu ketat.',
      rootCauseEn: 'Stop loss buffer was too tight during Asian session.',
      lessonLearnedMs: 'Perluaskan buffer kepada 1.8x ATR.',
      lessonLearnedEn: 'Expand SL buffer to 1.8x ATR.',
      adaptiveRuleMs: 'Buffer 1.8x ATR',
      adaptiveRuleEn: 'Expand SL buffer to 1.8x ATR for EUR/USD',
      ratingScore: 2
    };

    aiDecisionEngine.addPostMortemReview(lossReview);

    // Adapted signal
    const adaptedSignal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0835,
      candles: mockCandles,
      indicators: { rsi: 55, ema50: 1.0820, atr: 0.0010 },
      dataMode: 'LIVE'
    });

    // Adapted SL distance should be 1.8 * 0.0010 = 0.00180 (SL = 1.08170 - 4.0 pips wider!)
    expect(adaptedSignal.stopLoss).toBe(1.08170);
    expect(adaptedSignal.adaptiveLearningEvidence.status).toBe('ACTIVE');
    expect(adaptedSignal.adaptiveLearningEvidence.relevantLessonsCount).toBe(1);
    expect(adaptedSignal.adaptiveLearningEvidence.appliedLessons[0]).toContain('pm-loss-eurusd-p6');
  });

  // E. Symbol Isolation
  it('E: EUR/USD loss lesson does NOT alter GBP/USD baseline SL', async () => {
    const mockCandles = Array.from({ length: 25 }, (_, i) => ({
      timestamp: new Date(),
      open: 1.2970,
      high: 1.2980,
      low: 1.2960,
      close: 1.2975,
      volume: 1000
    }));

    const lossReview: PostMortemReview = {
      id: 'pm-loss-eurusd-isolated',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0840,
      exitPrice: 1.0825,
      stopLoss: 1.0825,
      takeProfit: 1.0870,
      pnlDollars: -150,
      outcome: 'LOSS',
      rootCauseMs: 'Root cause EUR/USD',
      rootCauseEn: 'Root cause EUR/USD',
      lessonLearnedMs: 'Lesson EUR/USD',
      lessonLearnedEn: 'Lesson EUR/USD',
      adaptiveRuleMs: 'Rule EUR/USD',
      adaptiveRuleEn: 'Expand SL buffer to 1.8x ATR',
      ratingScore: 2
    };

    aiDecisionEngine.addPostMortemReview(lossReview);

    const gbpusdSignal = await manualSignalService.generateManualSignal({
      symbol: 'GBP/USD',
      timeframe: 'M15',
      currentPrice: 1.2975,
      candles: mockCandles,
      indicators: { rsi: 55, ema50: 1.2950, atr: 0.0010 },
      dataMode: 'LIVE'
    });

    // GBP/USD retains baseline 1.4x ATR: 1.2975 - 0.0014 = 1.29610
    expect(gbpusdSignal.stopLoss).toBe(1.29610);
    expect(gbpusdSignal.adaptiveLearningEvidence.relevantLessonsCount).toBe(0);
  });

  // F. WIN lesson does not trigger defensive SL widening
  it('F: WIN lesson does not trigger defensive SL widening', async () => {
    const mockCandles = Array.from({ length: 25 }, (_, i) => ({
      timestamp: new Date(),
      open: 1.0830,
      high: 1.0840,
      low: 1.0820,
      close: 1.0835,
      volume: 1000
    }));

    const winReview: PostMortemReview = {
      id: 'pm-win-eurusd-p6',
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0830,
      exitPrice: 1.0880,
      stopLoss: 1.0815,
      takeProfit: 1.0880,
      pnlDollars: 250,
      outcome: 'WIN',
      rootCauseMs: 'Strategy execution perfect',
      rootCauseEn: 'Strategy execution perfect',
      lessonLearnedMs: 'Maintain disciplined entry',
      lessonLearnedEn: 'Maintain disciplined entry',
      adaptiveRuleMs: 'Continue standard rules',
      adaptiveRuleEn: 'Continue standard rules',
      ratingScore: 5
    };

    aiDecisionEngine.addPostMortemReview(winReview);

    const signal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0835,
      candles: mockCandles,
      indicators: { rsi: 55, ema50: 1.0820, atr: 0.0010 },
      dataMode: 'LIVE'
    });

    // Retains baseline 1.4x ATR (1.08210)
    expect(signal.stopLoss).toBe(1.08210);
    expect(signal.adaptiveLearningEvidence.relevantLessonsCount).toBe(0);
  });

  // H & I. Manual Signal never transmits broker orders and cannot bypass ExecutionSafetyGate
  it('H & I: Manual Signal cannot bypass ExecutionSafetyGate and never transmits broker orders', async () => {
    const mockCandles = Array.from({ length: 25 }, (_, i) => ({
      timestamp: new Date(),
      open: 1.0830,
      high: 1.0840,
      low: 1.0820,
      close: 1.0835,
      volume: 1000
    }));

    const signal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0835,
      candles: mockCandles,
      dataMode: 'LIVE'
    });

    expect(signal.executionMode).toBe('MANUAL');
    expect(signal.brokerExecution).toBe(false);

    // Verify Execution Authorization Gate fails closed
    const authResult = await authorizeExecution({
      signalId: signal.signalId,
      requestedOrder: { symbol: signal.symbol, direction: signal.direction as any, quantity: 0.1, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit1, price: 1.0835 },
      token: undefined as any,
      dataMode: 'LIVE',
      executionMode: 'LIVE',
      accountId: 'DEFAULT',
      tradingRepo: null as any
    });

    expect(authResult.authorized).toBe(false);
    expect(authResult.reason).toContain('Execution Authorization Failed');
  });

  // J & K. Manual trade journal entries are clearly distinguished from broker trades
  it('J & K: Manual trade journal is explicitly tagged executionMode: MANUAL and source: MANUAL_USER_REPORTED', async () => {
    const entry = manualSignalService.recordManualTrade({
      symbol: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0835,
      stopLoss: 1.0815,
      takeProfit: 1.0885,
      notes: 'Manually executed on external broker'
    });

    expect(entry.tradeId).toMatch(/^MANUAL-/);
    expect(entry.executionMode).toBe('MANUAL');
    expect(entry.brokerExecution).toBe(false);
    expect(entry.source).toBe('MANUAL_USER_REPORTED');
    expect(entry.outcome).toBe('OPEN');

    const closed = await manualSignalService.closeManualTrade(entry.tradeId, {
      exitPrice: 1.0820,
      outcome: 'LOSS',
      realizedPnl: -150,
      userNotes: 'Exited on SL hit'
    });

    expect(closed.outcome).toBe('LOSS');
    expect(closed.realizedPnl).toBe(-150);
    expect(closed.executionMode).toBe('MANUAL');
    expect(closed.brokerExecution).toBe(false);
  });

  // L. Timeframe-based expiration
  it('L: Assigns correct timeframe-based expiration windows', async () => {
    const mockCandles = Array.from({ length: 20 }, () => ({
      timestamp: new Date(),
      open: 1.08,
      high: 1.09,
      low: 1.07,
      close: 1.085,
      volume: 500
    }));

    const m15Signal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.085,
      candles: mockCandles,
      dataMode: 'LIVE'
    });

    const h1Signal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'H1',
      currentPrice: 1.085,
      candles: mockCandles,
      dataMode: 'LIVE'
    });

    // M15 expiration: ~45 mins
    const m15DiffMins = Math.round((m15Signal.expiresAt - m15Signal.generatedAt) / 60000);
    expect(m15DiffMins).toBe(45);

    // H1 expiration: ~180 mins (3 hours)
    const h1DiffMins = Math.round((h1Signal.expiresAt - h1Signal.generatedAt) / 60000);
    expect(h1DiffMins).toBe(180);
  });

  // PHASE 6B: Dual-Layer Data Model (AI Planned Setup vs User Actual Execution)
  it('Phase 6B: Distinguishes AI PLANNED SETUP from USER ACTUAL EXECUTION without overwriting', async () => {
    const mockCandles = Array.from({ length: 25 }, (_, i) => ({
      timestamp: new Date(),
      open: 1.0830,
      high: 1.0840,
      low: 1.0820,
      close: 1.0835,
      volume: 1000
    }));

    const signal = await manualSignalService.generateManualSignal({
      symbol: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0835,
      candles: mockCandles,
      indicators: { rsi: 55, ema50: 1.0820, atr: 0.0010 },
      dataMode: 'LIVE'
    });

    const plannedEntry = (signal.entryZone.min + signal.entryZone.max) / 2;
    const userActualEntry = 1.08412; // User entered late / with slippage

    const userTrade = manualSignalService.createUserActualTrade({
      signal,
      actualEntry: userActualEntry,
      positionSize: 0.5,
      notes: 'User manual execution via external broker'
    });

    expect(userTrade.manualTradeId).toMatch(/^MTR-/);
    expect(userTrade.signalId).toBe(signal.signalId);
    expect(userTrade.symbol).toBe('EUR/USD');
    expect(userTrade.actualEntry).toBe(1.08412);
    expect(userTrade.positionSize).toBe(0.5);
    expect(userTrade.status).toBe('ACTIVE');
    expect(userTrade.result).toBe('PENDING');

    // CRITICAL INVARIANT: AI Planned Setup is NOT overwritten by actual entry!
    expect(userTrade.aiPlannedSetup.plannedEntry).not.toBe(userActualEntry);
    expect(userTrade.aiPlannedSetup.plannedEntry).toBe(Number(plannedEntry.toFixed(5)));
    expect(userTrade.aiPlannedSetup.stopLoss).toBe(signal.stopLoss);
    expect(userTrade.aiPlannedSetup.takeProfit1).toBe(signal.takeProfit1);
    expect(userTrade.aiPlannedSetup.takeProfit2).toBe(signal.takeProfit2);
    expect(userTrade.executionMode).toBe('MANUAL');
    expect(userTrade.brokerExecution).toBe(false);
    expect(userTrade.source).toBe('MANUAL_USER_REPORTED');

    // Close the trade at TP1
    const closedTrade = await manualSignalService.closeUserActualTrade(userTrade.manualTradeId, {
      exitPrice: 1.08562, // +15 pips
      exitReason: 'TAKE_PROFIT_1',
      userNotes: 'TP1 reached'
    });

    expect(closedTrade.status).toBe('CLOSED');
    expect(closedTrade.result).toBe('WIN');
    expect(closedTrade.realizedPips).toBe(15.0);
    expect(closedTrade.realizedPnl).toBe(75.0); // 15 pips * $10/pip * 0.5 lots = $75.00
    expect(closedTrade.aiPlannedSetup.plannedEntry).toBe(Number(plannedEntry.toFixed(5))); // AI setup still preserved!
  });
});
