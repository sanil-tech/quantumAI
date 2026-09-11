import { describe, it, expect, beforeEach } from 'vitest';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { shadowObservationService } from '../apps/decision-agent/src/services/shadowObservationService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { AiTradeOpportunity } from '../src/types';

describe('QUANTUMAI ? Targeted TP1 Execution Semantics Check', () => {

  beforeEach(() => {
    controlledDemoExecutionService.clearRecords();
    shadowObservationService.clearPositions();
  });

  it('1. Single TP Setup: Reaching TP1 results in complete position closure with TAKE_PROFIT_1', () => {
    controlledDemoExecutionService.armDemoExecution();

    const singleTpOpportunity: AiTradeOpportunity = {
      id: 'sig-tp1-single',
      pair: 'EUR/USD',
      timestamp: Date.now(),
      bias: 'BULLISH',
      confidence: 85,
      action: 'BUY',
      status: 'VALID_PROPOSAL',
      reasons: ['Order block retest'],
      entryZone: { min: 1.0850, max: 1.0860 },
      stopLoss: 1.0820,
      takeProfit1: 1.0890,
      takeProfit2: null,
      riskRewardRatio: '1:2.0',
      invalidationLevel: 1.0820,
      tradingStyle: 'DAY_TRADER',
      probabilityScore: 80,
      marketRegime: 'BALANCED'
    };

    const res = controlledDemoExecutionService.executeControlledDemoOrder(
      singleTpOpportunity,
      0.01,
      1.0850,
      { brokerOrderId: 'ord-tp1-01', brokerPositionId: 'pos-tp1-01', executedPrice: 1.0850 }
    );

    expect(res.success).toBe(true);

    // Tick reaching TP1
    controlledDemoExecutionService.updatePositionsWithMarketPrice('EUR/USD', 1.0890, 1.0895, 1.0840);

    const record = controlledDemoExecutionService.getRecordById(res.record!.id)!;
    expect(record.phase).toBe('POSITION_CLOSED');
    expect(record.closeReason).toBe('TAKE_PROFIT_1');
    expect(record.exitPrice).toBe(1.0890);
  });

  it('2. Multi-TP Setup: Reaching TP1 moves SL to Breakeven and keeps position open toward TP2', () => {
    controlledDemoExecutionService.armDemoExecution();

    const multiTpOpportunity: AiTradeOpportunity = {
      id: 'sig-tp1-multi',
      pair: 'EUR/USD',
      timestamp: Date.now(),
      bias: 'BULLISH',
      confidence: 88,
      action: 'BUY',
      status: 'VALID_PROPOSAL',
      reasons: ['Order block retest + expansion'],
      entryZone: { min: 1.0850, max: 1.0860 },
      stopLoss: 1.0820,
      takeProfit1: 1.0890,
      takeProfit2: 1.0930,
      riskRewardRatio: '1:2.6',
      invalidationLevel: 1.0820,
      tradingStyle: 'DAY_TRADER',
      probabilityScore: 85,
      marketRegime: 'TRENDING_BULLISH'
    };

    const res = controlledDemoExecutionService.executeControlledDemoOrder(
      multiTpOpportunity,
      0.01,
      1.0850,
      { brokerOrderId: 'ord-tp1-02', brokerPositionId: 'pos-tp1-02', executedPrice: 1.0850 }
    );

    expect(res.success).toBe(true);

    // Step A: Price reaches TP1 (1.0895) but not TP2 (1.0930)
    controlledDemoExecutionService.updatePositionsWithMarketPrice('EUR/USD', 1.0890, 1.0895, 1.0845);

    let record = controlledDemoExecutionService.getRecordById(res.record!.id)!;
    expect(record.phase).toBe('POSITION_CONFIRMED'); // Still OPEN
    expect(record.tp1Hit).toBe(true);
    expect(record.stopLoss).toBe(1.0850); // SL moved to Breakeven (entry price)

    // Step B: Price subsequently reaches TP2 (1.0935)
    controlledDemoExecutionService.updatePositionsWithMarketPrice('EUR/USD', 1.0930, 1.0935, 1.0880);

    record = controlledDemoExecutionService.getRecordById(res.record!.id)!;
    expect(record.phase).toBe('POSITION_CLOSED');
    expect(record.closeReason).toBe('TAKE_PROFIT_2');
    expect(record.exitPrice).toBe(1.0930);
  });

  it('3. Multi-TP Setup: Price reverses after TP1 and exits at Breakeven SL without loss', () => {
    controlledDemoExecutionService.armDemoExecution();

    const multiTpOpportunity: AiTradeOpportunity = {
      id: 'sig-tp1-be',
      pair: 'EUR/USD',
      timestamp: Date.now(),
      bias: 'BULLISH',
      confidence: 88,
      action: 'BUY',
      status: 'VALID_PROPOSAL',
      reasons: ['Order block retest'],
      entryZone: { min: 1.0850, max: 1.0860 },
      stopLoss: 1.0820,
      takeProfit1: 1.0890,
      takeProfit2: 1.0930,
      riskRewardRatio: '1:2.6',
      invalidationLevel: 1.0820,
      tradingStyle: 'DAY_TRADER',
      probabilityScore: 85,
      marketRegime: 'TRENDING_BULLISH'
    };

    const res = controlledDemoExecutionService.executeControlledDemoOrder(
      multiTpOpportunity,
      0.01,
      1.0850,
      { brokerOrderId: 'ord-tp1-03', brokerPositionId: 'pos-tp1-03', executedPrice: 1.0850 }
    );

    // Hit TP1 -> Moves SL to Breakeven
    controlledDemoExecutionService.updatePositionsWithMarketPrice('EUR/USD', 1.0890, 1.0895, 1.0845);

    // Price reverses back down to 1.0850 (Breakeven entry)
    controlledDemoExecutionService.updatePositionsWithMarketPrice('EUR/USD', 1.0850, 1.0860, 1.0848);

    const record = controlledDemoExecutionService.getRecordById(res.record!.id)!;
    expect(record.phase).toBe('POSITION_CLOSED');
    expect(record.closeReason).toBe('STOP_LOSS');
    expect(record.exitPrice).toBe(1.0850);
  });
});
