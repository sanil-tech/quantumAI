import { TradingRepository } from '@iati/database';
import { M5ShadowObservation } from './m5ShadowObservationService';

export interface M5PerformanceAnalyticsOptions {
  executionMode: 'DEMO_FORWARD' | 'SHADOW';
  symbol?: string;
}

export interface M5PerformanceReport {
  executionMode: 'DEMO_FORWARD' | 'SHADOW';
  totalOpportunities: number;
  acceptedCount: number;
  rejectedCount: number;
  vetoedCount: number;
  expiredCount: number;
  ordersPlaced: number;
  fillsCount: number;
  brokerRejections: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  expectancyR: number;
  averageR: number;
  realizedPnL: number;
  maxDrawdown: number;
  // Shadow specific counterfactuals
  rejectedShadowResolved?: number;
  rejectedWouldWin?: number;
  rejectedWouldLose?: number;
}

export class M5PerformanceAnalyticsService {
  private static instance: M5PerformanceAnalyticsService;
  private tradingRepo: TradingRepository;

  private constructor() {
    this.tradingRepo = new TradingRepository();
  }

  public static getInstance(): M5PerformanceAnalyticsService {
    if (!M5PerformanceAnalyticsService.instance) {
      M5PerformanceAnalyticsService.instance = new M5PerformanceAnalyticsService();
    }
    return M5PerformanceAnalyticsService.instance;
  }

  /**
   * Generates M5 Performance Analytics for a specific execution_mode.
   * FAIL CLOSED: Throws an error if options.executionMode is missing or invalid.
   */
  public async getM5PerformanceReport(options: M5PerformanceAnalyticsOptions): Promise<M5PerformanceReport> {
    if (!options || !options.executionMode || !['DEMO_FORWARD', 'SHADOW'].includes(options.executionMode)) {
      throw new Error('[M5_ANALYTICS_FAIL_CLOSED] executionMode is required and must be either "DEMO_FORWARD" or "SHADOW". Silent aggregation is strictly prohibited.');
    }

    const mode = options.executionMode;

    if (mode === 'DEMO_FORWARD') {
      let signalsRes: any = { rows: [] };
      let positionsRes: any = { rows: [] };
      try {
        signalsRes = await this.tradingRepo.query(
          `SELECT decision, status FROM signals WHERE timeframe = 'M5' AND provenance = 'NATURAL_RUNTIME' AND execution_mode = 'DEMO_FORWARD'`
        );
        positionsRes = await this.tradingRepo.query(
          `SELECT realized_profit, pnl_pips, status FROM positions WHERE timeframe = 'M5' AND environment = 'DEMO'`
        );
      } catch (e) {}

      const rows = signalsRes.rows || [];
      const posRows = positionsRes.rows || [];

      const totalOpportunities = rows.length;
      const acceptedCount = rows.filter((r: any) => r.decision === 'ACCEPTED' || r.status === 'EXECUTED').length;
      const rejectedCount = rows.filter((r: any) => r.decision === 'REJECTED' || r.status === 'REJECTED' || r.status === 'SKIPPED').length;
      const vetoedCount = rows.filter((r: any) => r.decision === 'VETOED' || r.status === 'VETOED').length;
      const expiredCount = rows.filter((r: any) => r.status === 'EXPIRED').length;

      const closedPositions = posRows.filter((p: any) => p.status === 'CLOSED');
      const closedTrades = closedPositions.length;
      const wins = closedPositions.filter((p: any) => Number(p.realized_profit) > 0).length;
      const losses = closedPositions.filter((p: any) => Number(p.realized_profit) < 0).length;
      const winRate = closedTrades > 0 ? Number(((wins / closedTrades) * 100).toFixed(1)) : 0;
      const realizedPnL = closedPositions.reduce((acc: number, p: any) => acc + Number(p.realized_profit || 0), 0);

      return {
        executionMode: 'DEMO_FORWARD',
        totalOpportunities,
        acceptedCount,
        rejectedCount,
        vetoedCount,
        expiredCount,
        ordersPlaced: acceptedCount,
        fillsCount: acceptedCount,
        brokerRejections: 0,
        closedTrades,
        wins,
        losses,
        winRate,
        profitFactor: losses > 0 ? Number((wins / losses).toFixed(2)) : (wins > 0 ? 99.0 : 0),
        expectancyR: 0,
        averageR: 0,
        realizedPnL: Number(realizedPnL.toFixed(2)),
        maxDrawdown: 0
      };
    } else {
      // SHADOW mode query
      let shadowRes: any = { rows: [] };
      try {
        shadowRes = await this.tradingRepo.query(
          `SELECT outcome FROM m5_shadow_observations WHERE execution_mode = 'SHADOW'`
        );
      } catch (e) {}

      const rows = shadowRes.rows || [];
      const totalOpportunities = rows.length;
      const resolved = rows.filter((r: any) => r.outcome !== 'PENDING');
      const wouldWin = rows.filter((r: any) => r.outcome === 'WOULD_WIN').length;
      const wouldLose = rows.filter((r: any) => r.outcome === 'WOULD_LOSE').length;

      return {
        executionMode: 'SHADOW',
        totalOpportunities,
        acceptedCount: 0,
        rejectedCount: totalOpportunities,
        vetoedCount: 0,
        expiredCount: 0,
        ordersPlaced: 0,
        fillsCount: 0,
        brokerRejections: 0,
        closedTrades: 0,
        wins: 0,
        losses: 0,
        winRate: resolved.length > 0 ? Number(((wouldWin / resolved.length) * 100).toFixed(1)) : 0,
        profitFactor: 0,
        expectancyR: 0,
        averageR: 0,
        realizedPnL: 0, // Shadow NEVER has realized PnL!
        maxDrawdown: 0,
        rejectedShadowResolved: resolved.length,
        rejectedWouldWin: wouldWin,
        rejectedWouldLose: wouldLose
      };
    }
  }
}

export const m5PerformanceAnalyticsService = M5PerformanceAnalyticsService.getInstance();
