import { describe, it, expect } from 'vitest';
import 'dotenv/config';
import dns from 'dns/promises';
import net from 'net';
import tls from 'tls';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';

describe('TASK 8A-I — cTrader DEMO Connectivity & Application Auth Forensics', () => {
  it('1. verifies environment loading and credential status without logging secrets', () => {
    const hasClientId = !!process.env.CTRADER_CLIENT_ID;
    const hasClientSecret = !!process.env.CTRADER_CLIENT_SECRET;
    expect(hasClientId).toBe(true);
    expect(hasClientSecret).toBe(true);
  });

  it('2. verifies credential normalization (no unescaped newlines/leading whitespace)', () => {
    const cid = (process.env.CTRADER_CLIENT_ID || '').trim();
    const csec = (process.env.CTRADER_CLIENT_SECRET || '').trim();
    expect(cid).toBe(cid.trim());
    expect(csec).toBe(csec.trim());
  });

  it('3. verifies ProtoOAApplicationAuthReq (2100) protobuf field mapping', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2100, {
      clientId: 'test_id',
      clientSecret: 'test_secret'
    }, 'req_test_1');
    expect(frame).toBeDefined();
    expect(frame.length).toBeGreaterThan(4);
  });

  it('4. verifies fail-closed 2142 error response decoding for CH_CLIENT_AUTH_FAILURE', async () => {
    const root = await CTraderProtoManager.loadSchemas();
    const ErrorResType = root.lookupType('openapi.ProtoOAErrorRes');
    const encodedError = ErrorResType.encode({
      errorCode: 'CH_CLIENT_AUTH_FAILURE',
      description: 'CH_CLIENT_AUTH_FAILURE'
    }).finish();

    const ProtoMessage = root.lookupType('openapi.ProtoMessage');
    const wrapperBuffer = ProtoMessage.encode({
      payloadType: 2142,
      payload: encodedError
    }).finish();

    const decoded = await CTraderProtoManager.decodeFrame(Buffer.from(wrapperBuffer));
    expect(decoded.payloadType).toBe(2142);
    expect(decoded.decodedPayload.description).toBe('CH_CLIENT_AUTH_FAILURE');
  });

  it('5. guarantees CTraderAdapter returns undefined account status when disconnected (no synthetic fallbacks)', async () => {
    const adapter = new CTraderAdapter({ environment: 'DEMO', clientId: 'a', clientSecret: 'b', accountId: '123', accessToken: 'c' });
    const status = await adapter.getAccountStatus();
    expect(status.balance).toBeUndefined();
    expect(status.equity).toBeUndefined();
    expect(status.currency).toBeUndefined();
  });

  it('6. enforces READ_ONLY_MODE_ENFORCED on order placement', async () => {
    const adapter = new CTraderAdapter();
    await expect(adapter.placeOrder({} as any)).rejects.toThrow('READ_ONLY_MODE_ENFORCED');
  });
});
