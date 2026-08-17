import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CTraderTransport, ExtractedExecutionEvent, ExtractedOrderErrorEvent } from '../src/integrations/ctrader/ctraderTransport';
import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

describe('TASK 8B-P17: cTrader Transport Execution-Event Correlation & Error Routing Suite', () => {
  let transport: CTraderTransport;

  beforeEach(() => {
    transport = new CTraderTransport();
  });

  describe('1. Execution Events State Machine & Event Dispatch', () => {
    it('1. handles ORDER_ACCEPTED (executionType = 2) and emits execution event', () => {
      const eventSpy = vi.fn();
      transport.on('execution', eventSpy);

      const payload = {
        ctidTraderAccountId: 5881234,
        executionType: 2, // ORDER_ACCEPTED
        order: {
          orderId: 1001,
          tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 },
          orderType: 1,
          orderStatus: 1
        }
      };

      const result = transport.handleExecutionEvent(payload, 'msg_001');
      expect(result.executionType).toBe(2);
      expect(result.executionTypeName).toBe('ORDER_ACCEPTED');
      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy).toHaveBeenCalledWith(result);
    });

    it('2. handles ORDER_FILLED (executionType = 3) with nested position and deal', () => {
      const eventSpy = vi.fn();
      transport.on('execution', eventSpy);

      const payload = {
        ctidTraderAccountId: 5881234,
        executionType: 3, // ORDER_FILLED
        order: {
          orderId: 1002,
          tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 },
          orderType: 1,
          orderStatus: 2
        },
        position: {
          positionId: 5001,
          tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 },
          positionStatus: 1,
          price: 1.08500
        },
        deal: {
          dealId: 9001,
          orderId: 1002,
          positionId: 5001,
          volume: 100000,
          filledVolume: 100000,
          symbolId: 1,
          executionPrice: 1.08500,
          tradeSide: 1,
          dealStatus: 2, // FILLED
          commission: 20
        }
      };

      const result = transport.handleExecutionEvent(payload, 'msg_002');
      expect(result.executionType).toBe(3);
      expect(result.executionTypeName).toBe('ORDER_FILLED');
      expect(result.deal.dealId).toBe(9001);
      expect(result.deal.executionPrice).toBe(1.08500);
      expect(result.position.positionId).toBe(5001);
      expect(eventSpy).toHaveBeenCalledWith(result);
    });

    it('3. handles ORDER_PARTIAL_FILL (executionType = 11) preserving filledVolume', () => {
      const payload = {
        ctidTraderAccountId: 5881234,
        executionType: 11, // ORDER_PARTIAL_FILL
        order: {
          orderId: 1003,
          tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 },
          orderType: 1,
          orderStatus: 2
        },
        deal: {
          dealId: 9002,
          orderId: 1003,
          positionId: 5002,
          volume: 100000,
          filledVolume: 40000, // Partial fill
          symbolId: 1,
          executionPrice: 1.08510,
          tradeSide: 1,
          dealStatus: 3 // PARTIALLY_FILLED
        }
      };

      const result = transport.handleExecutionEvent(payload, 'msg_003');
      expect(result.executionType).toBe(11);
      expect(result.executionTypeName).toBe('ORDER_PARTIAL_FILL');
      expect(result.deal.filledVolume).toBe(40000);
      expect(result.deal.volume).toBe(100000);
    });

    it('4. handles ORDER_REJECTED (executionType = 7) and preserves error code', () => {
      const payload = {
        ctidTraderAccountId: 5881234,
        executionType: 7, // ORDER_REJECTED
        errorCode: 'MARKET_CLOSED',
        order: {
          orderId: 1004,
          tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 },
          orderType: 1,
          orderStatus: 4 // REJECTED
        }
      };

      const result = transport.handleExecutionEvent(payload, 'msg_004');
      expect(result.executionType).toBe(7);
      expect(result.executionTypeName).toBe('ORDER_REJECTED');
      expect(result.errorCode).toBe('MARKET_CLOSED');
    });

    it('5. handles ORDER_CANCELLED (executionType = 5)', () => {
      const payload = {
        ctidTraderAccountId: 5881234,
        executionType: 5, // ORDER_CANCELLED
        order: {
          orderId: 1005,
          tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 },
          orderType: 1,
          orderStatus: 5 // CANCELLED
        }
      };

      const result = transport.handleExecutionEvent(payload, 'msg_005');
      expect(result.executionType).toBe(5);
      expect(result.executionTypeName).toBe('ORDER_CANCELLED');
    });
  });

  describe('2. Error Event Routing', () => {
    it('6. handles ProtoOAOrderErrorEvent (2132) emitting orderError event with full metadata', () => {
      const errorSpy = vi.fn();
      transport.on('orderError', errorSpy);

      const errorPayload = {
        ctidTraderAccountId: 5881234,
        errorCode: 'NOT_ENOUGH_MONEY',
        orderId: 1006,
        positionId: 5006,
        description: 'Account balance insufficient for requested margin.'
      };

      const result = transport.handleOrderErrorEvent(errorPayload, 'err_msg_006');
      expect(result.errorCode).toBe('NOT_ENOUGH_MONEY');
      expect(result.orderId).toBe(1006);
      expect(result.positionId).toBe(5006);
      expect(result.description).toBe('Account balance insufficient for requested margin.');
      expect(errorSpy).toHaveBeenCalledWith(result);
    });

    it('7. handles ProtoOAErrorRes (50/2142) and emits errorResponse', () => {
      const errorSpy = vi.fn();
      transport.on('errorResponse', errorSpy);

      transport.handleErrorResponse({
        errorCode: 'CH_CLIENT_AUTH_FAILURE',
        description: 'Client authentication failed'
      }, 'auth_err_001');

      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
        errorCode: 'CH_CLIENT_AUTH_FAILURE',
        description: 'Client authentication failed',
        clientMsgId: 'auth_err_001'
      }));
    });
  });

  describe('3. Multi-Key Correlation & Dispatch Logic', () => {
    it('8. handles unknown payload without crashing or generating fake execution', () => {
      const unhandledSpy = vi.fn();
      transport.on('unhandledMessage', unhandledSpy);

      transport.dispatchIncomingMessage({
        payloadType: 9999,
        decodedPayload: { someData: 123 },
        clientMsgId: 'unknown_001'
      });

      expect(unhandledSpy).toHaveBeenCalledTimes(1);
    });

    it('9. marks events without tracking as UNCORRELATED and emits uncorrelatedExecution', () => {
      const uncorrSpy = vi.fn();
      transport.on('uncorrelatedExecution', uncorrSpy);

      const payload = {
        ctidTraderAccountId: 5881234,
        executionType: 3,
        order: { orderId: 8888, tradeData: { symbolId: 1, volume: 50000, tradeSide: 1 } }
      };

      const result = transport.handleExecutionEvent(payload); // No clientMsgId
      expect(result.correlation.correlated).toBe(false);
      expect(result.correlation.correlationKey).toBe('UNCORRELATED');
      expect(uncorrSpy).toHaveBeenCalledWith(result);
    });

    it('10. detects duplicate execution events idempotently and emits duplicateExecutionEvent', () => {
      const dupSpy = vi.fn();
      transport.on('duplicateExecutionEvent', dupSpy);

      const payload = {
        ctidTraderAccountId: 5881234,
        executionType: 3,
        deal: { dealId: 7777, orderId: 6666, positionId: 5555, executionTimestamp: 1770000000000 }
      };

      const first = transport.handleExecutionEvent(payload, 'dup_msg_1');
      expect(dupSpy).not.toHaveBeenCalled();

      const second = transport.handleExecutionEvent(payload, 'dup_msg_2');
      expect(dupSpy).toHaveBeenCalledTimes(1);
      expect(dupSpy).toHaveBeenCalledWith(second);
    });

    it('11. handles duplicate clientMsgId gracefully', () => {
      const payload = {
        ctidTraderAccountId: 5881234,
        executionType: 2,
        order: { orderId: 1010, tradeData: { symbolId: 1, volume: 10000, tradeSide: 1 } }
      };

      transport.handleExecutionEvent(payload, 'same_msg_id');
      const res2 = transport.handleExecutionEvent(payload, 'same_msg_id');
      expect(res2.correlation.clientMsgId).toBe('same_msg_id');
    });
  });

  describe('4. Pending Request Settlement & Lifecycles', () => {
    it('12. request timeout rejects pending request and cleans up tracking maps', async () => {
      // Mock socket
      (transport as any).socket = {
        destroyed: false,
        write: vi.fn()
      };

      const promise = transport.sendRequest(2100, { clientId: 'a', clientSecret: 'b' }, 50, 'to_req_1');
      await expect(promise).rejects.toThrow('CTRADER_REQUEST_TIMEOUT');
    });

    it('13. settles pending request upon correlated execution event and cleans up', async () => {
      (transport as any).socket = {
        destroyed: false,
        write: vi.fn()
      };

      const promise = transport.sendRequest(2106, { ctidTraderAccountId: 5881234, symbolId: 1, orderType: 1, tradeSide: 1, volume: 100000 }, 5000, 'ord_req_01');

      // Dispatch matching execution event
      transport.dispatchIncomingMessage({
        payloadType: 2126,
        decodedPayload: {
          ctidTraderAccountId: 5881234,
          executionType: 3, // ORDER_FILLED
          order: { orderId: 9901, tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 } },
          deal: { dealId: 8801, executionPrice: 1.0850 }
        },
        clientMsgId: 'ord_req_01'
      });

      const res = await promise;
      expect(res.payloadType).toBe(2126);
      expect((res as any).executionEvent.executionTypeName).toBe('ORDER_FILLED');
    });

    it('14. handles multiple concurrent requests with isolated clientMsgIds', async () => {
      (transport as any).socket = {
        destroyed: false,
        write: vi.fn()
      };

      const p1 = transport.sendRequest(2121, { ctidTraderAccountId: 123 }, 5000, 'req_concurrent_1');
      const p2 = transport.sendRequest(2121, { ctidTraderAccountId: 456 }, 5000, 'req_concurrent_2');

      transport.dispatchIncomingMessage({
        payloadType: 2122,
        decodedPayload: { trader: { balance: 1000 } },
        clientMsgId: 'req_concurrent_1'
      });

      transport.dispatchIncomingMessage({
        payloadType: 2122,
        decodedPayload: { trader: { balance: 2000 } },
        clientMsgId: 'req_concurrent_2'
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.decodedPayload.trader.balance).toBe(1000);
      expect(r2.decodedPayload.trader.balance).toBe(2000);
    });
  });

  describe('5. Invariant Integrity & Fail-Closed Assertions', () => {
    it('15. verifies execution event with nested position details', () => {
      const result = transport.handleExecutionEvent({
        ctidTraderAccountId: 5881234,
        executionType: 3,
        position: { positionId: 7711, price: 1.0920, tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 } }
      }, 'msg_pos_1');

      expect(result.position.positionId).toBe(7711);
      expect(result.position.price).toBe(1.0920);
    });

    it('16. verifies execution event with nested deal details', () => {
      const result = transport.handleExecutionEvent({
        ctidTraderAccountId: 5881234,
        executionType: 3,
        deal: { dealId: 4411, executionPrice: 1.0925, commission: 30, tradeSide: 1, dealStatus: 2 }
      }, 'msg_deal_1');

      expect(result.deal.dealId).toBe(4411);
      expect(result.deal.commission).toBe(30);
    });

    it('17. broker rejection rejects pending order and does NOT manufacture success', async () => {
      (transport as any).socket = {
        destroyed: false,
        write: vi.fn()
      };

      const promise = transport.sendRequest(2106, { ctidTraderAccountId: 5881234, symbolId: 1, orderType: 1, tradeSide: 1, volume: 100000 }, 5000, 'ord_rej_01');

      transport.dispatchIncomingMessage({
        payloadType: 2126,
        decodedPayload: {
          ctidTraderAccountId: 5881234,
          executionType: 7, // ORDER_REJECTED
          errorCode: 'INSUFFICIENT_MARGIN'
        },
        clientMsgId: 'ord_rej_01'
      });

      await expect(promise).rejects.toThrow('CTRADER_ORDER_REJECTED: Execution rejected (ORDER_REJECTED): INSUFFICIENT_MARGIN');
    });

    it('18. partial fill preserves filledVolume without converting to full fill', () => {
      const result = transport.handleExecutionEvent({
        ctidTraderAccountId: 5881234,
        executionType: 11, // ORDER_PARTIAL_FILL
        deal: { volume: 100000, filledVolume: 35000, executionPrice: 1.0850 }
      });

      expect(result.deal.filledVolume).toBe(35000);
      expect(result.deal.volume).toBe(100000);
      expect(result.deal.filledVolume).not.toBe(result.deal.volume);
    });

    it('19. disconnect rejects all pending requests fail-closed', async () => {
      (transport as any).socket = {
        destroyed: false,
        write: vi.fn(),
        destroy: vi.fn()
      };

      const p = transport.sendRequest(2124, { ctidTraderAccountId: 5881234 }, 5000, 'disc_req_1');
      await transport.disconnect();
      await expect(p).rejects.toThrow('CTRADER_DISCONNECTED: Client disconnected.');
    });

    it('20. READ_ONLY_MODE_ENFORCED remains strictly active on CTraderAdapter', async () => {
      const adapter = new CTraderAdapter();
      await expect(adapter.placeOrder({} as any)).rejects.toThrow('READ_ONLY_MODE_ENFORCED: Trade execution disabled in Phase 3B audit.');
      await expect(adapter.closePosition('pos_1')).rejects.toThrow('READ_ONLY_MODE_ENFORCED: Trade execution disabled in Phase 3B audit.');
    });
  });
});
