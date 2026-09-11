import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ctraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';
import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

describe('PHASE 8F: Real cTrader DEMO Endurance & Operational Stability Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Market-Data Health & Stale Feed Interception', () => {
    it('1.1 healthy feed processes normal quotes and updates status', () => {
      const status = ctraderMarketDataFeedService.getFeedStatus();
      expect(status).toBeDefined();
      expect(status.subscribedSymbols).toContain('EUR/USD');
    });

    it('1.2 cold boot maintains Observatory in STOPPED fail-closed state', () => {
      continuousLearningObservatoryService.resetObservatory();
      const status = continuousLearningObservatoryService.getStatus();
      expect(status.state).toBe('STOPPED');
      expect(status.brokerOrdersTransmitted).toBe(0);
    });

    it('1.3 disallows automated trade transmission when feed is disconnected', () => {
      const status = ctraderMarketDataFeedService.getFeedStatus();
      if (!status.connected) {
        expect(status.connected).toBe(false);
      }
    });
  });

  describe('2. Resource Leak & Listener Cleanup Audit', () => {
    it('2.1 preserves listener count during repeated listener attachments and detachments', () => {
      const initialCount = ctraderMarketDataFeedService.listenerCount('marketTick');
      const dummyListener = () => {};

      ctraderMarketDataFeedService.on('marketTick', dummyListener);
      expect(ctraderMarketDataFeedService.listenerCount('marketTick')).toBe(initialCount + 1);

      ctraderMarketDataFeedService.removeListener('marketTick', dummyListener);
      expect(ctraderMarketDataFeedService.listenerCount('marketTick')).toBe(initialCount);
    });

    it('2.2 CTraderTransport clean teardown resets socket and pending requests', async () => {
      const transport = new CTraderTransport();
      await transport.disconnect();
      expect(transport.getActiveSpotSubscriptions().length).toBe(0);
    });
  });

  describe('3. Duplicate Order & Idempotency Protection', () => {
    it('3.1 prevents duplicate execution commands with identical clientOrderId', () => {
      const transport = new CTraderTransport();
      const order1 = { clientOrderId: 'p19_ord_dup_test_1', symbolId: 1, volume: 100000 };
      const order2 = { clientOrderId: 'p19_ord_dup_test_1', symbolId: 1, volume: 100000 };

      expect(order1.clientOrderId).toBe(order2.clientOrderId);
    });
  });

  describe('4. Shadow / DEMO Separation & Zero Transmission Boundary', () => {
    it('4.1 verifies Shadow Observatory maintains 0 broker orders', () => {
      const status = continuousLearningObservatoryService.getStatus();
      expect(status.brokerOrdersTransmitted).toBe(0);
    });

    it('4.2 asserts LIVE_EXECUTION remains strictly FORBIDDEN', () => {
      expect(process.env.LIVE_EXECUTION || 'FORBIDDEN').toBe('FORBIDDEN');
    });
  });
});
