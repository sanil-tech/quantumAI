import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function listAccounts() {
  const transport = new CTraderTransport();
  const host = process.env.CTRADER_HOST || 'demo.ctraderapi.com';
  const port = Number(process.env.CTRADER_PORT) || 5035;
  const clientId = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  const accessToken = process.env.CTRADER_ACCESS_TOKEN;

  await transport.connect(host, port);
  await transport.sendRequest(2100, { clientId, clientSecret }, 7000);

  console.log('Fetching account list for access token (ProtoOA 2149)...');
  const accListRes = await transport.sendRequest(2149, { accessToken }, 7000);
  console.log('Account List Result:', JSON.stringify(accListRes, null, 2));

  await transport.disconnect();
}

listAccounts().catch(e => {
  console.error(e);
  process.exit(1);
});
