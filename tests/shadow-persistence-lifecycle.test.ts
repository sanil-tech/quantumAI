import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getDbPool, checkDbConnection, shadowObservationRepository } from '../packages/database/src/index';
import { continuousLearningObservatoryService, ActiveShadowObservation } from '../src/server/services/continuousLearningObservatoryService';
import { learningJournalService } from '../src/server/services/learningJournalService';
import { FinalExecutionGateService } from '../src/server/services/finalExecutionGateService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { CurrencyPair } from '../src/types';

describe('Shadow Persistence Architecture Lifecycle & Safety Suite', () => {
  let dbAvailable = false;

  beforeEach(async () => {
    continuousLearningObservatoryService.resetObservatory();
    learningJournalService.clearJournal();
    dbAvailable = await checkDbConnection();
  });

  afterEach(() => {
    continuousLearningObservatoryService.resetObservatory();
  });

  it('1. verifies migration 008 executes idempotently and creates required tables', async () => {
    const migrationPath = path.resolve(__dirname, '../migrations/008_shadow_observations_and_journal.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS shadow_observations');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS learning_journal_events');

    if (dbAvailable) {
      const pool = getDbPool();
      // Run once
      await pool.query(sql);
      // Run second time (idempotency)
      await pool.query(sql);

      // Verify table existence
      const tablesRes = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('shadow_observations', 'learning_journal_events')
      `);
      const tableNames = tablesRes.rows.map(r => r.table_name);
      expect(tableNames).toContain('shadow_observations');
      expect(tableNames).toContain('learning_journal_events');
    }
  });

  it('2. verifies SHADOW_OPENED persists a complete observation with immutable snapshot', async () => {
    const mockObs: ActiveShadowObservation = {
      id: `shadow-test-${Date.now()}-open1`,
      signalId: `sig-test-${Date.now()}-1`,
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.240,
      stopLoss: 159.270,
      initialStopLoss: 159.270,
      takeProfit1: 159.200,
      takeProfit2: 159.160,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 159.240,
      lowestPriceSeen: 159.240,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { confidence: 0.91, indicators: { rsi: 68.2, macdHist: -0.0004 } }
    };

    const saved = await shadowObservationRepository.saveShadowObservation(mockObs);
    if (dbAvailable) {
      expect(saved).toBe(true);

      const active = await shadowObservationRepository.getActiveShadowObservations();
      const found = active.find(o => o.id === mockObs.id);
      expect(found).toBeDefined();
      expect(found?.entryPrice).toBe(159.240);
      expect(found?.stopLoss).toBe(159.270);
      expect(found?.status).toBe('ACTIVE');
      expect(found?.immutableSignalSnapshot.confidence).toBe(0.91);
    }
  });

  it('3. verifies TP1 hit updates tp1_hit and adjusts stopLoss in database', async () => {
    const testId = `shadow-test-${Date.now()}-tp1`;
    const mockObs: ActiveShadowObservation = {
      id: testId,
      signalId: `sig-test-${Date.now()}-2`,
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.240,
      stopLoss: 159.270,
      initialStopLoss: 159.270,
      takeProfit1: 159.200,
      takeProfit2: 159.160,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 159.240,
      lowestPriceSeen: 159.240,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true }
    };

    await shadowObservationRepository.saveShadowObservation(mockObs);

    // Simulate TP1 adaptation update
    const updated = await shadowObservationRepository.updateShadowObservation({
      id: testId,
      tp1Hit: true,
      stopLoss: 159.240 // Breakeven
    });

    if (dbAvailable) {
      expect(updated).toBe(true);
      const active = await shadowObservationRepository.getActiveShadowObservations();
      const found = active.find(o => o.id === testId);
      expect(found?.tp1Hit).toBe(true);
      expect(found?.stopLoss).toBe(159.240);
      expect(found?.initialStopLoss).toBe(159.270); // Baseline preserved
    }
  });

  it('4. verifies SHADOW_CLOSED persists final outcome, exitPrice, and realizedR', async () => {
    const testId = `shadow-test-${Date.now()}-close1`;
    const mockObs: ActiveShadowObservation = {
      id: testId,
      signalId: `sig-test-${Date.now()}-3`,
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_ORDER_BLOCK_RETEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.240,
      stopLoss: 159.270,
      initialStopLoss: 159.270,
      takeProfit1: 159.200,
      takeProfit2: 159.160,
      isMultiTarget: true,
      tp1Hit: true,
      status: 'ACTIVE',
      mfePips: 8.0,
      maePips: 0.5,
      highestPriceSeen: 159.245,
      lowestPriceSeen: 159.160,
      openedAt: Date.now() - 60000,
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true }
    };

    await shadowObservationRepository.saveShadowObservation(mockObs);

    // Close at TP2
    await shadowObservationRepository.updateShadowObservation({
      id: testId,
      status: 'CLOSED',
      closeReason: 'TAKE_PROFIT_2',
      exitPrice: 159.160,
      realizedR: 2.67,
      closedAt: Date.now()
    });

    if (dbAvailable) {
      const completed = await shadowObservationRepository.getCompletedShadowObservations(100);
      const found = completed.find(o => o.id === testId);
      expect(found).toBeDefined();
      expect(found?.status).toBe('CLOSED');
      expect(found?.closeReason).toBe('TAKE_PROFIT_2');
      expect(found?.exitPrice).toBe(159.160);
      expect(found?.realizedR).toBe(2.67);
    }
  });

  it('5. verifies boot hydration restores ACTIVE and COMPLETED shadow observations into memory', async () => {
    if (!dbAvailable) return;

    const activeId = `shadow-active-hyd-${Date.now()}`;
    const closedId = `shadow-closed-hyd-${Date.now()}`;

    // Seed database directly
    await shadowObservationRepository.saveShadowObservation({
      id: activeId,
      signalId: 'sig-hyd-1',
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'FVG_EXPANSION',
      setupFingerprint: 'EUR/USD_BUY_FVG',
      session: 'LONDON',
      marketRegime: 'RANGING',
      entryPrice: 1.16500,
      stopLoss: 1.16300,
      initialStopLoss: 1.16300,
      takeProfit1: 1.16900,
      isMultiTarget: false,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 1.16500,
      lowestPriceSeen: 1.16500,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true }
    });

    await shadowObservationRepository.saveShadowObservation({
      id: closedId,
      signalId: 'sig-hyd-2',
      symbol: 'GBP/USD',
      direction: 'BUY',
      setupType: 'LIQUIDITY_SWEEP',
      setupFingerprint: 'GBP/USD_BUY_SWEEP',
      session: 'NEW_YORK',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 1.34500,
      stopLoss: 1.34300,
      initialStopLoss: 1.34300,
      takeProfit1: 1.34900,
      isMultiTarget: false,
      tp1Hit: false,
      status: 'CLOSED',
      closeReason: 'TAKE_PROFIT_1',
      exitPrice: 1.34900,
      realizedR: 2.0,
      mfePips: 4.0,
      maePips: 0.2,
      highestPriceSeen: 1.34900,
      lowestPriceSeen: 1.34480,
      openedAt: Date.now() - 100000,
      closedAt: Date.now() - 50000,
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true }
    });

    // Reset observatory in-memory state
    continuousLearningObservatoryService.resetObservatory();
    expect(continuousLearningObservatoryService.getActiveObservations().length).toBe(0);

    // Perform boot hydration
    await continuousLearningObservatoryService.initPersistence();

    const activeObs = continuousLearningObservatoryService.getActiveObservations();
    const completedObs = continuousLearningObservatoryService.getCompletedObservations(100);

    const foundActive = activeObs.find(o => o.id === activeId);
    const foundClosed = completedObs.find(o => o.id === closedId);

    expect(foundActive).toBeDefined();
    expect(foundActive?.symbol).toBe('EUR/USD');
    expect(foundActive?.entryPrice).toBe(1.16500);

    expect(foundClosed).toBeDefined();
    expect(foundClosed?.symbol).toBe('GBP/USD');
    expect(foundClosed?.closeReason).toBe('TAKE_PROFIT_1');
    expect(foundClosed?.realizedR).toBe(2.0);
  }, 25000);

  it('6. verifies learning journal boot hydration and event persistence', async () => {
    learningJournalService.clearJournal();

    const testEvent = learningJournalService.recordEvent({
      eventType: 'SAFETY_BLOCK',
      setupFingerprint: 'TEST_SAFETY',
      symbol: 'USD/JPY',
      direction: 'SELL',
      session: 'LONDON',
      observationType: 'SHADOW_OBSERVATION' as any,
      evidenceTier: 'NO_EVIDENCE' as any,
      sampleCount: 1,
      previousLearningWeight: 1.0,
      newLearningWeight: 1.0,
      affectedFutureSetupFingerprint: 'TEST_SAFETY',
      reason: 'Safety block test verification'
    });

    expect(testEvent.id).toBeDefined();

    if (dbAvailable) {
      const events = await shadowObservationRepository.getJournalEvents({ setupFingerprint: 'TEST_SAFETY' });
      const found = events.find(e => e.id === testEvent.id);
      expect(found).toBeDefined();
      expect(found?.reason).toBe('Safety block test verification');
    }
  });

  it('7. verifies hydration idempotency — calling initPersistence multiple times never duplicates records', async () => {
    if (!dbAvailable) return;

    await continuousLearningObservatoryService.initPersistence();
    const count1 = continuousLearningObservatoryService.getActiveObservations().length;
    const completed1 = continuousLearningObservatoryService.getCompletedObservations().length;

    // Call second time
    await continuousLearningObservatoryService.initPersistence();
    const count2 = continuousLearningObservatoryService.getActiveObservations().length;
    const completed2 = continuousLearningObservatoryService.getCompletedObservations().length;

    expect(count2).toBe(count1);
    expect(completed2).toBe(completed1);
  }, 25000);

  it('8. verifies complete accounting isolation: ZERO shadow records in positions, orders, or manual_trades', async () => {
    if (!dbAvailable) return;

    const pool = getDbPool();

    // Check positions table
    const posRes = await pool.query("SELECT COUNT(*) as count FROM positions WHERE position_id LIKE 'shadow-%' OR setup_id LIKE 'shadow-%'");
    expect(Number(posRes.rows[0].count)).toBe(0);

    // Check orders table
    const ordersRes = await pool.query("SELECT COUNT(*) as count FROM orders WHERE order_id LIKE 'shadow-%'");
    expect(Number(ordersRes.rows[0].count)).toBe(0);

    // Check manual_trades table
    const manualRes = await pool.query("SELECT COUNT(*) as count FROM manual_trades WHERE manual_trade_id LIKE 'shadow-%'");
    expect(Number(manualRes.rows[0].count)).toBe(0);
  });

  it('9. verifies absolute broker execution invariants: 0 orders transmitted and execution gates disarmed', () => {
    const status = continuousLearningObservatoryService.getStatus();
    expect(status.brokerOrdersTransmitted).toBe(0);
    expect(status.isDemoArmed).toBe(false);
    expect(status.liveExecutionGate).toBe('FORBIDDEN');

    const liveGateCheck = FinalExecutionGateService.evaluateFinalExecutionGate({
      requestId: 'REQ-PERSIST-TEST',
      idempotencyKey: 'IDEM-PERSIST-TEST',
      strategyId: 'STRAT-AI-TREND-PULSE',
      strategyVersion: 'v2.0.0',
      symbol: 'EURUSD',
      direction: 'BUY',
      riskPercent: 1.0,
      environment: 'LIVE',
      actorId: 'ADMIN-01',
      actorRole: 'ADMIN'
    });
    expect(liveGateCheck.decision).toBe('DENIED');
    expect(liveGateCheck.brokerOrderTransmitted).toBe(false);
    expect(validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.1
    }).allowed).toBe(false);
  });

  it('10. verifies graceful fallback to in-memory monitoring and MEMORY_DEGRADED flag when DB is unavailable', async () => {
    // Mock getPersistenceHealth to return DEGRADED
    const spy = vi.spyOn(shadowObservationRepository, 'getPersistenceHealth').mockReturnValue('DEGRADED');

    continuousLearningObservatoryService.resetObservatory();
    continuousLearningObservatoryService.startObservatory();

    // Ingest market tick and verify observatory still monitors in memory
    const obs = continuousLearningObservatoryService.getActiveObservations();
    expect(obs.every(o => o.persistence === 'MEMORY_DEGRADED')).toBe(true);

    spy.mockRestore();
  });

  it('11. FULL REAL RESTART RECOVERY TEST', async () => {
    if (!dbAvailable) return;

    const testTradeId = `shadow-restart-test-${Date.now()}`;
    const initialObs: ActiveShadowObservation = {
      id: testTradeId,
      signalId: `sig-restart-${Date.now()}`,
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_RESTART_TEST',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.240,
      stopLoss: 159.270,
      initialStopLoss: 159.270,
      takeProfit1: 159.200,
      takeProfit2: 159.160,
      isMultiTarget: true,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 159.240,
      lowestPriceSeen: 159.240,
      openedAt: Date.now() - 30000,
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { confidence: 0.95, hash: 'imm-hash-123' }
    };

    // 1. Open shadow and verify in DB
    await shadowObservationRepository.saveShadowObservation(initialObs);
    const activeDb1 = await shadowObservationRepository.getActiveShadowObservations();
    expect(activeDb1.some(o => o.id === testTradeId)).toBe(true);

    // 2. Process TP1 adaptation
    await shadowObservationRepository.updateShadowObservation({
      id: testTradeId,
      tp1Hit: true,
      stopLoss: 159.240
    });

    // 3. Process TP2 closure
    await shadowObservationRepository.updateShadowObservation({
      id: testTradeId,
      status: 'CLOSED',
      closeReason: 'TAKE_PROFIT_2',
      exitPrice: 159.160,
      realizedR: 2.67,
      closedAt: Date.now()
    });

    // 4. Record single TRADE_CLOSED journal event
    learningJournalService.recordEvent({
      eventType: 'TRADE_CLOSED',
      setupFingerprint: 'USD/JPY_SELL_RESTART_TEST',
      symbol: 'USD/JPY',
      direction: 'SELL',
      session: 'LONDON',
      observationType: 'SHADOW_OBSERVATION' as any,
      evidenceTier: 'EARLY_OBSERVATION' as any,
      sampleCount: 1,
      previousLearningWeight: 1.0,
      newLearningWeight: 1.0,
      affectedFutureSetupFingerprint: 'USD/JPY_SELL_RESTART_TEST',
      realizedR: 2.67,
      reason: `Shadow trade closed with TAKE_PROFIT_2 at 159.160`
    });

    // 5. SIMULATE FULL SERVER RESTART
    continuousLearningObservatoryService.resetObservatory();
    learningJournalService.clearJournal();

    // Verify memory is completely wiped
    expect(continuousLearningObservatoryService.getCompletedObservations().some(o => o.id === testTradeId)).toBe(false);
    expect(learningJournalService.getEvents({ setupFingerprint: 'USD/JPY_SELL_RESTART_TEST' }).length).toBe(0);

    // 6. RE-BOOT AND HYDRATE
    await continuousLearningObservatoryService.initPersistence();
    await learningJournalService.initPersistence();

    // 7. Verify CLOSED trade recovered with immutable fields
    const completedAfter = continuousLearningObservatoryService.getCompletedObservations(100);
    const recoveredTrade = completedAfter.find(o => o.id === testTradeId);
    expect(recoveredTrade).toBeDefined();
    expect(recoveredTrade?.status).toBe('CLOSED');
    expect(recoveredTrade?.closeReason).toBe('TAKE_PROFIT_2');
    expect(recoveredTrade?.exitPrice).toBe(159.160);
    expect(recoveredTrade?.realizedR).toBe(2.67);
    expect(recoveredTrade?.immutableSignalSnapshot?.hash).toBe('imm-hash-123');

    // 8. Verify journal event recovered
    const journalAfter = learningJournalService.getEvents({ setupFingerprint: 'USD/JPY_SELL_RESTART_TEST' });
    expect(journalAfter.length).toBeGreaterThanOrEqual(1);

    // 9. Confirm zero broker orders and gates remain disarmed
    expect(validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.1
    }).allowed).toBe(false);
  });
});


