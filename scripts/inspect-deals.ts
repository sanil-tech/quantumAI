import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function main() {
  const t = new CTraderTransport();
  try {
    await t.connect('demo.ctraderapi.com', 5035);
    await t.sendRequest(2100, {
      clientId: process.env.CTRADER_CLIENT_ID,
      clientSecret: process.env.CTRADER_CLIENT_SECRET
    }, 5000);
    await t.sendRequest(2102, {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      accessToken: process.env.CTRADER_ACCESS_TOKEN
    }, 5000);

    const now = Date.now();
    const oneDayAgo = now - 24 * 3600 * 1000;
    const res = await t.sendRequest(2133, {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      fromTimestamp: oneDayAgo,
      toTimestamp: now,
      maxRows: 10
    }, 6000);

    const deals = res.decodedPayload?.deal || [];
    console.log(`Found ${deals.length} deals in the last 24h:`);
    for (const d of deals) {
      console.log(`Deal #${d.dealId}: Pos #${d.positionId}, Volume=${d.volume/10000000}, ExecutionPrice=${d.executionPrice}, Profit=${d.moneyDigits ? (d.closePositionDetail?.grossProfit || 0) / 100 : d.closePositionDetail?.grossProfit}, Reason=${d.closePositionDetail?.comment || d.dealStatus}`);
    }
  } catch (e: any) {
    console.error('Error fetching deals:', e.message);
  } finally {
    await t.disconnect();
    process.exit(0);
  }
}

main();
