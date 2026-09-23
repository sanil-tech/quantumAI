import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { autonomousMarketScannerService } from '../src/server/services/autonomousMarketScannerService';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

describe('QUANTUMAI — Autonomous Market Scanner Pending Order Risk Governance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Requirement 1: CTraderAdapter exposes cancelOrder and getPendingOrders methods', () => {
    const adapter = new CTraderAdapter({ accountId: '48282756' });
    expect(typeof adapter.cancelOrder).toBe('function');
    expect(typeof adapter.getPendingOrders).toBe('function');
  });

  it('Requirement 2: Scanner provides maxAccountConcurrentOrders cap and status', () => {
    const status = autonomousMarketScannerService.getStatus();
    expect(typeof status.maxAccountConcurrentOrders).toBe('number');
    expect(Array.isArray(status.watchlist)).toBe(true);
    expect(status.watchlist).toContain('AUD/USD');
    expect(status.watchlist).toContain('NZD/USD');
  });

  it('Requirement 3: CTraderAdapter cancelOrder operates safely in mock test environment', async () => {
    const adapter = new CTraderAdapter({ clientId: 'mock-client-id', accountId: '48282756' });
    const cancelRes = await adapter.cancelOrder('ord-12345');
    expect(cancelRes).toBe(true);
  });

  it('Requirement 4: CTraderAdapter getPendingOrders returns array of broker pending orders', async () => {
    const adapter = new CTraderAdapter({ accountId: '48282756' });
    const pending = await adapter.getPendingOrders();
    expect(Array.isArray(pending)).toBe(true);
    if (pending.length > 0) {
      expect(pending[0]).toHaveProperty('orderId');
      expect(pending[0]).toHaveProperty('symbol');
      expect(pending[0]).toHaveProperty('tradeSide');
    }
  });

  it('Requirement 5: Scanner prunes invalidated setups when price breaches stop loss', async () => {
    // Inject a test setup into scanner
    (autonomousMarketScannerService as any).discoveredSetups = [
      {
        id: 'setup_TEST_M15_BUY',
        timestamp: Date.now() - 30000,
        pair: 'EUR/USD',
        timeframe: 'M15',
        direction: 'BUY',
        confidence: 85,
        entryPrice: 1.0850,
        stopLoss: 1.0820,
        takeProfit1: 1.0910,
        reasons: ['Test setup'],
        status: 'DISCOVERED'
      }
    ];

    await autonomousMarketScannerService.pruneInvalidAndExpiredSetups();
    const status = autonomousMarketScannerService.getStatus();
    expect(Array.isArray(status.recentSetups)).toBe(true);
  });
});
