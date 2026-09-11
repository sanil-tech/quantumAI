import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function main() {
  const t = new CTraderTransport();
  console.log('[AMEND-TEST] Connecting to cTrader demo...');
  await t.connect('demo.ctraderapi.com', 5035);
  await t.sendRequest(2100, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET });
  await t.sendRequest(2102, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID), accessToken: process.env.CTRADER_ACCESS_TOKEN });
  
  const rec = await t.sendRequest(2124, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID) });
  const positions = rec.decodedPayload.position || [];
  console.log(`[AMEND-TEST] Total open positions in cTrader: ${positions.length}`);

  for (const pos of positions) {
    const isGold = pos.tradeData?.symbolId === 41 || pos.symbolId === 41;
    if (isGold) {
      console.log(`[AMEND-TEST] Found Gold position #${pos.positionId}: Side=${pos.tradeData?.tradeSide}, Price=${pos.price}, SL=${pos.stopLoss}, TP=${pos.takeProfit}`);
      
      const isSell = pos.tradeData?.tradeSide === 2;
      const targetSL = isSell ? Number((pos.price + 20.0).toFixed(2)) : Number((pos.price - 20.0).toFixed(2));
      const targetTP = isSell ? Number((pos.price - 40.0).toFixed(2)) : Number((pos.price + 40.0).toFixed(2));

      console.log(`[AMEND-TEST] Submitting ProtoOAAmendPositionSLTPReq (2110) for Gold #${pos.positionId} -> SL: ${targetSL}, TP: ${targetTP}`);
      const res = await t.sendRequest(2110, {
        ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
        positionId: pos.positionId,
        stopLoss: targetSL,
        takeProfit: targetTP
      }, 8000);

      console.log('[AMEND-TEST] Amend result payloadType:', res.payloadType);
      console.log('[AMEND-TEST] Decoded response:', JSON.stringify(res.decodedPayload, null, 2));
    }
  }

  console.log('[AMEND-TEST] Completed successfully!');
  await t.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[AMEND-TEST] Error:', err);
  process.exit(1);
});
