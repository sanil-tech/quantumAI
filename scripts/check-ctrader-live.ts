import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function checkCTrader() {
  const transport = new CTraderTransport();
  await transport.connect('demo.ctraderapi.com', 5035);

  await transport.sendRequest(2100, {
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET
  });
  await transport.sendRequest(2102, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    accessToken: process.env.CTRADER_ACCESS_TOKEN
  });

  const reconRes = await transport.sendRequest(2124, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  });

  const positions = reconRes.decodedPayload?.position || [];
  console.log('=== CTRADER LIVE BROKER POSITIONS ===');
  for (const p of positions) {
    console.log(`Position #${p.positionId}: volume=${Number(p.tradeData?.volume || 0) / 10000000}, price=${p.price}, SL=${p.stopLoss}, TP=${p.takeProfit}`);
  }

  await transport.disconnect();
}

checkCTrader().catch(console.error);
