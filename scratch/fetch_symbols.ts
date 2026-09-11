import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function main() {
  const t = new CTraderTransport();
  console.log('[SYMBOLS] Connecting to cTrader demo...');
  await t.connect('demo.ctraderapi.com', 5035);
  await t.sendRequest(2100, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET });
  await t.sendRequest(2102, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID), accessToken: process.env.CTRADER_ACCESS_TOKEN });
  
  const res = await t.sendRequest(2114, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  }, 10000);

  console.log('[SYMBOLS] Response payloadType:', res.payloadType);
  const symbols = res.decodedPayload.symbol || [];
  console.log(`[SYMBOLS] Total symbols returned: ${symbols.length}`);

  const targetSymbols = symbols.filter((s: any) => {
    const name = (s.symbolName || '').toUpperCase();
    return name.includes('GBP') || name.includes('JPY') || name.includes('NAS') || name.includes('US100') || name.includes('USTEC') || name.includes('TECH') || name.includes('XAU') || name.includes('EUR') || name.includes('USD') || name.includes('NZD');
  });

  const ids = targetSymbols.map((s: any) => s.symbolId);
  console.log('[SYMBOLS] Fetching details for IDs:', ids);

  const detailRes = await t.sendRequest(2116, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    symbolId: ids
  }, 10000);

  const details = detailRes.decodedPayload.symbol || [];
  for (const d of details) {
    console.log(JSON.stringify({
      symbolId: d.symbolId,
      symbolName: d.symbolName,
      lotSize: d.lotSize,
      minVolume: d.minVolume,
      maxVolume: d.maxVolume,
      stepVolume: d.stepVolume,
      digits: d.digits,
      pipPosition: d.pipPosition
    }, null, 2));
  }

  await t.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[SYMBOLS] Error:', err);
  process.exit(1);
});
