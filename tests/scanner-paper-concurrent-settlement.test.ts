import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TradingRepository } from '../packages/database/src/repository';

describe('TASK 8B-P6: Paper Trade Concurrency & Double-Settlement', () => {
  let repo: TradingRepository;
  const timestamp = Date.now();
  const positionId = 'TASK8B-P6-WIN-' + timestamp;
  const setupId = 'TASK8B-P6-SETUP-' + timestamp;
  const accountId = '5881460';

  beforeAll(() => {
    repo = new TradingRepository();
  });

  afterAll(async () => {
    try {
      await repo.query("DELETE FROM positions WHERE position_id LIKE 'TASK8B-P6-%'");
      await repo.query("DELETE FROM account_state WHERE account_id = '5881460'");
    } catch (e) {}
  });

  it('demonstrates exactly-once settlement under concurrent execution', async () => {
    const baselineMetrics = await repo.calculatePerformanceMetrics(accountId);
    const baselineClosedTrades = baselineMetrics.totalTrades;
    const baselineWins = baselineMetrics.winCount;

    await repo.savePosition({
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

    const openPos = await repo.getPositionById(positionId);
    expect(openPos?.status).toBe('OPEN');

    // Concurrent settlement attempt
    const attemptA = repo.closePositionTransaction({
      positionId,
      closePrice: 1.1010,
      realizedProfit: 10.00,
      pnlPips: 10,
      closeReason: 'TP_HIT_A',
      accountId
    });

    const attemptB = repo.closePositionTransaction({
      positionId,
      closePrice: 1.1020,
      realizedProfit: 20.00,
      pnlPips: 20,
      closeReason: 'TP_HIT_B',
      accountId
    });

    const attemptC = repo.closePositionTransaction({
      positionId,
      closePrice: 1.1030,
      realizedProfit: 30.00,
      pnlPips: 30,
      closeReason: 'TP_HIT_C',
      accountId
    });

    const results = await Promise.allSettled([attemptA, attemptB, attemptC]);
    
    // Check invariants
    const finalPos = await repo.getPositionById(positionId);
    expect(finalPos?.status).toBe('CLOSED');
    
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(3); // All should resolve (1 mutates, 2 are no-ops)
    
    // Exactly one set of parameters won
    const winnerClosePrice = finalPos?.closePrice;
    const winnerProfit = finalPos?.realizedProfit;
    const winnerReason = finalPos?.closeReason;
    
    // Either A, B, or C won, and it didn't mix payloads
    const isA = winnerClosePrice === 1.1010 && winnerProfit === 10.00 && winnerReason === 'TP_HIT_A';
    const isB = winnerClosePrice === 1.1020 && winnerProfit === 20.00 && winnerReason === 'TP_HIT_B';
    const isC = winnerClosePrice === 1.1030 && winnerProfit === 30.00 && winnerReason === 'TP_HIT_C';
    expect(isA || isB || isC).toBe(true);

    const finalMetrics = await repo.calculatePerformanceMetrics(accountId);
    expect(finalMetrics.totalTrades).toBe(baselineClosedTrades + 1); // exactly 1
    expect(finalMetrics.winCount).toBe(baselineWins + 1);

    expect(finalPos?.positionId).toBe(positionId);
    expect(finalPos?.setupId).toBe(setupId);

    let count = 0;
    try { 
      const allPosRes = await repo.query("SELECT COUNT(*) as count FROM positions WHERE position_id = $1", [positionId]);
      count = parseInt(allPosRes.rows[0].count);
    } catch(e) {
      throw e; // P14B: DB is sole source of truth — no in-memory fallback
    }
    expect(count).toBe(1); // exactly 1 record
  });
});
