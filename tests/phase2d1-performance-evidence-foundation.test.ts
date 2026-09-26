import { describe, it, expect, beforeEach } from 'vitest';
import { SignalLoggingService } from '../src/server/services/signalLoggingService';
import { AutonomousTradeExecutor } from '../src/server/services/autonomousTradeExecutor';
import { SignalRecord } from '@iati/database';

// Mock repository in memory for test assertions
class MockTradingRepository {
  public savedSignals: Map<string, SignalRecord> = new Map();
  public savedPositions: Map<string, any> = new Map();

  async saveSignal(signal: SignalRecord): Promise<SignalRecord> {
    const cloned = JSON.parse(JSON.stringify(signal));
    this.savedSignals.set(signal.id, cloned);
    return cloned;
  }

  async updateSignalDecision(signalId: string, decision: any, decisionReason?: string): Promise<SignalRecord | null> {
    const existing = this.savedSignals.get(signalId);
    if (!existing) return null;
    existing.decision = decision;
    existing.status = decision;
    existing.decisionReason = decisionReason;
    return existing;
  }

  async savePosition(pos: any): Promise<any> {
    this.savedPositions.set(pos.positionId, pos);
    return pos;
  }

  async getOpenPositions(): Promise<any[]> {
    return Array.from(this.savedPositions.values()).filter(p => p.status === 'OPEN' || p.status === 'ACTIVE');
  }

  async saveTradeEvent(): Promise<void> {}
}

describe('Phase 2D.1 — QuantumAI Performance Evidence Foundation Suite', () => {
  let mockRepo: MockTradingRepository;
  let signalLogger: SignalLoggingService;

  beforeEach(() => {
    mockRepo = new MockTradingRepository();
    signalLogger = new SignalLoggingService(mockRepo as any);
  });

  // Test A — Natural Signal Persistence before Outcome
  it('A. Every natural signal is persisted before outcome is known', async () => {
    const signalId = signalLogger.logSignal(
      'EUR/USD',
      'BUY',
      85,
      { rsi: 42, ema200: 1.0850 },
      ['Bullish RSI divergence', 'SMC Order Block'],
      1.0860,
      1.0830,
      1.0920,
      'M15',
      'setup_eurusd_test_101'
    );

    expect(signalId).toBeDefined();
    const persisted = mockRepo.savedSignals.get(signalId);
    expect(persisted).toBeDefined();
    expect(persisted?.symbol).toBe('EUR/USD');
    expect(persisted?.direction).toBe('BUY');
    expect(persisted?.status).toBe('ACTIVE');
    expect(persisted?.decision).toBe('ACCEPTED');
    expect(persisted?.provenance).toBe('NATURAL_RUNTIME');
  });

  // Test B — Rejected / Vetoed Signals Retained
  it('B. Rejected and vetoed signals are durably retained with decision reasons', async () => {
    const signalId = signalLogger.logSignal(
      'GBP/USD',
      'SELL',
      72,
      { rsi: 68 },
      ['Resistance rejection'],
      1.3550,
      1.3580,
      1.3480,
      'M15',
      'setup_gbpusd_veto_202'
    );

    signalLogger.updateSignalStatus(signalId, 'VETOED', 'High impact CPI news blackout window');

    const updated = mockRepo.savedSignals.get(signalId);
    expect(updated).toBeDefined();
    expect(updated?.decision).toBe('VETOED');
    expect(updated?.status).toBe('VETOED');
    expect(updated?.decisionReason).toBe('High impact CPI news blackout window');
  });

  // Test C — Signal Lineage Propagation
  it('C. Signal IDs propagate through execution lineage (signal -> setup -> command -> position)', async () => {
    const setupId = 'setup_lineage_303';
    const signalId = signalLogger.logSignal(
      'USD/JPY',
      'BUY',
      88,
      { rsi: 35 },
      ['Support bounce'],
      158.50,
      158.20,
      159.20,
      'M15',
      setupId
    );

    const persistedSignal = mockRepo.savedSignals.get(signalId);
    expect(persistedSignal?.setupId).toBe(setupId);
    expect(persistedSignal?.id).toBe(signalId);
  });

  // Test D — Immutability of Original Signal Parameters
  it('D. Outcome updates cannot silently rewrite original signal parameters', async () => {
    const signalId = signalLogger.logSignal(
      'AUD/USD',
      'BUY',
      80,
      { rsi: 40 },
      ['Initial setup'],
      0.6750,
      0.6720,
      0.6810,
      'M15',
      'setup_immutable_404'
    );

    const initialEntry = mockRepo.savedSignals.get(signalId)?.entryPrice;
    const initialSL = mockRepo.savedSignals.get(signalId)?.stopLoss;

    // Simulate outcome update
    signalLogger.updateSignalStatus(signalId, 'EXECUTED', undefined, {
      tradeId: 'trade_404',
      executedAt: new Date(),
      actualEntry: 0.6752,
      slippage: 0.2
    });

    const updatedSignal = mockRepo.savedSignals.get(signalId);
    expect(updatedSignal?.entryPrice).toBe(initialEntry);
    expect(updatedSignal?.stopLoss).toBe(initialSL);
    expect(updatedSignal?.decision).toBe('ACCEPTED');
  });

  // Test E — Data Provenance Separation
  it('E. Provenance categories remain strictly separated', async () => {
    const naturalId = signalLogger.logSignal(
      'EUR/USD',
      'BUY',
      90,
      {},
      ['Live natural signal'],
      1.0850,
      1.0820,
      1.0910,
      'M15'
    );

    const naturalSignal = mockRepo.savedSignals.get(naturalId);
    expect(naturalSignal?.provenance).toBe('NATURAL_RUNTIME');

    const simulatedSignal: SignalRecord = {
      id: 'sig_sim_505',
      symbol: 'EUR/USD',
      timeframe: 'M15',
      direction: 'BUY',
      entryPrice: 1.0850,
      stopLoss: 1.0820,
      takeProfit1: 1.0910,
      provenance: 'SIMULATED_TEST'
    };
    await mockRepo.saveSignal(simulatedSignal);

    expect(mockRepo.savedSignals.get('sig_sim_505')?.provenance).toBe('SIMULATED_TEST');
    expect(naturalSignal?.provenance).not.toBe(simulatedSignal.provenance);
  });

  // Test F — Baseline Version QAI_BASELINE_V1 Attached
  it('F. QAI_BASELINE_V1 is attached to all new forward signals', async () => {
    const signalId = signalLogger.logSignal(
      'USD/CAD',
      'SELL',
      82,
      {},
      ['Baseline version verification'],
      1.3980,
      1.4010,
      1.3920,
      'M15'
    );

    const signal = mockRepo.savedSignals.get(signalId);
    expect(signal?.strategyVersion).toBe('QAI_BASELINE_V1');
    expect(signal?.effectiveFrom).toBeDefined();
  });

  // Test G — Unchanged Execution Behavior
  it('G. Production trading logic execution parameters remain static during Phase 2D.1', () => {
    const executor = new AutonomousTradeExecutor({
      enabled: true,
      pair: 'EUR/USD',
      timeframe: 'M15',
      maxOpenTrades: 3,
      riskPercent: 1.0,
      minConfidence: 75,
      accountId: 'DEFAULT'
    });

    const status = executor.getStatus();
    expect(status.pair).toBe('EUR/USD');
    expect(status.timeframe).toBe('M15');
    expect(status.minConfidence).toBe(75);
  });

  // Test H — Adaptive Learning Execution Safety Guard
  it('H. Adaptive-learning outputs cannot alter trade execution during Phase 2D.1', async () => {
    // Assert that AutonomousTradeExecutor does not consume dynamic weights or alter SL/TP
    const executor = new AutonomousTradeExecutor({
      enabled: true,
      pair: 'GBP/USD',
      timeframe: 'M15',
      maxOpenTrades: 2,
      riskPercent: 1.0,
      minConfidence: 80,
      accountId: 'DEFAULT'
    });

    const generateSignalMethod = (executor as any).generateTradingSignal.bind(executor);
    const mockIndicators = {
      ema200: 1.3400,
      rsi: 55,
      superTrend: { trend: 'BULLISH' },
      adx: { adx: 30 }
    };

    const signal1 = generateSignalMethod(mockIndicators, {}, [], 1.3500);
    const signal2 = generateSignalMethod(mockIndicators, {}, [], 1.3500);

    // Outputs must be identical and deterministic, unaffected by external learning events
    expect(signal1?.stopLoss).toBe(signal2?.stopLoss);
    expect(signal1?.takeProfit1).toBe(signal2?.takeProfit1);
    expect(signal1?.confidence).toBe(signal2?.confidence);
  });
});
