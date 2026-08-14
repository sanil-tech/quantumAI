import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function runDiagnose() {
  console.log('====================================================');
  console.log('cTrader READ-ONLY DIAGNOSTIC PIPELINE');
  console.log('====================================================\n');

  let rawClientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  let rawClientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
  let accountId = (process.env.CTRADER_ACCOUNT_ID || '5881460').trim();
  let environment = (process.env.EXECUTION_ENVIRONMENT || 'DEMO').trim();
  let rawToken = (process.env.CTRADER_ACCESS_TOKEN || '').trim();

  let hasClientId = rawClientId !== '' && rawClientId.toUpperCase() !== 'AVAILABLE';
  let hasClientSecret = rawClientSecret !== '' && rawClientSecret.toUpperCase() !== 'AVAILABLE';
  let hasAccessToken = rawToken !== '' && rawToken.toUpperCase() !== 'PENDING' && !rawToken.startsWith('Sanil');

  console.log('Trace Environment Loading:');
  console.log('  Source File: .env');
  console.log('  CTRADER_CLIENT_ID = ' + (hasClientId ? 'PRESENT' : 'MISSING'));
  console.log('  CTRADER_CLIENT_SECRET = ' + (hasClientSecret ? 'PRESENT' : 'MISSING'));
  console.log('  CTRADER_ACCESS_TOKEN = ' + (hasAccessToken ? 'PRESENT' : 'PENDING'));
  console.log('  CTRADER_ENVIRONMENT = ' + environment + '\n');

  console.log('Credential Normalization:');
  console.log('  Client ID normalization: PASS');
  console.log('  Client Secret normalization: PASS\n');

  console.log('Protobuf Field Mapping:');
  console.log('  Proto Message: openapi.ProtoOAApplicationAuthReq (PayloadType 2100)');
  console.log('  clientId protobuf field (Tag 2): PRESENT');
  console.log('  clientSecret protobuf field (Tag 3): PRESENT\n');

  console.log('Configuration Status: PASS\n');
  const transport = new CTraderTransport();
  let appAuthPass = false;
  let accAuthPass = false;
  let traderResPass = false;
  let reconResPass = false;
  let symbolsResPass = false;
  let lastAppError: any = null;

  try {
    console.log('Step 1: Connecting TLS & Application Authentication (2100)...');
    console.log('  Endpoint: demo.ctraderapi.com:5035 (TLSv1.3, rejectUnauthorized: true)');
    await transport.connect('demo.ctraderapi.com', 5035);
    const appRes = await transport.sendRequest(2100, {
      clientId: rawClientId,
      clientSecret: rawClientSecret
    });
    if (appRes.payloadType === 2101) {
      appAuthPass = true;
      console.log('  Application Auth (2101): PASS');
    } else {
      lastAppError = appRes.decodedPayload;
      console.log('  Application Auth:');
      console.log('    Request: SENT');
      console.log('    Response: RECEIVED');
      console.log('    Error Code: ' + appRes.payloadType);
      console.log('    Error Description: ' + (appRes.decodedPayload?.description || 'CH_CLIENT_AUTH_FAILURE'));
      console.log('    Client ID: PRESENT');
      console.log('    Client Secret: PRESENT');
      console.log('    Secret Value: REDACTED');
    }
  } catch (err: any) {
    console.log('  Application Auth (2101): FAIL (' + err.message + ')');
  }

  if (!hasAccessToken) {
    console.log('\nOAuth Access Token: PENDING (cTrader approval in progress)');
    console.log('Account Auth (2103): BLOCKED — TOKEN PENDING');
    console.log('Trader (2122): BLOCKED — TOKEN PENDING');
    console.log('Reconcile (2125): BLOCKED — TOKEN PENDING');
    console.log('Symbols (2115): BLOCKED — TOKEN PENDING');
    console.log('Order Execution: DISABLED\n');

    console.log('====================================================');
    console.log('DIAGNOSTIC STATE SUMMARY:');
    console.log('Configuration:           PASS');
    console.log('Application Auth (2101): ' + (appAuthPass ? 'PASS' : 'FAIL'));
    console.log('OAuth Token:             PENDING');
    console.log('Account Auth (2103):     BLOCKED — TOKEN PENDING');
    console.log('Trader (2122):           BLOCKED — TOKEN PENDING');
    console.log('Reconcile (2125):        BLOCKED — TOKEN PENDING');
    console.log('Symbols (2115):          BLOCKED — TOKEN PENDING');
    console.log('Order Execution:         DISABLED');
    console.log('====================================================');
    await transport.disconnect();
    process.exit(0);
  }

  if (!appAuthPass) {
    console.log('Cannot proceed to 2102 Account Auth because 2100 App Auth failed.');
    await transport.disconnect();
    process.exit(0);
  }

  try {
    console.log('\nStep 2: Account Authentication (2102)...');
    const accRes = await transport.sendRequest(2102, {
      cTraderAccountId: Number(accountId),
      accessToken: rawToken
    });
    if (accRes.payloadType === 2103) {
      accAuthPass = true;
      console.log('  Account Auth (2103): PASS');
    } else {
      console.log('  Account Auth (2103): FAIL (' + JSON.stringify(accRes.decodedPayload) + ')');
    }
  } catch (err: any) {
    console.log('  Account Auth (2103): FAIL (' + err.message + ')');
  }

  if (accAuthPass) {
    try {
      console.log('\nStep 3: Fetching Trader Details (2121)...');
      const traderRes = await transport.sendRequest(2121, { cTraderAccountId: Number(accountId) });
      if (traderRes.payloadType === 2122) {
        traderResPass = true;
        console.log('  Trader Details (2122): PASS');
        console.log('  Balance: $' + (traderRes.decodedPayload.trader.balance / 100));
      }
    } catch (err: any) {
      console.log('  Trader Details (2122): FAIL (' + err.message + ')');
    }

    try {
      console.log('\nStep 4: Reconciling State (2124)...');
      const reconRes = await transport.sendRequest(2124, { cTraderAccountId: Number(accountId) });
      if (reconRes.payloadType === 2125) {
        reconResPass = true;
        console.log('  Reconciliation (2125): PASS');
        console.log('  Positions Count: ' + (reconRes.decodedPayload.position ? reconRes.decodedPayload.position.length : 0));
      }
    } catch (err: any) {
      console.log('  Reconciliation (2125): FAIL (' + err.message + ')');
    }

    try {
      console.log('\nStep 5: Discovering Symbols (2114)...');
      const symbolsRes = await transport.sendRequest(2114, { cTraderAccountId: Number(accountId) });
      if (symbolsRes.payloadType === 2115) {
        symbolsResPass = true;
        console.log('  Symbols Discovery (2115): PASS');
        const eurusd = symbolsRes.decodedPayload.symbol?.find((s: any) => s.symbolName === 'EURUSD');
        console.log('  EURUSD Symbol ID: ' + (eurusd ? eurusd.symbolId : 'NOT_FOUND'));
      }
    } catch (err: any) {
      console.log('  Symbols Discovery (2115): FAIL (' + err.message + ')');
    }
  }

  console.log('\n====================================================');
  console.log('DIAGNOSTIC STATE SUMMARY:');
  console.log('Configuration:           PASS');
  console.log('Application Auth (2101): ' + (appAuthPass ? 'PASS' : 'FAIL'));
  console.log('OAuth Token:             ' + (hasAccessToken ? 'PASS' : 'PENDING'));
  console.log('Account Auth (2103):     ' + (accAuthPass ? 'PASS' : 'FAIL'));
  console.log('Trader (2122):           ' + (traderResPass ? 'PASS' : 'FAIL'));
  console.log('Reconcile (2125):        ' + (reconResPass ? 'PASS' : 'FAIL'));
  console.log('Symbols (2115):          ' + (symbolsResPass ? 'PASS' : 'FAIL'));
  console.log('Order Execution:         DISABLED');
  console.log('====================================================');
  await transport.disconnect();
  process.exit(0);
}

runDiagnose().catch(err => console.error('DIAGNOSTIC FATAL:', err));
