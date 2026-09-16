import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function testAmend() {
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
  
  console.log('Sending ProtoOAAmendPositionSLTPReq (2110) with stopLoss: 1.15462, takeProfit: 1.14562...');
  const res = await transport.sendRequest(2110, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    positionId: 288564090,
    stopLoss: 1.15462,
    takeProfit: 1.14562
  });
  console.log('Broker Response PayloadType:', res.payloadType);
  console.log('Broker Decoded Payload:', JSON.stringify(res.decodedPayload, null, 2));

  await transport.disconnect();
}
testAmend().catch(e => console.error(e));
