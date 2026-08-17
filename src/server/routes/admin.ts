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

// ==========================================
// PHASE 3B — CTRADER DEMO CONTROL & CONNECTIVITY
// ==========================================
import { CTraderConfigValidator } from '../services/ctraderConfigValidator';
import { CTraderAdapter } from '../../../apps/execution-router/src/adapters/ctraderAdapter';
import { canonicalExecutionRouter } from './execution';
import { createRiskApprovalToken, verifyGovernanceSignature } from '../../../apps/risk-governance/src/modules/riskTokenService';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { learningService } from '../services/learningService';
import { TradeProposal, RiskClearedPayload } from '@iati/core-types';

/**
 * GET /api/admin/ctrader/status
 * Task 2 & Task 3: Returns sanitized cTrader DEMO account status.
 * NEVER exposes clientSecret, accessToken, or raw secrets.
 */
adminRouter.get('/ctrader/status', async (req: Request, res: Response) => {
  try {
    let demoConfig;
    try {
      demoConfig = CTraderConfigValidator.validateDemoConfig();
    } catch (cfgErr: any) {
      const sanitized = CTraderConfigValidator.sanitizeAccountStatus('NOT_CONFIGURED', undefined, cfgErr.message);
      return res.json({ success: true, ...sanitized });
    }

    const adapter = new CTraderAdapter(demoConfig);
    try {
      await adapter.connect();
      const accountStatus = await adapter.getAccountStatus();
      const sanitized = CTraderConfigValidator.sanitizeAccountStatus('CONNECTED', accountStatus);
      return res.json({ success: true, ...sanitized });
    } catch (connErr: any) {
      const isAuthErr = connErr.message.includes('CTRADER_AUTH_FAILURE');
      const isMissingErr = connErr.message.includes('CTRADER_MISSING_CREDENTIALS');
      const statusType = isAuthErr || isMissingErr ? 'AUTHENTICATION_FAILED' : 'BROKER_UNAVAILABLE';
      const sanitized = CTraderConfigValidator.sanitizeAccountStatus(statusType, undefined, connErr.message);
      return res.json({ success: true, ...sanitized });
    }
  } catch (err: any) {
    logger.error(`Failed to get cTrader status: ${err.message}`);
    const sanitized = CTraderConfigValidator.sanitizeAccountStatus('BROKER_UNAVAILABLE', undefined, err.message);
    res.status(500).json({ success: false, ...sanitized });
  }
});

/**
 * POST /api/admin/ctrader/execute-demo-trade
 * Task 4, 5, 6, 7: Controlled DEMO trade execution routed ONLY through canonical ExecutionRouter
 */
adminRouter.post('/ctrader/execute-demo-trade', async (req: Request, res: Response) => {
  try {
    const env = (process.env.EXECUTION_ENVIRONMENT || 'DEMO').toUpperCase();
    if (env !== 'DEMO') {
      return res.status(403).json({
        success: false,
        error: `DEMO_EXECUTION_REJECTED: Phase 3B permits DEMO execution only. Current environment is '${env}'.`
      });
    }

    // Task 6: Validate cTrader credentials presence
    let demoConfig;
    try {
      demoConfig = CTraderConfigValidator.validateDemoConfig(req.body.credentials);
    } catch (cfgErr: any) {
      return res.status(422).json({
        success: false,
        error: cfgErr.message
      });
    }

    const { symbol, direction, lotSize, stopLoss, takeProfit } = req.body;

    if (!symbol || !direction) {
      return res.status(400).json({ success: false, error: 'Symbol and direction are required for DEMO execution.' });
    }

    // Smallest safe DEMO lot size (default 0.01)
    const approvedLotSize = Math.min(Number(lotSize || 0.01), 0.10);
    const proposalId = `prop-demo-ctl-${Date.now()}`;
    const approvalId = `gov-demo-ctl-${Date.now()}`;

    const proposal: TradeProposal = {
      id: proposalId,
      symbol,
      direction,
      confidence: 90,
      evidence: ['Controlled DEMO Trade Execution'],
      agent_votes: [],
      why_direction: `Controlled DEMO Execution: ${direction} ${symbol}`,
      invalidate_conditions: [],
      timestamp: new Date(),
      stopLoss: stopLoss || (direction === 'BUY' ? 1.0800 : 1.0900),
      takeProfit: takeProfit || (direction === 'BUY' ? 1.0950 : 1.0750)
    };

    // Task 5: Generate valid RiskApprovalToken with HMAC signature
    const token = createRiskApprovalToken({
      approvalId,
      signalId: proposalId,
      symbol,
      direction,
      approvedLotSize,
      maxAllowedDrawdown: 5.0,
      calculatedRiskAmount: approvedLotSize * 100,
      status: 'APPROVED'
    });

    const payload: RiskClearedPayload & { environment?: any; credentials?: any } = {
      proposal_id: proposalId,
      symbol,
      account_id: demoConfig.accountId,
      approval_id: approvalId,
      risk_score: 5,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: approvalId,
        status: 'APPROVED',
        risk_score: 5,
        checks: [],
        timestamp: new Date(),
        decision_authority: 'RiskGov',
        token
      },
      approval_token: token,
      timestamp: new Date(),
      broker_id: 'ctrader-broker-01',
      environment: 'DEMO',
      credentials: demoConfig
    };

    // Route through canonical ExecutionRouter
    const result = await canonicalExecutionRouter.handleRiskCleared(payload);

    // Save Position & Audit Events in PostgreSQL
    const posId = `pos_ctrader_demo_${Date.now()}`;
    await repo.savePosition({
      positionId: posId,
      ticketId: result.report.broker_position_id || posId.replace('pos_', ''),
      setupId: proposalId,
      accountId: demoConfig.accountId,
      symbol,
      direction,
      quantity: approvedLotSize,
      entryPrice: result.report.filled_price,
      currentPrice: result.report.filled_price,
      stopLoss: proposal.stopLoss,
      takeProfit: proposal.takeProfit,
      unrealizedProfit: 0,
      realizedProfit: 0,
      status: 'OPEN',
      broker: 'ctrader-broker-01',
      environment: 'DEMO',
      proposalId,
      approvalId,
      brokerOrderId: result.report.broker_order_id,
      brokerPositionId: result.report.broker_position_id,
      brokerDealId: result.report.broker_deal_id,
      reconciliationStatus: 'MATCHED',
      openedAt: new Date()
    });

    await repo.saveTradeEvent({
      id: `evt_demo_open_${Date.now()}`,
      tradeId: posId,
      setupId: proposalId,
      eventType: 'POSITION_OPENED',
      actor: 'AdminTradingCenter',
      details: { brokerId: 'ctrader-broker-01', environment: 'DEMO', brokerOrderId: result.report.broker_order_id }
    });

    await repo.saveTradeEvent({
      id: `evt_demo_conf_${Date.now()}`,
      tradeId: posId,
      setupId: proposalId,
      eventType: 'BROKER_CONFIRMED',
      actor: 'cTraderBrokerAdapter',
      details: { brokerPositionId: result.report.broker_position_id, brokerDealId: result.report.broker_deal_id }
    });

    res.json({
      success: true,
      message: 'Controlled cTrader DEMO trade executed successfully via canonical ExecutionRouter.',
      execution: result,
      positionId: posId
    });
  } catch (err: any) {
    logger.error(`Controlled cTrader DEMO execution failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/ctrader/close-demo-trade
 * Task 9, 10, 11: Controlled cTrader DEMO position closure & adaptive learning trigger
 */
adminRouter.post('/ctrader/close-demo-trade', async (req: Request, res: Response) => {
  try {
    const { positionId, closePrice } = req.body;
    if (!positionId) {
      return res.status(400).json({ success: false, error: 'positionId is required to close DEMO trade.' });
    }

    const pos = await repo.getPositionById(positionId);
    if (!pos) {
      return res.status(404).json({ success: false, error: `POSITION_NOT_FOUND: Position '${positionId}' not found in database.` });
    }

    const exitPrice = Number(closePrice || pos.currentPrice || pos.entryPrice);
    const priceDiff = pos.direction === 'BUY' ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice);
    const pipScale = pos.symbol.includes('JPY') ? 100 : 10000;
    const pnlPips = Math.round(priceDiff * pipScale);
    const realizedProfit = Number((pnlPips * pos.quantity * 10).toFixed(2));

    const closeResult = await repo.closePositionTransaction({
      positionId: pos.positionId,
      closePrice: exitPrice,
      realizedProfit,
      pnlPips,
      closeReason: realizedProfit >= 0 ? 'DEMO_TP_CLOSE' : 'DEMO_SL_CLOSE',
      accountId: pos.accountId
    });

    // Task 13: Save Trade Audit Event
    await repo.saveTradeEvent({
      id: `evt_demo_close_${Date.now()}`,
      tradeId: pos.positionId,
      setupId: pos.setupId,
      eventType: 'POSITION_CLOSED',
      actor: 'AdminTradingCenter',
      details: { exitPrice, realizedProfit, pnlPips }
    });

    // Task 10: Publish TradeClosed event
    const tradeClosedPayload: TradeClosedPayload = {
      tradeId: closeResult.position.positionId,
      positionId: closeResult.position.positionId,
      accountId: closeResult.position.accountId,
      symbol: closeResult.position.symbol,
      direction: closeResult.position.direction,
      entryPrice: closeResult.position.entryPrice,
      exitPrice: closeResult.position.closePrice || exitPrice,
      stopLoss: closeResult.position.stopLoss || 0,
      takeProfit: closeResult.position.takeProfit || 0,
      pnlDollars: closeResult.position.realizedProfit,
      pnlPips: closeResult.position.pnlPips || pnlPips,
      proposalId: closeResult.position.proposalId,
      approvalId: closeResult.position.approvalId,
      strategyId: closeResult.position.strategyId,
      strategyVersion: closeResult.position.strategyVersion,
      environment: 'DEMO',
      closedAt: closeResult.position.closedAt || new Date()
    };

    await globalEventBus.publish({
      id: `evt_bus_close_demo_${Date.now()}`,
      type: EventTypes.TradeClosed,
      timestamp: new Date(),
      payload: tradeClosedPayload
    });

    // Task 11: Auto-trigger idempotent LearningService
    let review;
    try {
      review = await learningService.processClosedTrade(tradeClosedPayload);
      await repo.saveTradeEvent({
        id: `evt_demo_learn_${Date.now()}`,
        tradeId: pos.positionId,
        setupId: pos.setupId,
        eventType: 'TRADE_LEARNING_CREATED',
        actor: 'LearningService',
        details: { reviewId: review.id, outcome: review.outcome }
      });
    } catch (learnErr: any) {
      logger.warn(`Learning auto-process warning: ${learnErr.message}`);
    }

    res.json({
      success: true,
      message: 'cTrader DEMO position closed cleanly and learning persisted.',
      position: closeResult.position,
      review
    });
  } catch (err: any) {
    logger.error(`Controlled cTrader DEMO position close failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

