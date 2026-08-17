import { describe, it, expect } from 'vitest';
import { RiskGovernanceEngine } from '../apps/risk-governance/src/modules/governanceEngine';
import { authorizeExecution } from '../apps/risk-governance/src/modules/executionAuthorization';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { TradeProposal } from '../src/types';

describe('QUANTUMAI ? Phase 7: Adaptive Learning Safety Invariants', () => {
  const governanceEngine = new RiskGovernanceEngine();

  it('1. Adaptive Learning CANNOT override hard risk limits (maxLotSizeCap / maxLoss)', () => {
    // Inject extreme adaptive learning lesson
    aiDecisionEngine.setPostMortemReviews([
      {
        id: 'pm-extreme-risk',
        tradeId: 't-extreme',
        positionId: 'p-extreme',
        learningVersion: '1.0',
        timestamp: Date.now(),
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0820,
        stopLoss: 1.0820,
        takeProfit: 1.0910,
        pnlDollars: -500,
        pnlPips: -30,
        outcome: 'LOSS',
        rootCauseEn: 'Extreme loss',
        rootCauseMs: 'Rugi',
        lessonLearnedEn: 'Widen SL',
        lessonLearnedMs: 'Besarkan SL',
        adaptiveRuleEn: 'Request 50.0 lots',
        adaptiveRuleMs: 'Minta 50 lot',
        ratingScore: 50,
        strategyId: 'SMC_QUANT_V1',
        strategyVersion: '1.0'
      }
    ]);

    const proposal: TradeProposal = {
      id: 'prop-test-extreme',
      symbol: 'EUR/USD',
      direction: 'BUY',
      lot_size: 50.0, // Exceeds default 10.0 lot limit
      order_type: 'MARKET',
      entry_range: [1.0850, 1.0852],
      stop_loss: 1.0800,
      take_profit: 1.0950,
      invalidation_level: 1.0790,
      estimated_risk_usd: 2500,
      strategy_name: 'ADAPTIVE_SMC',
      strategy_version: '1.0',
      confidence: 90,
      evidence: ['Adaptive Memory'],
      agent_votes: [],
      why_direction: 'Adaptive setup',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    // Hard risk governance evaluation MUST reject
    const decision = governanceEngine.evaluateTradeProposal(proposal, 'DEFAULT', 50.0);
    expect(decision.status).toBe('REJECTED');
    expect(decision.rejection_reasons?.some(r => r.includes('exceeds maximum allowable lot size'))).toBe(true);
  });

  it('2. Adaptive Learning CANNOT bypass Execution Authorization Gate', async () => {
    const authResult = await authorizeExecution({
      signalId: 'sig-test',
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1, stopLoss: 1.0800, takeProfit: 1.0900, price: 1.0850 },
      token: undefined as any,
      dataMode: 'LIVE',
      executionMode: 'LIVE',
      accountId: 'DEFAULT',
      tradingRepo: null as any
    });

    // Execution safety gate MUST fail closed
    expect(authResult.authorized).toBe(false);
    expect(authResult.reason).toContain('Execution Authorization Failed');
  });

  it('3. Adaptive Learning outputs are pure mathematical advisory objects and CANNOT transmit broker orders', async () => {
    const opinion = await aiDecisionEngine.generateOpinion({
      pair: 'EUR/USD',
      timeframe: 'M15',
      currentPrice: 1.0850,
      indicators: { rsi: 55, ema50: 1.0840, atr: 0.0020 }
    });

    // Opinion is purely analytical
    expect(opinion.pair).toBe('EUR/USD');
    expect(opinion.action).toBe('BUY');
    expect((opinion as any).orderTransmitted).toBeUndefined();
    expect((opinion as any).socketStatus).toBeUndefined();
  });
});
