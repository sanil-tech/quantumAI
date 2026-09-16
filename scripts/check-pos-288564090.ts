import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function checkPos() {
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
  const target = positions.find((p: any) => p.positionId === 288564090 || String(p.positionId) === '288564090');
  console.log('POSITION 288564090 ON CTRADER:', JSON.stringify(target, null, 2));
  await transport.disconnect();
}
checkPos().catch(e => console.error(e));
