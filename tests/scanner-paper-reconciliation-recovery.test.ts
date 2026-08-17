import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TradingRepository } from '../packages/database/src/repository';

describe('TASK 8B-P8: Production-Grade Recovery / Reconciliation', () => {
  let repoA: TradingRepository;
  const timestamp = Date.now();
  const positionId = 'TASK8B-P8-POS-' + timestamp;
  const setupId = 'TASK8B-P8-SETUP-' + timestamp;
  const accountId = '5881460';

  beforeAll(() => {
    repoA = new TradingRepository();
  });

  afterAll(async () => {
    try {
      const cleanupRepo = new TradingRepository();
      await cleanupRepo.query("DELETE FROM positions WHERE position_id LIKE 'TASK8B-P8-%'");
    } catch (e) {}
  });

  it('proves reconciliation is idempotent, exactly-once, and identity-preserving', async () => {
    const baselineMetrics = await repoA.calculatePerformanceMetrics(accountId);
    const baselineClosedTrades = baselineMetrics.totalTrades;
    const baselineWins = baselineMetrics.winCount;

    // SCENARIO 1 - OPEN POSITION SURVIVES RESTART
    await repoA.savePosition({
      positionId,
      setupId,
      accountId,
      symbol: 'EURUSD',
      direction: 'BUY',
      quantity: 1000,
      entryPrice: 1.1000,
      currentPrice: 1.1000,
      status: 'OPEN',
      broker: 'PAPER',
      openedAt: new Date(),
    });

    const openPos = await repoA.getPositionById(positionId);
    expect(openPos?.status).toBe('OPEN');
    expect(openPos?.positionId).toBe(positionId);
    expect(openPos?.setupId).toBe(setupId);

    // Simulate restart
    const repoB = new TradingRepository();
    const restartedPos = await repoB.getPositionById(positionId);
    expect(restartedPos?.status).toBe('OPEN');
    expect(restartedPos?.positionId).toBe(positionId);
    expect(restartedPos?.setupId).toBe(setupId);

    // SCENARIO 2 - RECOVERY CLOSE
    const recoveryRes = await repoB.closePositionTransaction({
      positionId,
      closePrice: 1.1010,
      realizedProfit: 10.00,
      pnlPips: 10,
      closeReason: 'TP_HIT',
      accountId
    });

    expect(recoveryRes.position.status).toBe('CLOSED');
    expect(recoveryRes.position.closePrice).toBe(1.1010);
    expect(recoveryRes.position.realizedProfit).toBe(10.00);

    const postRecoveryMetrics = await repoB.calculatePerformanceMetrics(accountId);
    expect(postRecoveryMetrics.totalTrades).toBe(baselineClosedTrades + 1);
    expect(postRecoveryMetrics.winCount).toBe(baselineWins + 1);
    expect(recoveryRes.position.positionId).toBe(positionId);
    expect(recoveryRes.position.setupId).toBe(setupId);

    // SCENARIO 3 - DUPLICATE BROKER EVENT AFTER RECOVERY
    const duplicateRes = await repoB.closePositionTransaction({
      positionId,
      closePrice: 1.2000,
      realizedProfit: 999.00,
      pnlPips: 999,
      closeReason: 'SL_HIT',
      accountId
    });

    const postDuplicatePos = await repoB.getPositionById(positionId);
    expect(postDuplicatePos?.status).toBe('CLOSED');
    expect(postDuplicatePos?.closePrice).toBe(1.1010);
    expect(postDuplicatePos?.realizedProfit).toBe(10.00);
    expect(postDuplicatePos?.closeReason).toBe('TP_HIT');

    const postDuplicateMetrics = await repoB.calculatePerformanceMetrics(accountId);
    expect(postDuplicateMetrics.totalTrades).toBe(baselineClosedTrades + 1);
    expect(postDuplicateMetrics.winCount).toBe(baselineWins + 1);

    // SCENARIO 4 - RECONCILIATION MUST BE IDEMPOTENT
    // Run close multiple times
    await repoB.closePositionTransaction({ positionId, closePrice: 1.1010, realizedProfit: 10.00, pnlPips: 10, closeReason: 'TP_HIT', accountId });
    await repoB.closePositionTransaction({ positionId, closePrice: 1.1010, realizedProfit: 10.00, pnlPips: 10, closeReason: 'TP_HIT', accountId });

    const finalPos = await repoB.getPositionById(positionId);
    expect(finalPos?.status).toBe('CLOSED');
    const finalMetrics = await repoB.calculatePerformanceMetrics(accountId);
    expect(finalMetrics.totalTrades).toBe(baselineClosedTrades + 1);

    // SCENARIO 6 - DUPLICATE RECORD PROTECTION
    let count = 0;
    try {
      const allPosRes = await repoB.query("SELECT COUNT(*) as count FROM positions WHERE position_id = $1", [positionId]);
      count = parseInt(allPosRes.rows[0].count);
    } catch(e) {
      throw e; // P14B: DB is sole source of truth — no in-memory fallback
    }
    expect(count).toBe(1);

    // SCENARIO 7 - IDENTITY INVARIANT
    expect(finalPos?.positionId).toBe(positionId);
    expect(finalPos?.setupId).toBe(setupId);
    expect(finalPos?.accountId).toBe(accountId);

    // SCENARIO 9 - CONCURRENT RECOVERY + DUPLICATE EVENT
    const concurrentPositionId = 'TASK8B-P8-CONC-' + timestamp;
    await repoB.savePosition({
      positionId: concurrentPositionId,
      setupId: 'TASK8B-P8-CONC-SETUP-' + timestamp,
      accountId,
      symbol: 'EURUSD',
      direction: 'BUY',
      quantity: 1000,
      entryPrice: 1.1000,
      currentPrice: 1.1000,
      status: 'OPEN',
      broker: 'PAPER',
      openedAt: new Date(),
    });

    const baselineConcMetrics = await repoB.calculatePerformanceMetrics(accountId);
    const concBaselineClosed = baselineConcMetrics.totalTrades;

    const attempt1 = repoB.closePositionTransaction({ positionId: concurrentPositionId, closePrice: 1.1010, realizedProfit: 10.00, pnlPips: 10, closeReason: 'TP_HIT', accountId });
    const attempt2 = repoB.closePositionTransaction({ positionId: concurrentPositionId, closePrice: 1.2000, realizedProfit: 999.00, pnlPips: 999, closeReason: 'SL_HIT', accountId });
    const attempt3 = repoB.closePositionTransaction({ positionId: concurrentPositionId, closePrice: 1.3000, realizedProfit: 888.00, pnlPips: 888, closeReason: 'MANUAL', accountId });

    await Promise.allSettled([attempt1, attempt2, attempt3]);

    const finalConcPos = await repoB.getPositionById(concurrentPositionId);
    expect(finalConcPos?.status).toBe('CLOSED');
    
    // Exactly one won, but it's a race so we just assert consistency.
    const expectedProfit = finalConcPos?.realizedProfit;
    const finalConcMetrics = await repoB.calculatePerformanceMetrics(accountId);
    
    expect(finalConcMetrics.totalTrades).toBe(concBaselineClosed + 1);

    let concCount = 0;
    try {
      const concRes = await repoB.query("SELECT COUNT(*) as count FROM positions WHERE position_id = $1", [concurrentPositionId]);
      concCount = parseInt(concRes.rows[0].count);
    } catch(e) {
      throw e; // P14B: DB is sole source of truth — no in-memory fallback
    }
    expect(concCount).toBe(1);

  });
});
