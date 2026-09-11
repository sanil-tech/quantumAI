import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

describe('PHASE 3B: Execution Truth & State Machine Repair Suite', () => {
  let transport: CTraderTransport;

  beforeEach(() => {
    transport = new CTraderTransport();
  });

  // TEST A: ORDER_ACCEPTED only -> Promise remains pending -> no FILLED event -> no position persistence
  it('TEST A: ORDER_ACCEPTED only leaves Promise pending and does not emit FILLED or clean up', async () => {
    (transport as any).socket = {
      destroyed: false,
      write: vi.fn()
    };

    let resolved = false;
    let rejected = false;

    const promise = transport.sendRequest(2106, { ctidTraderAccountId: 48282756, symbolId: 1, orderType: 1, tradeSide: 1, volume: 100000 }, 500, 'test_a_msg');
    promise.then(() => { resolved = true; }).catch(() => { rejected = true; });

    const acceptedSpy = vi.fn();
    transport.on('orderAccepted', acceptedSpy);

    // Dispatch Frame 1: ORDER_ACCEPTED (executionType: 2)
    transport.dispatchIncomingMessage({
      payloadType: 2126,
      decodedPayload: {
        ctidTraderAccountId: 48282756,
        executionType: 2, // ORDER_ACCEPTED
        order: { orderId: 315656469, clientOrderId: 'ord-123', tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 } },
        position: { positionId: 285026529 }
      },
      clientMsgId: 'test_a_msg'
    });

    // Give microtasks time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(acceptedSpy).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);
    expect(rejected).toBe(false);

    // Verify pending request is STILL present and tracked
    expect((transport as any).pendingRequests.has('test_a_msg')).toBe(true);

    // Let it time out to clean up
    await expect(promise).rejects.toThrow('CTRADER_REQUEST_TIMEOUT');
  });

  // TEST B: ORDER_ACCEPTED + ORDER_FILLED -> Promise resolves -> status FILLED -> brokerDealId populated -> filledPrice = authoritative execution price
  it('TEST B: ORDER_ACCEPTED followed by ORDER_FILLED resolves Promise with deal ID and authoritative execution price', async () => {
    (transport as any).socket = {
      destroyed: false,
      write: vi.fn()
    };

    const promise = transport.sendRequest(2106, { ctidTraderAccountId: 48282756, symbolId: 1, orderType: 1, tradeSide: 1, volume: 100000 }, 5000, 'test_b_msg');

    // 1. Frame 1: ORDER_ACCEPTED (executionType: 2)
    transport.dispatchIncomingMessage({
      payloadType: 2126,
      decodedPayload: {
        ctidTraderAccountId: 48282756,
        executionType: 2,
        order: { orderId: 315656469, clientOrderId: 'ord-b-1', tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 } },
        position: { positionId: 285026529 }
      },
      clientMsgId: 'test_b_msg'
    });

    // 2. Frame 2: ORDER_FILLED (executionType: 3) with deal details (correlated via orderId: 315656469)
    transport.dispatchIncomingMessage({
      payloadType: 2126,
      decodedPayload: {
        ctidTraderAccountId: 48282756,
        executionType: 3,
        deal: {
          dealId: 330764286,
          orderId: 315656469,
          positionId: 285026529,
          volume: 100000,
          filledVolume: 100000,
          executionPrice: 1.16694,
          dealStatus: 2
        },
        order: {
          orderId: 315656469,
          executionPrice: 1.16694,
          orderStatus: 2
        }
      }
    });

    const res = await promise;
    expect(res.payloadType).toBe(2126);
    expect(res.decodedPayload.deal.dealId).toBe(330764286);
    expect(res.decodedPayload.deal.executionPrice).toBe(1.16694);
    expect(res.decodedPayload.position.positionId).toBe(285026529);
    expect(res.decodedPayload.order.orderId).toBe(315656469);
  });

  // TEST C: ORDER_ACCEPTED + REJECT -> rejected -> no position
  it('TEST C: ORDER_ACCEPTED followed by ORDER_REJECTED rejects pending Promise', async () => {
    (transport as any).socket = {
      destroyed: false,
      write: vi.fn()
    };

    const promise = transport.sendRequest(2106, { ctidTraderAccountId: 48282756, symbolId: 1, orderType: 1, tradeSide: 1, volume: 100000 }, 5000, 'test_c_msg');

    // Frame 1: ORDER_ACCEPTED
    transport.dispatchIncomingMessage({
      payloadType: 2126,
      decodedPayload: {
        ctidTraderAccountId: 48282756,
        executionType: 2,
        order: { orderId: 315656470, tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 } }
      },
      clientMsgId: 'test_c_msg'
    });

    // Frame 2: ORDER_REJECTED
    transport.dispatchIncomingMessage({
      payloadType: 2126,
      decodedPayload: {
        ctidTraderAccountId: 48282756,
        executionType: 7,
        errorCode: 'MARKET_CLOSED',
        order: { orderId: 315656470 }
      }
    });

    await expect(promise).rejects.toThrow('CTRADER_ORDER_REJECTED: Execution rejected (ORDER_REJECTED): MARKET_CLOSED');
    expect((transport as any).pendingRequests.has('test_c_msg')).toBe(false);
  });

  // TEST D: ORDER_ACCEPTED + PARTIAL_FILL -> not falsely marked fully filled
  it('TEST D: ORDER_ACCEPTED followed by PARTIAL_FILL emits orderPartialFill without resolving as full fill', async () => {
    (transport as any).socket = {
      destroyed: false,
      write: vi.fn()
    };

    let resolved = false;
    const promise = transport.sendRequest(2106, { ctidTraderAccountId: 48282756, symbolId: 1, orderType: 1, tradeSide: 1, volume: 100000 }, 500, 'test_d_msg');
    promise.then(() => { resolved = true; }).catch(() => {});

    const partialSpy = vi.fn();
    transport.on('orderPartialFill', partialSpy);

    // Frame 1: ORDER_ACCEPTED
    transport.dispatchIncomingMessage({
      payloadType: 2126,
      decodedPayload: {
        ctidTraderAccountId: 48282756,
        executionType: 2,
        order: { orderId: 315656471 }
      },
      clientMsgId: 'test_d_msg'
    });

    // Frame 2: ORDER_PARTIAL_FILL
    transport.dispatchIncomingMessage({
      payloadType: 2126,
      decodedPayload: {
        ctidTraderAccountId: 48282756,
        executionType: 11,
        deal: { dealId: 330764287, orderId: 315656471, volume: 100000, filledVolume: 40000, executionPrice: 1.16690 }
      }
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(partialSpy).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);
    expect((transport as any).pendingRequests.has('test_d_msg')).toBe(true);

    // Clean up
    await expect(promise).rejects.toThrow('CTRADER_REQUEST_TIMEOUT');
  });

  // TEST E: MARKET order with no execution price -> must NOT fallback to 1.0
  it('TEST E: CTraderAdapter strictly throws when execution price is missing and never defaults to 1.0', async () => {
    const adapter = new CTraderAdapter({
      environment: 'DEMO',
      clientId: 'real_spotware_app_id'
    });
    const mockTransport = {
      isConnected: () => true,
      sendRequest: vi.fn().mockResolvedValue({
        payloadType: 2126,
        decodedPayload: {
          order: { orderId: 999999 },
          position: { positionId: 888888 },
          deal: { dealId: 777777 } // Notice: no executionPrice!
        }
      })
    };
    (adapter as any).transport = mockTransport;

    await expect(adapter.placeOrder({
      order_id: 'ord_test_e',
      symbol: 'EUR/USD',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.01,
      price: 0
    } as any)).rejects.toThrow('CTRADER_EXECUTION_PRICE_MISSING: Broker execution event (order 999999) did not contain authoritative executionPrice.');
  });

  // TEST F: Multiple execution events with same clientMsgId -> correlation remains correct
  it('TEST F: Multiple sequential execution events with the same clientOrderId correlate accurately', async () => {
    (transport as any).socket = {
      destroyed: false,
      write: vi.fn()
    };

    const promise = transport.sendRequest(2106, { ctidTraderAccountId: 48282756, symbolId: 1, orderType: 1, tradeSide: 1, volume: 100000 }, 5000, 'test_f_msg');

    // Register clientOrderId mapping
    (transport as any).clientOrderIdToClientMsgId.set('client_ord_999', 'test_f_msg');

    // Event 1: Unsolicited envelope with clientOrderId
    transport.dispatchIncomingMessage({
      payloadType: 2126,
      decodedPayload: {
        ctidTraderAccountId: 48282756,
        executionType: 2,
        order: { orderId: 444111, clientOrderId: 'client_ord_999' }
      }
    });

    // Event 2: Correlated by orderId mapped from Event 1
    transport.dispatchIncomingMessage({
      payloadType: 2126,
      decodedPayload: {
        ctidTraderAccountId: 48282756,
        executionType: 3,
        deal: { dealId: 555222, orderId: 444111, executionPrice: 1.16700 }
      }
    });

    const res = await promise;
    expect(res.decodedPayload.deal.dealId).toBe(555222);
    expect(res.decodedPayload.deal.executionPrice).toBe(1.16700);
  });

  // TEST G: Market order adjusts absolute SL/TP relative to actual fill price
  it('TEST G: Market order adjusts absolute SL/TP relative to actual fill price', async () => {
    const adapter = new CTraderAdapter({
      environment: 'DEMO',
      clientId: 'real_spotware_app_id',
      accountId: '5877246_DEMO'
    });

    const mockSendRequest = vi.fn().mockImplementation(async (payloadType: number, payload: any) => {
      if (payloadType === 2106) {
        return {
          payloadType: 2126,
          decodedPayload: {
            order: { orderId: 999999 },
            position: { positionId: 888888 },
            deal: { dealId: 777777, executionPrice: 4590.05 }
          }
        };
      } else if (payloadType === 2110) {
        return {
          payloadType: 2111,
          decodedPayload: {
            positionId: payload.positionId,
            stopLoss: payload.stopLoss,
            takeProfit: payload.takeProfit
          }
        };
      }
    });

    (adapter as any).transport = {
      isConnected: () => true,
      sendRequest: mockSendRequest
    };

    const report = await adapter.placeOrder({
      order_id: 'ord_test_g',
      symbol: 'XAUUSD',
      direction: 'SELL',
      order_type: 'MARKET',
      quantity: 0.01,
      price: 2729.71,
      stop_loss: 2759.71, // $30.00 above proposed price
      take_profit: 2699.71  // $30.00 below proposed price
    } as any);

    expect(report.status).toBe('FILLED');
    expect(report.filled_price).toBe(4590.05);

    // Verify 2110 (ProtoOAAmendPositionSLTPReq) was called with adjusted levels
    const amendCall = mockSendRequest.mock.calls.find(c => c[0] === 2110);
    expect(amendCall).toBeDefined();
    const amendPayload = amendCall![1];
    expect(amendPayload.positionId).toBe(888888);
    // Adjusted SL = 4590.05 + 30.00 = 4620.05
    expect(amendPayload.stopLoss).toBe(4620.05);
    // Adjusted TP = 4590.05 - 30.00 = 4560.05
    expect(amendPayload.takeProfit).toBe(4560.05);
  });

  // TEST H: Enforces directional validation and filters out invalid SL/TP
  it('TEST H: Enforces directional validation and filters out invalid SL/TP', async () => {
    const adapter = new CTraderAdapter({
      environment: 'DEMO',
      clientId: 'real_spotware_app_id',
      accountId: '5877246_DEMO'
    });

    const mockSendRequest = vi.fn().mockImplementation(async (payloadType: number, payload: any) => {
      if (payloadType === 2106) {
        return {
          payloadType: 2126,
          decodedPayload: {
            order: { orderId: 999999 },
            position: { positionId: 888888 },
            deal: { dealId: 777777, executionPrice: 4590.05 }
          }
        };
      } else if (payloadType === 2110) {
        return {
          payloadType: 2111,
          decodedPayload: {
            positionId: payload.positionId,
            stopLoss: payload.stopLoss,
            takeProfit: payload.takeProfit
          }
        };
      }
    });

    (adapter as any).transport = {
      isConnected: () => true,
      sendRequest: mockSendRequest
    };

    // Place a LIMIT order so absolute values are passed without relative adjustment
    const report = await adapter.placeOrder({
      order_id: 'ord_test_h',
      symbol: 'XAUUSD',
      direction: 'SELL',
      order_type: 'LIMIT',
      quantity: 0.01,
      price: 4590.00,
      stop_loss: 2759.71, // Absolute SL below actual entry price on SELL - invalid!
      take_profit: 2699.71  // Absolute TP below actual entry price on SELL - valid!
    } as any);

    expect(report.status).toBe('FILLED');

    const amendCall = mockSendRequest.mock.calls.find(c => c[0] === 2110);
    expect(amendCall).toBeDefined();
    const amendPayload = amendCall![1];
    expect(amendPayload.positionId).toBe(888888);
    // Invalid SL (2759.71 < 4590.05 for SELL) must be filtered out
    expect(amendPayload.stopLoss).toBeUndefined();
    // Valid TP (2699.71 < 4590.05 for SELL) must be kept
    expect(amendPayload.takeProfit).toBe(2699.71);
  });
});
