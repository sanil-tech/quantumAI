import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';
import { CTraderDemoLifecycleHarness } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';

async function main() {
  const host = 'demo.ctraderapi.com';
  const port = 5035;

  const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
  const accountId = (process.env.CTRADER_ACCOUNT_ID || '').trim();
  const accessToken = (process.env.CTRADER_ACCESS_TOKEN || '').trim();

  if (!clientId || !clientSecret || !accountId || !accessToken) {
    console.error('ERROR: Missing required cTrader DEMO API credentials in environment.');
    process.exit(1);
  }

  const accountIdNum = Number(accountId);
  if (!Number.isFinite(accountIdNum) || accountIdNum <= 0) {
    console.error(`ERROR: Invalid account ID: "${accountId}"`);
    process.exit(1);
  }

  const transport = new CTraderTransport();

  try {
    // 1. Connect
    await transport.connect(host, port, 10000);

    // 2. Application Auth (2100)
    const appAuthRes = await transport.sendRequest(2100, {
      clientId,
      clientSecret
    });
    if (appAuthRes.payloadType !== 2101) {
      throw new Error(`App auth failed. Expected 2101, got ${appAuthRes.payloadType}`);
    }

    // 3. Account Auth (2102)
    const accountAuthRes = await transport.sendRequest(2102, {
      ctidTraderAccountId: accountIdNum,
      accessToken
    });
    if (accountAuthRes.payloadType !== 2103) {
      throw new Error(`Account auth failed. Expected 2103, got ${accountAuthRes.payloadType}`);
    }

    // 4. Retrieve Account Information (2121 ProtoOATraderReq)
    const traderRes = await transport.sendRequest(2121, {
      ctidTraderAccountId: accountIdNum
    });
    const trader = traderRes.decodedPayload?.trader;
    const moneyDigits = trader?.moneyDigits ?? 2;
    const rawBalance = Number(trader?.balance ?? 0);
    const formattedBalance = (rawBalance / Math.pow(10, moneyDigits)).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    // 5. Retrieve Symbols List (2114)
    const symbolsListRes = await transport.sendRequest(2114, {
      ctidTraderAccountId: accountIdNum
    });
    const lightSymbols: any[] = symbolsListRes.decodedPayload?.symbol || [];
    const eurusd = lightSymbols.find((s: any) => {
      const name = (s.symbolName || '').toUpperCase().replace('/', '').replace('_', '');
      return name === 'EURUSD';
    });

    if (!eurusd || !eurusd.symbolId) {
      throw new Error('EURUSD symbol not found on DEMO broker account.');
    }

    const symbolId = Number(eurusd.symbolId);

    // 6. Retrieve Full Symbol Spec (2116)
    const symbolByIdRes = await transport.sendRequest(2116, {
      ctidTraderAccountId: accountIdNum,
      symbolId: [symbolId]
    });
    const fullSymbols: any[] = symbolByIdRes.decodedPayload?.symbol || [];
    const fullSymbol = fullSymbols.find((s: any) => Number(s.symbolId) === symbolId);

    if (!fullSymbol) {
      throw new Error(`Full symbol metadata unavailable for EURUSD (ID: ${symbolId}).`);
    }

    // Print Concise Connectivity Report
    console.log('================================================');
    console.log('QUANTUMAI cTRADER DEMO CONNECTIVITY');
    console.log('================================================');
    console.log('Environment : DEMO');
    console.log(`Endpoint    : ${host}:${port}`);
    console.log('Connection  : CONNECTED');
    console.log('App Auth    : PASS');
    console.log('Account Auth: PASS');
    console.log(`Account     : ${CTraderDemoLifecycleHarness.redactAccountId(accountId)}`);
    console.log(`Balance     : ${formattedBalance}`);
    console.log(`Currency    : USD`);
    console.log(`EURUSD      : FOUND`);
    console.log(`Symbol ID   : ${symbolId}`);
    console.log(`Metadata    : PASS (min: ${fullSymbol.minVolume}, step: ${fullSymbol.stepVolume}, lot: ${fullSymbol.lotSize})`);
    console.log('================================================');
    console.log('RESULT      : DEMO CONNECTIVITY VERIFIED');
    console.log('================================================');

  } catch (err: any) {
    console.error('================================================');
    console.error('QUANTUMAI cTRADER DEMO CONNECTIVITY FAILED');
    console.error('================================================');
    console.error(`Error: ${err.message}`);
    console.error('================================================');
    process.exit(1);
  } finally {
    try {
      await transport.disconnect();
    } catch (e) {}
  }
}

main().catch((err) => {
  console.error('[UNHANDLED_EXCEPTION]', err);
  process.exit(1);
});
