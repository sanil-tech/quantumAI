import { Router, Request, Response } from 'express';
import { TradingAnalyticsService } from '../services/tradingAnalyticsService';
import { TradingRepository } from '@iati/database';

const analyticsRouter = Router();
const analyticsService = new TradingAnalyticsService();
const tradingRepo = new TradingRepository();

/**
 * GET /api/analytics/metrics
 * Get comprehensive trading metrics
 */
analyticsRouter.get('/metrics', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || 'DEFAULT';
    const metrics = await analyticsService.calculateMetrics(accountId);

    res.json({
      success: true,
      data: metrics
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/analytics/by-pair
 * Performance breakdown by trading pair
 */
analyticsRouter.get('/by-pair', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || 'DEFAULT';
    const pairPerformance = await analyticsService.getPerformanceByPair(accountId);

    res.json({
      success: true,
      data: pairPerformance
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/analytics/daily
 * Daily performance breakdown
 */
analyticsRouter.get('/daily', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || 'DEFAULT';
    const days = parseInt(req.query.days as string) || 30;
    const dailyPerformance = await analyticsService.getDailyPerformance(accountId, days);

    res.json({
      success: true,
      data: dailyPerformance
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/analytics/export/csv
 * Export all trades as CSV
 */
analyticsRouter.get('/export/csv', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || 'DEFAULT';
    const csv = await analyticsService.exportAsCSV(accountId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="trades_${accountId}_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/analytics/report
 * Generate comprehensive performance report
 */
analyticsRouter.get('/report', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || 'DEFAULT';
    const report = await analyticsService.generateReport(accountId);

    res.setHeader('Content-Type', 'text/plain');
    res.send(report);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/analytics/positions
 * Get trade history with pagination
 */
analyticsRouter.get('/positions', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || 'DEFAULT';
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string || 'CLOSED';

    // Fetch positions based on status
    let positions: any[] = [];
    if (status === 'CLOSED') {
      positions = await tradingRepo.getClosedPositions(accountId, limit, offset);
    } else if (status === 'ACTIVE') {
      positions = await tradingRepo.getOpenPositions(accountId);
    } else {
      positions = await tradingRepo.getAllPositions(accountId, limit, offset);
    }

    res.json({
      success: true,
      data: {
        positions,
        count: positions.length,
        limit,
        offset
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/analytics/dashboard
 * Comprehensive dashboard data
 */
analyticsRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || 'DEFAULT';

    const metrics = await analyticsService.calculateMetrics(accountId);
    const pairPerformance = await analyticsService.getPerformanceByPair(accountId);
    const dailyPerformance = await analyticsService.getDailyPerformance(accountId, 7);
    const recentTrades = await tradingRepo.getClosedPositions(accountId, 10);
    const activeTrades = await tradingRepo.getOpenPositions(accountId);

    res.json({
      success: true,
      data: {
        metrics,
        pairPerformance,
        dailyPerformance,
        recentTrades,
        activeTrades: activeTrades.length,
        summary: {
          totalP_L: metrics.totalPnlDollars,
          winRate: metrics.winRatePercent,
          profitFactor: metrics.profitFactor,
          sharpeRatio: metrics.sharpeRatio,
          maxDrawdown: metrics.drawdownPercent,
          topPair: pairPerformance.length > 0 ? {
            pair: pairPerformance[0].pair,
            pnl: pairPerformance[0].pnl,
            winRate: pairPerformance[0].winRate
          } : null
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/analytics/heatmap
 * Performance heatmap (hour of day, day of week)
 */
analyticsRouter.get('/heatmap', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || 'DEFAULT';
    const positions = await tradingRepo.getClosedPositions(accountId, 10000);

    // Create heatmap by day of week and hour
    const heatmap: Record<string, Record<string, { trades: number; wins: number; pnl: number }>> = {};

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
      heatmap[day] = {};
      for (let hour = 0; hour < 24; hour++) {
        heatmap[day][hour.toString().padStart(2, '0')] = { trades: 0, wins: 0, pnl: 0 };
      }
    });

    positions.forEach(p => {
      const date = new Date(p.closedAt || p.openedAt || new Date());
      const dayName = dayNames[date.getUTCDay()];
      const hour = date.getUTCHours().toString().padStart(2, '0');

      heatmap[dayName][hour].trades++;
      heatmap[dayName][hour].wins += (p.realizedProfit || 0) > 0 ? 1 : 0;
      heatmap[dayName][hour].pnl += (p.realizedProfit || 0);
    });

    res.json({
      success: true,
      data: heatmap
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export { analyticsRouter };
