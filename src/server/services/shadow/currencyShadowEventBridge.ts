import { EventEmitter } from 'events';
import {
  CurrencyShadowObserverService,
  InMemoryCurrencyShadowRepository,
  PostgresCurrencyShadowRepository,
  IBrokerReadOnlyProvider,
  ICurrencyShadowRepository
} from './currencyShadowObserverService';
import { PositionInput, ProposalInput } from '../../../../packages/core/src/currencyShadowGovernance';
import {
  TradeObservationService,
  defaultTradeObservationService
} from '../observation/tradeObservationService';

/**
 * Dedicated One-Way Observational Event Bridge.
 * 
 * INVARIANT: Strictly side-channel and non-blocking.
 * FORBIDDEN: Returning any execution decision, modifying proposal/position state,
 * or invoking any broker-write capability.
 */
export class CurrencyShadowEventBridge {
  private boundFeed: EventEmitter | null = null;
  private boundScanner: EventEmitter | null = null;
  private isProcessing = false;

  constructor(
    private readonly observerService: CurrencyShadowObserverService,
    private readonly brokerProvider?: IBrokerReadOnlyProvider,
    private readonly observationService?: TradeObservationService
  ) {}

  /**
   * Binds to cTrader Market Data Feed / Broker Reconciliation events.
   * Consumes: 'brokerPositionsUpdated', 'brokerClosedDealsUpdated'
   */
  public bindMarketDataFeed(feed: EventEmitter): void {
    if (this.boundFeed === feed) return;
    this.boundFeed = feed;

    // 1. Listen for real-time broker positions update (Level 1 Authority)
    feed.on('brokerPositionsUpdated', (openPositions: any[]) => {
      this.handlePositionsUpdated(openPositions).catch(err => {
        console.warn('[SHADOW-BRIDGE-WARN] Non-blocking positions observation failed:', err?.message);
      });
    });

    // 2. Listen for broker closed deals update
    feed.on('brokerClosedDealsUpdated', (closedDeals: any[]) => {
      this.handleClosedDealsUpdated(closedDeals).catch(err => {
        console.warn('[SHADOW-BRIDGE-WARN] Non-blocking closed deals observation failed:', err?.message);
      });
    });
  }

  /**
   * Binds to Autonomous Market Scanner / Signal / Proposal events.
   * Consumes: 'tradeExecuted', 'proposalGenerated'
   */
  public bindScannerService(scanner: EventEmitter): void {
    if (this.boundScanner === scanner) return;
    this.boundScanner = scanner;

    scanner.on('tradeExecuted', (tradeSetup: any) => {
      this.handleTradeExecuted(tradeSetup).catch(err => {
        console.warn('[SHADOW-BRIDGE-WARN] Non-blocking trade execution observation failed:', err?.message);
      });
    });
  }

  /**
   * Non-blocking handler for broker open positions state updates.
   */
  private async handlePositionsUpdated(rawPositions: any[]): Promise<void> {
    if (!rawPositions || !Array.isArray(rawPositions)) return;

    try {
      const mappedPositions: PositionInput[] = rawPositions.map(p => ({
        positionId: Number(p.positionId || p.id),
        symbol: p.symbol || p.pair?.replace('/', '') || 'UNKNOWN',
        direction: (p.tradeSide === 1 || p.tradeSide === 'BUY' || p.side === 'BUY' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
        volumeLots: Number(p.volumeLots || p.lots || (Number(p.volume || 0) / 10000000) || 0.01)
      }));

      // Observe lifecycle for latest updated position
      if (mappedPositions.length > 0) {
        const latestPos = mappedPositions[mappedPositions.length - 1];
        await this.observerService.observePositionLifecycle({
          eventType: 'POSITION_OPENED',
          brokerPositionId: String(latestPos.positionId),
          symbol: latestPos.symbol,
          direction: latestPos.direction,
          volumeLots: latestPos.volumeLots,
          actualPositionsOverride: mappedPositions
        });

        if (this.observationService) {
          this.observationService.recordBrokerPositionOpened({
            brokerPositionId: String(latestPos.positionId),
            symbol: latestPos.symbol,
            direction: latestPos.direction,
            volumeLots: latestPos.volumeLots
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      console.warn('[SHADOW-BRIDGE-ERROR] Error handling positions updated:', err?.message);
    }
  }

  /**
   * Non-blocking handler for broker closed deals.
   */
  private async handleClosedDealsUpdated(rawDeals: any[]): Promise<void> {
    if (!rawDeals || !Array.isArray(rawDeals) || rawDeals.length === 0) return;

    try {
      const latestDeal = rawDeals[0];
      const posId = String(latestDeal.positionId || latestDeal.dealId || 'UNKNOWN');
      const sym = latestDeal.symbol || 'UNKNOWN';

      await this.observerService.observePositionLifecycle({
        eventType: 'POSITION_CLOSED',
        brokerPositionId: posId,
        brokerDealId: String(latestDeal.dealId || ''),
        symbol: sym
      });

      if (this.observationService) {
        const gross = Number(latestDeal.grossProfit || latestDeal.profit || 0);
        const comm = Number(latestDeal.commission || 0);
        const swap = Number(latestDeal.swap || 0);
        const net = Number((gross + comm + swap).toFixed(2));

        this.observationService.recordBrokerPositionClosed({
          brokerPositionId: posId,
          brokerDealId: String(latestDeal.dealId || ''),
          realizedPnL: net,
          grossPnL: gross,
          closeReason: latestDeal.closeReason || 'DEAL_EXECUTED'
        }).catch(() => {});
      }
    } catch (err: any) {
      console.warn('[SHADOW-BRIDGE-ERROR] Error handling closed deals:', err?.message);
    }
  }

  /**
   * Non-blocking handler for scanner trade execution / proposal creation.
   */
  private async handleTradeExecuted(tradeSetup: any): Promise<void> {
    if (!tradeSetup) return;

    try {
      const propId = tradeSetup.proposalId || tradeSetup.setupId || `prop-${Date.now()}`;
      const sym = tradeSetup.pair?.replace('/', '') || tradeSetup.symbol || 'EURUSD';
      const dir: 'BUY' | 'SELL' = tradeSetup.direction === 'BUY' ? 'BUY' : 'SELL';
      const vol = Number(tradeSetup.volumeLots || tradeSetup.lots || 0.01);
      const risk = Number(tradeSetup.riskPercent || 0.5);

      await this.observerService.observeProposalCreated({
        evaluationId: `eval-prop-${propId}`,
        proposalId: propId,
        signalId: tradeSetup.signalId,
        symbol: sym,
        direction: dir,
        volumeLots: vol,
        riskPercent: risk
      });

      if (this.observationService) {
        this.observationService.recordProposal({
          proposalId: propId,
          signalId: tradeSetup.signalId,
          symbol: sym,
          direction: dir,
          volumeLots: vol,
          riskPercent: risk,
          strategy: tradeSetup.strategy || tradeSetup.setupName,
          timeframe: tradeSetup.timeframe,
          timestamp: new Date().toISOString()
        }).catch(() => {});
      }
    } catch (err: any) {
      console.warn('[SHADOW-BRIDGE-ERROR] Error handling trade proposal:', err?.message);
    }
  }
}

/**
 * Global default instance initialized for production runtime registration.
 */
export const defaultCurrencyShadowObserverService = new CurrencyShadowObserverService(
  new InMemoryCurrencyShadowRepository()
);

export const defaultCurrencyShadowEventBridge = new CurrencyShadowEventBridge(
  defaultCurrencyShadowObserverService,
  undefined,
  defaultTradeObservationService
);
