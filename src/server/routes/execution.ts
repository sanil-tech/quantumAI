import { AccountService } from '../services/accountService';
import { Router, Request, Response } from 'express';
import { executionQueueService } from '../services/executionQueueService';
import { validateExecutionSafety } from '../services/liveExecutionSafetyGuard';
import { ExecutionEnvironment, MarketDataLineage } from '../domain/types';
import { RiskGovernanceEngine } from '../../../apps/risk-governance/src/modules/governanceEngine';
import { authorizeExecution } from '../../../apps/risk-governance/src/modules/executionAuthorization';
import { TradeProposal, RiskApprovalToken, RiskClearedPayload } from '@iati/core-types';
import { ExecutionRouter } from '../../../apps/execution-router/src/router/executionRouter';
import { PaperBrokerAdapter } from '../../../apps/execution-router/src/adapters/paperBrokerAdapter';
import { TradingRepository, PositionRecord, AccountStateRecord, checkDbConnection } from '@iati/database';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { learningService } from '../services/learningService';

export const executionRouter = Router();
export const canonicalExecutionRouter = new ExecutionRouter();
const governanceEngine = new RiskGovernanceEngine();
export const tradingRepo = new TradingRepository();

export interface SharedAutoTrade {
  id: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice?: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  lotSize: number;
  openTime: number;
  status: 'OPEN' | 'CLOSED';
  setupId?: string;
  pnlDollars?: number;
  pnlPips?: number;
  brokerTicket?: string;
  environment?: string;
  accountId?: string;
  broker?: string;
  proposalId?: string;
  approvalId?: string;
  strategyId?: string;
  strategyVersion?: string;
  idempotencyKey?: string;
}

export interface SharedClosedTrade extends SharedAutoTrade {
  closeTime: number;
  exitPrice: number;
  closeReason: string;
}

// In-Memory Read-Through / Write-Through Cache
export const sharedAutoTraderState = {
  openTrades: [] as SharedAutoTrade[],
  closedTrades: [] as SharedClosedTrade[],
  performance: {
    winCount: 0,
    lossCount: 0,
    winRatePercent: 0,
    totalPnlDollars: 0,
    totalPnlPips: 0,
    totalTrades: 0
  }
};

export function mapPositionToAutoTrade(pos: PositionRecord): SharedAutoTrade {
  return {
    id: pos.positionId,
    pair: pos.symbol,
    direction: pos.direction,
    entryPrice: pos.entryPrice,
    stopLoss: pos.stopLoss || 0,
    takeProfit1: pos.takeProfit || 0,
    takeProfit2: pos.takeProfit2 || 0,
    lotSize: pos.quantity,
    openTime: pos.openedAt ? new Date(pos.openedAt).getTime() : Date.now(),
    status: pos.status,
    setupId: pos.setupId,
    pnlDollars: pos.unrealizedProfit,
    pnlPips: pos.pnlPips || 0,
    brokerTicket: pos.ticketId || pos.positionId.replace('trade_', ''),
    environment: pos.environment,
    accountId: pos.accountId,
    broker: pos.broker,
    proposalId: pos.proposalId,
    approvalId: pos.approvalId,
    strategyId: pos.strategyId,
    strategyVersion: pos.strategyVersion,
    idempotencyKey: pos.idempotencyKey
  };
}

export function mapPositionToClosedTrade(pos: PositionRecord): SharedClosedTrade {
  const autoTrade = mapPositionToAutoTrade(pos);
  return {
    ...autoTrade,
    closeTime: pos.closedAt ? new Date(pos.closedAt).getTime() : Date.now(),
    exitPrice: pos.closePrice || pos.currentPrice,
    pnlDollars: pos.realizedProfit,
    pnlPips: pos.pnlPips || 0,
    closeReason: pos.closeReason || 'MANUAL_CLOSE'
  };
}

/**
 * GET /api/autotrader/state
 * Returns shared cloud trade state and pending execution commands directly from persistent DB
 */
executionRouter.get('/autotrader/state', async (req: Request, res: Response) => {
  try {
    const isConnected = await checkDbConnection();
    if (!isConnected) {
      res.status(503).json({
        success: false,
        persistenceStatus: 'PERSISTENCE_UNAVAILABLE',
        error: 'PERSISTENCE_UNAVAILABLE: Database is down or unreachable'
      });
      return;
    }

    const accountId = AccountService.resolveAccountId(req.query.accountId as string);

    const [openPositions, closedPositions, performance, accountStateRecord, pendingCommands] = await Promise.all([
      tradingRepo.getOpenPositions(accountId).catch(() => []),
      tradingRepo.getClosedPositions(accountId, 50).catch(() => []),
      tradingRepo.calculatePerformanceMetrics(accountId).catch(() => ({
        winCount: 0,
        lossCount: 0,
        winRatePercent: 0,
        totalPnlDollars: 0,
        totalPnlPips: 0,
        totalTrades: 0
      })),
      tradingRepo.getAccountState(accountId).catch(() => null),
      executionQueueService.getPendingCommands(accountId).catch(() => [])
    ]);

    const openTrades = openPositions.map(mapPositionToAutoTrade);
    const closedTrades = closedPositions.map(mapPositionToClosedTrade);

    sharedAutoTraderState.openTrades = openTrades;
    sharedAutoTraderState.closedTrades = closedTrades;
    sharedAutoTraderState.performance = performance;

    const state = {
      openTrades,
      closedTrades,
      performance,
      balance: accountStateRecord?.balance ?? 10000,
      initialCapital: accountStateRecord?.initialCapital ?? 10000,
      isAutoEnabled: accountStateRecord?.isAutoEnabled ?? true,
      latestAiRule: accountStateRecord?.latestAiRule || "Peraturan Adaptif #1: Kekalkan pengesahan trend pelbagai rangka masa sebelum pemicu entri.",
      logs: []
    };

    res.json({
      success: true,
      state,
      // Backwards compatibility
      openTrades,
      closedTrades,
      performance,
      pendingCommands
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/autotrader/trades
 * Returns paginated positions from database
 */
executionRouter.get('/autotrader/trades', async (req: Request, res: Response) => {
  try {
    const isConnected = await checkDbConnection();
    if (!isConnected) {
      res.status(503).json({
        success: false,
        persistenceStatus: 'PERSISTENCE_UNAVAILABLE',
        error: 'PERSISTENCE_UNAVAILABLE: Database is down or unreachable'
      });
      return;
    }

    const accountId = AccountService.resolveAccountId(req.query.accountId as string);
    const status = (req.query.status as string) || 'ALL';
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const symbol = req.query.symbol as string;

    const result = await tradingRepo.getPositions({
      accountId,
      status,
      limit,
      offset,
      symbol
    });

    const mappedTrades = result.positions.map(p => 
      p.status === 'CLOSED' ? mapPositionToClosedTrade(p) : mapPositionToAutoTrade(p)
    );

    res.json({
      success: true,
      count: result.totalCount,
      limit,
      offset,
      trades: mappedTrades
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/autotrader/trades/:id
 * Retrieves trade details and execution audit trail from persistent DB
 */
executionRouter.get('/autotrader/trades/:id', async (req: Request, res: Response) => {
  try {
    const tradeId = String(req.params.id);
    const pos = await tradingRepo.getPositionById(tradeId) || await tradingRepo.getPositionByIdempotencyKeyOrSetupId(tradeId, tradeId);
    if (!pos) {
      res.status(404).json({ success: false, error: "TRADE_NOT_FOUND" });
      return;
    }

    const trade = pos.status === 'CLOSED' ? mapPositionToClosedTrade(pos) : mapPositionToAutoTrade(pos);
    const events = await tradingRepo.getTradeEvents(pos.positionId);

    res.json({
      success: true,
      trade,
      events
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/trade/execute (or /api/autotrader/open)
 * Executes auto-trade with persistent DB execution, idempotency, and live execution safety guard
 */
export async function handleExecuteTrade(req: Request, res: Response) {
  try {
    const {
      pair,
      direction,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      lotSize,
      setupId,
      idempotencyKey,
      environment,
      accountNumber,
      broker,
      lineage
    } = req.body;

    if (!pair || !direction || !entryPrice) {
      res.status(400).json({ error: "Pair, direction & entryPrice are required." });
      return;
    }

    const targetEnv: ExecutionEnvironment = environment || req.body.targetEnv || 'DEMO';
    const targetAccount = AccountService.resolveAccountId(accountNumber);
    const targetBroker = broker || 'CTRADER';
    const tradeSetupId = setupId || req.body.tradeSetupId || `setup_${pair.replace('/', '')}_${direction}_${Date.now()}`;

    // 1. Idempotency Check in DB
    const key = typeof idempotencyKey === 'string' ? idempotencyKey : undefined;
    const setup = typeof tradeSetupId === 'string' ? tradeSetupId : undefined;
    if (key || setup) {
      const existingPos = await tradingRepo.getPositionByIdempotencyKeyOrSetupId(key || setup!, setup || key!);
      if (existingPos) {
        const existingTrade = mapPositionToAutoTrade(existingPos);
        res.json({
          success: true,
          message: `Trade already executed and recorded in persistent database (Setup/Idempotency Key: ${existingPos.idempotencyKey || existingPos.setupId})`,
          isDuplicate: true,
          trade: existingTrade,
          mt5Ticket: existingPos.ticketId || existingPos.positionId.replace('trade_', '')
        });
        return;
      }
    }

    // Lineage construction
    const dataLineage: MarketDataLineage = lineage || req.body.dataLineage || {
      dataClass: (req.body.isReal || targetEnv === 'REAL_LIVE') ? 'LIVE' : 'SIMULATED',
      provider: broker || 'cTrader Open API',
      symbol: pair,
      timestamp: Date.now(),
      receivedAt: Date.now()
    };

    // Construct TradeProposal and evaluate Risk Governance
    const proposal: TradeProposal = req.body.proposal || {
      id: `prop-at-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      symbol: pair,
      direction,
      confidence: Number(req.body.confidence ?? 85),
      evidence: Array.isArray(req.body.evidence) ? req.body.evidence : ['AutoTrader Request'],
      agent_votes: [],
      why_direction: req.body.why_direction || `AutoTrader trade: ${direction} ${pair}`,
      invalidate_conditions: [],
      timestamp: new Date()
    };

    let token: RiskApprovalToken | undefined = req.body.token || req.body.approval_token;
    if (!token) {
      const decision = governanceEngine.evaluateTradeProposal(proposal, targetAccount, Number(lotSize || 0.10));
      if (decision.status !== 'APPROVED' || !decision.token || decision.token.status !== 'APPROVED') {
        res.status(403).json({
          error: `RISK_GOVERNANCE_REJECTION: Trade proposal rejected by Risk Governance Engine.`,
          rejectionReasons: decision.rejection_reasons,
          decision
        });
        return;
      }
      token = decision.token;
    }

    // Authorize execution via canonical gateway
    const authResult = await authorizeExecution({
      signalId: proposal.id,
      requestedOrder: {
        symbol: pair,
        direction,
        quantity: Number(lotSize || 0.10),
        price: Number(entryPrice)
      },
      token,
      dataMode: dataLineage.dataClass === 'LIVE' ? 'LIVE' : 'SIMULATION',
      executionMode: targetEnv === 'REAL_LIVE' ? 'LIVE' : 'PAPER'
    });

    if (!authResult.authorized) {
      const isLineageError = authResult.errorCode === 'LINEAGE_VIOLATION';
      res.status(isLineageError ? 422 : 403).json({
        error: isLineageError ? `LINEAGE_VIOLATION: ${authResult.reason}` : (authResult.reason || 'EXECUTION_AUTHORIZATION_FAILED'),
        code: authResult.errorCode,
        authResult
      });
      return;
    }

    // Enqueue command with idempotency & safety guard
    const queueResult = await executionQueueService.enqueueCommand({
      setupId: tradeSetupId,
      symbol: pair,
      side: direction,
      volume: Number(lotSize || 0.10),
      entryPrice: Number(entryPrice),
      stopLoss: Number(stopLoss || 0),
      takeProfit1: Number(takeProfit1 || 0),
      takeProfit2: Number(takeProfit2 || 0),
      broker: targetBroker,
      accountNumber: targetAccount,
      environment: targetEnv,
      lineage: dataLineage,
      idempotencyKey
    });

    if (queueResult.rejected) {
      res.status(422).json({
        error: queueResult.error || "Execution rejected by Live Execution Safety Guard.",
        code: "LINEAGE_SAFETY_VIOLATION",
        command: queueResult.command
      });
      return;
    }

    const ticket = queueResult.command.id.replace('cmd_', '').slice(0, 7);
    const tradeId = `trade_${ticket}`;

    // Save Position Record in PostgreSQL Database
    const posRecord: PositionRecord = {
      positionId: tradeId,
      ticketId: ticket,
      setupId: tradeSetupId,
      accountId: targetAccount,
      symbol: pair,
      direction,
      quantity: Number(lotSize || 0.10),
      entryPrice: Number(entryPrice),
      currentPrice: Number(entryPrice),
      stopLoss: Number(stopLoss || 0),
      takeProfit: Number(takeProfit1 || 0),
      takeProfit2: Number(takeProfit2 || 0),
      unrealizedProfit: 0,
      realizedProfit: 0,
      pnlPips: 0,
      status: 'OPEN',
      broker: targetBroker,
      environment: targetEnv,
      proposalId: proposal.id,
      approvalId: token?.approvalId,
      idempotencyKey: key || undefined,
      openedAt: new Date()
    };

    // Save Position Record in PostgreSQL Database if connected
    const isConnected = await checkDbConnection();
    let savedPos: PositionRecord = posRecord;

    if (isConnected) {
      try {
        savedPos = await tradingRepo.savePosition(posRecord);

        // Save Trade Audit Events
        await tradingRepo.saveTradeEvent({
          id: `evt_sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tradeId,
          setupId: tradeSetupId,
          eventType: 'AI_SIGNAL',
          details: { pair, direction, entryPrice, stopLoss, takeProfit1 }
        });

        await tradingRepo.saveTradeEvent({
          id: `evt_risk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tradeId,
          setupId: tradeSetupId,
          eventType: 'RISK_APPROVED',
          details: { proposalId: proposal.id, approvalId: token?.approvalId }
        });

        await tradingRepo.saveTradeEvent({
          id: `evt_open_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tradeId,
          setupId: tradeSetupId,
          eventType: 'POSITION_OPENED',
          details: { ticket, broker: targetBroker, environment: targetEnv }
        });
      } catch (dbErr: any) {
        console.warn(`[EXECUTION_ROUTE] Database save warning: ${dbErr.message}`);
      }
    }

    const newTrade = mapPositionToAutoTrade(savedPos);

    if (!sharedAutoTraderState.openTrades.some(t => t.id === newTrade.id)) {
      sharedAutoTraderState.openTrades.push(newTrade);
    }

    res.json({
      success: true,
      message: queueResult.isDuplicate 
        ? `Trade command already queued or executed (Idempotency Key: ${queueResult.command.idempotencyKey})`
        : `Trade command successfully enqueued and processed`,
      isDuplicate: queueResult.isDuplicate,
      trade: newTrade,
      command: queueResult.command,
      mt5Ticket: ticket
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

executionRouter.post('/autotrader/open', handleExecuteTrade);
executionRouter.post('/autotrader/trade/execute', handleExecuteTrade);
executionRouter.post('/execution/autotrader-submit', handleExecuteTrade);

/**
 * POST /api/autotrader/trade/close
 * Closes an open trade in persistent database and updates account balance + performance metrics
 */
executionRouter.post('/autotrader/trade/close', async (req: Request, res: Response) => {
  try {
    const { tradeId, exitPrice, closeReason, clientClosedTrade, pnlDollars, pnlPips, pair, direction, accountId } = req.body;
    const targetAccountId = AccountService.resolveAccountId(accountId);
    const targetId = tradeId || (clientClosedTrade && clientClosedTrade.id);

    const isConnected = await checkDbConnection();
    if (!isConnected) {
      const existingInRam = sharedAutoTraderState.openTrades.find(t => t.id === targetId || t.pair === pair);
      const actualExit = Number(exitPrice || existingInRam?.currentPrice || existingInRam?.entryPrice || 1.085);
      const calculatedPnlDollars = pnlDollars !== undefined ? Number(pnlDollars) : 0;
      const calculatedPnlPips = pnlPips !== undefined ? Number(pnlPips) : 0;
      const reason = closeReason || 'MANUAL_CLOSE';

      const closedTrade: SharedClosedTrade = {
        id: targetId || `trade_${Date.now()}`,
        pair: pair || existingInRam?.pair || 'EUR/USD',
        direction: direction || existingInRam?.direction || 'BUY',
        entryPrice: existingInRam?.entryPrice || actualExit,
        stopLoss: existingInRam?.stopLoss || 0,
        takeProfit1: existingInRam?.takeProfit1 || 0,
        lotSize: existingInRam?.lotSize || 0.1,
        openTime: existingInRam?.openTime || Date.now(),
        status: 'CLOSED',
        closeTime: Date.now(),
        exitPrice: actualExit,
        pnlDollars: calculatedPnlDollars,
        pnlPips: calculatedPnlPips,
        closeReason: reason,
        accountId: targetAccountId
      };

      const ramIdx = sharedAutoTraderState.openTrades.findIndex(t => t.id === closedTrade.id || t.pair === closedTrade.pair);
      if (ramIdx !== -1) sharedAutoTraderState.openTrades.splice(ramIdx, 1);
      if (!sharedAutoTraderState.closedTrades.some(t => t.id === closedTrade.id)) {
        sharedAutoTraderState.closedTrades.unshift(closedTrade);
      }

      res.json({
        success: true,
        closedTrade,
        performance: sharedAutoTraderState.performance,
        newBalance: 10000 + calculatedPnlDollars
      });
      return;
    }

    let pos = targetId ? await tradingRepo.getPositionById(targetId) : null;

    if (!pos && targetId) {
      pos = await tradingRepo.getPositionByIdempotencyKeyOrSetupId(targetId, targetId);
    }

    if (!pos) {
      const openPositions = await tradingRepo.getOpenPositions(targetAccountId);
      if (pair) {
        pos = openPositions.find(p => p.symbol === pair) || null;
      } else if (openPositions.length > 0) {
        pos = openPositions[0];
      }
    }

    if (!pos) {
      res.status(404).json({ error: `POSITION_NOT_FOUND: Trade ${targetId || pair} not found in database` });
      return;
    }

    const actualExit = Number(exitPrice || pos.currentPrice || pos.entryPrice);
    const pipScale = pos.symbol.includes('JPY') ? 100 : (['NASDAQ', 'BTC/USD', 'XAU/USD'].includes(pos.symbol) ? 1 : 10000);
    const priceDiff = pos.direction === 'BUY' ? (actualExit - pos.entryPrice) : (pos.entryPrice - actualExit);
    const calculatedPnlPips = pnlPips !== undefined ? Number(pnlPips) : Math.round(priceDiff * pipScale);
    const calculatedPnlDollars = pnlDollars !== undefined ? Number(pnlDollars) : Number((calculatedPnlPips * pos.quantity * 10).toFixed(2));
    const reason = closeReason || (calculatedPnlDollars >= 0 ? 'TP1_HIT' : 'SL_HIT');

    // Atomically close position in PostgreSQL DB
    const closeResult = await tradingRepo.closePositionTransaction({
      positionId: pos.positionId,
      closePrice: actualExit,
      realizedProfit: calculatedPnlDollars,
      pnlPips: calculatedPnlPips,
      closeReason: reason,
      accountId: pos.accountId || targetAccountId
    });

    // Save Trade Audit Event
    await tradingRepo.saveTradeEvent({
      id: `evt_close_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tradeId: pos.positionId,
      setupId: pos.setupId,
      eventType: reason.includes('SL') ? 'SL_HIT' : (reason.includes('TP') ? 'TP_HIT' : 'MANUAL_CLOSE'),
      details: { exitPrice: actualExit, pnlDollars: calculatedPnlDollars, pnlPips: calculatedPnlPips, reason }
    });

    // Publish TradeClosedEvent to EventBus & auto-trigger persistent LearningService
    const tradeClosedPayload: TradeClosedPayload = {
      tradeId: closeResult.position.positionId,
      positionId: closeResult.position.positionId,
      accountId: closeResult.position.accountId,
      symbol: closeResult.position.symbol,
      direction: closeResult.position.direction,
      entryPrice: closeResult.position.entryPrice,
      exitPrice: closeResult.position.closePrice || actualExit,
      stopLoss: closeResult.position.stopLoss || 0,
      takeProfit: closeResult.position.takeProfit || 0,
      pnlDollars: closeResult.position.realizedProfit,
      pnlPips: closeResult.position.pnlPips || calculatedPnlPips,
      proposalId: closeResult.position.proposalId,
      approvalId: closeResult.position.approvalId,
      strategyId: closeResult.position.strategyId,
      strategyVersion: closeResult.position.strategyVersion,
      environment: closeResult.position.environment,
      closedAt: closeResult.position.closedAt || new Date()
    };

    await globalEventBus.publish({
      id: `evt_close_bus_${Date.now()}`,
      type: EventTypes.TradeClosed,
      timestamp: new Date(),
      payload: tradeClosedPayload
    });

    try {
      await learningService.processClosedTrade(tradeClosedPayload);
    } catch (learnErr: any) {
      console.warn(`[EXECUTION_ROUTE] Learning auto-process notice: ${learnErr.message}`);
    }

    const closedTrade = mapPositionToClosedTrade(closeResult.position);

    // Calculate updated performance directly from persistent DB
    const performance = await tradingRepo.calculatePerformanceMetrics(pos.accountId || targetAccountId);

    // Update RAM cache
    const cacheIdx = sharedAutoTraderState.openTrades.findIndex(t => t.id === pos!.positionId);
    if (cacheIdx !== -1) sharedAutoTraderState.openTrades.splice(cacheIdx, 1);
    if (!sharedAutoTraderState.closedTrades.some(t => t.id === closedTrade.id)) {
      sharedAutoTraderState.closedTrades.unshift(closedTrade);
    }
    sharedAutoTraderState.performance = performance;

    res.json({
      success: true,
      closedTrade,
      performance,
      newBalance: closeResult.newBalance
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/reset
 * Resets shared cloud auto-trader state
 */
executionRouter.post('/autotrader/reset', async (req: Request, res: Response) => {
  try {
    sharedAutoTraderState.openTrades = [];
    sharedAutoTraderState.closedTrades = [];
    await executionQueueService.clearPendingCommands(AccountService.resolveAccountId());
    res.json({ success: true, message: "Shared AutoTrader state and pending execution commands reset successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/sync
 * Syncs account state preferences without overwriting DB trade records
 */
executionRouter.post('/autotrader/sync', async (req: Request, res: Response) => {
  try {
    const { isAutoEnabled, balance, initialCapital, latestAiRule, accountId } = req.body;
    const targetAccount = AccountService.resolveAccountId(accountId);

    if (typeof balance === 'number' || isAutoEnabled !== undefined || latestAiRule) {
      const existingState = await tradingRepo.getAccountState(targetAccount).catch(() => null);
      await tradingRepo.saveAccountState({
        accountId: targetAccount,
        isAutoEnabled: isAutoEnabled !== undefined ? Boolean(isAutoEnabled) : (existingState?.isAutoEnabled ?? true),
        balance: typeof balance === 'number' && balance > 0 ? balance : (existingState?.balance ?? 10000),
        initialCapital: typeof initialCapital === 'number' && initialCapital > 0 ? initialCapital : (existingState?.initialCapital ?? 10000),
        riskPercent: existingState?.riskPercent || 1.0,
        latestAiRule: latestAiRule || existingState?.latestAiRule
      }).catch(err => console.error('Failed to save account state in sync:', err));
    }

    const openPositions = await tradingRepo.getOpenPositions(targetAccount);
    const closedPositions = await tradingRepo.getClosedPositions(targetAccount, 50);
    const performance = await tradingRepo.calculatePerformanceMetrics(targetAccount);
    const accountState = await tradingRepo.getAccountState(targetAccount);

    const openTrades = openPositions.map(mapPositionToAutoTrade);
    const closedTrades = closedPositions.map(mapPositionToClosedTrade);

    res.json({
      success: true,
      message: "Synced with persistent database",
      state: {
        openTrades,
        closedTrades,
        performance,
        balance: accountState?.balance ?? 10000,
        initialCapital: accountState?.initialCapital ?? 10000,
        isAutoEnabled: accountState?.isAutoEnabled ?? true,
        latestAiRule: accountState?.latestAiRule || ""
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/execution/orders
 * Returns all orders managed by ExecutionRouter
 */
executionRouter.get('/execution/orders', (req: Request, res: Response) => {
  const orders = canonicalExecutionRouter.orderManager.getAllOrders();
  res.json({ count: orders.length, orders });
});

/**
 * GET /api/execution/positions
 * Returns all open positions from configured broker adapters
 */
executionRouter.get('/execution/positions', async (req: Request, res: Response) => {
  const positions = await canonicalExecutionRouter.getAllPositions();
  res.json({ count: positions.length, positions });
});

/**
 * GET /api/execution/performance
 * Returns performance metrics from ExecutionRouter
 */
executionRouter.get('/execution/performance', async (req: Request, res: Response) => {
  const accountStatuses = await canonicalExecutionRouter.getAccountStatuses();
  const primaryAccountStatus = accountStatuses[0];
  const orders = canonicalExecutionRouter.orderManager.getAllOrders();
  const filledCount = orders.filter(o => o.status === 'FILLED').length;
  const rejectedCount = orders.filter(o => o.status === 'REJECTED').length;

  const paperBroker = canonicalExecutionRouter.getBroker(canonicalExecutionRouter.defaultBrokerId) as PaperBrokerAdapter;

  res.json({
    account_status: primaryAccountStatus,
    account_statuses: accountStatuses,
    metrics: {
      total_orders: orders.length,
      filled_orders: filledCount,
      rejected_orders: rejectedCount,
      average_slippage_pips: paperBroker && paperBroker.simulationEngine ? paperBroker.simulationEngine.getSlippageEngine().getAverageSlippagePips() : 0
    }
  });
});

/**
 * POST /api/execution/order
 * Direct execution route for RiskCleared payloads
 */
executionRouter.post('/execution/order', async (req: Request, res: Response) => {
  try {
    const payload = req.body as RiskClearedPayload;
    if (!payload || !payload.approval_id || !payload.trade_proposal) {
      res.status(400).json({ error: "Valid RiskCleared payload with approval_id and trade_proposal required" });
      return;
    }
    const result = await canonicalExecutionRouter.handleRiskCleared(payload);
    res.json({ message: "Execution order routed successfully", result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
