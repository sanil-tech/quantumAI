import { TradingRepository } from '@iati/database';
import { M5ScalpSetupResult } from './m5ScalpStrategyService';

export interface M5ShadowObservation {
  id: string;
  marketOpportunityId: string;
  signalId: string;
  setupId?: string;
  symbol: string;
  timeframe: 'M5';
  direction: 'BUY' | 'SELL';
  rejectionReason: string;
  plannedEntry: number;
  plannedSl: number;
  plannedTp: number;
  plannedRr: number;
  createdAt: number;
  resolvedAt?: number;
  outcome: 'PENDING' | 'WOULD_WIN' | 'WOULD_LOSE' | 'EXPIRED';
  maxFavorablePips?: number;
  maxAdversePips?: number;
  executionMode: 'SHADOW';
}

export class M5ShadowObservationService {
  private static instance: M5ShadowObservationService;
  private shadowRecords: Map<string, M5ShadowObservation> = new Map();
  private tradingRepo: TradingRepository;

  private constructor() {
    this.tradingRepo = new TradingRepository();
  }

  public static getInstance(): M5ShadowObservationService {
    if (!M5ShadowObservationService.instance) {
      M5ShadowObservationService.instance = new M5ShadowObservationService();
    }
    return M5ShadowObservationService.instance;
  }

  /**
   * Records a rejected M5 opportunity into Shadow observation storage.
   * MUST NOT place broker orders or touch production positions / realized P&L tables.
   */
  public async recordRejectedOpportunity(setup: M5ScalpSetupResult): Promise<M5ShadowObservation> {
    const obs: M5ShadowObservation = {
      id: `shadow_m5_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      marketOpportunityId: setup.marketOpportunityId,
      signalId: setup.signalId,
      setupId: setup.setupId,
      symbol: setup.symbol,
      timeframe: 'M5',
      direction: setup.direction,
      rejectionReason: setup.rejectionReason || 'REJECTED_UNKNOWN',
      plannedEntry: setup.entryPrice,
      plannedSl: setup.stopLoss,
      plannedTp: setup.takeProfit1,
      plannedRr: setup.plannedRr,
      createdAt: Date.now(),
      outcome: 'PENDING',
      executionMode: 'SHADOW'
    };

    this.shadowRecords.set(obs.id, obs);

    // Persist to m5_shadow_observations PostgreSQL table
    try {
      await this.tradingRepo.query(
        `INSERT INTO m5_shadow_observations 
        (market_opportunity_id, signal_id, setup_id, symbol, timeframe, direction, rejection_reason, rejection_details, planned_entry, planned_sl, planned_tp, planned_rr, execution_mode)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          obs.marketOpportunityId, obs.signalId, obs.setupId || null, obs.symbol, obs.timeframe,
          obs.direction, obs.rejectionReason, JSON.stringify(setup.reasons), obs.plannedEntry,
          obs.plannedSl, obs.plannedTp, obs.plannedRr, 'SHADOW'
        ]
      );
    } catch (err: any) {
      console.warn(`[M5ShadowObservationService] Postgres log notice: ${err.message}`);
    }

    console.log(`👁️ [M5ShadowObservationService] Logged REJECTED M5 setup for ${obs.symbol} (${obs.rejectionReason}) in SHADOW mode. No broker order.`);
    return obs;
  }

  /**
   * Resolves a pending shadow observation based on live market price tick.
   */
  public resolveObservation(obsId: string, currentPrice: number): M5ShadowObservation | null {
    const obs = this.shadowRecords.get(obsId);
    if (!obs || obs.outcome !== 'PENDING') return obs || null;

    let isWin = false;
    let isLoss = false;

    if (obs.direction === 'BUY') {
      if (currentPrice >= obs.plannedTp) isWin = true;
      else if (currentPrice <= obs.plannedSl) isLoss = true;
    } else {
      if (currentPrice <= obs.plannedTp) isWin = true;
      else if (currentPrice >= obs.plannedSl) isLoss = true;
    }

    if (isWin) {
      obs.outcome = 'WOULD_WIN';
      obs.resolvedAt = Date.now();
    } else if (isLoss) {
      obs.outcome = 'WOULD_LOSE';
      obs.resolvedAt = Date.now();
    }

    return obs;
  }

  public getShadowObservations(): M5ShadowObservation[] {
    return Array.from(this.shadowRecords.values());
  }
}

export const m5ShadowObservationService = M5ShadowObservationService.getInstance();
