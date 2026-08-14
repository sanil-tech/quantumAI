import tls from 'tls';
import { CTraderProtoManager } from './ctraderProto';

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
}

export class CTraderTransport {
  private socket: tls.TLSSocket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestCounter: number = 0;

  async connect(host: string, port: number, timeoutMs: number = 10000): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.socket) this.socket.destroy();
        reject(new Error('CTRADER_TRANSPORT_TIMEOUT: Connection timeout after ' + timeoutMs + 'ms'));
      }, timeoutMs);

      this.socket = tls.connect({ host, port, rejectUnauthorized: true }, () => {
        clearTimeout(timer);
        resolve(true);
      });

      this.socket.on('data', (chunk: Buffer) => this.handleData(chunk));
      this.socket.on('error', (err) => {
        clearTimeout(timer);
        this.rejectAll(err);
      });
      this.socket.on('close', () => {
        this.rejectAll(new Error('CTRADER_SOCKET_CLOSED: Socket connection closed.'));
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.rejectAll(new Error('CTRADER_DISCONNECTED: Client disconnected.'));
  }

  async sendRequest(payloadType: number, payloadObj: any, timeoutMs: number = 10000): Promise<{ payloadType: number; decodedPayload: any; clientMsgId?: string }> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('CTRADER_TRANSPORT_DISCONNECTED: Cannot send request on disconnected socket.');
    }

    const clientMsgId = 'req_' + Date.now() + '_' + (++this.requestCounter);
    const frame = await CTraderProtoManager.encodeFrame(payloadType, payloadObj, clientMsgId);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(clientMsgId);
        reject(new Error('CTRADER_REQUEST_TIMEOUT: Request timed out for ' + clientMsgId));
      }, timeoutMs);

      this.pendingRequests.set(clientMsgId, { resolve, reject, timer });
      this.socket!.write(frame);
    });
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 4) {
      const messageLength = this.buffer.readUInt32BE(0);
      if (messageLength > 10 * 1024 * 1024) {
        this.rejectAll(new Error('CTRADER_FRAMING_ERROR: Message length exceeds 10MB limit.'));
        if (this.socket) this.socket.destroy();
        return;
      }

      if (this.buffer.length < 4 + messageLength) {
        break;
      }

      const frameBytes = this.buffer.subarray(4, 4 + messageLength);
      this.buffer = this.buffer.subarray(4 + messageLength);

      CTraderProtoManager.decodeFrame(frameBytes)
        .then((res) => {
          if (res.clientMsgId && this.pendingRequests.has(res.clientMsgId)) {
            const pending = this.pendingRequests.get(res.clientMsgId)!;
            clearTimeout(pending.timer);
            this.pendingRequests.delete(res.clientMsgId);
            pending.resolve(res);
          }
        })
        .catch((err) => {
          console.error('[CTRADER_TRANSPORT_DECODE_ERROR]', err.message);
        });
    }
  }

  private rejectAll(err: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }
}
