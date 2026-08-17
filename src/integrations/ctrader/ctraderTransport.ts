import * as tls from 'tls';
import { EventEmitter } from 'events';
import { CTraderProtoManager } from './ctraderProto';

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
  createdAt: number;
  clientMsgId: string;
  clientOrderId?: string;
  expectedPayloadType?: number;
}

export type CorrelationKeyType = 'clientMsgId' | 'clientOrderId' | 'orderId' | 'positionId' | 'dealId' | 'UNCORRELATED';

export interface ExecutionCorrelation {
  correlated: boolean;
  correlationKey: CorrelationKeyType;
  clientMsgId?: string;
  clientOrderId?: string;
  orderId?: string;
  positionId?: string;
  dealId?: string;
  executionType: number;
  executionTypeName: string;
}

export interface ExtractedExecutionEvent {
  ctidTraderAccountId?: number;
  executionType: number;
  executionTypeName: string;
  order?: any;
  position?: any;
  deal?: any;
  errorCode?: string;
  isServerEvent?: boolean;
  correlation: ExecutionCorrelation;
  rawPayload: any;
  timestamp: Date;
}

export interface ExtractedOrderErrorEvent {
  ctidTraderAccountId?: number;
  errorCode: string;
  orderId?: number;
  positionId?: number;
  description?: string;
  clientMsgId?: string;
  rawPayload: any;
  timestamp: Date;
}

export class CTraderTransport extends EventEmitter {
  private socket: tls.TLSSocket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private orderIdToClientMsgId: Map<string, string> = new Map();
  private clientOrderIdToClientMsgId: Map<string, string> = new Map();
  private processedEvents: Map<string, number> = new Map(); // Event signature -> timestamp
  private requestCounter: number = 0;

  // Maximum processed event cache size before pruning
  private static readonly MAX_EVENT_CACHE_SIZE = 1000;
  private static readonly EVENT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  sendRequest(
    payloadType: number,
    payloadObj: any,
    timeoutMs: number = 10000,
    customClientMsgId?: string
  ): Promise<{ payloadType: number; decodedPayload: any; clientMsgId?: string }> {
    if (!this.socket || this.socket.destroyed) {
      return Promise.reject(new Error('CTRADER_TRANSPORT_DISCONNECTED: Cannot send request on disconnected socket.'));
    }

    const clientMsgId = customClientMsgId || ('req_' + Date.now() + '_' + (++this.requestCounter));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cleanupPendingRequest(clientMsgId);
        reject(new Error('CTRADER_REQUEST_TIMEOUT: Request timed out for ' + clientMsgId));
      }, timeoutMs);

      const pending: PendingRequest = {
        resolve,
        reject,
        timer,
        createdAt: Date.now(),
        clientMsgId,
        clientOrderId: payloadObj?.clientOrderId,
        expectedPayloadType: payloadType === 2106 || payloadType === 2111 ? 2126 : undefined
      };

      this.pendingRequests.set(clientMsgId, pending);

      if (payloadObj?.clientOrderId) {
        this.clientOrderIdToClientMsgId.set(payloadObj.clientOrderId, clientMsgId);
      }

      CTraderProtoManager.encodeFrame(payloadType, payloadObj, clientMsgId)
        .then((frame) => {
          if (!this.socket || this.socket.destroyed) {
            this.cleanupPendingRequest(clientMsgId);
            reject(new Error('CTRADER_DISCONNECTED: Client disconnected.'));
            return;
          }
          this.socket.write(frame);
        })
        .catch((err) => {
          this.cleanupPendingRequest(clientMsgId);
          reject(err);
        });
    });
  }

  public handleData(chunk: Buffer): void {
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
          this.dispatchIncomingMessage(res);
        })
        .catch((err) => {
          console.error('[CTRADER_TRANSPORT_DECODE_ERROR]', err.message);
          this.emit('decodeError', err);
        });
    }
  }

  public dispatchIncomingMessage(res: { payloadType: number; decodedPayload: any; clientMsgId?: string }): void {
    const { payloadType, decodedPayload, clientMsgId } = res;
    this.emit('payload', payloadType, decodedPayload, clientMsgId);

    // 1. Handle Execution Events (2126)
    if (payloadType === 2126) {
      this.handleExecutionEvent(decodedPayload, clientMsgId);
      return;
    }

    // 2. Handle Order Error Events (2132)
    if (payloadType === 2132) {
      this.handleOrderErrorEvent(decodedPayload, clientMsgId);
      return;
    }

    // 3. Handle Generic Error Responses (50 / 2142)
    if (payloadType === 50 || payloadType === 2142) {
      this.handleErrorResponse(decodedPayload, clientMsgId);
      return;
    }

    // 4. Handle Direct Request-Response messages (e.g. 2101, 2103, 2115, 2122, 2125)
    if (clientMsgId && this.pendingRequests.has(clientMsgId)) {
      const pending = this.pendingRequests.get(clientMsgId)!;
      this.cleanupPendingRequest(clientMsgId);
      pending.resolve(res);
      return;
    }

    // Unhandled / Uncorrelated Informational Message
    this.emit('unhandledMessage', res);
  }

  public handleExecutionEvent(decodedPayload: any, clientMsgId?: string): ExtractedExecutionEvent {
    const execType = Number(decodedPayload.executionType);
    const execTypeName = this.getExecutionTypeName(execType);

    // Correlation resolution
    const correlation = this.correlateExecutionEvent(decodedPayload, clientMsgId);

    const eventRecord: ExtractedExecutionEvent = {
      ctidTraderAccountId: decodedPayload.ctidTraderAccountId ? Number(decodedPayload.ctidTraderAccountId) : undefined,
      executionType: execType,
      executionTypeName: execTypeName,
      order: decodedPayload.order,
      position: decodedPayload.position,
      deal: decodedPayload.deal,
      errorCode: decodedPayload.errorCode,
      isServerEvent: decodedPayload.isServerEvent,
      correlation,
      rawPayload: decodedPayload,
      timestamp: new Date()
    };

    // Maintain orderId -> clientMsgId lookup for multi-leg execution events
    if (decodedPayload.order && decodedPayload.order.orderId && correlation.clientMsgId) {
      this.orderIdToClientMsgId.set(decodedPayload.order.orderId.toString(), correlation.clientMsgId);
    }

    // Duplicate event detection (Idempotency)
    const eventSignature = this.computeEventSignature(decodedPayload);
    const isDuplicate = this.isDuplicateEvent(eventSignature);

    if (isDuplicate) {
      this.emit('duplicateExecutionEvent', eventRecord);
      return eventRecord;
    }

    this.recordProcessedEvent(eventSignature);

    // Settle correlated pending requests if present
    if (correlation.correlated && correlation.clientMsgId && this.pendingRequests.has(correlation.clientMsgId)) {
      const pending = this.pendingRequests.get(correlation.clientMsgId)!;

      if (execType === 7 || execType === 8) {
        // ORDER_REJECTED (7) or ORDER_CANCEL_REJECTED (8)
        this.cleanupPendingRequest(correlation.clientMsgId);
        pending.reject(new Error(`CTRADER_ORDER_REJECTED: Execution rejected (${execTypeName}): ${decodedPayload.errorCode || 'UNKNOWN_ERROR'}`));
      } else if (execType === 2 || execType === 3 || execType === 11) {
        // ORDER_ACCEPTED (2), ORDER_FILLED (3), ORDER_PARTIAL_FILL (11)
        this.cleanupPendingRequest(correlation.clientMsgId);
        pending.resolve({
          payloadType: 2126,
          decodedPayload,
          clientMsgId: correlation.clientMsgId,
          executionEvent: eventRecord
        });
      }
    }

    this.emit('execution', eventRecord);

    if (!correlation.correlated) {
      this.emit('uncorrelatedExecution', eventRecord);
    }

    return eventRecord;
  }

  public handleOrderErrorEvent(decodedPayload: any, clientMsgId?: string): ExtractedOrderErrorEvent {
    const errorRecord: ExtractedOrderErrorEvent = {
      ctidTraderAccountId: decodedPayload.ctidTraderAccountId ? Number(decodedPayload.ctidTraderAccountId) : undefined,
      errorCode: decodedPayload.errorCode || 'UNKNOWN_ERROR',
      orderId: decodedPayload.orderId ? Number(decodedPayload.orderId) : undefined,
      positionId: decodedPayload.positionId ? Number(decodedPayload.positionId) : undefined,
      description: decodedPayload.description,
      clientMsgId,
      rawPayload: decodedPayload,
      timestamp: new Date()
    };

    // Settle correlated pending request with rejection
    let resolvedClientMsgId = clientMsgId;
    if (!resolvedClientMsgId && errorRecord.orderId) {
      resolvedClientMsgId = this.orderIdToClientMsgId.get(errorRecord.orderId.toString());
    }

    if (resolvedClientMsgId && this.pendingRequests.has(resolvedClientMsgId)) {
      const pending = this.pendingRequests.get(resolvedClientMsgId)!;
      this.cleanupPendingRequest(resolvedClientMsgId);
      pending.reject(new Error(`CTRADER_ORDER_ERROR: ${errorRecord.errorCode} - ${errorRecord.description || 'No description'}`));
    }

    this.emit('orderError', errorRecord);
    return errorRecord;
  }

  public handleErrorResponse(decodedPayload: any, clientMsgId?: string): void {
    const errorCode = decodedPayload.errorCode || 'UNKNOWN_ERROR';
    const description = decodedPayload.description || 'Error occurred';

    if (clientMsgId && this.pendingRequests.has(clientMsgId)) {
      const pending = this.pendingRequests.get(clientMsgId)!;
      this.cleanupPendingRequest(clientMsgId);
      pending.reject(new Error(`CTRADER_ERROR_RES: ${errorCode} - ${description}`));
    }

    this.emit('errorResponse', { errorCode, description, clientMsgId, rawPayload: decodedPayload });
  }

  private correlateExecutionEvent(decodedPayload: any, directClientMsgId?: string): ExecutionCorrelation {
    const execType = Number(decodedPayload.executionType);
    const execTypeName = this.getExecutionTypeName(execType);

    // 1. Direct clientMsgId from framing envelope
    if (directClientMsgId && this.pendingRequests.has(directClientMsgId)) {
      return {
        correlated: true,
        correlationKey: 'clientMsgId',
        clientMsgId: directClientMsgId,
        orderId: decodedPayload.order?.orderId?.toString(),
        positionId: decodedPayload.position?.positionId?.toString(),
        dealId: decodedPayload.deal?.dealId?.toString(),
        executionType: execType,
        executionTypeName: execTypeName
      };
    }

    // 2. Correlation via nested clientOrderId on Order
    const clientOrderId = decodedPayload.order?.clientOrderId;
    if (clientOrderId && this.clientOrderIdToClientMsgId.has(clientOrderId)) {
      const mappedMsgId = this.clientOrderIdToClientMsgId.get(clientOrderId)!;
      return {
        correlated: true,
        correlationKey: 'clientOrderId',
        clientMsgId: mappedMsgId,
        clientOrderId,
        orderId: decodedPayload.order?.orderId?.toString(),
        positionId: decodedPayload.position?.positionId?.toString(),
        dealId: decodedPayload.deal?.dealId?.toString(),
        executionType: execType,
        executionTypeName: execTypeName
      };
    }

    // 3. Correlation via known orderId
    const orderId = decodedPayload.order?.orderId?.toString() || decodedPayload.deal?.orderId?.toString();
    if (orderId && this.orderIdToClientMsgId.has(orderId)) {
      const mappedMsgId = this.orderIdToClientMsgId.get(orderId)!;
      return {
        correlated: true,
        correlationKey: 'orderId',
        clientMsgId: mappedMsgId,
        orderId,
        positionId: decodedPayload.position?.positionId?.toString(),
        dealId: decodedPayload.deal?.dealId?.toString(),
        executionType: execType,
        executionTypeName: execTypeName
      };
    }

    // 4. If direct clientMsgId was provided but pending request already completed or untracked
    if (directClientMsgId) {
      return {
        correlated: true,
        correlationKey: 'clientMsgId',
        clientMsgId: directClientMsgId,
        orderId,
        positionId: decodedPayload.position?.positionId?.toString(),
        dealId: decodedPayload.deal?.dealId?.toString(),
        executionType: execType,
        executionTypeName: execTypeName
      };
    }

    // 5. UNCORRELATED
    return {
      correlated: false,
      correlationKey: 'UNCORRELATED',
      orderId,
      positionId: decodedPayload.position?.positionId?.toString(),
      dealId: decodedPayload.deal?.dealId?.toString(),
      executionType: execType,
      executionTypeName: execTypeName
    };
  }

  public getExecutionTypeName(executionType: number): string {
    switch (executionType) {
      case 2: return 'ORDER_ACCEPTED';
      case 3: return 'ORDER_FILLED';
      case 4: return 'ORDER_REPLACED';
      case 5: return 'ORDER_CANCELLED';
      case 6: return 'ORDER_EXPIRED';
      case 7: return 'ORDER_REJECTED';
      case 8: return 'ORDER_CANCEL_REJECTED';
      case 9: return 'SWAP';
      case 10: return 'DEPOSIT_WITHDRAW';
      case 11: return 'ORDER_PARTIAL_FILL';
      case 12: return 'BONUS_DEPOSIT_WITHDRAW';
      default: return `UNKNOWN_EXECUTION_TYPE_${executionType}`;
    }
  }

  private computeEventSignature(payload: any): string {
    const dealId = payload.deal?.dealId?.toString() || '0';
    const orderId = payload.order?.orderId?.toString() || '0';
    const positionId = payload.position?.positionId?.toString() || '0';
    const execType = payload.executionType || '0';
    const timestamp = payload.deal?.executionTimestamp || payload.order?.utcLastUpdateTimestamp || '0';
    return `${dealId}_${orderId}_${positionId}_${execType}_${timestamp}`;
  }

  private isDuplicateEvent(signature: string): boolean {
    if (!signature || signature === '0_0_0_0_0') return false;
    const existing = this.processedEvents.get(signature);
    if (!existing) return false;
    return (Date.now() - existing) < CTraderTransport.EVENT_CACHE_TTL_MS;
  }

  private recordProcessedEvent(signature: string): void {
    if (!signature || signature === '0_0_0_0_0') return;
    this.processedEvents.set(signature, Date.now());

    // Prune cache if over capacity
    if (this.processedEvents.size > CTraderTransport.MAX_EVENT_CACHE_SIZE) {
      const now = Date.now();
      this.processedEvents.forEach((time, sig) => {
        if (now - time > CTraderTransport.EVENT_CACHE_TTL_MS) {
          this.processedEvents.delete(sig);
        }
      });
    }
  }

  private cleanupPendingRequest(clientMsgId: string): void {
    if (this.pendingRequests.has(clientMsgId)) {
      const pending = this.pendingRequests.get(clientMsgId)!;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(clientMsgId);

      if (pending.clientOrderId) {
        this.clientOrderIdToClientMsgId.delete(pending.clientOrderId);
      }
    }
  }

  private rejectAll(err: Error): void {
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(err);
    });
    this.pendingRequests.clear();
    this.orderIdToClientMsgId.clear();
    this.clientOrderIdToClientMsgId.clear();
  }
}
