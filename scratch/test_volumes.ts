import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function main() {
  const t = new CTraderTransport();
  await t.connect('demo.ctraderapi.com', 5035);
  await t.sendRequest(2100, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET });
  await t.sendRequest(2102, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID), accessToken: process.env.CTRADER_ACCESS_TOKEN });
  
  const traderRes = await t.sendRequest(2121, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID) });
  console.log('Trader Details:', JSON.stringify(traderRes.decodedPayload, null, 2));

  // Let's test different volumes for GBPJPY (ID 7)
  // Let's test 100,000 (0.01 lot), 1,000, 10,000, 100, 500
  const testVols = [100, 500, 1000, 10000, 50000, 100000];
  for (const v of testVols) {
    try {
      console.log(`Trying volume: ${v}...`);
      const o = await t.sendRequest(2106, {
        ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
        symbolId: 7,
        orderType: 1,
        tradeSide: 1,
        volume: v,
        clientOrderId: `test_${v}_${Date.now()}`
      }, 5000);
      console.log(`SUCCESS at volume ${v}!`, o.payloadType, JSON.stringify(o.decodedPayload));
      break;
    } catch (e: any) {
      console.log(`Failed at volume ${v}:`, e.message);
    }
  }

  // Also test NASDAQ (ID 21501)
  console.log('--- TESTING NASDAQ (ID 21501) ---');
  try {
    const oNas = await t.sendRequest(2106, {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      symbolId: 21501,
      orderType: 1,
      tradeSide: 1,
      volume: 100, // 1 contract
      clientOrderId: `test_nas_${Date.now()}`
    }, 5000);
    console.log(`SUCCESS NASDAQ at volume 100!`, oNas.payloadType, JSON.stringify(oNas.decodedPayload));
  } catch (e: any) {
    console.log(`Failed NASDAQ:`, e.message);
  }

  await t.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
