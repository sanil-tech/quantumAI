import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function main() {
  const t = new CTraderTransport();
  await t.connect('demo.ctraderapi.com', 5035);
  await t.sendRequest(2100, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET });
  await t.sendRequest(2102, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID), accessToken: process.env.CTRADER_ACCESS_TOKEN });
  
  const res = await t.sendRequest(2114, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  }, 10000);

  const symbols = res.decodedPayload.symbol || [];
  
  const majors = symbols.filter((s: any) => s.symbolId <= 50 || s.symbolId === 21501 || s.symbolId === 22395);
  
  console.log('--- ALL SYMBOL NAMES AND IDS ---');
  for (const s of majors) {
    console.log(`ID: ${s.symbolId.toString().padStart(5, ' ')} | Name: "${s.symbolName}"`);
  }

  // Also query expected margin for 0.05 lots GBPJPY and 1 contract NASDAQ
  const gbpjpyMargin = await t.sendRequest(2162, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    symbolId: 7,
    volume: [500000] // 0.05 lot in cents
  }).catch((e: any) => e.message);
  console.log('GBPJPY 0.05 lot margin:', JSON.stringify(gbpjpyMargin));

  await t.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
