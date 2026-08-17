import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TradingRepository } from '../packages/database/src/repository';

describe('TASK 8B-P7: Broker Event -> Crash -> Restart -> Recovery', () => {
  let repoA: TradingRepository;
  const timestamp = Date.now();
  const positionId = 'TASK8B-P7-POS-' + timestamp;
  const setupId = 'TASK8B-P7-SETUP-' + timestamp;
  const accountId = '5881460';

  beforeAll(() => {
    repoA = new TradingRepository();
  });

  afterAll(async () => {
    try {
      const cleanupRepo = new TradingRepository();
      await cleanupRepo.query("DELETE FROM positions WHERE position_id LIKE 'TASK8B-P7-%'");
    } catch (e) {}
  });

  it('leaves settlement uncommitted after simulated pre-commit crash, recovers exactly once after simulated application restart, and ignores duplicate broker execution event', async () => {
    const baselineMetrics = await repoA.calculatePerformanceMetrics(accountId);
    const baselineClosedTrades = baselineMetrics.totalTrades;
    const baselineWins = baselineMetrics.winCount;

    // 1. Position is created in an OPEN state.
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

    // 2. Simulated broker event indicates execution occurred, local settlement begins.
    // 3. Inject a process-crash-like failure BEFORE final settlement.
    let attempt = 0;
    const originalClose = repoA.closePositionTransaction.bind(repoA);
    vi.spyOn(repoA, 'closePositionTransaction').mockImplementation(async (params) => {
      attempt++;
      if (attempt === 1) {
        // PRE-COMMIT CRASH INJECTION
        throw new Error('SIMULATED CRASH: Process exited before commit');
      }
      return originalClose(params);
    });

    await expect(repoA.closePositionTransaction({
      positionId,
      closePrice: 1.1010,
      realizedProfit: 10.00,
      pnlPips: 10,
      closeReason: 'TP_HIT',
      accountId
    })).rejects.toThrow('SIMULATED CRASH: Process exited before commit');

    // 4. Verify no partial settlement has been committed
    const postCrashPos = await repoA.getPositionById(positionId);
    expect(postCrashPos?.status).toBe('OPEN'); // remains OPEN

    const postCrashMetrics = await repoA.calculatePerformanceMetrics(accountId);
    expect(postCrashMetrics.totalTrades).toBe(baselineClosedTrades); // No metric increment

    // 5. Simulate application restart by creating a fresh repository instance
    // P14B hardened: creating a new repo instance simulates app restart; DB retains OPEN state
    // creating a new repo instance accurately simulates reconnecting to the database 
    // or picking up the persistent state in memory. 
    // In a real crash, the DB retains the OPEN state.
    const repoB = new TradingRepository();

    // 6. Recovery processes the broker execution event exactly once
    const recoveryRes = await repoB.closePositionTransaction({
      positionId,
      closePrice: 1.1010,
      realizedProfit: 10.00,
      pnlPips: 10,
      closeReason: 'TP_HIT',
      accountId
    });

    // 7. Verify recovery
    expect(recoveryRes.position.status).toBe('CLOSED');
    expect(recoveryRes.position.closePrice).toBe(1.1010);
    expect(recoveryRes.position.realizedProfit).toBe(10.00);

    const afterRecoveryMetrics = await repoB.calculatePerformanceMetrics(accountId);
    expect(afterRecoveryMetrics.totalTrades).toBe(baselineClosedTrades + 1); // exactly 1
    expect(afterRecoveryMetrics.winCount).toBe(baselineWins + 1); // exactly 1

    // 8. Replay the event with conflicting payload
    const duplicateRes = await repoB.closePositionTransaction({
      positionId,
      closePrice: 1.2000,
      realizedProfit: 999.00,
      pnlPips: 999,
      closeReason: 'DUPLICATE_EVENT',
      accountId
    });

    // 9. Verify duplicate event was a no-op
    const finalPos = await repoB.getPositionById(positionId);
    expect(finalPos?.status).toBe('CLOSED');
    expect(finalPos?.closePrice).toBe(1.1010);
    expect(finalPos?.realizedProfit).toBe(10.00);
    expect(finalPos?.closeReason).toBe('TP_HIT'); // original reason

    const finalMetrics = await repoB.calculatePerformanceMetrics(accountId);
    expect(finalMetrics.totalTrades).toBe(baselineClosedTrades + 1);
    expect(finalMetrics.winCount).toBe(baselineWins + 1);

    expect(finalPos?.positionId).toBe(positionId);
    expect(finalPos?.setupId).toBe(setupId);

    let count = 0;
    try {
      const allPosRes = await repoB.query("SELECT COUNT(*) as count FROM positions WHERE position_id = $1", [positionId]);
      count = parseInt(allPosRes.rows[0].count);
    } catch(e) {
      throw e; // P14B: DB is sole source of truth — no in-memory fallback
    }
    expect(count).toBe(1); // exactly 1 record
  });
});
