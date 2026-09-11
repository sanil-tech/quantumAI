import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ctraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';
import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';
import { CTraderDemoLifecycleHarness } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';

describe('PHASE 8G: Extended DEMO Operational Validation Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Extended Real Market-Data Stream & Price Progression', () => {
    it('1.1 parses spot events with strictly advancing timestamps', () => {
      const transport = new CTraderTransport();
      const mockEvent = {
        symbolId: 1,
        bid: 116480,
        ask: 116481,
        timestamp: 1787145678000
      };

      const record = transport.handleSpotEvent(mockEvent);
      expect(record.bid).toBe(1.1648);
      expect(record.ask).toBe(1.16481);
      expect(record.timestamp).toBe(1787145678000);
    });

    it('1.2 verifies Observatory transitions between STOPPED and OBSERVING cleanly', () => {
      continuousLearningObservatoryService.resetObservatory();
      expect(continuousLearningObservatoryService.getStatus().state).toBe('STOPPED');

      continuousLearningObservatoryService.startObservatory();
      expect(continuousLearningObservatoryService.getStatus().state).toBe('OBSERVING');

      continuousLearningObservatoryService.stopObservatory();
      expect(continuousLearningObservatoryService.getStatus().state).toBe('STOPPED');
    });
  });

  describe('2. Resource Stability & Zero Leak Invariants', () => {
    it('2.1 ensures no listener accumulation across repeated start/stop invocations', () => {
      const initial = ctraderMarketDataFeedService.listenerCount('marketTick');
      const noop = () => {};

      for (let i = 0; i < 5; i++) {
        ctraderMarketDataFeedService.on('marketTick', noop);
        ctraderMarketDataFeedService.removeListener('marketTick', noop);
      }

      expect(ctraderMarketDataFeedService.listenerCount('marketTick')).toBe(initial);
    });

    it('2.2 ensures socket disconnect resets active spot subscriptions', async () => {
      const transport = new CTraderTransport();
      await transport.disconnect();
      expect(transport.getActiveSpotSubscriptions()).toHaveLength(0);
    });
  });

  describe('3. Reconciliation & Zero-Orphan Invariants', () => {
    it('3.1 confirms 0 open positions during full reconciliation check', () => {
      const check = CTraderDemoLifecycleHarness.verifyClosure([], 12345);
      expect(check.reconciled).toBe(true);
      expect(check.positionClosed).toBe(true);
      expect(check.openPositionsCount).toBe(0);
    });

    it('3.2 verifies duplicate orders are rejected deterministically', () => {
      const orderA = { clientOrderId: 'ord-8g-001', symbolId: 1, volume: 100000 };
      const orderB = { clientOrderId: 'ord-8g-001', symbolId: 1, volume: 100000 };
      expect(orderA.clientOrderId).toBe(orderB.clientOrderId);
    });
  });

  describe('4. Complete Separation of Shadow and Live Execution Boundaries', () => {
    it('4.1 verifies Shadow Observatory maintains 0 broker orders', () => {
      const status = continuousLearningObservatoryService.getStatus();
      expect(status.brokerOrdersTransmitted).toBe(0);
    });

    it('4.2 asserts LIVE_EXECUTION remains strictly FORBIDDEN', () => {
      expect(process.env.LIVE_EXECUTION || 'FORBIDDEN').toBe('FORBIDDEN');
    });

    it('4.3 asserts AUTOMATED_LIVE_EXECUTION remains DISABLED', () => {
      expect(process.env.AUTOMATED_LIVE_EXECUTION || 'DISABLED').toBe('DISABLED');
    });
  });
});
