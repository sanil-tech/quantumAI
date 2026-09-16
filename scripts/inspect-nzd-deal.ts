import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function inspectNzdDeal() {
  const transport = new CTraderTransport();
  await transport.connect('demo.ctraderapi.com', 5035);
  
  await transport.sendRequest(2100, {
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET
  }, 10000);

  const accountId = Number(process.env.CTRADER_ACCOUNT_ID || '48282756');
  await transport.sendRequest(2102, {
    cTraderAccountId: accountId,
    accessToken: process.env.CTRADER_ACCESS_TOKEN
  }, 10000);

  // Fetch deals from last 48 hours
  const fromTimestamp = Date.now() - 48 * 60 * 60 * 1000;
  const toTimestamp = Date.now();

  const dealsRes = await transport.sendRequest(2133, {
    ctidTraderAccountId: accountId,
    fromTimestamp,
    toTimestamp
  }, 15000);

  const deals = dealsRes.decodedPayload?.deal || [];
  console.log(`Total deals retrieved in last 48h: ${deals.length}`);

  // Fetch symbol list to resolve symbol names
  const symbolsRes = await transport.sendRequest(2114, {
    ctidTraderAccountId: accountId,
    includeArchivedSymbols: false
  }, 15000);
  const symbolList = symbolsRes.decodedPayload?.symbol || [];
  const symbolMap = new Map<number, string>();
  for (const s of symbolList) {
    symbolMap.set(Number(s.symbolId), s.symbolName || `ID_${s.symbolId}`);
  }

  // Filter recent 10 deals
  const lastDeals = deals.slice(-15);
  console.log('\n--- 15 MOST RECENT DEALS ---');
  for (const d of lastDeals) {
    const symName = symbolMap.get(Number(d.symbolId)) || `Symbol_${d.symbolId}`;
    const volLots = Number(d.volume || 0) / 10000000;
    const profit = Number(d.moneyDigits ? d.grossProfit / Math.pow(10, d.moneyDigits) : (d.grossProfit || 0) / 100);
    const closePosDetail = d.closePositionDetail;
    const executionPrice = Number(d.executionPrice || 0);
    const timeStr = new Date(Number(d.executionTimestamp || 0)).toISOString();
    console.log(`Deal #${d.dealId} | Pos #${d.positionId} | ${symName} | Side: ${d.tradeSide === 1 ? 'BUY' : 'SELL'} | Lots: ${volLots} | ExecPrice: ${executionPrice} | GrossProfit: $${profit.toFixed(2)} | Time: ${timeStr} | ClosedVolume: ${closePosDetail ? Number(closePosDetail.closedVolume)/10000000 : 'N/A'}`);
    if (closePosDetail) {
      console.log('   closePositionDetail:', JSON.stringify(closePosDetail));
    }
  }

  // Also check open positions
  const posRes = await transport.sendRequest(2124, {
    ctidTraderAccountId: accountId
  }, 10000);
  const openPositions = posRes.decodedPayload?.position || [];
  console.log(`\n--- CURRENT OPEN POSITIONS (${openPositions.length}) ---`);
  for (const p of openPositions) {
    const symName = symbolMap.get(Number(p.tradeData?.symbolId)) || `Symbol_${p.tradeData?.symbolId}`;
    const volLots = Number(p.tradeData?.volume || 0) / 10000000;
    console.log(`Pos #${p.positionId} | ${symName} | Lots: ${volLots} | SL: ${p.stopLoss} | TP: ${p.takeProfit}`);
  }

  await transport.disconnect();
}

inspectNzdDeal().catch(e => {
  console.error('Inspect error:', e);
  process.exit(1);
});
