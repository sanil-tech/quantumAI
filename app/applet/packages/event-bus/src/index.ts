import { logger } from '@iati/core';

export interface IEvent<T = any> {
  id: string;
  type: string;
  timestamp: Date;
  payload: T;
}

export interface IEventBus {
  publish(event: IEvent): Promise<void>;
  subscribe(eventType: string, handler: (event: IEvent) => Promise<void>): void;
}

export class InMemoryEventBus implements IEventBus {
  private handlers: Map<string, Array<(event: IEvent) => Promise<void>>> = new Map();

  async publish(event: IEvent): Promise<void> {
    logger.info(`Publishing event: ${event.type}`);
    const eventHandlers = this.handlers.get(event.type) || [];
    
    setImmediate(() => {
      eventHandlers.forEach(handler => {
        handler(event).catch(err => {
          logger.error(`Error handling event ${event.type}`, err);
        });
      });
    });
  }

  subscribe(eventType: string, handler: (event: IEvent) => Promise<void>): void {
    const currentHandlers = this.handlers.get(eventType) || [];
    currentHandlers.push(handler);
    this.handlers.set(eventType, currentHandlers);
    logger.info(`Subscribed to event: ${eventType}`);
  }
}

export const globalEventBus = new InMemoryEventBus();

export const EventTypes = {
  MarketDataUpdated: 'MarketDataUpdated',
  MarketStateUpdated: 'MarketStateUpdated',
  TradeProposed: 'TradeProposed',
  RiskCleared: 'RiskCleared',
  GovernanceApproved: 'GovernanceApproved',
  OrderPlaced: 'OrderPlaced',
  OrderFilled: 'OrderFilled',
} as const;
