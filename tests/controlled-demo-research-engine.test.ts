import { describe, it, expect, beforeEach } from 'vitest';
import { researchLearningEngine } from '../apps/decision-agent/src/services/researchLearningEngine';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { AiTradeOpportunity } from '../src/types';

describe('QUANTUMAI ? Controlled DEMO Research Engine & Learning Growth Mode', () => {

  beforeEach(() => {
    researchLearningEngine.clearAll();
    controlledDemoExecutionService.clearRecords();
  });

  // --- PART 1: SETUP FINGERPRINTS & SETUP-LEVEL ISOLATION ---

  it('1. Generates unique setup fingerprints per pair, direction, and pattern', () => {
    const fp1 = researchLearningEngine.generateFingerprint('EUR/USD', 'BUY', 'ORDER_BLOCK_RETEST');
    const fp2 = researchLearningEngine.generateFingerprint('EUR/USD', 'BUY', 'MOMENTUM_CONTINUATION');
    const fp3 = researchLearningEngine.generateFingerprint('GBP/USD', 'BUY', 'ORDER_BLOCK_RETEST');

    expect(fp1).toBe('EUR/USD_BUY_ORDER_BLOCK_RETEST');
    expect(fp2).toBe('EUR/USD_BUY_MOMENTUM_CONTINUATION');
    expect(fp3).toBe('GBP/USD_BUY_ORDER_BLOCK_RETEST');
    expect(fp1).not.toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });

  it('2. Maintains setup-level isolation: lessons on EUR/USD Order Block do NOT contaminate Momentum or GBP/USD', () => {
    // Ingest 6 losses on EUR/USD BUY ORDER_BLOCK_RETEST
    for (let i = 0; i < 6; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'EUR/USD',
        direction: 'BUY',
        setupType: 'ORDER_BLOCK_RETEST',
        session: 'LONDON',
        outcome: 'LOSS',
        closeReason: 'STOP_LOSS',
        realizedR: -1.0,
        mfePips: 3.0,
        maePips: 25.0,
        observationType: 'REAL_DEMO_EXECUTION',
        postMortem: { adaptiveRuleEn: 'Widen SL by 1.1x' } as any
      });
    }

    const obStats = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST');
    expect(obStats?.totalObservations).toBe(6);
    expect(obStats?.lossCount).toBe(6);
    expect(obStats?.recommendedSlMultiplier).toBeGreaterThan(1.0);

    // Check EUR/USD MOMENTUM_CONTINUATION is completely untouched
    const momStats = researchLearningEngine.getSetupStats('EUR/USD_BUY_MOMENTUM_CONTINUATION');
    expect(momStats).toBeUndefined();

    // Check GBP/USD is completely untouched
    const gbpStats = researchLearningEngine.getSetupStats('GBP/USD_BUY_ORDER_BLOCK_RETEST');
    expect(gbpStats).toBeUndefined();
  });

  // --- PART 2: SAMPLE SIZE EVIDENCE TIERS & BOUNDED LEARNING ---

  it('3. Enforces strict sample-size tiers (N < 5 = NO_EVIDENCE, weight = 0.0)', () => {
    // Ingest 3 losses
    for (let i = 0; i < 3; i++) {
      researchLearningEngine.ingestCompletedObservation({
        symbol: 'EUR/USD',
        direction: 'BUY',
        setupType: 'ORDER_BLOCK_RETEST',
        session: 'LONDON',
        outcome: 'LOSS',
        closeReason: 'STOP_LOSS',
        realizedR: -1.0,
        mfePips: 3.0,
        maePips: 25.0,
        observationType: 'REAL_DEMO_EXECUTION'
      });
    }

    const stats = researchLearningEngine.getSetupStats('EUR/USD_BUY_ORDER_BLOCK_RETEST')!;
    expect(stats.evidenceTier).toBe('NO_EVIDENCE');
    expect(stats.learningWeight).toBe(0.0);
    expect(stats.recommendedSlMultiplier).toBe(1.0); // No premature adjustment
  });

  it('4. Escalates evidence tiers progressively up to ROBUST_OBSERVATION with bounded weights', () => {
    const tier0 = researchLearningEngine.resolveEvidenceTier(4);
    expect(tier0.tier).toBe('NO_EVIDENCE');
    expect(tier0.weight).toBe(0.0);

    const tier1 = researchLearningEngine.resolveEvidenceTier(7);
    expect(tier1.tier).toBe('EARLY_OBSERVATION');
    expect(tier1.weight).toBe(0.05);

    const tier2 = researchLearningEngine.resolveEvidenceTier(15);
    expect(tier2.tier).toBe('DEVELOPING');
    expect(tier2.weight).toBe(0.10);

    const tier3 = researchLearningEngine.resolveEvidenceTier(45);
    expect(tier3.tier).toBe('MODERATE_EVIDENCE');
    expect(tier3.weight).toBe(0.15);

    const tier4 = researchLearningEngine.resolveEvidenceTier(120);
    expect(tier4.tier).toBe('ROBUST_OBSERVATION');
    expect(tier4.weight).toBe(0.20);
  });

  // --- PART 3: SESSION LEARNING & COUNTERFACTUAL TRACKING ---

  it('5. Accumulates multi-session learning telemetry truthfully', () => {
    researchLearningEngine.ingestCompletedObservation({
      symbol: 'EUR/USD',
      direction: 'BUY',
      session: 'ASIAN',
      outcome: 'WIN',
      closeReason: 'TAKE_PROFIT_1',
      realizedR: 1.5,
      mfePips: 20.0,
      maePips: 2.0,
      observationType: 'REAL_DEMO_EXECUTION'
    });

    researchLearningEngine.ingestCompletedObservation({
      symbol: 'EUR/USD',
      direction: 'SELL',
      session: 'LONDON',
      outcome: 'LOSS',
      closeReason: 'STOP_LOSS',
      realizedR: -1.0,
      mfePips: 4.0,
      maePips: 22.0,
      observationType: 'REAL_DEMO_EXECUTION'
    });

    const sStats = researchLearningEngine.getSessionStats();
    const asian = sStats.find(s => s.session === 'ASIAN')!;
    const london = sStats.find(s => s.session === 'LONDON')!;

    expect(asian.winRate).toBe(100.0);
    expect(asian.avgR).toBe(1.5);

    expect(london.winRate).toBe(0.0);
    expect(london.avgR).toBe(-1.0);
  });

  it('6. Records and resolves counterfactual observations without confusing them with real trades', () => {
    const opp: AiTradeOpportunity = {
      id: 'sig-counterfactual-1',
      pair: 'EUR/USD',
      timestamp: Date.now(),
      bias: 'BULLISH',
      confidence: 50,
      action: 'NO_SETUP',
      status: 'NO_SETUP',
      reasons: ['No clear confirmation'],
      entryZone: { min: 1.0850, max: 1.0860 },
      stopLoss: 1.0820,
      takeProfit1: 1.0890,
      takeProfit2: 1.0930,
      riskRewardRatio: '1:2.0',
      invalidationLevel: 1.0820,
      tradingStyle: 'DAY_TRADER',
      probabilityScore: 50,
      marketRegime: 'RANGING'
    };

    const cf = researchLearningEngine.recordCounterfactual(opp, 'NO_SETUP_CONFIRMATION', 'LONDON');
    expect(cf.observationType).toBe('COUNTERFACTUAL_OBSERVATION');
    expect(cf.hypotheticalOutcome).toBe('IN_PROGRESS');

    // Simulate price hitting TP1
    const resolved = researchLearningEngine.resolveCounterfactualOutcome(cf.id, 1.0895, 1.0840);
    expect(resolved?.hypotheticalOutcome).toBe('WOULD_HAVE_WON_TP1');
    expect(resolved?.hypotheticalR).toBe(1.5);
  });

  // --- PART 4: SAFETY INVARIANTS & AUDIT INTEGRITY ---

  it('7. Preserves absolute safety boundaries (LIVE forbidden, DEMO disarmed)', () => {
    const liveSafety = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });

    expect(liveSafety.allowed).toBe(false);
    expect(controlledDemoExecutionService.isDemoArmed()).toBe(false);
  });
});
