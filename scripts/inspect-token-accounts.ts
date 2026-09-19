import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function inspectTokenAccounts() {
  const transport = new CTraderTransport();
  await transport.connect('demo.ctraderapi.com', 5035, 10000);

  const clientId = '36222_ujzQc2eZJ0Ej5pyrCiClTboT5xfh67RFzNsA0yKlYJIVL44eDJ';
  const clientSecret = 'QaFTfvt6TJ3NF0STJ8a0AVp33Ogu194L2tdURnqeWiz1leFY8V';
  const token = '0rRFtUmuaiyF13s6Xqwxe07tlqvKSfMM_7dWUFe_Dx0';

  console.log('1. AppAuth 2100...');
  const appRes = await transport.sendRequest(2100, { clientId, clientSecret });
  console.log('AppAuth payloadType:', appRes.payloadType);

  console.log('2. Querying ProtoOAGetAccountListByAccessTokenReq (2149) with new token...');
  try {
    const listRes = await transport.sendRequest(2149, { accessToken: token });
    console.log('✅ Accounts List for new token (2150):', JSON.stringify(listRes.decodedPayload, null, 2));
  } catch (err: any) {
    console.error('❌ GetAccountList error:', err.message);
  }

  await transport.disconnect();
}

inspectTokenAccounts().catch(console.error);
