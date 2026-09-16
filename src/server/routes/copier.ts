import { Router, Request, Response } from 'express';
import { multiClientCopierService } from '../services/multiClientCopierService';

export const copierRouter = Router();

/**
 * GET /api/copier/status
 */
copierRouter.get('/copier/status', (req: Request, res: Response) => {
  try {
    const status = multiClientCopierService.getStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/subscribers
 */
copierRouter.get('/copier/subscribers', (req: Request, res: Response) => {
  try {
    const subscribers = multiClientCopierService.getSubscribers();
    res.json({ subscribers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/analytics
 * Real-time aggregated statistics for subscriber growth, renewals and cBot telemetry
 */
copierRouter.get('/copier/analytics', async (req: Request, res: Response) => {
  try {
    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');
    const analytics = vipSubscriptionService.getSubscriberAnalytics();
    res.json({ success: true, ...analytics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/copier/subscribers/add
 */
copierRouter.post('/copier/subscribers/add', (req: Request, res: Response) => {
  try {
    const { name, email, accountNumber, ctidTraderAccountId, brokerName, environment, riskMode, initialBalance } = req.body;
    if (!name || !accountNumber) {
      return res.status(400).json({ error: 'Name and Account Number are required' });
    }

    const sub = multiClientCopierService.addSubscriber({
      name,
      email: email || `${name.toLowerCase().replace(/\s+/g, '')}@example.com`,
      accountNumber,
      ctidTraderAccountId,
      brokerName: brokerName || 'Spotware cTrader Open API',
      environment: environment || 'DEMO',
      riskMode: riskMode || 'BALANCED',
      initialBalance: Number(initialBalance) || 10000
    });

    res.json({ success: true, subscriber: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/subscribers/toggle
 */
copierRouter.post('/api/copier/subscribers/toggle', (req: Request, res: Response) => {
  try {
    const { subscriberId } = req.body;
    if (!subscriberId) {
      return res.status(400).json({ error: 'subscriberId is required' });
    }

    const sub = multiClientCopierService.toggleSubscriberStatus(subscriberId);
    if (!sub) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    res.json({ success: true, subscriber: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/subscribers/risk
 */
copierRouter.post('/copier/subscribers/risk', (req: Request, res: Response) => {
  try {
    const { subscriberId, riskMode } = req.body;
    if (!subscriberId || !riskMode) {
      return res.status(400).json({ error: 'subscriberId and riskMode are required' });
    }

    const sub = multiClientCopierService.updateSubscriberRisk(subscriberId, riskMode);
    if (!sub) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    res.json({ success: true, subscriber: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/logs
 */
copierRouter.get('/copier/logs', (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const logs = multiClientCopierService.getAuditLogs(limit);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/master/toggle
 */
copierRouter.post('/copier/master/toggle', (req: Request, res: Response) => {
  try {
    const { active } = req.body;
    multiClientCopierService.setMasterStatus(Boolean(active));
    res.json({ success: true, masterActive: Boolean(active) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export interface CopierLiveSignal {
  id: string;
  action?: 'NEW_ORDER' | 'CANCEL_ORDER';
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  lotSize: number;
  reasons?: string[];
  timestamp: number;
}

let latestCopierSignal: CopierLiveSignal | null = null;

export function publishCopierSignal(signal: Omit<CopierLiveSignal, 'id' | 'timestamp'> & { id?: string }): CopierLiveSignal {
  latestCopierSignal = {
    ...signal,
    id: signal.id || `SIG-${Date.now()}`,
    timestamp: Date.now()
  };
  return latestCopierSignal;
}

/**
 * GET /api/copier/signal
 * High-speed, zero-conflict direct signal bridge for cTrader cBot receivers.
 */
copierRouter.get('/copier/signal', (req: Request, res: Response) => {
  const since = Number(req.query.since) || 0;
  if (!latestCopierSignal || latestCopierSignal.timestamp <= since) {
    return res.json({ hasSignal: false, serverTime: Date.now() });
  }
  return res.json({
    hasSignal: true,
    serverTime: Date.now(),
    signal: latestCopierSignal
  });
});

/**
 * POST /api/copier/signal
 * Trigger manual test or broadcast trade signal to cTrader cBots.
 */
copierRouter.post('/copier/signal', (req: Request, res: Response) => {
  try {
    const { pair, direction, entryPrice, stopLoss, takeProfit1, takeProfit2, lotSize, reasons } = req.body;
    if (!pair || !direction || !entryPrice) {
      return res.status(400).json({ error: 'pair, direction, entryPrice are required' });
    }
    const sig = publishCopierSignal({
      pair,
      direction,
      entryPrice: Number(entryPrice),
      stopLoss: Number(stopLoss),
      takeProfit1: Number(takeProfit1),
      takeProfit2: Number(takeProfit2),
      lotSize: Number(lotSize) || 0.02,
      reasons: Array.isArray(reasons) ? reasons : ['Quantum AI Quantitative Signal']
    });
    res.json({ success: true, signal: sig });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/verify
 * cTrader cBot License Verification Endpoint
 */
copierRouter.get('/copier/verify', async (req: Request, res: Response) => {
  try {
    const account = req.query.account ? String(req.query.account) : '';
    if (!account) {
      return res.status(400).json({ valid: false, message: 'Parameter account diperlukan.' });
    }
    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');
    const result = vipSubscriptionService.verifyLicense(account);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ valid: false, message: err.message });
  }
});

/**
 * POST /api/copier/register-account
 * Register or update VIP Account
 */
copierRouter.post('/copier/register-account', async (req: Request, res: Response) => {
  try {
    const { accountNumber, telegramId, telegramUsername, name, durationDays } = req.body;
    if (!accountNumber) {
      return res.status(400).json({ error: 'accountNumber diperlukan' });
    }
    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');
    const record = vipSubscriptionService.registerAccount({
      accountNumber: String(accountNumber),
      telegramId: telegramId ? String(telegramId) : undefined,
      telegramUsername: telegramUsername ? String(telegramUsername) : undefined,
      name,
      durationDays: Number(durationDays) || 30
    });
    res.json({ success: true, subscriber: record });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/report-closed
 * Receives position closed events from cTrader cBot and broadcasts profit/result to Telegram
 */
copierRouter.post('/copier/report-closed', async (req: Request, res: Response) => {
  try {
    const { label, symbol, tradeType, entryPrice, closePrice, netProfit, pips, account } = req.body;
    const { telegramNotificationService } = await import('../services/telegramNotificationService');

    const isProfit = Number(netProfit) >= 0;
    const isTicket1 = String(label).includes('QAI_T1');
    const isTicket2 = String(label).includes('QAI_T2');

    console.log(`📊 [cBot Trade Closed] ${symbol} ${tradeType} | Net: €${netProfit} | Pips: ${pips} | Label: ${label}`);

    await telegramNotificationService.broadcastTradeEvent({
      pair: symbol || 'EUR/USD',
      direction: tradeType === 'Buy' ? 'BUY' : 'SELL',
      timeframe: 'M15',
      entryPrice: Number(entryPrice) || 0,
      stopLoss: 0,
      takeProfit1: Number(closePrice) || 0,
      confidence: 90,
      pnlDollars: Number(netProfit),
      pnlPips: Number(pips),
      status: isProfit ? (isTicket1 ? 'PROFIT_LOCKED' : 'TP_HIT') : 'SL_HIT',
      tier: 'VIP',
      brokerOrderId: label || `ACC-${account}`,
      reasons: [
        isTicket1 ? 'Tiket 1 Sasaran TP1 Dicapai & Profit Dikunci' : 'Tiket 2 Runner Berjaya Ditutup',
        `Net PnL: ${Number(netProfit) >= 0 ? '+' : ''}€${Number(netProfit).toFixed(2)} (${Number(pips).toFixed(1)} pips)`
      ]
    });

    res.json({ success: true, message: 'Trade closure broadcasted to Telegram channels.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/vip-accounts
 * List all VIP registered accounts
 */
copierRouter.get('/copier/vip-accounts', async (req: Request, res: Response) => {
  try {
    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');
    const subscribers = vipSubscriptionService.getAllSubscribers();
    res.json({ success: true, count: subscribers.length, subscribers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

let latestMasterTestOrderId: string | null = null;
let latestTestSignalPair: string = 'EUR/USD';
let latestTestSignalDirection: 'BUY' | 'SELL' = 'BUY';
let latestTestSignalEntry: number = 1.15350;
let latestTestSignalSL: number = 1.15150;

/**
 * POST /api/copier/test-dual-order
 * Dispatches an institutional test pending order simultaneously to:
 * 1. Master Direct OpenAPI account (5881460 / 48282756)
 * 2. Client cBot Copier bridge (5877246)
 * 3. Telegram VIP & Free channels
 */
copierRouter.post('/copier/test-dual-order', async (req: Request, res: Response) => {
  try {
    const {
      pair = 'EUR/USD',
      direction = 'BUY',
      entryPrice = 1.15350,
      stopLoss = 1.15150,
      takeProfit1 = 1.15600,
      takeProfit2 = 1.15850,
      lotSize = 0.02,
      confidence = 94,
      reasons = [
        'M15 Bullish Order Block (OB) Retest Confirmed',
        'Asian Session Lows Liquidity Sweep',
        'H1 Institutional FVG Mitigation & 200 EMA Support'
      ]
    } = req.body || {};

    latestTestSignalPair = pair;
    latestTestSignalDirection = direction as 'BUY' | 'SELL';
    latestTestSignalEntry = Number(entryPrice);
    latestTestSignalSL = Number(stopLoss);

    console.log(`\n🚀 [Dual-Account Test Order] Initiating test dispatch for ${pair} ${direction} Limit @ ${entryPrice}...`);

    // 1. Direct Spotware cTrader Open API (Master Account: 5881460 / CTID: 48282756)
    let masterResult: any = null;
    let masterError: string | null = null;
    try {
      const { CTraderAdapter } = await import('../../../apps/execution-router/src/adapters/ctraderAdapter');
      const masterAdapter = new CTraderAdapter({ accountId: '48282756' });
      await masterAdapter.connect();
      const orderIdStr = `test_dual_${Date.now()}`;
      masterResult = await masterAdapter.placeOrder({
        order_id: orderIdStr,
        proposal_id: `prop_${orderIdStr}`,
        symbol: pair,
        direction: direction as 'BUY' | 'SELL',
        order_type: 'LIMIT',
        quantity: Number(lotSize),
        price: Number(entryPrice),
        stop_loss: Number(stopLoss),
        take_profit: Number(takeProfit1),
        time_in_force: 'GTC',
        broker_id: 'ctrader-broker-01',
        timestamp: new Date()
      });
      latestMasterTestOrderId = masterResult.broker_order_id || masterResult.brokerOrderId || masterResult.report_id || null;
      console.log(`✅ [Master OpenAPI Account] Pending Limit Order placed! Broker Order ID: #${latestMasterTestOrderId}`);
    } catch (err: any) {
      masterError = err.message;
      console.warn(`⚠️ [Master OpenAPI Account] Notice:`, err.message);
    }

    // 2. Client cBot Receiver Bridge (Account: 5877246)
    const copierSignal = publishCopierSignal({
      action: 'NEW_ORDER',
      pair,
      direction: direction as 'BUY' | 'SELL',
      entryPrice: Number(entryPrice),
      stopLoss: Number(stopLoss),
      takeProfit1: Number(takeProfit1),
      takeProfit2: Number(takeProfit2),
      lotSize: Number(lotSize),
      reasons: Array.isArray(reasons) ? reasons : [reasons]
    });
    console.log(`✅ [Client cBot Bridge] Copier signal published (ID: ${copierSignal.id})`);

    // 3. Telegram VIP & Free Broadcast
    let telegramDispatched = false;
    try {
      const { telegramNotificationService } = await import('../services/telegramNotificationService');
      telegramDispatched = await telegramNotificationService.broadcastTradeEvent({
        pair,
        direction: direction as 'BUY' | 'SELL',
        timeframe: 'M15',
        entryPrice: Number(entryPrice),
        stopLoss: Number(stopLoss),
        takeProfit1: Number(takeProfit1),
        takeProfit2: Number(takeProfit2),
        confidence: Number(confidence),
        reasons: Array.isArray(reasons) ? reasons : [reasons],
        lotSize: Number(lotSize),
        status: 'ENTRY_DISPATCHED',
        tier: Number(confidence) >= 85 ? 'FREE' : 'VIP',
        brokerOrderId: latestMasterTestOrderId || 'CTRADER-OPENAPI-MASTER'
      });
      console.log(`✅ [Telegram Broadcast] Dispatched alert to VIP & Free channels`);
    } catch (tgErr: any) {
      console.warn(`⚠️ [Telegram Broadcast] Warning:`, tgErr.message);
    }

    res.json({
      success: true,
      message: 'Dual-Account Test Order successfully executed across OpenAPI, cBot, and Telegram!',
      signal: {
        pair,
        direction,
        entryPrice: Number(entryPrice),
        stopLoss: Number(stopLoss),
        takeProfit1: Number(takeProfit1),
        takeProfit2: Number(takeProfit2),
        lotSize: Number(lotSize)
      },
      masterOpenApiAccount: {
        accountId: '5881460 (CTID: 48282756)',
        brokerOrderId: latestMasterTestOrderId,
        status: masterError ? 'NOTICE' : 'DISPATCHED',
        details: masterResult,
        notice: masterError
      },
      clientCbotAccount: {
        accountId: '5877246',
        copierSignalId: copierSignal.id,
        status: 'SIGNAL_PUBLISHED_AWAITING_POLL'
      },
      telegramBroadcast: {
        channels: ['VIP Channel (-1004344482481)', 'Free Channel (-1004354378602)'],
        sent: telegramDispatched
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/cancel-dual-order
 * Cancels the dual-account test order:
 * 1. Cancels pending order on Master OpenAPI account
 * 2. Publishes CANCEL_ORDER to client cBots
 * 3. Broadcasts SIGNAL_CANCELLED alert to Telegram
 */
copierRouter.post('/copier/cancel-dual-order', async (req: Request, res: Response) => {
  try {
    const pair = req.body?.pair || latestTestSignalPair;
    const direction = req.body?.direction || latestTestSignalDirection;
    const entryPrice = req.body?.entryPrice || latestTestSignalEntry;
    const stopLoss = req.body?.stopLoss || latestTestSignalSL;

    console.log(`\n🛑 [Dual-Account Cancel Order] Cancelling pending orders for ${pair}...`);

    // 1. Cancel on Master OpenAPI
    let masterCancelled = false;
    let masterError: string | null = null;
    if (latestMasterTestOrderId) {
      try {
        const { CTraderAdapter } = await import('../../../apps/execution-router/src/adapters/ctraderAdapter');
        const masterAdapter = new CTraderAdapter({ accountId: '48282756' });
        await masterAdapter.connect();
        masterCancelled = await masterAdapter.cancelOrder(latestMasterTestOrderId);
        console.log(`✅ [Master OpenAPI Account] Cancelled order #${latestMasterTestOrderId}`);
      } catch (err: any) {
        masterError = err.message;
        console.warn(`⚠️ [Master OpenAPI Account] Cancel notice:`, err.message);
      }
    }

    // 2. Publish CANCEL_ORDER to cBot Receiver Bridge
    const cancelSignal = publishCopierSignal({
      action: 'CANCEL_ORDER',
      pair,
      direction,
      entryPrice,
      stopLoss,
      takeProfit1: 0,
      takeProfit2: 0,
      lotSize: 0,
      reasons: ['Dual-Account Test Verification Completed - Order Safely Purged']
    });
    console.log(`✅ [Client cBot Bridge] Published CANCEL_ORDER for ${pair}`);

    // 3. Broadcast SIGNAL_CANCELLED to Telegram
    let telegramCancelled = false;
    try {
      const { telegramNotificationService } = await import('../services/telegramNotificationService');
      telegramCancelled = await telegramNotificationService.broadcastTradeEvent({
        pair,
        direction,
        timeframe: 'M15',
        entryPrice,
        stopLoss,
        takeProfit1: 0,
        confidence: 90,
        reasons: ['Dual-Account Testing Verification Concluded - Pending Limit Orders Successfully Cleaned Up'],
        lotSize: 0,
        status: 'SIGNAL_CANCELLED',
        tier: 'VIP',
        cancellationReason: 'Dual-Account testing verification concluded successfully. Pending limit order cancelled.'
      });
      console.log(`✅ [Telegram Broadcast] Broadcasted SIGNAL_CANCELLED alert`);
    } catch (tgErr: any) {
      console.warn(`⚠️ [Telegram Broadcast] Cancel alert warning:`, tgErr.message);
    }

    res.json({
      success: true,
      message: `Pending orders on ${pair} successfully cancelled across OpenAPI, cBot, and Telegram!`,
      masterAccountCancelled: masterCancelled,
      clientCbotCancelPublished: true,
      telegramAlertSent: telegramCancelled,
      cancelledOrderId: latestMasterTestOrderId
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


