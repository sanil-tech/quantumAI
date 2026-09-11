import dotenv from 'dotenv';
dotenv.config();

import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function testDemoConnectivity() {
  const host = process.env.CTRADER_HOST || 'demo.ctraderapi.com';
  const port = Number(process.env.CTRADER_PORT) || 5035;
  const clientId = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  const accessToken = process.env.CTRADER_ACCESS_TOKEN;
  const accountId = process.env.CTRADER_ACCOUNT_ID;

  console.log('--- Step 0/1/2: cTrader DEMO Connectivity & Auth Probe ---');
  console.log('Target Host:', host);
  console.log('Target Port:', port);
  console.log('Is DEMO Host:', host === 'demo.ctraderapi.com');
  console.log('Credentials Status:');
  console.log('  CTRADER_CLIENT_ID:', clientId ? 'CONFIGURED' : 'NOT_CONFIGURED');
  console.log('  CTRADER_CLIENT_SECRET:', clientSecret ? 'CONFIGURED' : 'NOT_CONFIGURED');
  console.log('  CTRADER_ACCESS_TOKEN:', accessToken ? 'CONFIGURED' : 'NOT_CONFIGURED');
  console.log('  CTRADER_ACCOUNT_ID:', accountId ? 'CONFIGURED' : 'NOT_CONFIGURED');

  if (host !== 'demo.ctraderapi.com') {
    console.error('FATAL: Target host is not demo.ctraderapi.com');
    return;
  }

  const transport = new CTraderTransport();

  try {
    console.log('1. Connecting to cTrader DEMO TLS endpoint (demo.ctraderapi.com:5035)...');
    await transport.connect(host, port);
    console.log('   TLS Connection: ESTABLISHED');

    console.log('2. Sending ProtoOAApplicationAuthReq (2100)...');
    const appAuthRes = await transport.sendRequest(2100, {
      clientId,
      clientSecret
    }, 7000);
    console.log('   Application Auth: SUCCESS (PayloadType:', appAuthRes.payloadType, ')');

    console.log('3. Sending ProtoOAAccountAuthReq (2102) for Account ID:', accountId, '...');
    const accAuthRes = await transport.sendRequest(2102, {
      ctidTraderAccountId: Number(accountId),
      accessToken
    }, 7000);
    console.log('   Account Auth: SUCCESS (PayloadType:', accAuthRes.payloadType, ')');

    console.log('4. Querying Symbols List (2114)...');
    const symbolsRes = await transport.sendRequest(2114, {
      ctidTraderAccountId: Number(accountId)
    }, 7000);
    const symbolList = symbolsRes.decodedPayload?.symbol || [];
    console.log('   Symbols List: RECEIVED (Symbols count:', symbolList.length, ')');

    const eurUsd = symbolList.find((s: any) => s.symbolName === 'EURUSD' || s.symbolName === 'EUR/USD');
    console.log('   EUR/USD Symbol Resolution:', eurUsd ? `FOUND (ID: ${eurUsd.symbolId}, Name: ${eurUsd.symbolName})` : 'NOT_FOUND');

    console.log('5. Querying Current Open Positions (2124)...');
    const reconRes = await transport.sendRequest(2124, {
      ctidTraderAccountId: Number(accountId)
    }, 7000);
    const initialPositions = reconRes.decodedPayload?.position || [];
    console.log('   Current Open Positions Count:', initialPositions.length);

    await transport.disconnect();
    console.log('--- Non-Trading Connection Probe COMPLETE ---');
  } catch (err: any) {
    console.error('Probe Error:', err.message, err.stack);
    try { await transport.disconnect(); } catch (e) {}
  }
}

testDemoConnectivity();
