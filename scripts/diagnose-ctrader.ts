/**
 * diagnose-ctrader.ts
 * Comprehensive cTrader connection diagnostic — shows real error codes and traces each step.
 */
import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

const CTRADER_HOST = process.env.CTRADER_HOST || 'demo.ctraderapi.com';
const CTRADER_PORT = Number(process.env.CTRADER_PORT) || 5035;

function mask(s?: string): string {
  if (!s) return '(MISSING)';
  if (s.length <= 6) return '***';
  return s.slice(0, 3) + '***' + s.slice(-3);
}

async function diagnose() {
  console.log('\n==============================');
  console.log(' cTrader Connection Diagnostic');
  console.log('==============================\n');

  // 1. Validate credentials
  const clientId = process.env.CTRADER_CLIENT_ID?.trim();
  const clientSecret = process.env.CTRADER_CLIENT_SECRET?.trim();
  const accessToken = process.env.CTRADER_ACCESS_TOKEN?.trim();
  const accountId = process.env.CTRADER_ACCOUNT_ID?.trim();

  console.log('Config:');
  console.log(`  Host       : ${CTRADER_HOST}:${CTRADER_PORT}`);
  console.log(`  Client ID  : ${mask(clientId)}`);
  console.log(`  Secret     : ${mask(clientSecret)}`);
  console.log(`  AccessToken: ${mask(accessToken)}`);
  console.log(`  AccountID  : ${accountId || '(MISSING)'}`);
  console.log('');

  if (!clientId || !clientSecret || !accessToken || !accountId) {
    console.error('❌ FATAL: Missing required cTrader credentials in .env');
    process.exit(1);
  }

  const transport = new CTraderTransport();

  // Forward all raw events so we can see what comes back
  transport.on('errorResponse', (e) => {
    console.warn(`[RAW_ERROR_RESPONSE] errorCode=${e.errorCode}, description=${e.description}, clientMsgId=${e.clientMsgId}`);
  });
  transport.on('unhandledMessage', (res) => {
    console.log(`[UNHANDLED_MSG] payloadType=${res.payloadType}`, JSON.stringify(res.decodedPayload)?.slice(0, 200));
  });

  try {
    // STEP 1: TCP/TLS Connect
    console.log(`[1/4] Connecting TLS to ${CTRADER_HOST}:${CTRADER_PORT}...`);
    await transport.connect(CTRADER_HOST, CTRADER_PORT, 10000);
    console.log('      ✅ TLS connected\n');

    // STEP 2: Application Auth (2100 → 2101)
    console.log(`[2/4] Sending ProtoOAApplicationAuthReq (2100)...`);
    let appAuthRes: any;
    try {
      appAuthRes = await transport.sendRequest(2100, { clientId, clientSecret }, 10000);
      if (appAuthRes.payloadType === 2101) {
        console.log('      ✅ App auth SUCCESS (2101)\n');
      } else {
        console.error(`      ❌ Unexpected response: payloadType=${appAuthRes.payloadType}`);
        console.error('         Payload:', JSON.stringify(appAuthRes.decodedPayload));
        process.exit(1);
      }
    } catch (err: any) {
      console.error(`      ❌ App auth FAILED: ${err.message}`);
      process.exit(1);
    }

    // STEP 3: Account Auth (2102 → 2103)
    console.log(`[3/4] Sending ProtoOAAccountAuthReq (2102) for accountId=${accountId}...`);
    let accAuthRes: any;
    try {
      accAuthRes = await transport.sendRequest(2102, {
        ctidTraderAccountId: Number(accountId),
        accessToken
      }, 10000);
      if (accAuthRes.payloadType === 2103) {
        console.log('      ✅ Account auth SUCCESS (2103)');
        console.log(`         ctidTraderAccountId: ${accAuthRes.decodedPayload?.ctidTraderAccountId || accountId}\n`);
      } else {
        console.error(`      ❌ Unexpected response: payloadType=${accAuthRes.payloadType}`);
        console.error('         Payload:', JSON.stringify(accAuthRes.decodedPayload));
        process.exit(1);
      }
    } catch (err: any) {
      console.error(`      ❌ Account auth FAILED: ${err.message}`);
      console.error('      This is often caused by an expired access token. Refresh it at:');
      console.error('      https://openapi.ctrader.com/apps/auth');
      process.exit(1);
    }

    // STEP 4: Reconcile open positions (2124 → 2125)
    console.log('[4/4] Fetching open positions (ProtoOAReconcileReq 2124)...');
    try {
      const reconRes = await transport.sendRequest(2124, {
        ctidTraderAccountId: Number(accountId)
      }, 10000);
      const positions = reconRes.decodedPayload?.position || [];
      console.log(`      ✅ Reconcile SUCCESS — ${positions.length} open position(s)\n`);
      if (positions.length === 0) {
        console.log('      (No open positions)');
      }
      for (const p of positions) {
        const vol = Number(p.tradeData?.volume || 0) / 10000000;
        console.log(`      Position #${p.positionId}: vol=${vol} lots, price=${p.price}, SL=${p.stopLoss ?? 'N/A'}, TP=${p.takeProfit ?? 'N/A'}`);
      }
    } catch (err: any) {
      console.error(`      ❌ Reconcile FAILED: ${err.message}`);
    }

    console.log('\n============================');
    console.log(' Diagnostic COMPLETE ✅');
    console.log('============================\n');
  } finally {
    await transport.disconnect().catch(() => {});
  }
}

diagnose().catch((err) => {
  console.error('\n❌ Unhandled error:', err.message);
  process.exit(1);
});
