import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ShadowWriteAheadLog,
  ShadowObservationRepository,
  shadowObservationRepository,
  getDbPool
} from '@iati/database';
import {
  continuousLearningObservatoryService,
  ActiveShadowObservation
} from '../src/server/services/continuousLearningObservatoryService';
import {
  learningJournalService,
  LearningJournalEvent
} from '../src/server/services/learningJournalService';
import { CurrencyPair, TradingSession } from '../src/types';

describe('P22 Shadow Write-Ahead Durability (WAL) Suite', () => {
  const testWalDir = path.resolve(process.cwd(), 'data', 'test-shadow-wal');
  let testWal: ShadowWriteAheadLog;

  beforeEach(() => {
    testWal = new ShadowWriteAheadLog(testWalDir);
    testWal.clearWal();
    shadowObservationRepository.setWalInstance(testWal);
    (shadowObservationRepository as any).persistenceHealth = 'HEALTHY';
    continuousLearningObservatoryService.resetObservatory();
    learningJournalService.clearJournal();
  });

  afterEach(() => {
    testWal.clearWal();
    shadowObservationRepository.setWalInstance(ShadowWriteAheadLog.getInstance());
    (shadowObservationRepository as any).pool = null;
    try {
      if (fs.existsSync(testWalDir)) {
        fs.rmSync(testWalDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('1. writes shadow observation atomically to local WAL', () => {
    const walId = testWal.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: 'shadow-wal-test-1',
      symbol: 'USD/JPY',
      payload: { id: 'shadow-wal-test-1', symbol: 'USD/JPY', status: 'ACTIVE' }
    });

    expect(walId).toBeTruthy();
    expect(testWal.getPendingCount()).toBe(1);

    const pending = testWal.getPendingEntries();
    expect(pending.length).toBe(1);
    expect(pending[0].entityId).toBe('shadow-wal-test-1');
    expect(pending[0].operationType).toBe('SAVE_OBSERVATION');
  });

  it('2. buffers to WAL when PostgreSQL write encounters outage', async () => {
    const fakePool: any = {
      query: async () => {
        throw new Error('Connection refused (DB outage)');
      }
    };
    (shadowObservationRepository as any).pool = fakePool;

    const mockObs: ActiveShadowObservation = {
      id: `shadow-outage-${Date.now()}`,
      signalId: 'sig-outage-1',
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'EUR/USD_BUY_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 1.1650,
      stopLoss: 1.1630,
      initialStopLoss: 1.1630,
      takeProfit1: 1.1690,
      isMultiTarget: false,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 1.1650,
      lowestPriceSeen: 1.1650,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true }
    };

    const saved = await shadowObservationRepository.saveShadowObservation(mockObs);
    expect(saved).toBe(true); // Durably buffered to WAL
    expect(shadowObservationRepository.getPersistenceHealth()).toBe('WAL_PENDING');
    expect(testWal.getPendingCount()).toBe(1);

    (shadowObservationRepository as any).pool = null;
  });

  it('3. replays WAL successfully once PostgreSQL recovers', async () => {
    const mockObs: ActiveShadowObservation = {
      id: `shadow-replay-${Date.now()}`,
      signalId: 'sig-replay-1',
      symbol: 'GBP/USD',
      direction: 'BUY',
      setupType: 'LIQUIDITY_SWEEP',
      setupFingerprint: 'GBP/USD_BUY_SWEEP',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 1.3450,
      stopLoss: 1.3430,
      initialStopLoss: 1.3430,
      takeProfit1: 1.3490,
      isMultiTarget: false,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 1.3450,
      lowestPriceSeen: 1.3450,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { test: true }
    };

    testWal.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: mockObs.id,
      symbol: mockObs.symbol,
      payload: mockObs
    });
    expect(testWal.getPendingCount()).toBe(1);

    const result = await shadowObservationRepository.replayWal();
    expect(result.replayed).toBe(1);
    expect(result.failed).toBe(0);
    expect(testWal.getPendingCount()).toBe(0);
    expect(shadowObservationRepository.getPersistenceHealth()).toBe('HEALTHY');

    const pool = getDbPool();
    const dbRes = await pool.query('SELECT * FROM shadow_observations WHERE id = $1', [mockObs.id]);
    expect(dbRes.rows.length).toBe(1);
    expect(parseFloat(dbRes.rows[0].entry_price)).toBe(1.3450);
  });

  it('4. performs crash recovery across server restart with pending WAL', async () => {
    const mockObs: ActiveShadowObservation = {
      id: `shadow-crash-rec-${Date.now()}`,
      signalId: 'sig-crash-1',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.24,
      stopLoss: 159.27,
      initialStopLoss: 159.27,
      takeProfit1: 159.20,
      isMultiTarget: false,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 159.24,
      lowestPriceSeen: 159.24,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { testCrash: true }
    };

    testWal.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: mockObs.id,
      symbol: mockObs.symbol,
      payload: mockObs
    });

    continuousLearningObservatoryService.resetObservatory();
    await continuousLearningObservatoryService.initPersistence();

    expect(testWal.getPendingCount()).toBe(0);
    const activeObs = continuousLearningObservatoryService.getActiveObservations();
    const matched = activeObs.find(o => o.id === mockObs.id);
    expect(matched).toBeTruthy();
    expect(matched?.symbol).toBe('USD/JPY');
    expect(matched?.entryPrice).toBe(159.24);
  });

  it('5. enforces exact-once replay semantics without duplicate rows', async () => {
    const mockObs: ActiveShadowObservation = {
      id: `shadow-exact-once-${Date.now()}`,
      signalId: 'sig-exact-1',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.24,
      stopLoss: 159.27,
      initialStopLoss: 159.27,
      takeProfit1: 159.20,
      isMultiTarget: false,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 159.24,
      lowestPriceSeen: 159.24,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { exactOnce: true }
    };

    testWal.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: mockObs.id,
      symbol: mockObs.symbol,
      payload: mockObs
    });

    await shadowObservationRepository.replayWal();
    await shadowObservationRepository.saveShadowObservation(mockObs);

    const pool = getDbPool();
    const countRes = await pool.query('SELECT COUNT(*) FROM shadow_observations WHERE id = $1', [mockObs.id]);
    expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
  });

  it('6. prevents duplicate replay when entry was already removed', async () => {
    const mockObsId = `shadow-dup-prev-${Date.now()}`;
    const walId = testWal.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: mockObsId,
      symbol: 'EUR/USD',
      payload: { id: mockObsId, symbol: 'EUR/USD', status: 'ACTIVE' }
    });

    testWal.removeEntry(walId!);
    const result = await shadowObservationRepository.replayWal();
    expect(result.replayed).toBe(0);
  });

  it('7. buffers and replays multiple queued observations across pairs', async () => {
    const pairs: CurrencyPair[] = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
    for (let i = 0; i < pairs.length; i++) {
      const id = `shadow-multi-${i}-${Date.now()}`;
      testWal.writeEntry({
        operationType: 'SAVE_OBSERVATION',
        entityType: 'SHADOW_OBSERVATION',
        entityId: id,
        symbol: pairs[i],
        payload: {
          id,
          signalId: `sig-multi-${i}`,
          symbol: pairs[i],
          direction: 'BUY',
          setupType: 'ORDER_BLOCK_RETEST',
          setupFingerprint: `${pairs[i]}_BUY_OB`,
          session: 'LONDON',
          marketRegime: 'TRENDING_BULLISH',
          entryPrice: 1.1000,
          stopLoss: 1.0950,
          initialStopLoss: 1.0950,
          takeProfit1: 1.1100,
          isMultiTarget: false,
          tp1Hit: false,
          status: 'ACTIVE',
          mfePips: 0,
          maePips: 0,
          highestPriceSeen: 1.1000,
          lowestPriceSeen: 1.1000,
          openedAt: Date.now(),
          observationType: 'SHADOW_OBSERVATION',
          executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
          immutableSignalSnapshot: { idx: i }
        }
      });
    }

    expect(testWal.getPendingCount()).toBe(4);
    const result = await shadowObservationRepository.replayWal();
    expect(result.replayed).toBe(4);
    expect(testWal.getPendingCount()).toBe(0);
  });

  it('8. replays journal events to PostgreSQL without duplication', async () => {
    const journalEvent: LearningJournalEvent = {
      id: `lje-wal-test-${Date.now()}`,
      timestamp: Date.now(),
      eventType: 'TRADE_CLOSED',
      setupFingerprint: 'EUR/USD_BUY_OB',
      symbol: 'EUR/USD',
      session: 'LONDON',
      direction: 'BUY',
      observationType: 'SHADOW_OBSERVATION' as any,
      evidenceTier: 'EARLY_OBSERVATION' as any,
      sampleCount: 1,
      realizedR: 2.0,
      reason: 'Shadow trade closed with TAKE_PROFIT_1'
    };

    testWal.writeEntry({
      operationType: 'SAVE_JOURNAL_EVENT',
      entityType: 'JOURNAL_EVENT',
      entityId: journalEvent.id,
      symbol: journalEvent.symbol,
      payload: journalEvent
    });

    const result = await shadowObservationRepository.replayWal();
    expect(result.replayed).toBe(1);

    const pool = getDbPool();
    const dbRes = await pool.query('SELECT * FROM learning_journal_events WHERE id = $1', [journalEvent.id]);
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].reason).toBe(journalEvent.reason);
  });

  it('9. handles crash window where WAL entry exists alongside completed PostgreSQL row', async () => {
    const mockObs: ActiveShadowObservation = {
      id: `shadow-crash-win-${Date.now()}`,
      signalId: 'sig-win-1',
      symbol: 'USD/JPY',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'USD/JPY_SELL_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BEARISH',
      entryPrice: 159.24,
      stopLoss: 159.27,
      initialStopLoss: 159.27,
      takeProfit1: 159.20,
      isMultiTarget: false,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 159.24,
      lowestPriceSeen: 159.24,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { crashWin: true }
    };

    await shadowObservationRepository.saveShadowObservation(mockObs);
    testWal.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: mockObs.id,
      symbol: mockObs.symbol,
      payload: mockObs
    });

    const replayRes = await shadowObservationRepository.replayWal();
    expect(replayRes.replayed).toBe(1);
    expect(testWal.getPendingCount()).toBe(0);
  });

  it('10. isolates and quarantines corrupt WAL records without crashing', async () => {
    fs.mkdirSync(testWalDir, { recursive: true });
    fs.writeFileSync(path.join(testWalDir, 'wal-corrupt-file.json'), '{ invalid JSON content !!!');

    const pending = testWal.getPendingEntries();
    expect(pending.length).toBe(0);
    expect(fs.existsSync(path.join(testWalDir, 'wal-corrupt-file.json.corrupt'))).toBe(true);
  });

  it('11. verifies multi-pair isolation in WAL entries', () => {
    testWal.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: 'shadow-eur',
      symbol: 'EUR/USD',
      payload: { id: 'shadow-eur', symbol: 'EUR/USD' }
    });

    testWal.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: 'shadow-jpy',
      symbol: 'USD/JPY',
      payload: { id: 'shadow-jpy', symbol: 'USD/JPY' }
    });

    const pending = testWal.getPendingEntries();
    expect(pending.length).toBe(2);
    expect(pending.find(p => p.symbol === 'EUR/USD')?.entityId).toBe('shadow-eur');
    expect(pending.find(p => p.symbol === 'USD/JPY')?.entityId).toBe('shadow-jpy');
  });

  it('12. cleans up WAL entries on successful replay', async () => {
    const walId = testWal.writeEntry({
      operationType: 'SAVE_OBSERVATION',
      entityType: 'SHADOW_OBSERVATION',
      entityId: `shadow-clean-${Date.now()}`,
      symbol: 'AUD/USD',
      payload: {
        id: `shadow-clean-${Date.now()}`,
        signalId: 'sig-clean-1',
        symbol: 'AUD/USD',
        direction: 'BUY',
        setupType: 'ORDER_BLOCK_RETEST',
        setupFingerprint: 'AUD/USD_BUY_OB',
        session: 'LONDON',
        marketRegime: 'TRENDING_BULLISH',
        entryPrice: 0.7150,
        stopLoss: 0.7120,
        initialStopLoss: 0.7120,
        takeProfit1: 0.7200,
        isMultiTarget: false,
        tp1Hit: false,
        status: 'ACTIVE',
        mfePips: 0,
        maePips: 0,
        highestPriceSeen: 0.7150,
        lowestPriceSeen: 0.7150,
        openedAt: Date.now(),
        observationType: 'SHADOW_OBSERVATION',
        executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
        immutableSignalSnapshot: { clean: true }
      }
    });

    expect(fs.existsSync(path.join(testWalDir, `${walId}.json`))).toBe(true);
    await shadowObservationRepository.replayWal();
    expect(fs.existsSync(path.join(testWalDir, `${walId}.json`))).toBe(false);
  });

  it('13. transitions persistence health through OUTAGE -> WAL_PENDING -> REPLAY -> HEALTHY', async () => {
    expect(shadowObservationRepository.getPersistenceHealth()).toBe('HEALTHY');

    const fakePool: any = {
      query: async () => {
        throw new Error('Database offline');
      }
    };
    (shadowObservationRepository as any).pool = fakePool;

    await shadowObservationRepository.saveShadowObservation({
      id: `shadow-trans-${Date.now()}`,
      signalId: 'sig-trans-1',
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      setupFingerprint: 'EUR/USD_BUY_OB',
      session: 'LONDON',
      marketRegime: 'TRENDING_BULLISH',
      entryPrice: 1.1650,
      stopLoss: 1.1630,
      initialStopLoss: 1.1630,
      takeProfit1: 1.1690,
      isMultiTarget: false,
      tp1Hit: false,
      status: 'ACTIVE',
      mfePips: 0,
      maePips: 0,
      highestPriceSeen: 1.1650,
      lowestPriceSeen: 1.1650,
      openedAt: Date.now(),
      observationType: 'SHADOW_OBSERVATION',
      executionQualityAssumptions: { spreadPips: 0.8, slippagePips: 0.2, latencyMs: 18.5 },
      immutableSignalSnapshot: { trans: true }
    });

    expect(shadowObservationRepository.getPersistenceHealth()).toBe('WAL_PENDING');

    (shadowObservationRepository as any).pool = null;
    await shadowObservationRepository.replayWal();

    expect(shadowObservationRepository.getPersistenceHealth()).toBe('HEALTHY');
  });

  it('14. maintains strict accounting and broker execution isolation in WAL implementation', async () => {
    const pool = getDbPool();
    const posRes = await pool.query("SELECT COUNT(*) FROM positions WHERE position_id LIKE 'shadow-%' OR position_id LIKE 'wal-%'");
    const ordRes = await pool.query("SELECT COUNT(*) FROM orders WHERE order_id LIKE 'shadow-%' OR order_id LIKE 'wal-%'");
    const fillRes = await pool.query("SELECT COUNT(*) FROM order_fills WHERE fill_id LIKE 'shadow-%' OR fill_id LIKE 'wal-%'");
    const manRes = await pool.query("SELECT COUNT(*) FROM manual_trades WHERE manual_trade_id LIKE 'shadow-%' OR manual_trade_id LIKE 'wal-%'");

    expect(parseInt(posRes.rows[0].count, 10)).toBe(0);
    expect(parseInt(ordRes.rows[0].count, 10)).toBe(0);
    expect(parseInt(fillRes.rows[0].count, 10)).toBe(0);
    expect(parseInt(manRes.rows[0].count, 10)).toBe(0);
  });
});
