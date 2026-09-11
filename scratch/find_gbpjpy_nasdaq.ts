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
  
  // Find all symbols with GBPJPY, NASDAQ, US100, NAS, JPY, XAU, BTC, EUR, USD
  const filtered = symbols.filter((s: any) => {
    const n = (s.symbolName || '').toUpperCase();
    return n.includes('GBPJPY') || n.includes('NAS') || n.includes('US100') || n.includes('USTEC') || n.includes('TECH') || n.includes('NDX') || n.includes('XAU') || n.includes('EURUSD');
  });

  console.log('--- MATCHING SYMBOLS ---');
  for (const s of filtered) {
    console.log(`ID: ${s.symbolId} | Name: "${s.symbolName}" | Base: ${s.baseAssetId} | Quote: ${s.quoteAssetId}`);
  }

  // Also query details for these
  const detRes = await t.sendRequest(2116, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    symbolId: filtered.map((s: any) => s.symbolId)
  }, 10000);

  console.log('--- DETAILS ---');
  for (const d of detRes.decodedPayload.symbol || []) {
    console.log(`ID: ${d.symbolId} | Name: "${d.symbolName}" | lotSize: ${d.lotSize} | minVolume: ${d.minVolume} | stepVolume: ${d.stepVolume} | maxVolume: ${d.maxVolume} | digits: ${d.digits}`);
  }

  await t.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
