import 'dotenv/config';
import { CTraderConfigValidator } from '../src/server/services/ctraderConfigValidator';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function main() {
  const config = CTraderConfigValidator.validateDemoConfig();
  const transport = new CTraderTransport();
  console.log('1. CONNECTING TLS TO demo.ctraderapi.com:5035...');
  await transport.connect('demo.ctraderapi.com', 5035);
  console.log('   TLS CONNECTED!');

  console.log('2. SENDING 2100 (ProtoOAApplicationAuthReq)...');
  try {
    const appRes = await transport.sendRequest(2100, {
      clientId: config.clientId,
      clientSecret: config.clientSecret
    });
    console.log('   APP AUTH RES:', appRes.payloadType, JSON.stringify(appRes.decodedPayload));
  } catch (err: any) {
    console.error('   APP AUTH ERROR:', err.message);
  }

  console.log('3. SENDING 2102 (ProtoOAAccountAuthReq)...');
  try {
    const accRes = await transport.sendRequest(2102, {
      cTraderAccountId: Number(config.accountId),
      accessToken: config.accessToken
    });
    console.log('   ACC AUTH RES:', accRes.payloadType, JSON.stringify(accRes.decodedPayload));
  } catch (err: any) {
    console.error('   ACC AUTH ERROR:', err.message);
  }

  console.log('4. SENDING 2121 (ProtoOATraderReq)...');
  try {
    const traderRes = await transport.sendRequest(2121, {
      cTraderAccountId: Number(config.accountId)
    });
    console.log('   TRADER RES:', traderRes.payloadType, JSON.stringify(traderRes.decodedPayload));
  } catch (err: any) {
    console.error('   TRADER ERROR:', err.message);
  }

  await transport.disconnect();
}

main().catch(err => console.error('MAIN FATAL:', err));
