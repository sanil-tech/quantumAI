import 'dotenv/config';
import * as tls from 'tls';
import protobuf from 'protobufjs';
import * as path from 'path';

async function checkPositions() {
  const protoDir = path.resolve('src/integrations/ctrader/proto');
  const RootClass = (protobuf as any).Root || (protobuf as any).default?.Root;
  const root = new RootClass();
  root.resolvePath = (o: any, t: any) => path.join(protoDir, path.basename(t));
  root.loadSync([
    path.join(protoDir, 'OpenApiCommonModelMessages.proto'),
    path.join(protoDir, 'OpenApiCommonMessages.proto'),
    path.join(protoDir, 'OpenApiModelMessages.proto'),
    path.join(protoDir, 'OpenApiMessages.proto')
  ]);

  const ProtoMessage = root.lookupType('ProtoMessage');

  function encodeFrame(payloadType: number, typeName: string, payloadObj: any, clientMsgId: string) {
    const Type = root.lookupType(typeName);
    const objWithPayloadType = { ...payloadObj, payloadType };
    const payloadBuffer = Type.encode(Type.create(objWithPayloadType)).finish();
    const wrapperObj = { payloadType, payload: payloadBuffer, clientMsgId };
    const wrapperBuffer = ProtoMessage.encode(ProtoMessage.create(wrapperObj)).finish();
    const frame = Buffer.alloc(4 + wrapperBuffer.length);
    frame.writeUInt32BE(wrapperBuffer.length, 0);
    Buffer.from(wrapperBuffer).copy(frame, 4);
    return frame;
  }

  function decodeFrame(frameBytes: Buffer) {
    const message = ProtoMessage.decode(frameBytes);
    const payloadType = message.payloadType;
    const payloadBytes = message.payload;
    const clientMsgId = message.clientMsgId;
    let typeName = '';
    switch (payloadType) {
      case 2101: typeName = 'ProtoOAApplicationAuthRes'; break;
      case 2103: typeName = 'ProtoOAAccountAuthRes'; break;
      case 2125: typeName = 'ProtoOAReconcileRes'; break;
    }
    if (typeName) {
      const ResType = root.lookupType(typeName);
      const decodedPayload = ResType.decode(payloadBytes as Buffer);
      return { payloadType, typeName, decodedPayload, clientMsgId };
    }
    return { payloadType, payloadBytes, clientMsgId };
  }

  const socket = tls.connect({
    host: 'demo.ctraderapi.com',
    port: 5035,
    servername: 'demo.ctraderapi.com',
    rejectUnauthorized: false
  });

  let buffer = Buffer.alloc(0);
  const accountId = Number(process.env.CTRADER_ACCOUNT_ID);

  socket.on('secureConnect', () => {
    socket.write(encodeFrame(2100, 'ProtoOAApplicationAuthReq', {
      clientId: process.env.CTRADER_CLIENT_ID,
      clientSecret: process.env.CTRADER_CLIENT_SECRET
    }, 'app_1'));
  });

  const symbolMap: Record<number, string> = {
    1: 'EUR/USD',
    2: 'GBP/USD',
    3: 'EUR/JPY',
    4: 'USD/JPY',
    5: 'AUD/USD',
    6: 'USD/CHF',
    7: 'GBP/JPY',
    8: 'USD/CAD',
    12: 'NZD/USD',
    41: 'XAU/USD',
    22395: 'BTC/USD'
  };

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const len = buffer.readUInt32BE(0);
      if (buffer.length < 4 + len) break;
      const frameBytes = buffer.subarray(4, 4 + len);
      buffer = buffer.subarray(4 + len);

      const res = decodeFrame(frameBytes);
      if (res.payloadType === 2101) {
        socket.write(encodeFrame(2102, 'ProtoOAAccountAuthReq', {
          ctidTraderAccountId: accountId,
          accessToken: process.env.CTRADER_ACCESS_TOKEN
        }, 'acc_1'));
      } else if (res.payloadType === 2103) {
        socket.write(encodeFrame(2124, 'ProtoOAReconcileReq', {
          ctidTraderAccountId: accountId
        }, 'rec_1'));
      } else if (res.payloadType === 2125) {
        console.log('=== REAL CURRENT OPEN POSITIONS ON CTRADER ===');
        const pos = (res.decodedPayload as any)?.position || [];
        pos.forEach((p: any) => {
          const symId = p.tradeData?.symbolId;
          const symName = symbolMap[symId] || `Symbol #${symId}`;
          console.log(`- Position #${p.positionId} (${symName}) | Lots: ${p.tradeData?.volume / 10000000} | Entry: ${p.price} | SL: ${p.stopLoss || 'NONE'} | TP: ${p.takeProfit || 'NONE'}`);
        });
        socket.destroy();
        process.exit(0);
      }
    }
  });
}

checkPositions().catch(console.error);
