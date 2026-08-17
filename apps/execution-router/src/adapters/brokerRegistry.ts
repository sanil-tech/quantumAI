import { BrokerAdapter } from './brokerAdapter';
import { PaperBrokerAdapter } from './paperBrokerAdapter';
import { CTraderAdapter } from './ctraderAdapter';

export const DEFAULT_BROKER_ID = 'paper-broker-01';
export const PAPER_BROKER_ID = 'paper-broker-01';
export const CTRADER_BROKER_ID = 'ctrader-broker-01';

export class BrokerRegistry {
  private adapters: Map<string, BrokerAdapter> = new Map();
  private defaultBrokerId: string = DEFAULT_BROKER_ID;

  constructor() {
    const paper = new PaperBrokerAdapter();
    const ctrader = new CTraderAdapter();
    this.register(paper);
    this.register(ctrader);
  }

  register(adapter: BrokerAdapter): void {
    if (!adapter || !adapter.id) {
      throw new Error('Invalid BrokerAdapter: missing adapter id.');
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(brokerId?: string): BrokerAdapter | undefined {
    const id = brokerId || this.defaultBrokerId;
    return this.adapters.get(id) || this.adapters.get(this.defaultBrokerId);
  }

  has(brokerId: string): boolean {
    return this.adapters.has(brokerId);
  }

  setDefault(brokerId: string): void {
    if (!this.adapters.has(brokerId)) {
      throw new Error(`Cannot set default broker to unregistered adapter ID: '${brokerId}'.`);
    }
    this.defaultBrokerId = brokerId;
  }

  getDefaultId(): string {
    return this.defaultBrokerId;
  }

  listAdapters(): BrokerAdapter[] {
    return Array.from(this.adapters.values());
  }

  unregister(brokerId: string): boolean {
    return this.adapters.delete(brokerId);
  }
}

export const globalBrokerRegistry = new BrokerRegistry();
