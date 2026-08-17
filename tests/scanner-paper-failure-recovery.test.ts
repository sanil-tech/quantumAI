import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TradingRepository } from '../packages/database/src/repository';

describe('TASK 8B-P5: Paper Failure -> Recovery -> Idempotency', () => {
  let repo: TradingRepository;
  const timestamp = Date.now();
  const positionId = 'TASK8B-P5-WIN-' + timestamp;
  const setupId = 'TASK8B-P5-SETUP-' + timestamp;
  const openPosId = 'TASK8B-P5-OPEN-' + timestamp;
  const accountId = '5881460';

  beforeAll(() => {
    repo = new TradingRepository();
  });

  afterAll(async () => {
    try {
      await repo.query("DELETE FROM positions WHERE position_id LIKE 'TASK8B-P5-%'");
      await repo.query("DELETE FROM account_state WHERE account_id = '5881460'");
    } catch (e) {}
  });

  it('demonstrates exactly-once recovery after injected settlement failure', async () => {
    const baselineMetrics = await repo.calculatePerformanceMetrics(accountId);
    const baselineClosedTrades = baselineMetrics.totalTrades;
    const baselineWins = baselineMetrics.winCount;
    const baselineLosses = baselineMetrics.lossCount;

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

    const afterOpenMetrics = await repo.calculatePerformanceMetrics(accountId);
    expect(afterOpenMetrics.totalTrades).toBe(baselineClosedTrades);

    const originalClose = repo.closePositionTransaction.bind(repo);
    let attempt = 0;
    vi.spyOn(repo, 'closePositionTransaction').mockImplementation(async (params) => {
      attempt++;
      if (attempt === 1) {
        throw new Error('SIMULATED / INJECTED TEST FAILURE: Settlement persistence failed');
      }
      return originalClose(params);
    });

    await expect(repo.closePositionTransaction({
      positionId,
      closePrice: 1.1010,
      realizedProfit: 10.00,
      pnlPips: 10,
      closeReason: 'TP_HIT',
      accountId
    })).rejects.toThrow('SIMULATED / INJECTED TEST FAILURE: Settlement persistence failed');

    const postFailPos = await repo.getPositionById(positionId);
    expect(postFailPos?.status).toBe('OPEN');
    
    const afterFailMetrics = await repo.calculatePerformanceMetrics(accountId);
    expect(afterFailMetrics.totalTrades).toBe(baselineClosedTrades);

    const recoveryRes = await repo.closePositionTransaction({
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

    const afterRecoveryMetrics = await repo.calculatePerformanceMetrics(accountId);
    expect(afterRecoveryMetrics.totalTrades).toBe(baselineClosedTrades + 1);
    expect(afterRecoveryMetrics.winCount).toBe(baselineWins + 1);
    expect(afterRecoveryMetrics.lossCount).toBe(baselineLosses);

    const dupRes = await repo.closePositionTransaction({
      positionId,
      closePrice: 1.2000,
      realizedProfit: 999.00,
      pnlPips: 999,
      closeReason: 'DUPLICATE_ATTEMPT',
      accountId
    });

    const finalPos = await repo.getPositionById(positionId);
    expect(finalPos?.status).toBe('CLOSED');
    expect(finalPos?.closePrice).toBe(1.1010);
    expect(finalPos?.realizedProfit).toBe(10.00);
    expect(finalPos?.pnlPips).toBe(10);
    expect(finalPos?.closeReason).toBe('TP_HIT');
    
    const afterDupMetrics = await repo.calculatePerformanceMetrics(accountId);
    expect(afterDupMetrics.totalTrades).toBe(baselineClosedTrades + 1);
    expect(afterDupMetrics.winCount).toBe(baselineWins + 1);

    expect(finalPos?.positionId).toBe(positionId);
    expect(finalPos?.setupId).toBe(setupId);

    let count = 0;
    try { const res = await repo.query("SELECT COUNT(*) as count FROM positions WHERE position_id = $1", [positionId]); count = parseInt(res.rows[0].count); } catch(e) { throw e; } // P14B: no fallback — DB is sole source of truth
    expect(count).toBe(1);

    await repo.savePosition({
      positionId: openPosId,
      setupId: openPosId,
      accountId,
      symbol: 'GBPUSD',
      direction: 'SELL',
      quantity: 1000,
      entryPrice: 1.3000,
      currentPrice: 1.2900,
      unrealizedProfit: 10.00,
      status: 'OPEN',
      broker: 'PAPER',
      openedAt: new Date(),
    });

    const finalMetrics = await repo.calculatePerformanceMetrics(accountId);
    expect(finalMetrics.totalTrades).toBe(baselineClosedTrades + 1);
  });
});
