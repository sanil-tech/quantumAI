import { Router, Request, Response, NextFunction } from 'express';
import { TradingRepository } from '@iati/database';
import { logger } from '@iati/core';
import jwt from 'jsonwebtoken';

export const adminRouter = Router();
const repo = new TradingRepository();

/**
 * Admin Security Authorization Middleware
 * Only authenticated authorized admin users may access admin endpoints.
 */
export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = (req.headers['x-admin-key'] || req.headers['x-api-key']) as string | undefined;
  const authHeader = req.headers.authorization;
  const configuredAdminKey = process.env.ADMIN_API_KEY;
  const configuredJwtSecret = process.env.JWT_SECRET;

  // 1. Direct admin API key matching
  if (adminKey && configuredAdminKey && adminKey === configuredAdminKey) {
    (req as any).user = { role: 'admin', userId: 'admin-system' };
    return next();
  }

  // 2. Authorization Bearer header
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    if (configuredAdminKey && token === configuredAdminKey) {
      (req as any).user = { role: 'admin', userId: 'admin-system' };
      return next();
    }

    if (configuredJwtSecret) {
      try {
        const decoded: any = jwt.verify(token, configuredJwtSecret);
        if (decoded && (decoded.role === 'admin' || decoded.isAdmin === true)) {
          (req as any).user = decoded;
          return next();
        } else if (decoded) {
          return res.status(403).json({
            success: false,
            error: 'FORBIDDEN_ADMIN_ACCESS: Authenticated user does not possess required admin permissions.'
          });
        }
      } catch (e) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED_ADMIN_ACCESS: Invalid or expired authorization token.'
        });
      }
    }
  }

  // Fail closed - reject any missing or unauthorized request
  return res.status(401).json({
    success: false,
    error: 'UNAUTHORIZED_ADMIN_ACCESS: Valid admin API key or authorized admin token required.'
  });
};

// Apply admin auth middleware to all admin routes
adminRouter.use(adminAuthMiddleware);

/**
 * GET /api/admin/trades
 * Filterable, paginated list of trades directly from PostgreSQL
 */
adminRouter.get('/trades', async (req: Request, res: Response) => {
  try {
    const filters = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      accountId: req.query.accountId as string,
      symbol: req.query.symbol as string,
      direction: req.query.direction as string,
      strategy: req.query.strategy as string,
      strategyVersion: req.query.strategyVersion as string,
      outcome: req.query.outcome as 'WIN' | 'LOSS',
      status: req.query.status as 'OPEN' | 'CLOSED',
      environment: req.query.environment as string,
      broker: req.query.broker as string,
      minPnl: req.query.minPnl ? parseFloat(req.query.minPnl as string) : undefined,
      maxPnl: req.query.maxPnl ? parseFloat(req.query.maxPnl as string) : undefined,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20
    };

    const result = await repo.getAdminTrades(filters);
    res.json({
      success: true,
      ...result
    });
  } catch (err: any) {
    logger.error(`Failed to fetch admin trades: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/trades/export
 * Server-side generated CSV download of trade history from PostgreSQL
 */
adminRouter.get('/trades/export', async (req: Request, res: Response) => {
  try {
    const filters = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      accountId: req.query.accountId as string,
      symbol: req.query.symbol as string,
      direction: req.query.direction as string,
      strategy: req.query.strategy as string,
      status: req.query.status as 'OPEN' | 'CLOSED',
      environment: req.query.environment as string,
      broker: req.query.broker as string,
      search: req.query.search as string
    };

    const csvContent = await repo.exportAdminTradesCsv(filters);
    const filename = `quantum_trades_export_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err: any) {
    logger.error(`Failed to export trades CSV: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/trades/:id
 * Full trade detail by positionId or setupId from PostgreSQL
 */
adminRouter.get('/trades/:id', async (req: Request, res: Response) => {
  try {
    const tradeId = String(req.params.id);
    const detail = await repo.getAdminTradeDetail(tradeId);

    if (!detail.position) {
      return res.status(404).json({ success: false, error: `TRADE_NOT_FOUND: ${tradeId}` });
    }

    res.json({
      success: true,
      ...detail
    });
  } catch (err: any) {
    logger.error(`Failed to fetch trade detail ${req.params.id}: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/trades/:id/events
 * Array of trade_events lifecycle events for trade
 */
adminRouter.get('/trades/:id/events', async (req: Request, res: Response) => {
  try {
    const tradeId = String(req.params.id);
    const events = await repo.getTradeEvents(tradeId);
    res.json({
      success: true,
      tradeId,
      events
    });
  } catch (err: any) {
    logger.error(`Failed to fetch trade events ${req.params.id}: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/performance
 * Performance statistics calculated directly from PostgreSQL
 */
adminRouter.get('/performance', async (req: Request, res: Response) => {
  try {
    const accountId = (req.query.accountId as string) || 'DEFAULT';
    const perf = await repo.getAdminPerformance(accountId);
    res.json({
      success: true,
      ...perf
    });
  } catch (err: any) {
    logger.error(`Failed to fetch admin performance: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/learning
 * All adaptive post-mortem learning records from PostgreSQL
 */
adminRouter.get('/learning', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const result = await repo.getAdminLearningRecords(limit, offset);

    res.json({
      success: true,
      ...result
    });
  } catch (err: any) {
    logger.error(`Failed to fetch admin learning records: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/health
 * Admin Data Health reporting database connection, total stats, last DB write, persistence status, and anomalies
 */
adminRouter.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await repo.getAdminDataHealth();
    res.json({
      success: true,
      ...health
    });
  } catch (err: any) {
    logger.error(`Failed to fetch admin data health: ${err.message}`);
    res.status(500).json({
      success: false,
      dbConnection: 'DISCONNECTED',
      error: err.message
    });
  }
});

/**
 * POST /api/admin/reconcile
 * Trigger broker reconciliation for positions in PostgreSQL
 */
adminRouter.post('/reconcile', async (req: Request, res: Response) => {
  try {
    const broker = req.body?.broker || 'PAPER';
    const result = await repo.reconcileBrokerPositions(broker);

    res.json({
      success: true,
      broker,
      ...result
    });
  } catch (err: any) {
    logger.error(`Failed to run broker reconciliation: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/ai-monitoring
 * Backward compatibility route for AI monitoring dashboard
 */
adminRouter.get('/ai-monitoring', async (req: Request, res: Response) => {
  try {
    const perf = await repo.getAdminPerformance('DEFAULT');
    const openRes = await repo.getPositions({ status: 'OPEN', limit: 20 });
    const closedRes = await repo.getPositions({ status: 'CLOSED', limit: 20 });
    const pmRes = await repo.getAdminLearningRecords(20, 0);

    res.json({
      success: true,
      realFigures: {
        totalTrades: perf.totalTrades,
        totalWins: perf.winCount,
        totalLosses: perf.lossCount,
        overallWinRate: perf.winRatePercent,
        totalPnlDollars: perf.totalPnlDollars,
        profitFactor: perf.profitFactor,
        bestPair: perf.bestPair,
        worstPair: perf.worstPair
      },
      pairPerformance: perf.pairPerformance,
      openTrades: openRes.positions,
      recentClosedTrades: closedRes.positions,
      postMortemTradeHistory: pmRes.learningRecords
    });
  } catch (err: any) {
    logger.error(`Failed to fetch AI monitoring: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});
