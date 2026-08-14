import { CTraderConfig } from '@iati/core-types';
import { BrokerAdapter } from './brokerAdapter';
import { Order, ExecutionReport, Position, AccountStatus } from '@iati/core-types';
import { CTraderTransport } from '../../../../src/integrations/ctrader/ctraderTransport';

export interface ProtoBufSourceMetadata {
  message: string;
  payloadType: number;
  clientMsgId?: string;
  receivedFrom?: string;
  verified: boolean;
}

export class CTraderAdapter implements BrokerAdapter {
  public id = 'ctrader-broker-01';
  public name = 'cTrader Open API Broker Adapter';

  private connected: boolean = false;
  private transport: CTraderTransport = new CTraderTransport();
  private config: CTraderConfig;
  private lastTraderRes: any = null;
  private lastReconcileRes: any = null;
  private lastSymbolsRes: any = null;

  public mockAuthFail: boolean = false;
  public mockTimeout: boolean = false;
  public mockReject: boolean = false;
  public mockInsufficientMargin: boolean = false;
  public mockInvalidSymbol: boolean = false;

  constructor(config: CTraderConfig = {}) {
    this.config = {
      clientId: config.clientId !== undefined ? config.clientId : process.env.CTRADER_CLIENT_ID,
      clientSecret: config.clientSecret !== undefined ? config.clientSecret : process.env.CTRADER_CLIENT_SECRET,
      accountId: config.accountId !== undefined ? config.accountId : process.env.CTRADER_ACCOUNT_ID,
      accessToken: config.accessToken !== undefined ? config.accessToken : process.env.CTRADER_ACCESS_TOKEN,
      host: config.host || process.env.CTRADER_HOST || 'demo.ctraderapi.com',
      port: config.port || Number(process.env.CTRADER_PORT) || 5035,
      environment: config.environment || (process.env.EXECUTION_ENVIRONMENT as any) || 'PAPER',
      timeoutMs: config.timeoutMs || 5000
    };
  }

  public updateConfig(newConfig: Partial<CTraderConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  async connect(): Promise<boolean> {
    if (this.mockAuthFail) {
      this.connected = false;
      throw new Error('CTRADER_AUTH_FAILURE: Invalid cTrader API credentials or OAuth access token.');
    }

    const env = this.config.environment || 'PAPER';
    if (env === 'LIVE' || env === 'DEMO') {
      if (!this.config.clientId || !this.config.clientSecret || !this.config.accountId || !this.config.accessToken) {
        this.connected = false;
        throw new Error('CTRADER_MISSING_CREDENTIALS: Missing required cTrader credentials for environment.');
      }

      const host = this.config.host || (env === 'DEMO' ? 'demo.ctraderapi.com' : 'live.ctraderapi.com');
      if (process.env.NODE_ENV !== 'test') {
        await this.transport.connect(host, this.config.port || 5035, this.config.timeoutMs || 5000);
        const appAuthRes = await this.transport.sendRequest(2100, {
          clientId: this.config.clientId,
          clientSecret: this.config.clientSecret
        });
        if (appAuthRes.payloadType === 2101) {
          const accAuthRes = await this.transport.sendRequest(2102, {
            cTraderAccountId: Number(this.config.accountId),
            accessToken: this.config.accessToken
          });
        }
      }
    }

    this.connected = true;
    return true;
  }

  async disconnect(): Promise<boolean> {
    if (process.env.NODE_ENV !== 'test') {
      await this.transport.disconnect();
    }
    this.connected = false;
    return true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async fetchTraderDetails(): Promise<{ trader: any; source: ProtoBufSourceMetadata } | null> {
    if (!this.connected) return null;
    try {
      const res = await this.transport.sendRequest(2121, { cTraderAccountId: Number(this.config.accountId) });
      if (res.payloadType === 2122) {
        this.lastTraderRes = res;
        return {
          trader: res.decodedPayload.trader,
          source: { message: 'ProtoOATraderRes', payloadType: 2122, clientMsgId: res.clientMsgId, verified: true }
        };
      }
    } catch (e) {}
    return null;
  }

  async reconcileState(): Promise<{ positions: any[]; orders: any[]; source: ProtoBufSourceMetadata } | null> {
    if (!this.connected) return null;
    try {
      const res = await this.transport.sendRequest(2124, { cTraderAccountId: Number(this.config.accountId) });
      if (res.payloadType === 2125) {
        this.lastReconcileRes = res;
        return {
          positions: res.decodedPayload.position || [],
          orders: res.decodedPayload.order || [],
          source: { message: 'ProtoOAReconcileRes', payloadType: 2125, clientMsgId: res.clientMsgId, verified: true }
        };
      }
    } catch (e) {}
    return null;
  }

  async fetchSymbols(): Promise<{ symbols: any[]; source: ProtoBufSourceMetadata } | null> {
    if (!this.connected) return null;
    try {
      const res = await this.transport.sendRequest(2114, { cTraderAccountId: Number(this.config.accountId) });
      if (res.payloadType === 2115) {
        this.lastSymbolsRes = res;
        return {
          symbols: res.decodedPayload.symbol || [],
          source: { message: 'ProtoOASymbolsListRes', payloadType: 2115, clientMsgId: res.clientMsgId, verified: true }
        };
      }
    } catch (e) {}
    return null;
  }

  async getAccountStatus(): Promise<AccountStatus & { source?: ProtoBufSourceMetadata }> {
    const traderData = await this.fetchTraderDetails();
    if (traderData && traderData.trader) {
      const rawBalance = traderData.trader.balance;
      const balance = typeof rawBalance === 'number' ? rawBalance / 100 : Number(rawBalance.toString()) / 100;
      return {
        accountId: this.config.accountId || 'CTRADER_ACC_DEFAULT',
        brokerId: this.id,
        balance,
        equity: balance,
        currency: traderData.trader.depositAsset || 'USD',
        connected: this.connected,
        source: traderData.source
      };
    }
    return {
      accountId: this.config.accountId || 'CTRADER_ACC_DEFAULT',
      brokerId: this.id,
      balance: undefined as any,
      equity: undefined as any,
      currency: undefined as any,
      connected: this.connected
    };
  }

  async getPositions(): Promise<Position[]> {
    const recon = await this.reconcileState();
    if (!recon) return [];
    return recon.positions.map((p: any) => ({
      position_id: p.positionId.toString(),
      account_id: this.config.accountId || 'CTRADER_ACC',
      symbol: p.symbolId.toString(),
      direction: p.tradeSide === 1 ? 'BUY' : 'SELL',
      quantity: p.volume / 100000,
      entry_price: p.entryPrice,
      current_price: p.entryPrice,
      unrealized_profit: 0,
      realized_profit: 0,
      status: 'OPEN',
      opened_at: new Date(),
      updated_at: new Date()
    }));
  }

  async placeOrder(order: Order): Promise<ExecutionReport> {
    if (this.mockTimeout) throw new Error('CTRADER_TIMEOUT: Request timed out');
    if (this.mockReject) throw new Error('CTRADER_REJECT: Order rejected');
    if (this.mockInsufficientMargin) throw new Error('CTRADER_INSUFFICIENT_MARGIN: Insufficient funds');
    if (this.mockInvalidSymbol) throw new Error('CTRADER_INVALID_SYMBOL: Invalid trading symbol');
    throw new Error('READ_ONLY_MODE_ENFORCED: Trade execution disabled in Phase 3B audit.');
  }

  lotsToUnits(lots: number): number { return Math.round(lots * 100000); }
  unitsToLots(units: number): number { return units / 100000; }

  async closePosition(positionId: string): Promise<ExecutionReport> {
    if (this.mockTimeout) throw new Error('CTRADER_TIMEOUT: Request timed out');
    throw new Error('READ_ONLY_MODE_ENFORCED: Trade execution disabled in Phase 3B audit.');
  }
}
