import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function testAuth() {
  const transport = new CTraderTransport();
  await transport.connect('demo.ctraderapi.com', 5035, 10000);
  
  const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
  const token = 'qngwVCSiSsJ_DaXk89xcBWLbwlb2Xl61IaoIkz9r6qE';
  
  console.log('1. AppAuth 2100 with clientId:', clientId);
  const appRes = await transport.sendRequest(2100, { clientId, clientSecret });
  console.log('AppAuth response payloadType:', appRes.payloadType);
  
  console.log('2. AccountAuth 2102 for Account 48282756 with token:', token);
  try {
    const accRes = await transport.sendRequest(2102, { ctidTraderAccountId: 48282756, accessToken: token });
    console.log('✅ AccountAuth success payloadType:', accRes.payloadType, accRes.decodedPayload);
  } catch (err: any) {
    console.error('❌ AccountAuth error:', err.message);
  }
  
  await transport.disconnect();
}

testAuth().catch(console.error);
