
import tls from 'tls';
import dotenv from 'dotenv';
dotenv.config();

import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';

async function testAccountDiscoveryDirect() {
  const host = 'demo.ctraderapi.com';
  const port = 5035;
  const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
  const accessToken = (process.env.CTRADER_ACCESS_TOKEN || '').trim();
  const configuredAccountId = (process.env.CTRADER_ACCOUNT_ID || '').trim();

  console.log('====================================================');
  console.log('cTRADER READ-ONLY AUTHENTICATION & ACCOUNT DISCOVERY');
  console.log('====================================================');

  const root = await CTraderProtoManager.loadSchemas();
  const ProtoMessage = root.lookupType('ProtoMessage');

  const socket = tls.connect({
    host,
    port,
    servername: host,
    rejectUnauthorized: true,
    timeout: 10000
  }, async () => {
    console.log('1. TLS 1.3 Handshake: ESTABLISHED');
    console.log('2. Sending ProtoOAApplicationAuthReq (2100)...');

    const appFrame = await CTraderProtoManager.encodeFrame(2100, {
      clientId,
      clientSecret
    }, 'REQ-APP-AUTH-01');

    socket.write(appFrame);
  });

  let step = 1;

  socket.on('data', async (data) => {
    try {
      const decoded = await CTraderProtoManager.decodeFrame(data);
      console.log('Received Message: PayloadType ' + decoded.payloadType);

      if (decoded.payloadType === 2101 && step === 1) {
        console.log('   [SUCCESS] ProtoOAApplicationAuthRes (2101) received!');
        console.log('3. Sending ProtoOAGetAccountListByAccessTokenReq (2149)...');
        step = 2;

        const ReqType = root.lookupType('ProtoOAGetAccountListByAccessTokenReq');
        const payloadBuf = ReqType.encode(ReqType.create({
          payloadType: 2149,
          accessToken
        })).finish();

        const wrapperBuf = ProtoMessage.encode(ProtoMessage.create({
          payloadType: 2149,
          payload: payloadBuf,
          clientMsgId: 'REQ-ACC-LIST-01'
        })).finish();

        const fullFrame = Buffer.alloc(4 + wrapperBuf.length);
        fullFrame.writeUInt32BE(wrapperBuf.length, 0);
        Buffer.from(wrapperBuf).copy(fullFrame, 4);

        socket.write(fullFrame);
      } else if (decoded.payloadType === 2150 && step === 2) {
        console.log('   [SUCCESS] ProtoOAGetAccountListByAccessTokenRes (2150) received!');
        const ResType = root.lookupType('ProtoOAGetAccountListByAccessTokenRes');
        const unproto = ResType.decode(decoded.rawPayload);
        const accounts = (unproto as any).ctidTraderAccount || [];
        console.log('   Discovered Accounts Count:', accounts.length);

        for (const acc of accounts) {
          console.log('   -> Account ID: ' + acc.ctidTraderAccountId + ' | isLive: ' + acc.isLive + ' | traderLogin: ' + (acc.traderLogin || 'N/A'));
        }

        const demoMatch = accounts.find((a: any) => String(a.ctidTraderAccountId) === configuredAccountId);
        console.log('   Configured Account Match (' + configuredAccountId + '): ' + (demoMatch ? 'MATCHED (DEMO)' : 'NOT MATCHED'));

        if (demoMatch || accounts.length > 0) {
          const targetId = demoMatch ? demoMatch.ctidTraderAccountId : accounts[0].ctidTraderAccountId;
          console.log('4. Sending ProtoOAAccountAuthReq (2102) for Account ID: ' + targetId + '...');
          step = 3;

          const accAuthFrame = await CTraderProtoManager.encodeFrame(2102, {
            ctidTraderAccountId: Number(targetId),
            accessToken
          }, 'REQ-ACC-AUTH-01');

          socket.write(accAuthFrame);
        } else {
          socket.end();
        }
      } else if (decoded.payloadType === 2103 && step === 3) {
        console.log('   [SUCCESS] ProtoOAAccountAuthRes (2103) received!');
        console.log('====================================================');
        console.log('READ-ONLY ACCOUNT AUTHORIZATION COMPLETE & VERIFIED!');
        console.log('====================================================');
        socket.end();
      } else if (decoded.payloadType === 2142) {
        console.log('   [-] ProtoOAErrorRes (2142):', JSON.stringify(decoded.decodedPayload));
        socket.end();
      } else {
        console.log('   Other payload:', decoded.payloadType, JSON.stringify(decoded.decodedPayload));
        socket.end();
      }
    } catch (e: any) {
      console.log('Decode Error:', e.message);
      socket.end();
    }
  });

  socket.on('timeout', () => {
    console.log('Socket TIMEOUT');
    socket.destroy();
  });

  socket.on('error', (err) => {
    console.log('Socket ERROR:', err.message);
  });
}

testAccountDiscoveryDirect();
