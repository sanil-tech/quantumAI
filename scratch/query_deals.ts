import 'dotenv/config';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function run() {
  const c = new CTraderAdapter({ accountId: '48282756' });
  await c.connect();

  const transport = (c as any).transport;

  // Query Deals for today
  const fromTimestamp = Date.now() - 24 * 60 * 60 * 1000;
  const toTimestamp = Date.now();

  try {
    const res = await transport.sendRequest(2132, {
      ctidTraderAccountId: 48282756,
      fromTimestamp,
      toTimestamp,
      maxRows: 50
    });
    console.log("Deals response payloadType:", res.payloadType);
    const deals = res.decodedPayload?.deal || [];
    console.log(`Found ${deals.length} deals:`);
    const relevantDeals = deals.filter((d: any) => 
      String(d.positionId) === '286399810' || 
      String(d.orderId) === '316790057' ||
      d.symbolId === 3 || d.symbolId === 4
    );
    console.table(relevantDeals.map((d: any) => ({
      dealId: d.dealId,
      orderId: d.orderId,
      positionId: d.positionId,
      symbolId: d.symbolId,
      tradeSide: d.tradeSide,
      volume: d.volume,
      executionPrice: d.executionPrice,
      comment: d.comment,
      createTimestamp: new Date(Number(d.createTimestamp)).toISOString(),
      executionTimestamp: new Date(Number(d.executionTimestamp)).toISOString()
    })));
  } catch (e: any) {
    console.error("Error querying deals:", e.message);
  }

  process.exit(0);
}
run().catch(console.error);
