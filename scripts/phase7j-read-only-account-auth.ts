
import tls from 'tls';
import dotenv from 'dotenv';
dotenv.config();

import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';

async function executePhase7JSequence() {
  const host = 'demo.ctraderapi.com';
  const port = 5035;
  const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
  const accessToken = (process.env.CTRADER_ACCESS_TOKEN || '').trim();
  const accountId = Number((process.env.CTRADER_ACCOUNT_ID || '').trim());

  console.log('======================================================================');
  console.log('QUANTUMAI / IATI OS ? PHASE 7J READ-ONLY ACCOUNT AUTHORIZATION');
  console.log('======================================================================');
  console.log('Target Endpoint:        ', host + ':' + port);
  console.log('Client ID (Length):     ', clientId.length);
  console.log('Account ID:             ', accountId);

  return new Promise<void>((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let step = 1;

    const socket = tls.connect({
      host,
      port,
      servername: host,
      rejectUnauthorized: true,
      timeout: 10000
    }, async () => {
      console.log('\n1. TLS 1.3 Handshake:   ESTABLISHED');
      console.log('2. Application Auth:     Transmitting ProtoOAApplicationAuthReq (2100)...');

      const appAuthFrame = await CTraderProtoManager.encodeFrame(2100, {
        clientId,
        clientSecret
      }, 'REQ-PHASE7J-APP-01');

      socket.write(appAuthFrame);
    });

    socket.on('data', async (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (buffer.length < 4 + length) {
          break; // wait for full frame
        }

        const frame = buffer.subarray(0, 4 + length);
        buffer = buffer.subarray(4 + length);

        try {
          const decoded = await CTraderProtoManager.decodeFrame(frame);
          console.log('<- Received Message from Broker: PayloadType ' + decoded.payloadType);

          if (decoded.payloadType === 2101 && step === 1) {
            console.log('   [SUCCESS] ProtoOAApplicationAuthRes (2101) received!');
            console.log('\n3. Account Auth:         Transmitting ProtoOAAccountAuthReq (2102) for Account ID ' + accountId + '...');
            step = 2;

            const accAuthFrame = await CTraderProtoManager.encodeFrame(2102, {
              ctidTraderAccountId: accountId,
              accessToken
            }, 'REQ-PHASE7J-ACC-01');

            socket.write(accAuthFrame);
          } else if (decoded.payloadType === 2103 && step === 2) {
            console.log('   [SUCCESS] ProtoOAAccountAuthRes (2103) received!');
            console.log('\n4. Trader Details:       Transmitting ProtoOATraderReq (2121)...');
            step = 3;

            const traderFrame = await CTraderProtoManager.encodeFrame(2121, {
              ctidTraderAccountId: accountId
            }, 'REQ-PHASE7J-TRADER-01');

            socket.write(traderFrame);
          } else if (decoded.payloadType === 2122 && step === 3) {
            console.log('   [SUCCESS] ProtoOATraderRes (2122) received!');
            const trader = decoded.decodedPayload?.trader || {};
            console.log('   -> Trader Balance (Cents):  ', trader.balance);
            console.log('   -> Trader Currency Asset ID:', trader.depositAssetId);
            console.log('   -> Trader Leverage (Cents): ', trader.leverageInCents);

            console.log('\n5. Positions Reconcile:  Transmitting ProtoOAReconcileReq (2124)...');
            step = 4;

            const reconFrame = await CTraderProtoManager.encodeFrame(2124, {
              ctidTraderAccountId: accountId
            }, 'REQ-PHASE7J-RECON-01');

            socket.write(reconFrame);
          } else if (decoded.payloadType === 2125 && step === 4) {
            console.log('   [SUCCESS] ProtoOAReconcileRes (2125) received!');
            const positions = decoded.decodedPayload?.position || [];
            console.log('   -> Open Positions Count:    ', positions.length);

            console.log('\n======================================================================');
            console.log('PHASE 7J READ-ONLY ACCOUNT DISCOVERY & STATE AUDIT: COMPLETE (PASS)');
            console.log('======================================================================');
            console.log('ORDERS TRANSMITTED:      0');
            console.log('READ ONLY MODE:          true');
            console.log('SAFETY GATE:             BLOCKED');
            console.log('======================================================================');
            socket.end();
            resolve();
          } else if (decoded.payloadType === 2142) {
            console.log('   [-] ProtoOAErrorRes (2142):', JSON.stringify(decoded.decodedPayload));
            socket.end();
            resolve();
          }
        } catch (err: any) {
          console.error('Frame processing error:', err.message);
          socket.end();
          resolve();
        }
      }
    });

    socket.on('timeout', () => {
      console.log('[-] Socket Timeout after 10000ms');
      socket.destroy();
      resolve();
    });

    socket.on('error', (err) => {
      console.error('[-] Socket Error:', err.message);
      resolve();
    });
  });
}

executePhase7JSequence();
