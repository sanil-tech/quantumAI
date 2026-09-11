import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function main() {
  const t = new CTraderTransport();
  await t.connect('demo.ctraderapi.com', 5035);
  await t.sendRequest(2100, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET });
  await t.sendRequest(2102, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID), accessToken: process.env.CTRADER_ACCESS_TOKEN });
  
  const rec = await t.sendRequest(2124, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID) });
  console.log('--- ALL OPEN POSITIONS & MARGIN CONSUMED ---');
  let totalUsedMargin = 0;
  for (const p of rec.decodedPayload.position || []) {
    const margin = (p.usedMargin || 0) / 100;
    totalUsedMargin += margin;
    console.log(`Position #${p.positionId} | Symbol: ${p.tradeData?.symbolId} | Side: ${p.tradeData?.tradeSide} | Price: ${p.price} | Volume: ${p.tradeData?.volume} | Used Margin: $${margin.toFixed(2)}`);
  }
  console.log(`TOTAL USED MARGIN: $${totalUsedMargin.toFixed(2)}`);

  // Close test position #285373388 (the GBPJPY test position we just opened)
  const testGbpPos = rec.decodedPayload.position?.find((p: any) => p.positionId === 285373388);
  if (testGbpPos) {
    console.log('Closing test GBPJPY position #285373388...');
    await t.sendRequest(2106, {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      symbolId: testGbpPos.tradeData.symbolId,
      orderType: 1,
      tradeSide: testGbpPos.tradeData.tradeSide === 1 ? 2 : 1, // Opposite side
      volume: testGbpPos.tradeData.volume,
      positionId: testGbpPos.positionId,
      clientOrderId: `close_${Date.now()}`
    }, 5000);
    console.log('Closed test GBPJPY position successfully!');
  }

  // Now test GBPJPY 0.05 lot (volume 500,000)
  console.log('--- TESTING GBPJPY 0.05 LOT (volume 500,000) NOW ---');
  try {
    const gbpOrder = await t.sendRequest(2106, {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      symbolId: 7,
      orderType: 1,
      tradeSide: 1, // BUY
      volume: 500000,
      clientOrderId: `test_gbp_005_${Date.now()}`
    }, 5000);
    console.log('SUCCESS GBPJPY 0.05 lot order placed!', JSON.stringify(gbpOrder.decodedPayload));
  } catch (err: any) {
    console.log('GBPJPY 0.05 lot error:', err.message);
  }

  await t.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
