import { 
  UserActualTrade, 
  ManualTradeMonitoringSnapshot, 
  ManualTradeAlert, 
  ExitConditionTriggerType, 
  MarketDataMode,
  MarketDataEnvelope,
  CandleData,
  CurrencyPair
} from '@iati/core-types';
import { TradingRepository } from '@iati/database';
import { manualSignalService } from './manualSignalService';
import { fetchRealCandleEnvelope, PAIR_CONFIGS } from '../../lib/marketDataGenerator';

export class MarketMonitoringService {
  private repo: TradingRepository;
  private triggeredAlerts = new Map<string, ManualTradeAlert>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(repo?: TradingRepository) {
    this.repo = repo || new TradingRepository();
    this.loadPersistedAlerts().catch(err => {
      console.warn('[MarketMonitoringService] Initial alerts DB load notice:', err.message);
    });
  }

  /**
   * PHASE 6E: Hydrate alerts from PostgreSQL source of truth
   */
  public async loadPersistedAlerts(): Promise<ManualTradeAlert[]> {
    try {
      const persisted = await this.repo.getManualTradeAlerts();
      if (Array.isArray(persisted)) {
        for (const alert of persisted) {
          this.triggeredAlerts.set(alert.alertId, alert);
        }
        return persisted;
      }
    } catch (err: any) {
      console.warn('[MarketMonitoringService] DB alert load fallback:', err.message);
    }
    return Array.from(this.triggeredAlerts.values());
  }

  /**
   * Helper: Calculates pip multiplier and pip value per lot for a given symbol
   */
  public getSymbolPipConfig(symbol: string): { pipMultiplier: number; pipValuePerLot: number } {
    if (symbol === 'USD/JPY') {
      return { pipMultiplier: 100, pipValuePerLot: 7.0 };
    }
    if (symbol === 'XAU/USD' || symbol === 'NASDAQ' || symbol === 'BTC/USD') {
      return { pipMultiplier: 1, pipValuePerLot: 10.0 };
    }
    return { pipMultiplier: 10000, pipValuePerLot: 10.0 };
  }

  /**
   * Evaluates a single active manual trade against real market data.
   * STRICT INVARIANT: If market data is stale, unavailable, or synthetic during LIVE mode,
   * it fails closed (zero alerts generated, no price inference).
   */
  public async evaluateActiveTrade(
    trade: UserActualTrade,
    options?: {
      livePriceOverride?: number;
      marketEnvelopeOverride?: MarketDataEnvelope<CandleData[]>;
      dataMode?: MarketDataMode;
    }
  ): Promise<ManualTradeMonitoringSnapshot> {
    const dataMode = options?.dataMode || 'LIVE';
    const { pipMultiplier, pipValuePerLot } = this.getSymbolPipConfig(trade.symbol);

    // Initial snapshot baseline
    const snapshot: ManualTradeMonitoringSnapshot = {
      manualTradeId: trade.manualTradeId,
      signalId: trade.signalId,
      symbol: trade.symbol,
      direction: trade.direction,
      actualEntry: trade.actualEntry,
      positionSize: trade.positionSize,
      enteredAt: trade.enteredAt,
      status: trade.status,
      currentPrice: null,
      unrealizedPips: null,
      unrealizedPnl: null,
      marketDataTimestamp: null,
      marketDataStatus: 'UNAVAILABLE',
      monitoringStatus: trade.status === 'ACTIVE' ? 'MARKET_DATA_UNAVAILABLE' : 'NOT_ACTIVE',
      distanceToSlPips: null,
      distanceToTp1Pips: null,
      distanceToTp2Pips: null,
      aiPlannedSetup: trade.aiPlannedSetup,
      activeAlerts: []
    };

    if (trade.status !== 'ACTIVE') {
      snapshot.monitoringStatus = 'NOT_ACTIVE';
      return snapshot;
    }

    let currentPrice: number | null = null;
    let marketDataStatus: 'VALID' | 'STALE' | 'UNAVAILABLE' | 'INVALID' = 'UNAVAILABLE';
    let marketTimestamp: number | null = null;

    // 1. Direct price override (for deterministic unit tests or live tick push)
    if (options?.livePriceOverride !== undefined) {
      const p = Number(options.livePriceOverride);
      if (Number.isFinite(p) && p > 0) {
        currentPrice = p;
        marketDataStatus = 'VALID';
        marketTimestamp = Date.now();
      } else {
        marketDataStatus = 'INVALID';
      }
    } else {
      // 2. Fetch from real market data generator / envelope
      try {
        let envelope = options?.marketEnvelopeOverride;
        if (!envelope) {
          envelope = await fetchRealCandleEnvelope(
            trade.symbol as CurrencyPair,
            'M15',
            15,
            dataMode
          );
        }

        // FAIL-CLOSED CHECK: Reject SYNTHETIC data when running in LIVE mode
        if (dataMode === 'LIVE' && envelope.dataMode === 'SYNTHETIC') {
          console.warn(`[MarketMonitoring] FAIL_CLOSED: Synthetic market data rejected for live trade ${trade.manualTradeId}`);
          marketDataStatus = 'UNAVAILABLE';
          snapshot.marketDataStatus = 'UNAVAILABLE';
          snapshot.monitoringStatus = 'MARKET_DATA_UNAVAILABLE';
          return snapshot;
        }

        if (envelope && envelope.data && envelope.data.length > 0) {
          const lastCandle = envelope.data[envelope.data.length - 1];
          const c = Number(lastCandle.close);
          if (Number.isFinite(c) && c > 0) {
            currentPrice = c;
            marketTimestamp = typeof lastCandle.time === 'number' ? (lastCandle.time > 1e11 ? lastCandle.time : lastCandle.time * 1000) : Date.now();
            
            if (envelope.status === 'VALID') {
              marketDataStatus = 'VALID';
            } else if (envelope.status === 'STALE') {
              marketDataStatus = 'STALE';
            } else {
              marketDataStatus = 'INVALID';
            }
          }
        }
      } catch (err: any) {
        console.warn(`[MarketMonitoring] Error fetching live price for ${trade.symbol}:`, err.message);
        marketDataStatus = 'UNAVAILABLE';
      }
    }

    snapshot.marketDataStatus = marketDataStatus;
    snapshot.marketDataTimestamp = marketTimestamp;

    // FAIL-CLOSED GUARD: If price is missing or market data is NOT valid, produce ZERO exit alerts
    if (!currentPrice || marketDataStatus !== 'VALID') {
      snapshot.monitoringStatus = marketDataStatus === 'STALE' ? 'MARKET_DATA_STALE' : 'MARKET_DATA_UNAVAILABLE';
      snapshot.activeAlerts = this.getTriggeredAlerts(trade.manualTradeId);
      return snapshot;
    }

    // 3. Compute Floating Metrics
    snapshot.currentPrice = currentPrice;
    snapshot.monitoringStatus = 'MONITORING';

    let diff = 0;
    if (trade.direction === 'BUY') {
      diff = currentPrice - trade.actualEntry;
    } else if (trade.direction === 'SELL') {
      diff = trade.actualEntry - currentPrice;
    } else {
      console.warn(`[MarketMonitoring] FAIL_CLOSED: Invalid trade direction '${trade.direction}' for ${trade.manualTradeId}`);
      snapshot.monitoringStatus = 'MARKET_DATA_UNAVAILABLE';
      return snapshot;
    }

    const unrealizedPips = Number((diff * pipMultiplier).toFixed(1));
    const unrealizedPnl = Number((unrealizedPips * pipValuePerLot * trade.positionSize).toFixed(2));

    snapshot.unrealizedPips = unrealizedPips;
    snapshot.unrealizedPnl = unrealizedPnl;

    // Distances to AI Planned targets in pips
    const aiPlan = trade.aiPlannedSetup;
    if (aiPlan.stopLoss > 0) {
      const slDiff = trade.direction === 'BUY' ? (currentPrice - aiPlan.stopLoss) : (aiPlan.stopLoss - currentPrice);
      snapshot.distanceToSlPips = Number((slDiff * pipMultiplier).toFixed(1));
    }
    if (aiPlan.takeProfit1 > 0) {
      const tp1Diff = trade.direction === 'BUY' ? (aiPlan.takeProfit1 - currentPrice) : (currentPrice - aiPlan.takeProfit1);
      snapshot.distanceToTp1Pips = Number((tp1Diff * pipMultiplier).toFixed(1));
    }
    if (aiPlan.takeProfit2 > 0) {
      const tp2Diff = trade.direction === 'BUY' ? (aiPlan.takeProfit2 - currentPrice) : (currentPrice - aiPlan.takeProfit2);
      snapshot.distanceToTp2Pips = Number((tp2Diff * pipMultiplier).toFixed(1));
    }

    // 4. STEP 2: Exit Condition Detection & Persistence
    await this.evaluateExitConditions(trade, currentPrice, unrealizedPips, unrealizedPnl);

    snapshot.activeAlerts = this.getTriggeredAlerts(trade.manualTradeId);
    return snapshot;
  }

  /**
   * STEP 2 & 3: Evaluates exit thresholds and generates deduplicated alerts
   */
  private async evaluateExitConditions(
    trade: UserActualTrade,
    currentPrice: number,
    unrealizedPips: number,
    unrealizedPnl: number
  ): Promise<void> {
    const aiPlan = trade.aiPlannedSetup;
    const isBuy = trade.direction === 'BUY';

    // A. TAKE PROFIT 1
    if (aiPlan.takeProfit1 > 0) {
      const tp1Hit = isBuy ? currentPrice >= aiPlan.takeProfit1 : currentPrice <= aiPlan.takeProfit1;
      if (tp1Hit) {
        await this.emitAlertIfNew({
          manualTradeId: trade.manualTradeId,
          signalId: trade.signalId,
          symbol: trade.symbol,
          direction: trade.direction,
          triggerType: 'ALERT_TP1_REACHED',
          triggeredAt: new Date().toISOString(),
          triggerPrice: currentPrice,
          thresholdPrice: aiPlan.takeProfit1,
          unrealizedPips,
          unrealizedPnl,
          message: `[TP1 REACHED] ${trade.symbol} ${trade.direction} hit Take Profit 1 level at ${currentPrice} (+${unrealizedPips} pips / $${unrealizedPnl})`,
          acknowledged: false
        });
      }
    }

    // B. TAKE PROFIT 2
    if (aiPlan.takeProfit2 > 0) {
      const tp2Hit = isBuy ? currentPrice >= aiPlan.takeProfit2 : currentPrice <= aiPlan.takeProfit2;
      if (tp2Hit) {
        await this.emitAlertIfNew({
          manualTradeId: trade.manualTradeId,
          signalId: trade.signalId,
          symbol: trade.symbol,
          direction: trade.direction,
          triggerType: 'ALERT_TP2_REACHED',
          triggeredAt: new Date().toISOString(),
          triggerPrice: currentPrice,
          thresholdPrice: aiPlan.takeProfit2,
          unrealizedPips,
          unrealizedPnl,
          message: `[TP2 REACHED] ${trade.symbol} ${trade.direction} hit Take Profit 2 level at ${currentPrice} (+${unrealizedPips} pips / $${unrealizedPnl})`,
          acknowledged: false
        });
      }
    }

    // C. STOP LOSS
    if (aiPlan.stopLoss > 0) {
      const slHit = isBuy ? currentPrice <= aiPlan.stopLoss : currentPrice >= aiPlan.stopLoss;
      if (slHit) {
        await this.emitAlertIfNew({
          manualTradeId: trade.manualTradeId,
          signalId: trade.signalId,
          symbol: trade.symbol,
          direction: trade.direction,
          triggerType: 'ALERT_STOP_LOSS_HIT',
          triggeredAt: new Date().toISOString(),
          triggerPrice: currentPrice,
          thresholdPrice: aiPlan.stopLoss,
          unrealizedPips,
          unrealizedPnl,
          message: `[STOP LOSS HIT] ${trade.symbol} ${trade.direction} breached Stop Loss level at ${currentPrice} (${unrealizedPips} pips / $${unrealizedPnl})`,
          acknowledged: false
        });
      }
    }

    // D. INVALIDATION
    if (aiPlan.invalidationLevel > 0) {
      const invHit = isBuy ? currentPrice <= aiPlan.invalidationLevel : currentPrice >= aiPlan.invalidationLevel;
      if (invHit) {
        await this.emitAlertIfNew({
          manualTradeId: trade.manualTradeId,
          signalId: trade.signalId,
          symbol: trade.symbol,
          direction: trade.direction,
          triggerType: 'ALERT_INVALIDATION_TRIGGERED',
          triggeredAt: new Date().toISOString(),
          triggerPrice: currentPrice,
          thresholdPrice: aiPlan.invalidationLevel,
          unrealizedPips,
          unrealizedPnl,
          message: `[STRUCTURE INVALIDATED] ${trade.symbol} ${trade.direction} crossed structural invalidation level at ${currentPrice}`,
          acknowledged: false
        });
      }
    }
  }

  /**
   * STEP 3 & 4: Deduplicates alerts and persists to PostgreSQL
   */
  private async emitAlertIfNew(alert: Omit<ManualTradeAlert, 'alertId'>): Promise<void> {
    const alertKey = `${alert.manualTradeId}_${alert.triggerType}`;
    if (!this.triggeredAlerts.has(alertKey)) {
      const fullAlert: ManualTradeAlert = {
        ...alert,
        alertId: alertKey
      };
      this.triggeredAlerts.set(alertKey, fullAlert);
      console.log(`[MarketMonitoringAlert] TRIGGERED: ${alertKey} -> ${alert.message}`);

      // PHASE 6E: Persist to database asynchronously
      try {
        await this.repo.saveManualTradeAlert(fullAlert);
      } catch (err: any) {
        console.warn(`[MarketMonitoringService] DB alert persist notice:`, err.message);
      }
    }
  }

  /**
   * Evaluates all ACTIVE trades and returns complete monitoring snapshots
   */
  public async evaluateAllActiveTrades(dataMode: MarketDataMode = 'LIVE'): Promise<ManualTradeMonitoringSnapshot[]> {
    const activeTrades = manualSignalService.getUserActualTrades('ACTIVE');
    const snapshots: ManualTradeMonitoringSnapshot[] = [];

    for (const trade of activeTrades) {
      try {
        const snapshot = await this.evaluateActiveTrade(trade, { dataMode });
        snapshots.push(snapshot);
      } catch (err: any) {
        console.warn(`[MarketMonitoring] Failed to evaluate active trade ${trade.manualTradeId}:`, err.message);
      }
    }

    return snapshots;
  }

  /**
   * Returns triggered alerts (optionally filtered by manualTradeId)
   */
  public getTriggeredAlerts(manualTradeId?: string): ManualTradeAlert[] {
    const alerts = Array.from(this.triggeredAlerts.values());
    if (manualTradeId) {
      return alerts.filter(a => a.manualTradeId === manualTradeId);
    }
    return alerts;
  }

  /**
   * Clears alerts for a trade or all trades (both in memory and database)
   */
  public async clearAlerts(manualTradeId?: string): Promise<void> {
    if (manualTradeId) {
      for (const [key, alert] of this.triggeredAlerts.entries()) {
        if (alert.manualTradeId === manualTradeId) {
          this.triggeredAlerts.delete(key);
        }
      }
      await this.repo.clearManualTradeAlerts(manualTradeId).catch(() => {});
    } else {
      this.triggeredAlerts.clear();
      await this.repo.clearManualTradeAlerts().catch(() => {});
    }
  }

  /**
   * Starts background monitoring loop
   */
  public startMonitoringLoop(intervalMs: number = 5000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.evaluateAllActiveTrades('LIVE');
      } catch (e: any) {
        console.warn('[MarketMonitoringLoop] Error during cycle:', e.message);
      }
    }, intervalMs);

    console.log(`[MarketMonitoringLoop] Started with interval ${intervalMs}ms`);
  }

  /**
   * Stops background monitoring loop
   */
  public stopMonitoringLoop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log('[MarketMonitoringLoop] Stopped');
  }

  public isLoopRunning(): boolean {
    return this.isRunning;
  }
}

export const marketMonitoringService = new MarketMonitoringService();
