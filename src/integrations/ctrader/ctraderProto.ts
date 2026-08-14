import protobuf from 'protobufjs';
import path from 'path';

export class CTraderProtoManager {
  private static root: protobuf.Root | null = null;

  public static async loadSchemas(): Promise<protobuf.Root> {
    if (!this.root) {
      const protoDir = path.resolve('src/integrations/ctrader/proto');
      this.root = new protobuf.Root();
      this.root.resolvePath = (origin, target) => path.isAbsolute(target) ? target : path.join(protoDir, target);
      await this.root.load(path.join(protoDir, 'OpenApiModelMessages.proto'));
    }
    return this.root;
  }

  public static async encodeFrame(payloadType: number, payloadObj: any, clientMsgId?: string): Promise<Buffer> {
    const root = await this.loadSchemas();
    const ProtoMessage = root.lookupType('openapi.ProtoMessage');

    let payloadBuffer: Uint8Array = new Uint8Array(0);
    let messageTypeName = '';

    switch (payloadType) {
      case 2100: messageTypeName = 'openapi.ProtoOAApplicationAuthReq'; break;
      case 2102: messageTypeName = 'openapi.ProtoOAAccountAuthReq'; break;
      case 2114: messageTypeName = 'openapi.ProtoOASymbolsListReq'; break;
      case 2121: messageTypeName = 'openapi.ProtoOATraderReq'; break;
      case 2124: messageTypeName = 'openapi.ProtoOAReconcileReq'; break;
      default:
        throw new Error('UNSUPPORTED_PAYLOAD_TYPE');
    }

    const objWithPayloadType = { payloadType, ...payloadObj };
    const Type = root.lookupType(messageTypeName);
    const err = Type.verify(objWithPayloadType);
    if (err) throw new Error('PROTOBUF_VALIDATION_ERROR: ' + err);
    payloadBuffer = Type.encode(Type.create(objWithPayloadType)).finish();

    const wrapperObj = {
      payloadType,
      payload: payloadBuffer,
      clientMsgId
    };
    const wrapperBuffer = ProtoMessage.encode(ProtoMessage.create(wrapperObj)).finish();

    const frame = Buffer.alloc(4 + wrapperBuffer.length);
    frame.writeUInt32BE(wrapperBuffer.length, 0);
    Buffer.from(wrapperBuffer).copy(frame, 4);
    return frame;
  }

  public static async decodeFrame(buffer: Buffer): Promise<{ payloadType: number; decodedPayload: any; clientMsgId?: string }> {
    const root = await this.loadSchemas();
    const ProtoMessage = root.lookupType('openapi.ProtoMessage');
    const message = ProtoMessage.decode(buffer) as any;

    const payloadType = message.payloadType;
    const payloadBytes = message.payload;
    const clientMsgId = message.clientMsgId;

    let decodedPayload: any = null;
    switch (payloadType) {
      case 2101: decodedPayload = root.lookupType('openapi.ProtoOAApplicationAuthRes').decode(payloadBytes); break;
      case 2103: decodedPayload = root.lookupType('openapi.ProtoOAAccountAuthRes').decode(payloadBytes); break;
      case 2115: decodedPayload = root.lookupType('openapi.ProtoOASymbolsListRes').decode(payloadBytes); break;
      case 2122: decodedPayload = root.lookupType('openapi.ProtoOATraderRes').decode(payloadBytes); break;
      case 2125: decodedPayload = root.lookupType('openapi.ProtoOAReconcileRes').decode(payloadBytes); break;
      case 2142: decodedPayload = root.lookupType('openapi.ProtoOAErrorRes').decode(payloadBytes); break;
      default:
        decodedPayload = { rawBytes: payloadBytes };
        break;
    }

    return { payloadType, decodedPayload, clientMsgId };
  }
}
