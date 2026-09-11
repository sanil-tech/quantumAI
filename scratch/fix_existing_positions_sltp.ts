import 'dotenv/config';
import * as tls from 'tls';
import protobuf from 'protobufjs';
import * as path from 'path';

async function amendAllOpenPositions() {
  const protoDir = path.resolve('src/integrations/ctrader/proto');
  const RootClass = (protobuf as any).Root || (protobuf as any).default?.Root;
  const root = new RootClass();
  root.resolvePath = (o, t) => path.join(protoDir, path.basename(t));
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
      case 2126: typeName = 'ProtoOAExecutionEvent'; break;
      case 2142: case 50: typeName = 'ProtoOAErrorRes'; break;
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
    console.log('Connected! Sending AppAuth...');
    socket.write(encodeFrame(2100, 'ProtoOAApplicationAuthReq', {
      clientId: process.env.CTRADER_CLIENT_ID,
      clientSecret: process.env.CTRADER_CLIENT_SECRET
    }, 'app_1'));
  });

  socket.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const len = buffer.readUInt32BE(0);
      if (buffer.length < 4 + len) break;
      const frameBytes = buffer.subarray(4, 4 + len);
      buffer = buffer.subarray(4 + len);

      const res = decodeFrame(frameBytes);
      if (res.payloadType === 2101) {
        console.log('AppAuth OK, sending AccAuth...');
        socket.write(encodeFrame(2102, 'ProtoOAAccountAuthReq', {
          ctidTraderAccountId: accountId,
          accessToken: process.env.CTRADER_ACCESS_TOKEN
        }, 'acc_1'));
      } else if (res.payloadType === 2103) {
        console.log('AccAuth OK, querying Reconcile (2124)...');
        socket.write(encodeFrame(2124, 'ProtoOAReconcileReq', {
          ctidTraderAccountId: accountId
        }, 'rec_1'));
      } else if (res.payloadType === 2125) {
        const positions = (res.decodedPayload as any)?.position || [];
        console.log(`\nFound ${positions.length} active open positions in cTrader.`);

        for (const p of positions) {
          const symId = p.tradeData?.symbolId;
          const posId = p.positionId;
          const price = p.price || 1.0;
          const isBuy = p.tradeData?.tradeSide === 1;

          // EURUSD (symId 1): SL 25 pips (0.0025), TP 50 pips (0.0050)
          // GBPUSD (symId 2): SL 25 pips (0.0025), TP 50 pips (0.0050)
          const pipSize = 0.0001;
          const sl = isBuy ? Number((price - 25 * pipSize).toFixed(5)) : Number((price + 25 * pipSize).toFixed(5));
          const tp = isBuy ? Number((price + 50 * pipSize).toFixed(5)) : Number((price - 50 * pipSize).toFixed(5));

          console.log(`Setting SL/TP on Position #${posId} (Symbol ${symId}): Entry=${price}, SL=${sl}, TP=${tp}`);
          socket.write(encodeFrame(2110, 'ProtoOAAmendPositionSLTPReq', {
            ctidTraderAccountId: accountId,
            positionId: posId,
            stopLoss: sl,
            takeProfit: tp
          }, `amend_${posId}`));
        }

        setTimeout(() => {
          socket.destroy();
          console.log('Finished amending positions. Exiting.');
          process.exit(0);
        }, 2000);
      } else if (res.payloadType === 2126) {
        const pos = (res.decodedPayload as any)?.position;
        console.log(`[CONFIRMED] Position #${pos?.positionId} updated: SL=${pos?.stopLoss}, TP=${pos?.takeProfit}`);
      }
    }
  });
}

amendAllOpenPositions().catch(console.error);
