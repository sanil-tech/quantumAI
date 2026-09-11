
import tls from 'tls';
import dotenv from 'dotenv';
dotenv.config();

import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';

async function testCredentials() {
  const host = 'demo.ctraderapi.com';
  const port = 5035;
  const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();

  console.log('--- cTrader Open API Application Auth Test ---');
  console.log('Host:', host);
  console.log('Port:', port);
  console.log('Client ID length:', clientId.length);
  console.log('Client Secret length:', clientSecret.length);

  const socket = tls.connect({
    host,
    port,
    servername: host,
    rejectUnauthorized: true,
    timeout: 10000
  }, async () => {
    console.log('TLS 1.3 Handshake: ESTABLISHED');
    console.log('Encoding & Sending ProtoOAApplicationAuthReq (2100)...');

    const frame = await CTraderProtoManager.encodeFrame(2100, {
      clientId,
      clientSecret
    }, 'REQ-AUTH-PORTAL-01');

    socket.write(frame);
  });

  socket.on('data', async (data) => {
    console.log('Received response from broker (' + data.length + ' bytes)');
    try {
      const decoded = await CTraderProtoManager.decodeFrame(data);
      console.log('Decoded PayloadType:', decoded.payloadType);
      console.log('Payload Type Name:', decoded.payloadType === 2101 ? 'ProtoOAApplicationAuthRes (SUCCESS)' : (decoded.payloadType === 2142 ? 'ProtoOAErrorRes (ERROR)' : 'OTHER'));
      console.log('Decoded Payload:', JSON.stringify(decoded.decodedPayload));
    } catch (e: any) {
      console.log('Decode Error:', e.message);
    }
    socket.end();
  });

  socket.on('timeout', () => {
    console.log('Socket TIMEOUT (10000ms)');
    socket.destroy();
  });

  socket.on('error', (err) => {
    console.log('Socket ERROR:', err.message);
  });
}

testCredentials();
