import * as protobuf from 'protobufjs';
import * as path from 'path';

export class CTraderProtoManager {
  private static root: protobuf.Root | null = null;

  public static async loadSchemas(): Promise<protobuf.Root> {
    if (!this.root) {
      const protoDir = path.resolve('src/integrations/ctrader/proto');
      const RootConstructor: any = (protobuf as any).Root || (protobuf as any).default?.Root || protobuf;
      const root = new RootConstructor();
      root.resolvePath = (origin: string, target: string) => path.join(protoDir, path.basename(target));
      root.loadSync([
        path.join(protoDir, 'OpenApiCommonModelMessages.proto'),
        path.join(protoDir, 'OpenApiCommonMessages.proto'),
        path.join(protoDir, 'OpenApiModelMessages.proto'),
        path.join(protoDir, 'OpenApiMessages.proto')
      ]);
      this.root = root;
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
      case 2110: messageTypeName = 'ProtoOAAmendPositionSLTPReq'; break;
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
      case 2127: messageTypeName = 'ProtoOASubscribeSpotsReq'; break;
      case 2128: messageTypeName = 'ProtoOASubscribeSpotsRes'; break;
      case 2129: messageTypeName = 'ProtoOAUnsubscribeSpotsReq'; break;
      case 2130: messageTypeName = 'ProtoOAUnsubscribeSpotsRes'; break;
      case 2131: messageTypeName = 'ProtoOASpotEvent'; break;
      case 2132: messageTypeName = 'ProtoOAOrderErrorEvent'; break;
      case 2133: messageTypeName = 'ProtoOADealListReq'; break;
      case 2134: messageTypeName = 'ProtoOADealListRes'; break;
      case 2135: messageTypeName = 'ProtoOASubscribeLiveTrendbarReq'; break;
      case 2136: messageTypeName = 'ProtoOAUnsubscribeLiveTrendbarReq'; break;
      case 2137: messageTypeName = 'ProtoOAGetTrendbarsReq'; break;
      case 2138: messageTypeName = 'ProtoOAGetTrendbarsRes'; break;
      case 2149: messageTypeName = 'ProtoOAGetAccountListByAccessTokenReq'; break;
      case 2150: messageTypeName = 'ProtoOAGetAccountListByAccessTokenRes'; break;
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
      case 2110: messageTypeName = 'ProtoOAAmendPositionSLTPReq'; break;
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
      case 2127: messageTypeName = 'ProtoOASubscribeSpotsReq'; break;
      case 2128: messageTypeName = 'ProtoOASubscribeSpotsRes'; break;
      case 2129: messageTypeName = 'ProtoOAUnsubscribeSpotsReq'; break;
      case 2130: messageTypeName = 'ProtoOAUnsubscribeSpotsRes'; break;
      case 2131: messageTypeName = 'ProtoOASpotEvent'; break;
      case 2132: messageTypeName = 'ProtoOAOrderErrorEvent'; break;
      case 2133: messageTypeName = 'ProtoOADealListReq'; break;
      case 2134: messageTypeName = 'ProtoOADealListRes'; break;
      case 2135: messageTypeName = 'ProtoOASubscribeLiveTrendbarReq'; break;
      case 2136: messageTypeName = 'ProtoOAUnsubscribeLiveTrendbarReq'; break;
      case 2137: messageTypeName = 'ProtoOAGetTrendbarsReq'; break;
      case 2138: messageTypeName = 'ProtoOAGetTrendbarsRes'; break;
      case 2149: messageTypeName = 'ProtoOAGetAccountListByAccessTokenReq'; break;
      case 2150: messageTypeName = 'ProtoOAGetAccountListByAccessTokenRes'; break;
      // Error response payload types — must be decoded explicitly
      case 50:    messageTypeName = 'ProtoErrorRes'; break;
      case 2142:  messageTypeName = 'ProtoOAErrorRes'; break;
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
        // Fallback: try ProtoOAErrorRes for any error-class payloads
        if (payloadType === 50 || payloadType === 2142) {
          try {
            const errTypeName = payloadType === 50 ? 'ProtoErrorRes' : 'ProtoOAErrorRes';
            const ErrType = root.lookupType(errTypeName);
            const decoded = ErrType.decode(payloadBytes);
            decodedPayload = ErrType.toObject(decoded, { longs: Number, enums: Number, defaults: true });
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
