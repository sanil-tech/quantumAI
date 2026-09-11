import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function main() {
  const t = new CTraderTransport();
  await t.connect('demo.ctraderapi.com', 5035);
  await t.sendRequest(2100, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET });
  await t.sendRequest(2102, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID), accessToken: process.env.CTRADER_ACCESS_TOKEN });
  
  console.log('--- TESTING GBPJPY (ID 7) 0.05 LOT ---');
  // GBPJPY: 0.05 lot = 500,000 cents (0.05 * 10,000,000)
  const gbpjpyOrder = await t.sendRequest(2106, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    symbolId: 7,
    orderType: 1, // MARKET
    tradeSide: 1, // BUY
    volume: 500000,
    clientOrderId: `test_gbpjpy_${Date.now()}`
  }, 10000);
  console.log('GBPJPY Order Response payloadType:', gbpjpyOrder.payloadType, JSON.stringify(gbpjpyOrder.decodedPayload, null, 2));

  console.log('--- TESTING US TECH 100 / NASDAQ (ID 21501) 1 CONTRACT ---');
  // NASDAQ: 1 contract = 100 cents
  const nasdaqOrder = await t.sendRequest(2106, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    symbolId: 21501,
    orderType: 1, // MARKET
    tradeSide: 1, // BUY
    volume: 100, // 1 contract
    clientOrderId: `test_nasdaq_${Date.now()}`
  }, 10000);
  console.log('NASDAQ Order Response payloadType:', nasdaqOrder.payloadType, JSON.stringify(nasdaqOrder.decodedPayload, null, 2));

  // Now reconcile to check positions
  const rec = await t.sendRequest(2124, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID) });
  console.log('--- ALL OPEN POSITIONS ON CTRADER ---');
  for (const p of rec.decodedPayload.position || []) {
    console.log(`Position #${p.positionId} | SymbolId: ${p.tradeData?.symbolId} | Side: ${p.tradeData?.tradeSide} | Price: ${p.price} | Volume: ${p.tradeData?.volume}`);
  }

  await t.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
