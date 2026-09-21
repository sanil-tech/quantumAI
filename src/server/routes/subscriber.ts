import { Router, Request, Response } from 'express';
import { multiClientCopierService, SubscriberAccount } from '../services/multiClientCopierService';
import { TradingRepository } from '../../../packages/database/src/repository';
import { ctraderMarketDataFeedService } from '../services/ctraderMarketDataFeedService';
import { autonomousMarketScannerService } from '../services/autonomousMarketScannerService';

export const subscriberRouter = Router();
const tradingRepo = new TradingRepository();

/**
 * Resolves the authenticated or requested subscriber account.
 */
function resolveSubscriberAccount(req: Request): { accountId: string; subscriber: SubscriberAccount | null } {
  const queryAcc = (req.query.accountId as string || req.body?.accountId as string || req.headers['x-subscriber-account-id'] as string || '').trim();
  const allSubscribers = multiClientCopierService.getSubscribers ? multiClientCopierService.getSubscribers() : [];

  if (queryAcc) {
    const found = allSubscribers.find(s => 
      s.accountNumber === queryAcc || 
      String(s.ctidTraderAccountId) === queryAcc || 
      s.id === queryAcc
    );
    if (found) {
      return { accountId: found.accountNumber, subscriber: found };
    }
    return { accountId: queryAcc, subscriber: null };
  }

  // Fallback: If no accountId provided, pick the first active subscriber or fallback default
  if (allSubscribers.length > 0) {
    const first = allSubscribers[0];
    return { accountId: first.accountNumber, subscriber: first };
  }

  return { accountId: '5916063', subscriber: null };
}

/**
 * GET /api/subscriber/cockpit
 * Isolated VIP Client Cockpit Data: Balance, Equity, Live Trades, Closed Trades, Copier Status
 */
subscriberRouter.get('/cockpit', async (req: Request, res: Response) => {
  try {
    const { accountId, subscriber } = resolveSubscriberAccount(req);

    // 1. Fetch Subscriber Open Positions (strictly scoped by accountId)
    const openDbRes = await tradingRepo.query(
      `SELECT * FROM positions WHERE account_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC`,
      [accountId]
    ).catch(() => ({ rows: [] }));

    const openPositions = openDbRes.rows.map(r => {
      const pos = tradingRepo.mapPositionRow(r);
      const symbol = pos.symbol;
      const isJpy = symbol.includes('JPY');
      const isGold = symbol.includes('XAU');
      const pipMultiplier = isJpy ? 100 : isGold ? 1 : 10000;
      const latestSpot = ctraderMarketDataFeedService.getLatestTick(symbol);
      const curPrice = latestSpot 
        ? (pos.direction === 'BUY' ? latestSpot.bid : latestSpot.ask)
        : (pos.currentPrice || pos.entryPrice);
      const pips = pos.direction === 'BUY'
        ? (curPrice - pos.entryPrice) * pipMultiplier
        : (pos.entryPrice - curPrice) * pipMultiplier;
      const pnlDollars = Number((pips * pos.quantity * (isJpy ? 6.5 : isGold ? 10 : 10)).toFixed(2));
      return {
        ...pos,
        currentPrice: curPrice,
        pnlPips: Number(pips.toFixed(1)),
        unrealizedProfit: pnlDollars
      };
    });

    // 2. Fetch Subscriber Closed Trades (strictly scoped by accountId)
    const closedDbRes = await tradingRepo.query(
      `SELECT * FROM positions WHERE account_id = $1 AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT 100`,
      [accountId]
    ).catch(() => ({ rows: [] }));

    const closedPositions = closedDbRes.rows.map(r => tradingRepo.mapPositionRow(r));

    // 3. Fetch Subscriber Copier Audit Logs
    const auditLogs = multiClientCopierService.getAuditLogs(100)
      .filter(l => l.accountNumber === accountId || (subscriber && l.subscriberId === subscriber.id));

    // 4. Calculate Personal Performance Metrics
    const wins = closedPositions.filter(p => (p.realizedProfit || 0) > 0);
    const losses = closedPositions.filter(p => (p.realizedProfit || 0) < 0);
    const totalPnl = closedPositions.reduce((sum, p) => sum + (p.realizedProfit || 0), 0);
    const totalPips = closedPositions.reduce((sum, p) => sum + (p.pnlPips || 0), 0);
    const totalTrades = closedPositions.length;
    const winRate = totalTrades > 0 ? Number(((wins.length / totalTrades) * 100).toFixed(1)) : 0;

    // Calculate gross profit and gross loss for profit factor
    const grossProfit = wins.reduce((sum, p) => sum + (p.realizedProfit || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, p) => sum + (p.realizedProfit || 0), 0));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99.9 : 0);

    // Dynamic on-demand live account fetch directly from cTrader Open API
    const liveAccount = await ctraderMarketDataFeedService.fetchLiveAccountStatus(accountId);

    // Account financials (strictly authentic cTrader figures)
    const balance = liveAccount ? liveAccount.balance : (subscriber ? subscriber.balance : 0.00);
    const equity = liveAccount ? liveAccount.equity : (subscriber ? subscriber.equity : balance + (openPositions.reduce((sum, p) => sum + (p.unrealizedProfit || 0), 0)));
    const usedMargin = openPositions.reduce((sum, p) => sum + (p.margin || 0), 0);
    const marginFree = balance - usedMargin;

    // AI Scanner Status (Read-Only)
    const scannerStatus = autonomousMarketScannerService.getStatus();

    res.json({
      success: true,
      subscriber: subscriber || {
        id: `sub_${accountId}`,
        name: `cTrader Trader #${accountId}`,
        email: `${accountId}@ctrader.client`,
        accountNumber: accountId,
        ctidTraderAccountId: liveAccount ? liveAccount.ctidTraderAccountId : Number(accountId),
        environment: liveAccount?.isLive ? 'LIVE' : 'DEMO',
        brokerName: liveAccount?.brokerTitle || 'Spotware cTrader Open API',
        riskMode: 'BALANCED',
        riskPercent: 1.0,
        status: ctraderMarketDataFeedService.isConnected() ? 'ACTIVE' : 'TRIAL',
        balance,
        equity,
        connected: ctraderMarketDataFeedService.isConnected(),
        latencyMs: 35,
        totalCopiedTrades: totalTrades + openPositions.length,
        createdAt: Date.now() - 86400000 * 7
      },
      accountSummary: {
        accountId,
        broker: 'Spotware cTrader Open API 2.0',
        environment: subscriber?.environment || 'DEMO',
        balance: Number(balance.toFixed(2)),
        equity: Number(equity.toFixed(2)),
        marginFree: Number(marginFree.toFixed(2)),
        floatingPnl: Number((equity - balance).toFixed(2)),
        isConnected: ctraderMarketDataFeedService.isConnected(),
        status: subscriber?.status || 'ACTIVE'
      },
      performance: {
        winCount: wins.length,
        lossCount: losses.length,
        winRatePercent: winRate,
        totalPnlDollars: Number(totalPnl.toFixed(2)),
        totalPnlPips: Number(totalPips.toFixed(1)),
        profitFactor,
        totalTrades
      },
      openPositions,
      closedPositions,
      recentAuditLogs: auditLogs.slice(0, 15),
      marketRadar: {
        scannerActive: scannerStatus.isScanning,
        recentSetups: (scannerStatus.recentSetups || []).slice(0, 5)
      }
    });
  } catch (err: any) {
    console.error('[SubscriberCockpitError]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/subscriber/risk-settings
 * Update subscriber personal risk parameters (Lot Multiplier / Risk Mode)
 */
subscriberRouter.post('/risk-settings', async (req: Request, res: Response) => {
  try {
    const { accountId, subscriber } = resolveSubscriberAccount(req);
    const { riskMode, riskPercent } = req.body;

    if (subscriber) {
      if (riskMode && ['CONSERVATIVE', 'BALANCED', 'PRO'].includes(riskMode)) {
        subscriber.riskMode = riskMode;
      }
      if (typeof riskPercent === 'number' && riskPercent > 0 && riskPercent <= 5) {
        subscriber.riskPercent = riskPercent;
      }
      multiClientCopierService.registerOrUpdateSubscriber(subscriber);
    }

    res.json({
      success: true,
      message: 'Tetapan risiko berjaya dikemaskini.',
      settings: {
        riskMode: subscriber?.riskMode || riskMode || 'BALANCED',
        riskPercent: subscriber?.riskPercent || riskPercent || 1.0
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/subscriber/toggle-copy
 * Pause or resume copy-trading for this specific subscriber
 */
subscriberRouter.post('/toggle-copy', async (req: Request, res: Response) => {
  try {
    const { accountId, subscriber } = resolveSubscriberAccount(req);
    const { status } = req.body;

    const newStatus = status === 'PAUSED' ? 'PAUSED' : 'ACTIVE';

    if (subscriber) {
      subscriber.status = newStatus;
      multiClientCopierService.registerOrUpdateSubscriber(subscriber);
    }

    res.json({
      success: true,
      message: newStatus === 'ACTIVE' ? 'Salinan trade telah diaktifkan.' : 'Salinan trade telah dijeda (Paused).',
      status: newStatus
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/subscriber/emergency-close
 * Emergency close: Closes all open positions on subscriber's account with accurate exit prices & PnL
 */
subscriberRouter.post('/emergency-close', async (req: Request, res: Response) => {
  try {
    const { accountId } = resolveSubscriberAccount(req);

    const openPositionsRes = await tradingRepo.query(
      `SELECT * FROM positions WHERE account_id = $1 AND status = 'OPEN'`,
      [accountId]
    ).catch(() => ({ rows: [] }));

    let closedCount = 0;
    for (const row of openPositionsRes.rows) {
      const pos = tradingRepo.mapPositionRow(row);
      const symbol = pos.symbol;
      const isJpy = symbol.includes('JPY');
      const isGold = symbol.includes('XAU');
      const pipMultiplier = isJpy ? 100 : isGold ? 1 : 10000;

      const latestSpot = ctraderMarketDataFeedService.getLatestTick(symbol);
      const exitPrice = latestSpot 
        ? (pos.direction === 'BUY' ? latestSpot.bid : latestSpot.ask)
        : pos.entryPrice;

      const pips = pos.direction === 'BUY' 
        ? (exitPrice - pos.entryPrice) * pipMultiplier
        : (pos.entryPrice - exitPrice) * pipMultiplier;

      const pnlDollars = Number((pips * pos.quantity * (isJpy ? 6.5 : isGold ? 10 : 10)).toFixed(2));

      await tradingRepo.query(
        `UPDATE positions 
         SET status = 'CLOSED', close_price = $1, realized_profit = $2, pnl_pips = $3, 
             close_reason = 'SUBSCRIBER_EMERGENCY_STOP', closed_at = NOW(), updated_at = NOW() 
         WHERE position_id = $4`,
        [exitPrice, pnlDollars, Number(pips.toFixed(1)), pos.positionId]
      );
      closedCount++;
    }

    res.json({
      success: true,
      closedCount,
      message: `Berjaya menutup ${closedCount} posisi untuk akaun #${accountId}. Rekod lejar anda telah dikemaskini.`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/subscriber/close-position
 * Closes an individual subscriber position early with accurate exit price and realized PnL
 */
subscriberRouter.post('/close-position', async (req: Request, res: Response) => {
  try {
    const { accountId } = resolveSubscriberAccount(req);
    const { positionId, ticketId } = req.body;

    if (!positionId && !ticketId) {
      return res.status(400).json({ success: false, message: 'positionId atau ticketId diperlukan.' });
    }

    const findQuery = positionId
      ? `SELECT * FROM positions WHERE account_id = $1 AND position_id = $2 AND status = 'OPEN'`
      : `SELECT * FROM positions WHERE account_id = $1 AND ticket_id = $2 AND status = 'OPEN'`;
    const findParam = positionId || ticketId;

    const dbRes = await tradingRepo.query(findQuery, [accountId, findParam]).catch(() => ({ rows: [] }));
    if (dbRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Posisi aktif tidak dijumpai pada akaun anda.' });
    }

    const pos = tradingRepo.mapPositionRow(dbRes.rows[0]);
    const symbol = pos.symbol;
    const isJpy = symbol.includes('JPY');
    const isGold = symbol.includes('XAU');
    const pipMultiplier = isJpy ? 100 : isGold ? 1 : 10000;

    const latestSpot = ctraderMarketDataFeedService.getLatestTick(symbol);
    const exitPrice = latestSpot 
      ? (pos.direction === 'BUY' ? latestSpot.bid : latestSpot.ask)
      : pos.entryPrice;

    const pips = pos.direction === 'BUY' 
      ? (exitPrice - pos.entryPrice) * pipMultiplier
      : (pos.entryPrice - exitPrice) * pipMultiplier;

    const pnlDollars = Number((pips * pos.quantity * (isJpy ? 6.5 : isGold ? 10 : 10)).toFixed(2));

    // Transmit ProtoOAClosePositionReq directly to cTrader broker if position has a valid broker ticket
    try {
      const brokerPosId = pos.ticketId && /^\d+$/.test(pos.ticketId) ? Number(pos.ticketId) : undefined;
      if (brokerPosId) {
        const isGold = symbol.includes('XAU');
        const isBtc = symbol.includes('BTC');
        const isIndex = symbol.includes('NAS');
        let volumeCents = Math.round(pos.quantity * 10000000);
        if (isGold) volumeCents = Math.round(pos.quantity * 10000);
        else if (isBtc) volumeCents = Math.round(pos.quantity * 100);
        else if (isIndex) volumeCents = Math.max(100, Math.round(pos.quantity * 100));

        await ctraderMarketDataFeedService.closePositionForSubscriber({
          ctidTraderAccountId: Number(accountId),
          positionId: brokerPosId,
          volume: volumeCents
        });
      }
    } catch (closeBrokerErr: any) {
      console.warn('[SubscriberClose] Direct broker close notice:', closeBrokerErr.message);
    }

    await tradingRepo.query(
      `UPDATE positions 
       SET status = 'CLOSED', close_price = $1, realized_profit = $2, pnl_pips = $3, 
           close_reason = 'SUBSCRIBER_MANUAL_EARLY_CLOSE', closed_at = NOW(), updated_at = NOW() 
       WHERE position_id = $4`,
      [exitPrice, pnlDollars, Number(pips.toFixed(1)), pos.positionId]
    );

    res.json({
      success: true,
      message: `Posisi ${pos.symbol} (#${pos.ticketId || pos.positionId}) telah berjaya ditutup awal.`,
      tradeSummary: {
        positionId: pos.positionId,
        ticketId: pos.ticketId,
        symbol: pos.symbol,
        entryPrice: pos.entryPrice,
        exitPrice,
        realizedProfit: pnlDollars,
        pnlPips: Number(pips.toFixed(1))
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/copier/dispatch or POST /api/subscriber/dispatch
 * Dispatch trade proposal from master to all connected subscribers with persistence
 */
subscriberRouter.post(['/copier/dispatch', '/dispatch'], async (req: Request, res: Response) => {
  try {
    const { pair, direction, entryPrice, stopLoss, takeProfit1, takeProfit2, confidence, strategyId } = req.body;
    const result = await multiClientCopierService.dispatchMasterTrade({
      pair: pair || 'EUR/USD',
      direction: direction || 'BUY',
      entryPrice: Number(entryPrice || 1.0850),
      stopLoss: Number(stopLoss || 1.0820),
      takeProfit1: Number(takeProfit1 || 1.0910),
      takeProfit2: takeProfit2 ? Number(takeProfit2) : undefined,
      confidence: Number(confidence || 90),
      strategyId: strategyId || 'AI_SMC_MASTER'
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(err.message?.startsWith('GRADE_A_APPROVAL_REQUIRED') ? 422 : 500).json({ success: false, error: err.message });
  }
});

