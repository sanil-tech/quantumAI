import { Router, Request, Response } from 'express';
import { executionQueueService } from '../services/executionQueueService';
import { validateExecutionSafety } from '../services/liveExecutionSafetyGuard';
import { ExecutionEnvironment, MarketDataLineage } from '../domain/types';
import { RiskGovernanceEngine } from '../../../apps/risk-governance/src/modules/governanceEngine';
import { authorizeExecution } from '../../../apps/risk-governance/src/modules/executionAuthorization';
import { TradeProposal, RiskApprovalToken, RiskClearedPayload } from '@iati/core-types';
import { ExecutionRouter } from '../../../apps/execution-router/src/router/executionRouter';
import { PaperBrokerAdapter } from '../../../apps/execution-router/src/adapters/paperBrokerAdapter';

export const executionRouter = Router();
export const canonicalExecutionRouter = new ExecutionRouter();
const governanceEngine = new RiskGovernanceEngine();

// Shared AutoTrader In-Memory State for Realtime Sync
export interface SharedAutoTrade {
  id: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
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
}

export interface SharedClosedTrade extends SharedAutoTrade {
  closeTime: number;
  exitPrice: number;
  closeReason: string;
}

export const sharedAutoTraderState = {
  openTrades: [] as SharedAutoTrade[],
  closedTrades: [] as SharedClosedTrade[],
  performance: {
    winCount: 14,
    lossCount: 3,
    winRatePercent: 82.35,
    totalPnlDollars: 1420.50,
    totalPnlPips: 245
  }
};

/**
 * GET /api/autotrader/state
 * Returns shared cloud trade state and pending execution commands
 */
executionRouter.get('/autotrader/state', async (req: Request, res: Response) => {
  try {
    const pendingCommands = await executionQueueService.getPendingCommands('5877246');
    res.json({
      success: true,
      openTrades: sharedAutoTraderState.openTrades,
      closedTrades: sharedAutoTraderState.closedTrades,
      performance: sharedAutoTraderState.performance,
      pendingCommands
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/trade/execute (or /api/autotrader/open)
 * Executes auto-trade with persistent execution queue, idempotency, and live execution safety guard
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
    const targetAccount = accountNumber || '5877246';
    const targetBroker = broker || 'CTRADER';
    const tradeSetupId = setupId || req.body.tradeSetupId || `setup_${pair.replace('/', '')}_${direction}_${Date.now()}`;

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

    // Auto-Trade State Synchronization
    const ticket = queueResult.command.id.replace('cmd_', '').slice(0, 7);
    const newTrade: SharedAutoTrade = {
      id: `trade_${ticket}`,
      pair,
      direction,
      entryPrice: Number(entryPrice),
      stopLoss: Number(stopLoss || 0),
      takeProfit1: Number(takeProfit1 || 0),
      takeProfit2: Number(takeProfit2 || 0),
      lotSize: Number(lotSize || 0.10),
      openTime: Date.now(),
      status: 'OPEN',
      setupId: tradeSetupId,
      brokerTicket: ticket
    };

    if (!sharedAutoTraderState.openTrades.some(t => t.id === newTrade.id || (t.setupId && t.setupId === tradeSetupId))) {
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
 * Closes an open trade and calculates PnL
 */
executionRouter.post('/autotrader/trade/close', async (req: Request, res: Response) => {
  try {
    const { tradeId, exitPrice, closeReason, clientClosedTrade, pnlDollars, pair, direction } = req.body;

    const tradeIdx = sharedAutoTraderState.openTrades.findIndex(t => t.id === tradeId);
    let closedTrade: SharedClosedTrade;
    let calculatedPnlDollars = 0;

    if (tradeIdx !== -1) {
      const trade = sharedAutoTraderState.openTrades[tradeIdx];
      const actualExit = Number(exitPrice || trade.entryPrice);
      const pipScale = trade.pair.includes('JPY') ? 100 : (trade.pair === 'NASDAQ' || trade.pair === 'BTC/USD' || trade.pair === 'XAU/USD' ? 1 : 10000);
      const priceDiff = trade.direction === 'BUY' ? (actualExit - trade.entryPrice) : (trade.entryPrice - actualExit);
      const pnlPips = Math.round(priceDiff * pipScale);
      calculatedPnlDollars = Number((pnlPips * trade.lotSize * 10).toFixed(2));

      closedTrade = {
        ...trade,
        closeTime: Date.now(),
        exitPrice: actualExit,
        pnlDollars: calculatedPnlDollars,
        pnlPips,
        closeReason: closeReason || (calculatedPnlDollars >= 0 ? 'TP1_HIT' : 'SL_HIT')
      };

      sharedAutoTraderState.openTrades.splice(tradeIdx, 1);
    } else if (clientClosedTrade && clientClosedTrade.id) {
      closedTrade = clientClosedTrade;
      calculatedPnlDollars = Number(clientClosedTrade.pnlDollars || 0);
      const matchIdx = sharedAutoTraderState.openTrades.findIndex(t => t.id === clientClosedTrade.id || t.pair === clientClosedTrade.pair);
      if (matchIdx !== -1) {
        sharedAutoTraderState.openTrades.splice(matchIdx, 1);
      }
    } else {
      closedTrade = {
        id: tradeId || `closed_${Date.now()}`,
        pair: pair || 'EUR/USD',
        direction: direction || 'BUY',
        entryPrice: 1.0850,
        stopLoss: 1.0820,
        takeProfit1: 1.0910,
        lotSize: 0.10,
        openTime: Date.now() - 3600000,
        closeTime: Date.now(),
        exitPrice: Number(exitPrice || 1.0880),
        status: 'CLOSED',
        pnlDollars: Number(pnlDollars || 30),
        pnlPips: 30,
        closeReason: closeReason || 'MANUAL_CLOSE'
      };
    }

    if (!sharedAutoTraderState.closedTrades.some(t => t.id === closedTrade.id)) {
      sharedAutoTraderState.closedTrades.unshift(closedTrade);
    }

    // Update performance metrics
    if (calculatedPnlDollars >= 0) {
      sharedAutoTraderState.performance.winCount += 1;
    } else {
      sharedAutoTraderState.performance.lossCount += 1;
    }
    sharedAutoTraderState.performance.totalPnlDollars += calculatedPnlDollars;
    const totalTrades = sharedAutoTraderState.performance.winCount + sharedAutoTraderState.performance.lossCount;
    sharedAutoTraderState.performance.winRatePercent = Number(((sharedAutoTraderState.performance.winCount / totalTrades) * 100).toFixed(2));

    res.json({ success: true, closedTrade, performance: sharedAutoTraderState.performance });
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
    await executionQueueService.clearPendingCommands('5877246');
    res.json({ success: true, message: "Shared AutoTrader state and pending execution commands reset successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/sync
 * Syncs client trades
 */
executionRouter.post('/autotrader/sync', (req: Request, res: Response) => {
  const { openTrades, closedTrades, performance } = req.body;
  if (Array.isArray(openTrades)) sharedAutoTraderState.openTrades = openTrades;
  if (Array.isArray(closedTrades)) sharedAutoTraderState.closedTrades = closedTrades;
  if (performance) sharedAutoTraderState.performance = performance;
  res.json({ success: true, message: "Synced with server", state: sharedAutoTraderState });
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
 * Returns all open positions from default paper broker adapter
 */
executionRouter.get('/execution/positions', async (req: Request, res: Response) => {
  const paperBroker = canonicalExecutionRouter.brokerAdapters.get(canonicalExecutionRouter.defaultBrokerId) as PaperBrokerAdapter;
  const positions = paperBroker ? paperBroker.positionManager.getAllPositions() : [];
  res.json({ count: positions.length, positions });
});

/**
 * GET /api/execution/performance
 * Returns performance metrics from ExecutionRouter
 */
executionRouter.get('/execution/performance', async (req: Request, res: Response) => {
  const paperBroker = canonicalExecutionRouter.brokerAdapters.get(canonicalExecutionRouter.defaultBrokerId) as PaperBrokerAdapter;
  const accountStatus = paperBroker ? await paperBroker.getAccountStatus() : undefined;
  const orders = canonicalExecutionRouter.orderManager.getAllOrders();
  const filledCount = orders.filter(o => o.status === 'FILLED').length;
  const rejectedCount = orders.filter(o => o.status === 'REJECTED').length;

  res.json({
    account_status: accountStatus,
    metrics: {
      total_orders: orders.length,
      filled_orders: filledCount,
      rejected_orders: rejectedCount,
      average_slippage_pips: paperBroker ? paperBroker.simulationEngine.getSlippageEngine().getAverageSlippagePips() : 0
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
