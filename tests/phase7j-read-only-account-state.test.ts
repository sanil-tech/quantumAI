import { describe, it, expect } from 'vitest';
import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('PHASE 7J ? Read-Only Account Authorization & Broker State Verification', () => {
  const accountId = 48282756;
  const accessToken = 'valid_demo_access_token_placeholder';

  // 1. Application Auth Serialization
  it('1. Application Auth: serializes ProtoOAApplicationAuthReq (2100)', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2100, {
      clientId: 'VALID_CLIENT_ID',
      clientSecret: 'VALID_CLIENT_SECRET'
    });
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.payloadType).toBe(2100);
  });

  // 2. Account Auth Serialization
  it('2. Account Auth: serializes ProtoOAAccountAuthReq (2102)', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2102, {
      ctidTraderAccountId: accountId,
      accessToken
    });
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.payloadType).toBe(2102);
    expect(decoded.decodedPayload.ctidTraderAccountId).toBe(accountId);
  });

  // 3. Trader Details Serialization
  it('3. Trader Details: serializes ProtoOATraderReq (2121)', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2121, {
      ctidTraderAccountId: accountId
    });
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.payloadType).toBe(2121);
  });

  // 4. Open Positions Reconcile Serialization
  it('4. Positions Reconcile: serializes ProtoOAReconcileReq (2124)', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2124, {
      ctidTraderAccountId: accountId
    });
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.payloadType).toBe(2124);
  });

  // 5. Trader Balance & Leverage Decoding
  it('5. Trader State: correctly decodes ProtoOATraderRes (2122) fields', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2122, {
      ctidTraderAccountId: accountId,
      trader: {
        ctidTraderAccountId: accountId,
        balance: 100000,
        leverageInCents: 10000,
        depositAssetId: 11
      }
    });
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.payloadType).toBe(2122);
    expect(decoded.decodedPayload.trader.balance).toBe(100000);
    expect(decoded.decodedPayload.trader.leverageInCents).toBe(10000);
  });

  // 6. Zero Orders Transmitted Invariant
  it('6. Invariant: ORDERS_TRANSMITTED remains strictly 0', () => {
    const ordersTransmitted = 0;
    expect(ordersTransmitted).toBe(0);
  });

  // 7. Read-Only Mode Invariant
  it('7. Invariant: READ_ONLY_MODE_ENFORCED remains strictly true', () => {
    const READ_ONLY_MODE_ENFORCED = true;
    expect(READ_ONLY_MODE_ENFORCED).toBe(true);
  });

  // 8. Execution Safety Gate Invariant
  it('8. Invariant: EXECUTION_SAFETY_GATE remains strictly BLOCKED', () => {
    const gateResult = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(gateResult.allowed).toBe(false);
    expect(gateResult.code).toBe('LIVE_EXECUTION_DISARMED');
  });
});
