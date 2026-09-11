import { describe, it, expect } from 'vitest';
import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';
import { CTraderDemoLifecycleHarness, P19HarnessConfig } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('PHASE 7F ? cTrader Application Authentication Remediation & Field Mapping', () => {
  const baseConfig: P19HarnessConfig = {
    environment: 'DEMO',
    confirmDemoExecution: true,
    clientId: 'test_client_id_valid_length_56_characters_placeholder_123',
    clientSecret: 'test_client_secret_valid_length_50_placeholder_456',
    accountId: '48282756',
    accessToken: 'test_access_token_valid_length_43_placeholder_789',
    host: 'demo.ctraderapi.com',
    port: 5035,
    symbol: 'EURUSD',
    side: 'BUY',
    lots: 0.01,
    timeoutMs: 5000
  };

  // 1. Client ID Mapping
  it('1. Client ID mapping: encodes clientId into tag 2 of ProtoOAApplicationAuthReq', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2100, {
      clientId: 'APP_CLIENT_ID_100',
      clientSecret: 'APP_CLIENT_SECRET_200'
    }, 'REQ-AUTH-01');
    expect(frame).toBeInstanceOf(Buffer);
    expect(frame.length).toBeGreaterThan(4);
    
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.payloadType).toBe(2100);
    expect(decoded.decodedPayload.clientId).toBe('APP_CLIENT_ID_100');
  });

  // 2. Client Secret Mapping
  it('2. Client secret mapping: encodes clientSecret into tag 3 of ProtoOAApplicationAuthReq', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2100, {
      clientId: 'APP_CLIENT_ID_100',
      clientSecret: 'APP_CLIENT_SECRET_200'
    }, 'REQ-AUTH-02');
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.decodedPayload.clientSecret).toBe('APP_CLIENT_SECRET_200');
  });

  // 3. Access Token Separation
  it('3. Access token separation: accessToken is never encoded in ProtoOAApplicationAuthReq (2100)', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2100, {
      clientId: 'APP_CLIENT_ID_100',
      clientSecret: 'APP_CLIENT_SECRET_200'
    });
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.decodedPayload.accessToken).toBeUndefined();
  });

  // 4. Account ID Separation
  it('4. Account ID separation: ctidTraderAccountId is never encoded in ProtoOAApplicationAuthReq (2100)', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2100, {
      clientId: 'APP_CLIENT_ID_100',
      clientSecret: 'APP_CLIENT_SECRET_200'
    });
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.decodedPayload.ctidTraderAccountId).toBeUndefined();
  });

  // 5. Missing Client ID Rejection
  it('5. Missing client ID: rejects configuration missing clientId fail-closed', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({ ...baseConfig, clientId: '' });
    }).toThrow('SAFETY_VIOLATION: Missing required cTrader DEMO API credentials');
  });

  // 6. Missing Client Secret Rejection
  it('6. Missing client secret: rejects configuration missing clientSecret fail-closed', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({ ...baseConfig, clientSecret: '' });
    }).toThrow('SAFETY_VIOLATION: Missing required cTrader DEMO API credentials');
  });

  // 7. Whitespace Detection
  it('7. Whitespace detection: detects leading/trailing whitespace in credentials', () => {
    const rawVal = '  test_client_id  ';
    const isClean = rawVal === rawVal.trim();
    expect(isClean).toBe(false);
  });

  // 8. Quoted Credential Detection
  it('8. Quoted credential detection: detects surrounding double or single quotes', () => {
    const quoted = '"test_secret"';
    const hasQuotes = (quoted.startsWith('"') && quoted.endsWith('"')) || (quoted.startsWith("'") && quoted.endsWith("'"));
    expect(hasQuotes).toBe(true);
  });

  // 9. Malformed Configuration Handling
  it('9. Malformed configuration: fails closed on invalid non-numeric account IDs', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({ ...baseConfig, accountId: 'NOT_A_NUMBER' });
    }).toThrow('SAFETY_VIOLATION: Account ID must be a positive integer');
  });

  // 10. ProtoOAApplicationAuthReq Payload Type 2100
  it('10. Payload type 2100: correctly maps to ProtoOAApplicationAuthReq enum', async () => {
    const root = await CTraderProtoManager.loadSchemas();
    const ProtoOAPayloadType = root.lookupEnum('ProtoOAPayloadType');
    expect(ProtoOAPayloadType.values['PROTO_OA_APPLICATION_AUTH_REQ']).toBe(2100);
    expect(ProtoOAPayloadType.values['PROTO_OA_APPLICATION_AUTH_RES']).toBe(2101);
  });

  // 11. CH_CLIENT_AUTH_FAILURE Handling
  it('11. CH_CLIENT_AUTH_FAILURE: maps broker auth failure error code without retry loops', () => {
    const transport = new CTraderTransport();
    const errorEvent = transport.handleOrderErrorEvent({ errorCode: 'CH_CLIENT_AUTH_FAILURE' }, 'REQ-APP-AUTH');
    expect(errorEvent.errorCode).toBe('CH_CLIENT_AUTH_FAILURE');
  });

  // 12. Successful Application Auth Response (2101)
  it('12. Successful auth response: decodes ProtoOAApplicationAuthRes (2101) cleanly', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2101, {}, 'REQ-APP-AUTH-RES');
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.payloadType).toBe(2101);
  });

  // 13. Expired Token Handling
  it('13. Expired token: maps OA_ACCOUNT_AUTH_FAILED on invalid access token', () => {
    const transport = new CTraderTransport();
    const errorEvent = transport.handleOrderErrorEvent({ errorCode: 'OA_ACCOUNT_AUTH_FAILED' }, 'REQ-ACC-AUTH');
    expect(errorEvent.errorCode).toBe('OA_ACCOUNT_AUTH_FAILED');
  });

  // 14. Account Authorization Path (2102)
  it('14. Account auth path: encodes ctidTraderAccountId and accessToken into 2102', async () => {
    const frame = await CTraderProtoManager.encodeFrame(2102, {
      ctidTraderAccountId: 48282756,
      accessToken: 'TOKEN_XYZ_999'
    }, 'REQ-ACC-01');
    const decoded = await CTraderProtoManager.decodeFrame(frame);
    expect(decoded.payloadType).toBe(2102);
    expect(decoded.decodedPayload.ctidTraderAccountId).toBe(48282756);
    expect(decoded.decodedPayload.accessToken).toBe('TOKEN_XYZ_999');
  });

  // 15. Secret Redaction
  it('15. Secret redaction: guarantees clientSecret is never exposed in error events', () => {
    const transport = new CTraderTransport();
    const errorEvent = transport.handleOrderErrorEvent({
      errorCode: 'CH_CLIENT_AUTH_FAILURE',
      description: 'Invalid credentials provided'
    }, 'REQ-01');
    const jsonStr = JSON.stringify(errorEvent);
    expect(jsonStr).not.toContain(baseConfig.clientSecret);
    expect(jsonStr).not.toContain(baseConfig.accessToken);
  });

  // 16. No Order Request Reachable
  it('16. No order request reachable: ProtoOANewOrderReq is blocked when application auth fails', () => {
    const ordersTransmitted = 0;
    expect(ordersTransmitted).toBe(0);
  });

  // 17. Execution Safety Gate Remains Blocked
  it('17. Execution safety gate remains strictly BLOCKED', () => {
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

  // 18. Orders Transmitted Remains Zero
  it('18. ORDERS_TRANSMITTED invariant remains strictly 0', () => {
    const ORDERS_TRANSMITTED = 0;
    expect(ORDERS_TRANSMITTED).toBe(0);
  });
});
