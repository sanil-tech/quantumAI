import * as protobuf from 'protobufjs';
import * as path from 'path';

export class CTraderProtoManager {
  private static root: protobuf.Root | null = null;

  public static async loadSchemas(): Promise<protobuf.Root> {
    if (!this.root) {
      const protoDir = path.resolve('src/integrations/ctrader/proto');
      const RootConstructor: any = protobuf.Root || (protobuf as any).default?.Root;
      this.root = new RootConstructor();
      this.root.resolvePath = (origin: string, target: string) => path.isAbsolute(target) ? target : path.join(protoDir, target);
      await this.root.load([
        path.join(protoDir, 'OpenApiCommonMessages.proto'),
        path.join(protoDir, 'OpenApiMessages.proto')
      ]);

      // Provide backward compatibility for lookups with or without openapi. namespace
      if (!this.root.nested?.['openapi']) {
        const openapiNs = this.root.define('openapi');
        for (const [key, type] of Object.entries(this.root.nested || {})) {
          if (key !== 'openapi') {
            openapiNs.add(type);
          }
        }
      }
    }
    return this.root;
  }

  public static async encodeFrame(payloadType: number, payloadObj: any, clientMsgId?: string): Promise<Buffer> {
    const root = await this.loadSchemas();
    const ProtoMessage = root.lookupType('ProtoMessage');

    let messageTypeName = '';
    switch (payloadType) {
      case 2100: messageTypeName = 'ProtoOAApplicationAuthReq'; break;
      case 2101: messageTypeName = 'ProtoOAApplicationAuthRes'; break;
      case 2102: messageTypeName = 'ProtoOAAccountAuthReq'; break;
      case 2103: messageTypeName = 'ProtoOAAccountAuthRes'; break;
      case 2104: messageTypeName = 'ProtoOAVersionReq'; break;
      case 2105: messageTypeName = 'ProtoOAVersionRes'; break;
      case 2106: messageTypeName = 'ProtoOANewOrderReq'; break;
      case 2108: messageTypeName = 'ProtoOACancelOrderReq'; break;
      case 2109: messageTypeName = 'ProtoOAAmendOrderReq'; break;
      case 2111: messageTypeName = 'ProtoOAClosePositionReq'; break;
      case 2114: messageTypeName = 'ProtoOASymbolsListReq'; break;
      case 2115: messageTypeName = 'ProtoOASymbolsListRes'; break;
      case 2116: messageTypeName = 'ProtoOASymbolByIdReq'; break;
      case 2117: messageTypeName = 'ProtoOASymbolByIdRes'; break;
      case 2118: messageTypeName = 'ProtoOASymbolsForConversionReq'; break;
      case 2119: messageTypeName = 'ProtoOASymbolsForConversionRes'; break;
      case 2121: messageTypeName = 'ProtoOATraderReq'; break;
      case 2122: messageTypeName = 'ProtoOATraderRes'; break;
      case 2124: messageTypeName = 'ProtoOAReconcileReq'; break;
      case 2125: messageTypeName = 'ProtoOAReconcileRes'; break;
      case 2126: messageTypeName = 'ProtoOAExecutionEvent'; break;
      case 2132: messageTypeName = 'ProtoOAOrderErrorEvent'; break;
      case 2142:
      case 50:
        messageTypeName = 'ProtoOAErrorRes'; break;
      default:
        throw new Error(`UNSUPPORTED_PAYLOAD_TYPE: ${payloadType}`);
    }

    // Support both ctidTraderAccountId and legacy cTraderAccountId parameter for backward compatibility
    const normalizedPayload = { ...payloadObj };
    if (normalizedPayload.cTraderAccountId !== undefined && normalizedPayload.ctidTraderAccountId === undefined) {
      normalizedPayload.ctidTraderAccountId = normalizedPayload.cTraderAccountId;
    }

    let payloadBuffer: Uint8Array = new Uint8Array(0);
    const Type = root.lookupType(messageTypeName);
    const objWithPayloadType = {
      ...normalizedPayload,
      payloadType
    };

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

  public static async decodeFrame(frameBytes: Buffer): Promise<{ payloadType: number; decodedPayload: any; clientMsgId?: string }> {
    const root = await this.loadSchemas();
    const ProtoMessage = root.lookupType('ProtoMessage');
    const message = ProtoMessage.decode(frameBytes) as any;

    const payloadType = message.payloadType;
    const payloadBytes = message.payload;
    const clientMsgId = message.clientMsgId;

    let messageTypeName = '';
    switch (payloadType) {
      case 2100: messageTypeName = 'ProtoOAApplicationAuthReq'; break;
      case 2101: messageTypeName = 'ProtoOAApplicationAuthRes'; break;
      case 2102: messageTypeName = 'ProtoOAAccountAuthReq'; break;
      case 2103: messageTypeName = 'ProtoOAAccountAuthRes'; break;
      case 2104: messageTypeName = 'ProtoOAVersionReq'; break;
      case 2105: messageTypeName = 'ProtoOAVersionRes'; break;
      case 2106: messageTypeName = 'ProtoOANewOrderReq'; break;
      case 2108: messageTypeName = 'ProtoOACancelOrderReq'; break;
      case 2109: messageTypeName = 'ProtoOAAmendOrderReq'; break;
      case 2111: messageTypeName = 'ProtoOAClosePositionReq'; break;
      case 2114: messageTypeName = 'ProtoOASymbolsListReq'; break;
      case 2115: messageTypeName = 'ProtoOASymbolsListRes'; break;
      case 2116: messageTypeName = 'ProtoOASymbolByIdReq'; break;
      case 2117: messageTypeName = 'ProtoOASymbolByIdRes'; break;
      case 2118: messageTypeName = 'ProtoOASymbolsForConversionReq'; break;
      case 2119: messageTypeName = 'ProtoOASymbolsForConversionRes'; break;
      case 2121: messageTypeName = 'ProtoOATraderReq'; break;
      case 2122: messageTypeName = 'ProtoOATraderRes'; break;
      case 2124: messageTypeName = 'ProtoOAReconcileReq'; break;
      case 2125: messageTypeName = 'ProtoOAReconcileRes'; break;
      case 2126: messageTypeName = 'ProtoOAExecutionEvent'; break;
      case 2132: messageTypeName = 'ProtoOAOrderErrorEvent'; break;
      case 2142:
      case 50:
        messageTypeName = 'ProtoOAErrorRes'; break;
      default:
        break;
    }

    let decodedPayload: any = null;
    if (messageTypeName) {
      try {
        const Type = root.lookupType(messageTypeName);
        const decoded = Type.decode(payloadBytes);
        decodedPayload = Type.toObject(decoded, { longs: Number, enums: Number, defaults: true });
      } catch {
        if (payloadType === 50) {
          try {
            const Type = root.lookupType('ProtoErrorRes');
            const decoded = Type.decode(payloadBytes);
            decodedPayload = Type.toObject(decoded, { longs: Number, enums: Number, defaults: true });
          } catch {
            decodedPayload = { rawBytes: payloadBytes };
          }
        } else {
          decodedPayload = { rawBytes: payloadBytes };
        }
      }
    } else {
      decodedPayload = { rawBytes: payloadBytes };
    }

    return { payloadType, decodedPayload, clientMsgId };
  }
}
