import { describe, it, expect } from 'vitest';
import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';

describe('TASK 8B-P16.1: Authoritative cTrader ProtoBuf Schema Conformance & Wire Verification Suite', () => {

  describe('1. Authoritative Enum Numeric Value Audit', () => {
    it('1.1 verifies ProtoOAExecutionType enum strictly adheres to official Spotware numbers', async () => {
      const root = await CTraderProtoManager.loadSchemas();
      const ExecutionTypeEnum = root.lookupEnum('ProtoOAExecutionType');

      // Crucial verification: Spotware begins ORDER_ACCEPTED at 2, ORDER_FILLED at 3
      expect(ExecutionTypeEnum.values['ORDER_ACCEPTED']).toBe(2);
      expect(ExecutionTypeEnum.values['ORDER_FILLED']).toBe(3);
      expect(ExecutionTypeEnum.values['ORDER_REPLACED']).toBe(4);
      expect(ExecutionTypeEnum.values['ORDER_CANCELLED']).toBe(5);
      expect(ExecutionTypeEnum.values['ORDER_EXPIRED']).toBe(6);
      expect(ExecutionTypeEnum.values['ORDER_REJECTED']).toBe(7);
      expect(ExecutionTypeEnum.values['ORDER_CANCEL_REJECTED']).toBe(8);
      expect(ExecutionTypeEnum.values['SWAP']).toBe(9);
      expect(ExecutionTypeEnum.values['DEPOSIT_WITHDRAW']).toBe(10);
      expect(ExecutionTypeEnum.values['ORDER_PARTIAL_FILL']).toBe(11);
      expect(ExecutionTypeEnum.values['BONUS_DEPOSIT_WITHDRAW']).toBe(12);
    });

    it('1.2 verifies ProtoOADealStatus enum adheres to official Spotware numbers', async () => {
      const root = await CTraderProtoManager.loadSchemas();
      const DealStatusEnum = root.lookupEnum('ProtoOADealStatus');

      // Crucial verification: Spotware begins FILLED at 2
      expect(DealStatusEnum.values['FILLED']).toBe(2);
      expect(DealStatusEnum.values['PARTIALLY_FILLED']).toBe(3);
      expect(DealStatusEnum.values['REJECTED']).toBe(4);
      expect(DealStatusEnum.values['INTERNALLY_REJECTED']).toBe(5);
      expect(DealStatusEnum.values['ERROR']).toBe(6);
      expect(DealStatusEnum.values['MISSED']).toBe(7);
    });

    it('1.3 verifies ProtoOAOrderType and ProtoOATradeSide enums', async () => {
      const root = await CTraderProtoManager.loadSchemas();
      const OrderTypeEnum = root.lookupEnum('ProtoOAOrderType');
      const TradeSideEnum = root.lookupEnum('ProtoOATradeSide');

      expect(OrderTypeEnum.values['MARKET']).toBe(1);
      expect(OrderTypeEnum.values['LIMIT']).toBe(2);
      expect(OrderTypeEnum.values['STOP']).toBe(3);
      expect(OrderTypeEnum.values['STOP_LOSS_TAKE_PROFIT']).toBe(4);
      expect(OrderTypeEnum.values['MARKET_RANGE']).toBe(5);
      expect(OrderTypeEnum.values['STOP_LIMIT']).toBe(6);

      expect(TradeSideEnum.values['BUY']).toBe(1);
      expect(TradeSideEnum.values['SELL']).toBe(2);
    });

    it('1.4 verifies Payload IDs strictly match Spotware official payload types', async () => {
      const root = await CTraderProtoManager.loadSchemas();
      const PayloadTypeEnum = root.lookupEnum('ProtoOAPayloadType');

      expect(PayloadTypeEnum.values['PROTO_OA_APPLICATION_AUTH_REQ']).toBe(2100);
      expect(PayloadTypeEnum.values['PROTO_OA_APPLICATION_AUTH_RES']).toBe(2101);
      expect(PayloadTypeEnum.values['PROTO_OA_ACCOUNT_AUTH_REQ']).toBe(2102);
      expect(PayloadTypeEnum.values['PROTO_OA_ACCOUNT_AUTH_RES']).toBe(2103);
      expect(PayloadTypeEnum.values['PROTO_OA_NEW_ORDER_REQ']).toBe(2106);
      expect(PayloadTypeEnum.values['PROTO_OA_CLOSE_POSITION_REQ']).toBe(2111);
      expect(PayloadTypeEnum.values['PROTO_OA_SYMBOLS_LIST_REQ']).toBe(2114);
      expect(PayloadTypeEnum.values['PROTO_OA_SYMBOLS_LIST_RES']).toBe(2115);
      expect(PayloadTypeEnum.values['PROTO_OA_TRADER_REQ']).toBe(2121);
      expect(PayloadTypeEnum.values['PROTO_OA_TRADER_RES']).toBe(2122);
      expect(PayloadTypeEnum.values['PROTO_OA_RECONCILE_REQ']).toBe(2124);
      expect(PayloadTypeEnum.values['PROTO_OA_RECONCILE_RES']).toBe(2125);
      expect(PayloadTypeEnum.values['PROTO_OA_EXECUTION_EVENT']).toBe(2126);
      expect(PayloadTypeEnum.values['PROTO_OA_ORDER_ERROR_EVENT']).toBe(2132);
    });
  });

  describe('2. Authoritative Message Schema & Field Number Audit', () => {
    it('2.1 verifies ProtoOANewOrderReq field numbers and types', async () => {
      const root = await CTraderProtoManager.loadSchemas();
      const NewOrderType = root.lookupType('ProtoOANewOrderReq');

      expect(NewOrderType.fields['payloadType'].id).toBe(1);
      expect(NewOrderType.fields['ctidTraderAccountId'].id).toBe(2);
      expect(NewOrderType.fields['ctidTraderAccountId'].type).toBe('int64');
      expect(NewOrderType.fields['symbolId'].id).toBe(3);
      expect(NewOrderType.fields['symbolId'].type).toBe('int64');
      expect(NewOrderType.fields['orderType'].id).toBe(4);
      expect(NewOrderType.fields['tradeSide'].id).toBe(5);
      expect(NewOrderType.fields['volume'].id).toBe(6);
      expect(NewOrderType.fields['volume'].type).toBe('int64');
      expect(NewOrderType.fields['limitPrice'].id).toBe(7);
      expect(NewOrderType.fields['stopPrice'].id).toBe(8);
      expect(NewOrderType.fields['timeInForce'].id).toBe(9);
      expect(NewOrderType.fields['expirationTimestamp'].id).toBe(10);
      expect(NewOrderType.fields['stopLoss'].id).toBe(11);
      expect(NewOrderType.fields['takeProfit'].id).toBe(12);
      expect(NewOrderType.fields['comment'].id).toBe(13);
      expect(NewOrderType.fields['label'].id).toBe(16);
      expect(NewOrderType.fields['positionId'].id).toBe(17);
      expect(NewOrderType.fields['clientOrderId'].id).toBe(18);
      expect(NewOrderType.fields['relativeStopLoss'].id).toBe(19);
      expect(NewOrderType.fields['relativeStopLoss'].type).toBe('int64');
      expect(NewOrderType.fields['relativeTakeProfit'].id).toBe(20);
      expect(NewOrderType.fields['relativeTakeProfit'].type).toBe('int64');
    });

    it('2.2 verifies ProtoOAClosePositionReq field numbers', async () => {
      const root = await CTraderProtoManager.loadSchemas();
      const ClosePositionType = root.lookupType('ProtoOAClosePositionReq');

      expect(ClosePositionType.fields['payloadType'].id).toBe(1);
      expect(ClosePositionType.fields['ctidTraderAccountId'].id).toBe(2);
      expect(ClosePositionType.fields['positionId'].id).toBe(3);
      expect(ClosePositionType.fields['volume'].id).toBe(4);
    });

    it('2.3 verifies ProtoOAPosition nested tradeData structure', async () => {
      const root = await CTraderProtoManager.loadSchemas();
      const PositionType = root.lookupType('ProtoOAPosition');
      const TradeDataType = root.lookupType('ProtoOATradeData');

      expect(PositionType.fields['positionId'].id).toBe(1);
      expect(PositionType.fields['tradeData'].id).toBe(2);
      expect(PositionType.fields['positionStatus'].id).toBe(3);
      expect(PositionType.fields['swap'].id).toBe(4);
      expect(PositionType.fields['price'].id).toBe(5);
      expect(PositionType.fields['stopLoss'].id).toBe(6);
      expect(PositionType.fields['takeProfit'].id).toBe(7);

      expect(TradeDataType.fields['symbolId'].id).toBe(1);
      expect(TradeDataType.fields['volume'].id).toBe(2);
      expect(TradeDataType.fields['tradeSide'].id).toBe(3);
    });

    it('2.4 verifies ProtoOADeal field numbers', async () => {
      const root = await CTraderProtoManager.loadSchemas();
      const DealType = root.lookupType('ProtoOADeal');

      expect(DealType.fields['dealId'].id).toBe(1);
      expect(DealType.fields['orderId'].id).toBe(2);
      expect(DealType.fields['positionId'].id).toBe(3);
      expect(DealType.fields['volume'].id).toBe(4);
      expect(DealType.fields['filledVolume'].id).toBe(5);
      expect(DealType.fields['symbolId'].id).toBe(6);
      expect(DealType.fields['executionPrice'].id).toBe(10);
      expect(DealType.fields['tradeSide'].id).toBe(11);
      expect(DealType.fields['dealStatus'].id).toBe(12);
      expect(DealType.fields['commission'].id).toBe(14);
    });

    it('2.5 verifies ProtoOAOrderErrorEvent field numbers', async () => {
      const root = await CTraderProtoManager.loadSchemas();
      const OrderErrorType = root.lookupType('ProtoOAOrderErrorEvent');

      expect(OrderErrorType.fields['payloadType'].id).toBe(1);
      expect(OrderErrorType.fields['errorCode'].id).toBe(2);
      expect(OrderErrorType.fields['orderId'].id).toBe(3);
      expect(OrderErrorType.fields['ctidTraderAccountId'].id).toBe(5);
      expect(OrderErrorType.fields['positionId'].id).toBe(6);
      expect(OrderErrorType.fields['description'].id).toBe(7);
    });
  });

  describe('3. Wire Format & Deterministic Vector Verification', () => {
    it('3.1 encodes and decodes ProtoOAApplicationAuthReq (2100) vector', async () => {
      const clientMsgId = 'auth_app_001';
      const frame = await CTraderProtoManager.encodeFrame(2100, {
        clientId: 'TEST_CLIENT_ID',
        clientSecret: 'TEST_CLIENT_SECRET'
      }, clientMsgId);

      expect(frame.readUInt32BE(0)).toBe(frame.length - 4);
      const decoded = await CTraderProtoManager.decodeFrame(frame.subarray(4));
      expect(decoded.payloadType).toBe(2100);
      expect(decoded.clientMsgId).toBe(clientMsgId);
    });

    it('3.2 encodes and decodes ProtoOAAccountAuthReq (2102) vector with ctidTraderAccountId', async () => {
      const clientMsgId = 'auth_acc_001';
      const frame = await CTraderProtoManager.encodeFrame(2102, {
        ctidTraderAccountId: 5881234,
        accessToken: 'TEST_OAUTH_TOKEN'
      }, clientMsgId);

      const decoded = await CTraderProtoManager.decodeFrame(frame.subarray(4));
      expect(decoded.payloadType).toBe(2102);
      expect(decoded.clientMsgId).toBe(clientMsgId);
      expect(Number(decoded.decodedPayload.ctidTraderAccountId)).toBe(5881234);
      expect(decoded.decodedPayload.accessToken).toBe('TEST_OAUTH_TOKEN');
    });

    it('3.3 encodes and decodes ProtoOANewOrderReq (2106) MARKET BUY vector', async () => {
      const clientMsgId = 'new_order_buy_001';
      const frame = await CTraderProtoManager.encodeFrame(2106, {
        ctidTraderAccountId: 5881234,
        symbolId: 1, // EURUSD
        orderType: 1, // MARKET
        tradeSide: 1, // BUY
        volume: 100000,
        stopLoss: 1.08250,
        takeProfit: 1.09500,
        comment: 'QuantumAI test buy',
        label: 'QAI_BUY',
        clientOrderId: 'cli_buy_01'
      }, clientMsgId);

      const decoded = await CTraderProtoManager.decodeFrame(frame.subarray(4));
      expect(decoded.payloadType).toBe(2106);
      expect(decoded.clientMsgId).toBe(clientMsgId);
      expect(Number(decoded.decodedPayload.ctidTraderAccountId)).toBe(5881234);
      expect(Number(decoded.decodedPayload.symbolId)).toBe(1);
      expect(decoded.decodedPayload.orderType).toBe(1);
      expect(decoded.decodedPayload.tradeSide).toBe(1);
      expect(Number(decoded.decodedPayload.volume)).toBe(100000);
      expect(decoded.decodedPayload.stopLoss).toBeCloseTo(1.08250);
      expect(decoded.decodedPayload.takeProfit).toBeCloseTo(1.09500);
    });

    it('3.4 encodes and decodes ProtoOANewOrderReq (2106) MARKET SELL vector', async () => {
      const clientMsgId = 'new_order_sell_001';
      const frame = await CTraderProtoManager.encodeFrame(2106, {
        ctidTraderAccountId: 5881234,
        symbolId: 2, // GBPUSD
        orderType: 1, // MARKET
        tradeSide: 2, // SELL
        volume: 200000,
        clientOrderId: 'cli_sell_01'
      }, clientMsgId);

      const decoded = await CTraderProtoManager.decodeFrame(frame.subarray(4));
      expect(decoded.payloadType).toBe(2106);
      expect(decoded.decodedPayload.tradeSide).toBe(2);
      expect(Number(decoded.decodedPayload.symbolId)).toBe(2);
      expect(Number(decoded.decodedPayload.volume)).toBe(200000);
    });

    it('3.5 encodes and decodes ProtoOAClosePositionReq (2111) vector', async () => {
      const clientMsgId = 'close_pos_001';
      const frame = await CTraderProtoManager.encodeFrame(2111, {
        ctidTraderAccountId: 5881234,
        positionId: 98765432,
        volume: 100000
      }, clientMsgId);

      const decoded = await CTraderProtoManager.decodeFrame(frame.subarray(4));
      expect(decoded.payloadType).toBe(2111);
      expect(decoded.clientMsgId).toBe(clientMsgId);
      expect(Number(decoded.decodedPayload.ctidTraderAccountId)).toBe(5881234);
      expect(Number(decoded.decodedPayload.positionId)).toBe(98765432);
      expect(Number(decoded.decodedPayload.volume)).toBe(100000);
    });

    it('3.6 encodes and decodes ProtoOAExecutionEvent (2126) with official nested hierarchy', async () => {
      const clientMsgId = 'exec_evt_001';
      const frame = await CTraderProtoManager.encodeFrame(2126, {
        ctidTraderAccountId: 5881234,
        executionType: 3, // ORDER_FILLED in official Spotware schema
        order: {
          orderId: 11223344,
          tradeData: {
            symbolId: 1,
            volume: 100000,
            tradeSide: 1 // BUY
          },
          orderType: 1, // MARKET
          orderStatus: 1 // ORDER_STATUS_ACCEPTED
        },
        position: {
          positionId: 55667788,
          tradeData: {
            symbolId: 1,
            volume: 100000,
            tradeSide: 1
          },
          positionStatus: 1, // POSITION_STATUS_OPEN
          swap: 0,
          price: 1.08505,
          stopLoss: 1.08000,
          takeProfit: 1.09500
        },
        deal: {
          dealId: 99887766,
          orderId: 11223344,
          positionId: 55667788,
          volume: 100000,
          filledVolume: 100000,
          symbolId: 1,
          createTimestamp: 1770000000000,
          executionTimestamp: 1770000000150,
          executionPrice: 1.08505,
          tradeSide: 1, // BUY
          dealStatus: 2, // FILLED in official Spotware schema
          commission: 25
        }
      }, clientMsgId);

      const decoded = await CTraderProtoManager.decodeFrame(frame.subarray(4));
      expect(decoded.payloadType).toBe(2126);
      expect(decoded.clientMsgId).toBe(clientMsgId);
      expect(decoded.decodedPayload.executionType).toBe(3); // ORDER_FILLED

      // Verify nested structure matches official schema
      expect(Number(decoded.decodedPayload.order.orderId)).toBe(11223344);
      expect(Number(decoded.decodedPayload.order.tradeData.volume)).toBe(100000);

      expect(Number(decoded.decodedPayload.position.positionId)).toBe(55667788);
      expect(decoded.decodedPayload.position.price).toBeCloseTo(1.08505);
      expect(Number(decoded.decodedPayload.position.tradeData.symbolId)).toBe(1);

      expect(Number(decoded.decodedPayload.deal.dealId)).toBe(99887766);
      expect(decoded.decodedPayload.deal.executionPrice).toBeCloseTo(1.08505);
      expect(decoded.decodedPayload.deal.dealStatus).toBe(2); // FILLED
    });

    it('3.7 encodes and decodes ProtoOAOrderErrorEvent (2132) vector', async () => {
      const clientMsgId = 'err_evt_001';
      const frame = await CTraderProtoManager.encodeFrame(2132, {
        ctidTraderAccountId: 5881234,
        errorCode: 'NOT_ENOUGH_MONEY',
        orderId: 11223344,
        positionId: 55667788,
        description: 'Insufficient margin to open position.'
      }, clientMsgId);

      const decoded = await CTraderProtoManager.decodeFrame(frame.subarray(4));
      expect(decoded.payloadType).toBe(2132);
      expect(decoded.clientMsgId).toBe(clientMsgId);
      expect(decoded.decodedPayload.errorCode).toBe('NOT_ENOUGH_MONEY');
      expect(Number(decoded.decodedPayload.ctidTraderAccountId)).toBe(5881234);
      expect(Number(decoded.decodedPayload.orderId)).toBe(11223344);
      expect(Number(decoded.decodedPayload.positionId)).toBe(55667788);
    });

    it('3.8 encodes and decodes ProtoOAReconcileRes (2125) vector', async () => {
      const clientMsgId = 'recon_res_001';
      const frame = await CTraderProtoManager.encodeFrame(2125, {
        ctidTraderAccountId: 5881234,
        position: [{
          positionId: 778899,
          tradeData: {
            symbolId: 1,
            volume: 50000,
            tradeSide: 1
          },
          positionStatus: 1,
          swap: 0,
          price: 1.08400
        }],
        order: [{
          orderId: 445566,
          tradeData: {
            symbolId: 1,
            volume: 50000,
            tradeSide: 1
          },
          orderType: 2, // LIMIT
          orderStatus: 1 // ACCEPTED
        }]
      }, clientMsgId);

      const decoded = await CTraderProtoManager.decodeFrame(frame.subarray(4));
      expect(decoded.payloadType).toBe(2125);
      expect(Number(decoded.decodedPayload.position[0].positionId)).toBe(778899);
      expect(Number(decoded.decodedPayload.order[0].orderId)).toBe(445566);
    });
  });

  describe('4. Negative / Fail-Closed Protocol Tests', () => {
    it('4.1 rejects unknown payload type', async () => {
      await expect(CTraderProtoManager.encodeFrame(99999, {}))
        .rejects.toThrow('UNSUPPORTED_PAYLOAD_TYPE: 99999');
    });

    it('4.2 rejects missing required fields on ProtoOANewOrderReq', async () => {
      // Missing required volume and orderType
      await expect(CTraderProtoManager.encodeFrame(2106, {
        ctidTraderAccountId: 5881234,
        symbolId: 1
      })).rejects.toThrow('PROTOBUF_VALIDATION_ERROR');
    });

    it('4.3 handles raw bytes for unknown incoming payloadType without throwing', async () => {
      const root = await CTraderProtoManager.loadSchemas();
      const ProtoMessage = root.lookupType('ProtoMessage');
      const testBuffer = Buffer.from([1, 2, 3, 4]);

      const wrapper = ProtoMessage.encode(ProtoMessage.create({
        payloadType: 9876,
        payload: testBuffer,
        clientMsgId: 'unknown_001'
      })).finish();

      const decoded = await CTraderProtoManager.decodeFrame(Buffer.from(wrapper));
      expect(decoded.payloadType).toBe(9876);
      expect(decoded.clientMsgId).toBe('unknown_001');
      expect(decoded.decodedPayload.rawBytes).toBeDefined();
    });
  });
});
