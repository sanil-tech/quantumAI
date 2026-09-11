import { EventEmitter } from 'events';
import { CTraderProtoManager } from '../../src/integrations/ctrader/ctraderProto';

export interface SimulatedOrderRequest {
  ctidTraderAccountId: number;
  symbolId: number;
  orderType: number;
  tradeSide: number;
  volume: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
  label?: string;
  clientOrderId?: string;
  clientMsgId?: string;
}

export interface SimulatorExecutionLog {
  timestamp: number;
  action: string;
  payloadType?: number;
  clientMsgId?: string;
  details?: any;
}

export class CTraderDemoSimulator extends EventEmitter {
  public static readonly SIMULATOR_ENVIRONMENT = 'DEMO_SIMULATOR';
  public readonly ordersTransmitted: number = 0; // Strictly 0: no real broker orders transmitted

  private isConnectedState: boolean = false;
  private recordedLogs: SimulatorExecutionLog[] = [];
  private openPositions: Map<number, any> = new Map();
  private processedCommands: Set<string> = new Set();
  private processedClientMsgIds: Set<string> = new Set();

  // Configurable behaviors
  public behavior: 'FILL_IMMEDIATE' | 'ACCEPT_ONLY' | 'REJECT' | 'TIMEOUT' | 'DISCONNECT' | 'UNKNOWN' | 'PARTIAL_FILL' = 'FILL_IMMEDIATE';
  public rejectErrorCode: string = 'TRADING_BAD_VOLUME';
  public rejectDescription: string = 'Simulated order volume rejected';
  public partialFillRatio: number = 0.5;
  public nextOrderId: number = 70001;
  public nextPositionId: number = 80001;
  public nextDealId: number = 90001;

  constructor() {
    super();
  }

  public isConnected(): boolean {
    return this.isConnectedState;
  }

  public async connect(): Promise<boolean> {
    this.isConnectedState = true;
    this.recordLog('SIMULATOR_CONNECTED', { environment: CTraderDemoSimulator.SIMULATOR_ENVIRONMENT });
    return true;
  }

  public async disconnect(): Promise<void> {
    this.isConnectedState = false;
    this.recordLog('SIMULATOR_DISCONNECTED');
  }

  public recordLog(action: string, details?: any, payloadType?: number, clientMsgId?: string): void {
    this.recordedLogs.push({
      timestamp: Date.now(),
      action,
      payloadType,
      clientMsgId,
      details
    });
  }

  public getLogs(): SimulatorExecutionLog[] {
    return [...this.recordedLogs];
  }

  public clearLogs(): void {
    this.recordedLogs = [];
  }

  public getOpenPositions(): any[] {
    return Array.from(this.openPositions.values());
  }

  public setOpenPositions(positions: any[]): void {
    this.openPositions.clear();
    for (const p of positions) {
      this.openPositions.set(p.positionId, { ...p });
    }
  }

  public isCommandProcessed(commandId: string): boolean {
    return this.processedCommands.has(commandId);
  }

  public markCommandProcessed(commandId: string): void {
    this.processedCommands.add(commandId);
  }

  /**
   * Process a simulated request and return a deterministic encoded/decoded protobuf response.
   */
  public async handleSimulatedRequest(
    payloadType: number,
    payloadObj: any,
    clientMsgId?: string
  ): Promise<{ payloadType: number; decodedPayload: any; clientMsgId?: string }> {
    this.recordLog('REQUEST_RECEIVED', payloadObj, payloadType, clientMsgId);

    // Duplicate message detection
    if (clientMsgId && this.processedClientMsgIds.has(clientMsgId)) {
      this.recordLog('DUPLICATE_CLIENT_MSG_ID_DETECTED', { clientMsgId });
    }
    if (clientMsgId) {
      this.processedClientMsgIds.add(clientMsgId);
    }

    // 1. Application Auth (2100) -> 2101
    if (payloadType === 2100) {
      const res = {
        payloadType: 2101,
        decodedPayload: { cTraderCentralAccountAuthRes: true },
        clientMsgId
      };
      this.recordLog('APPLICATION_AUTH_RES_EMITTED', res.decodedPayload, 2101, clientMsgId);
      return res;
    }

    // 2. Account Auth (2102) -> 2103
    if (payloadType === 2102) {
      const res = {
        payloadType: 2103,
        decodedPayload: { ctidTraderAccountId: payloadObj.ctidTraderAccountId },
        clientMsgId
      };
      this.recordLog('ACCOUNT_AUTH_RES_EMITTED', res.decodedPayload, 2103, clientMsgId);
      return res;
    }

    // 3. Reconcile (2124) -> 2125
    if (payloadType === 2124) {
      const res = {
        payloadType: 2125,
        decodedPayload: {
          ctidTraderAccountId: payloadObj.ctidTraderAccountId,
          position: this.getOpenPositions(),
          order: []
        },
        clientMsgId
      };
      this.recordLog('RECONCILE_RES_EMITTED', res.decodedPayload, 2125, clientMsgId);
      return res;
    }

    // 4. New Order Req (2106)
    if (payloadType === 2106) {
      if (this.behavior === 'TIMEOUT') {
        this.recordLog('SIMULATED_TIMEOUT');
        throw new Error('SIMULATOR_TIMEOUT: Request timed out without broker acknowledgement');
      }

      if (this.behavior === 'DISCONNECT') {
        this.isConnectedState = false;
        this.recordLog('SIMULATED_SOCKET_DISCONNECT');
        throw new Error('SIMULATOR_DISCONNECT: Socket disconnected during transmission');
      }

      if (this.behavior === 'UNKNOWN') {
        this.recordLog('SIMULATED_UNKNOWN_STATE_ENTERED');
        throw new Error('TRANSMISSION_UNKNOWN: Request sent but broker response cannot be determined');
      }

      if (this.behavior === 'REJECT') {
        const res = {
          payloadType: 2132,
          decodedPayload: {
            ctidTraderAccountId: payloadObj.ctidTraderAccountId,
            errorCode: this.rejectErrorCode,
            description: this.rejectDescription
          },
          clientMsgId
        };
        this.recordLog('ORDER_ERROR_EVENT_EMITTED', res.decodedPayload, 2132, clientMsgId);
        return res;
      }

      if (this.behavior === 'ACCEPT_ONLY') {
        const orderId = this.nextOrderId++;
        const res = {
          payloadType: 2126,
          decodedPayload: {
            ctidTraderAccountId: payloadObj.ctidTraderAccountId,
            executionType: 2, // ORDER_ACCEPTED
            order: {
              orderId,
              tradeSide: payloadObj.tradeSide,
              symbolId: payloadObj.symbolId,
              volume: payloadObj.volume,
              orderStatus: 1
            }
          },
          clientMsgId
        };
        this.recordLog('ORDER_ACCEPTED_EVENT_EMITTED', res.decodedPayload, 2126, clientMsgId);
        return res;
      }

      if (this.behavior === 'PARTIAL_FILL') {
        const orderId = this.nextOrderId++;
        const positionId = this.nextPositionId++;
        const dealId = this.nextDealId++;
        const filledVolume = Math.round(payloadObj.volume * this.partialFillRatio);

        const newPos = {
          positionId,
          symbolId: payloadObj.symbolId,
          tradeSide: payloadObj.tradeSide,
          volume: filledVolume,
          entryPrice: payloadObj.price || 1.08320
        };
        this.openPositions.set(positionId, newPos);

        const res = {
          payloadType: 2126,
          decodedPayload: {
            ctidTraderAccountId: payloadObj.ctidTraderAccountId,
            executionType: 3, // ORDER_FILLED (partial)
            order: { orderId, volume: payloadObj.volume, orderStatus: 1 },
            deal: { dealId, filledVolume, executionPrice: payloadObj.price || 1.08320 },
            position: newPos
          },
          clientMsgId
        };
        this.recordLog('PARTIAL_FILL_EVENT_EMITTED', res.decodedPayload, 2126, clientMsgId);
        return res;
      }

      // Default: FILL_IMMEDIATE
      const orderId = this.nextOrderId++;
      const positionId = this.nextPositionId++;
      const dealId = this.nextDealId++;

      const newPos = {
        positionId,
        symbolId: payloadObj.symbolId,
        tradeSide: payloadObj.tradeSide,
        volume: payloadObj.volume,
        entryPrice: payloadObj.price || 1.08320
      };
      this.openPositions.set(positionId, newPos);

      const res = {
        payloadType: 2126,
        decodedPayload: {
          ctidTraderAccountId: payloadObj.ctidTraderAccountId,
          executionType: 3, // ORDER_FILLED
          order: { orderId, volume: payloadObj.volume, orderStatus: 1 },
          deal: { dealId, filledVolume: payloadObj.volume, executionPrice: payloadObj.price || 1.08320 },
          position: newPos
        },
        clientMsgId
      };
      this.recordLog('ORDER_FILLED_EVENT_EMITTED', res.decodedPayload, 2126, clientMsgId);
      return res;
    }

    // Close Position (2111) -> 2126
    if (payloadType === 2111) {
      const positionId = payloadObj.positionId;
      this.openPositions.delete(positionId);
      const res = {
        payloadType: 2126,
        decodedPayload: {
          ctidTraderAccountId: payloadObj.ctidTraderAccountId,
          executionType: 3,
          position: { positionId, volume: 0 }
        },
        clientMsgId
      };
      this.recordLog('POSITION_CLOSED_EVENT_EMITTED', res.decodedPayload, 2126, clientMsgId);
      return res;
    }

    throw new Error(`SIMULATOR_UNHANDLED_PAYLOAD_TYPE: ${payloadType}`);
  }
}
