import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function main() {
  const t = new CTraderTransport();
  console.log('[DEAL-LIST] Connecting to cTrader demo...');
  await t.connect('demo.ctraderapi.com', 5035);
  await t.sendRequest(2100, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET });
  await t.sendRequest(2102, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID), accessToken: process.env.CTRADER_ACCESS_TOKEN });
  
  const fromTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const toTimestamp = Date.now() + 60 * 60 * 1000;
  console.log(`[DEAL-LIST] Requesting ProtoOADealListReq (2133) from ${new Date(fromTimestamp).toISOString()} to ${new Date(toTimestamp).toISOString()}`);
  
  const res = await t.sendRequest(2133, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    fromTimestamp,
    toTimestamp,
    maxRows: 50
  }, 10000);

  console.log('[DEAL-LIST] Response payloadType:', res.payloadType);
  const deals = res.decodedPayload.deal || [];
  console.log(`[DEAL-LIST] Total deals returned by cTrader broker: ${deals.length}`);
  for (const d of deals) {
    console.log(JSON.stringify({
      dealId: d.dealId,
      orderId: d.orderId,
      positionId: d.positionId,
      symbolId: d.symbolId,
      tradeSide: d.tradeSide === 1 ? 'BUY' : 'SELL',
      volume: d.volume,
      filledVolume: d.filledVolume,
      executionPrice: d.executionPrice,
      closePositionDetail: d.closePositionDetail,
      executionTimestamp: d.executionTimestamp ? new Date(Number(d.executionTimestamp)).toISOString() : undefined,
      comment: d.comment
    }, null, 2));
  }

  await t.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[DEAL-LIST] Error:', err);
  process.exit(1);
});
