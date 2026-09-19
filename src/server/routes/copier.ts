import { Router, Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { multiClientCopierService } from '../services/multiClientCopierService';

export const copierRouter = Router();

export function timingSafeCompare(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Super-Admin & Admin Authorization Middleware for Copier Endpoints
 * Prevents unauthorized public access to signal ingestion, test execution,
 * subscriber PII, and administrative controls.
 * Fails closed if ADMIN_API_KEY is unconfigured in the environment.
 */
export const copierAdminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = (req.headers['x-admin-key'] || req.headers['x-api-key']) as string | undefined;
  const authHeader = req.headers.authorization;
  const configuredAdminKey = process.env.ADMIN_API_KEY;
  const configuredJwtSecret = process.env.JWT_SECRET;

  if (!configuredAdminKey || configuredAdminKey.trim().length === 0) {
    console.error('🔒 [CopierAdminAuth] SECURITY_ALERT: ADMIN_API_KEY is not configured in environment. Failing closed.');
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED_ADMIN_ACCESS: Administrative copier access is disabled (ADMIN_API_KEY unconfigured).'
    });
  }

  // 1. Constant-time admin API key matching
  if (adminKey && timingSafeCompare(adminKey, configuredAdminKey)) {
    (req as any).user = { role: 'super_admin', userId: 'admin-root' };
    return next();
  }

  // 2. Authorization Bearer header
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (timingSafeCompare(token, configuredAdminKey)) {
      (req as any).user = { role: 'super_admin', userId: 'admin-root' };
      return next();
    }
    if (configuredJwtSecret) {
      try {
        const decoded: any = jwt.verify(token, configuredJwtSecret);
        if (decoded && (decoded.role === 'super_admin' || decoded.role === 'admin' || decoded.isAdmin === true)) {
          (req as any).user = decoded;
          return next();
        }
      } catch {
        // invalid token
      }
    }
  }

  return res.status(401).json({
    success: false,
    error: 'UNAUTHORIZED_ADMIN_ACCESS: Valid admin API key or super_admin token required for this copier operation.'
  });
};

/**
 * Check if current request has verified admin credentials without failing request
 */
export const hasAdminAuth = (req: Request): boolean => {
  const adminKey = (req.headers['x-admin-key'] || req.headers['x-api-key']) as string | undefined;
  const authHeader = req.headers.authorization;
  const configuredAdminKey = process.env.ADMIN_API_KEY;
  const configuredJwtSecret = process.env.JWT_SECRET;

  if (!configuredAdminKey || configuredAdminKey.trim().length === 0) {
    return false;
  }

  if (adminKey && timingSafeCompare(adminKey, configuredAdminKey)) {
    return true;
  }
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (timingSafeCompare(token, configuredAdminKey)) {
      return true;
    }
    if (configuredJwtSecret) {
      try {
        const decoded: any = jwt.verify(token, configuredJwtSecret);
        return Boolean(decoded && (decoded.role === 'super_admin' || decoded.role === 'admin' || decoded.isAdmin === true));
      } catch {
        return false;
      }
    }
  }
  return false;
};

interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const rateLimitStore = new Map<string, RateLimitBucket>();

export const copierRateLimiter = (maxRequests: number = 180, windowSec: number = 60) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const account = (req.query.account as string) || 'global';
    const key = `${ip}_${account}`;
    const now = Date.now();

    let bucket = rateLimitStore.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 1, resetAt: now + windowSec * 1000 };
      rateLimitStore.set(key, bucket);
      return next();
    }

    bucket.count++;
    if (bucket.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: `Kadar permintaan melebihi had (${maxRequests} req / ${windowSec}s). Sila kurangkan frekuensi polling.`
      });
    }

    next();
  };
};

export const productionTlsGuard = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    const isTls = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (!isTls && req.hostname !== 'localhost' && req.hostname !== '127.0.0.1') {
      return res.status(403).json({
        success: false,
        error: 'TLS_REQUIRED_IN_PRODUCTION: Sambungan selamat HTTPS diperlukan dalam persekitaran produksi.'
      });
    }
  }
  next();
};

/**
 * GET /api/copier/status
 * Sanitized public health summary of copier service status (zero PII / account leakage)
 */
copierRouter.get('/copier/status', (req: Request, res: Response) => {
  try {
    const isAdmin = hasAdminAuth(req);
    const rawStatus = multiClientCopierService.getStatus();
    
    // Public safe view: High-level health only
    if (!isAdmin) {
      return res.json({
        service: 'QuantumAI VIP Copier Gateway',
        status: rawStatus.masterActive ? 'OPERATIONAL' : 'PAUSED',
        latencyMs: rawStatus.avgExecutionLatencyMs || 35,
        serverTime: Date.now()
      });
    }

    // Admin view: Full analytics
    res.json(rawStatus);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/subscribers
 * [ADMIN ONLY] List of copier subscribers
 */
copierRouter.get('/copier/subscribers', copierAdminAuthMiddleware, (req: Request, res: Response) => {
  try {
    const subscribers = multiClientCopierService.getSubscribers();
    res.json({ subscribers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/analytics
 * [ADMIN ONLY] Real-time aggregated statistics for subscriber growth, renewals and cBot telemetry
 */
copierRouter.get('/copier/analytics', copierAdminAuthMiddleware, async (req: Request, res: Response) => {
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
 * [ADMIN ONLY] Add a subscriber to multi-client copier
 */
copierRouter.post('/copier/subscribers/add', copierAdminAuthMiddleware, (req: Request, res: Response) => {
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
 * [ADMIN ONLY] Toggle subscriber copier active state
 */
copierRouter.post('/copier/subscribers/toggle', copierAdminAuthMiddleware, (req: Request, res: Response) => {
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
 * [ADMIN ONLY] Update subscriber risk profile
 */
copierRouter.post('/copier/subscribers/risk', copierAdminAuthMiddleware, (req: Request, res: Response) => {
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
 * [ADMIN ONLY] Copier execution and audit logs
 */
copierRouter.get('/copier/logs', copierAdminAuthMiddleware, (req: Request, res: Response) => {
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
 * [ADMIN ONLY] Toggle master account copier broadcasting
 */
copierRouter.post('/copier/master/toggle', copierAdminAuthMiddleware, (req: Request, res: Response) => {
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
  masterBrokerOrderId?: string;
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

const copierSignalsQueuePath = path.resolve(process.cwd(), 'data', 'copier_signals_queue.json');
let copierSignalsQueue: CopierLiveSignal[] = [];

function loadCopierQueueFromDisk() {
  try {
    if (fs.existsSync(copierSignalsQueuePath)) {
      const raw = fs.readFileSync(copierSignalsQueuePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        copierSignalsQueue = parsed;
      }
    }
  } catch (e: any) {
    console.warn('[CopierRouter] Could not load signals queue:', e.message);
  }
}
loadCopierQueueFromDisk();

function saveCopierQueueToDisk() {
  try {
    const dir = path.dirname(copierSignalsQueuePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Keep max 100 recent signals
    if (copierSignalsQueue.length > 100) {
      copierSignalsQueue = copierSignalsQueue.slice(0, 100);
    }
    fs.writeFileSync(copierSignalsQueuePath, JSON.stringify(copierSignalsQueue, null, 2), 'utf-8');
  } catch (e: any) {
    console.warn('[CopierRouter] Could not save signals queue:', e.message);
  }
}

let latestCopierSignal: CopierLiveSignal | null = null;

export function publishCopierSignal(signal: Omit<CopierLiveSignal, 'id' | 'timestamp'> & { id?: string }): CopierLiveSignal {
  const newSig: CopierLiveSignal = {
    ...signal,
    id: signal.id || `SIG-${Date.now()}`,
    timestamp: Date.now()
  };
  latestCopierSignal = newSig;
  
  // Add to queue (avoid duplicate IDs)
  const existingIdx = copierSignalsQueue.findIndex(s => s.id === newSig.id);
  if (existingIdx >= 0) {
    copierSignalsQueue[existingIdx] = newSig;
  } else {
    copierSignalsQueue.unshift(newSig);
  }
  saveCopierQueueToDisk();
  return latestCopierSignal;
}

/**
 * GET /api/copier/signal
 * High-speed direct signal bridge for authorized cTrader cBot receivers.
 * Strictly enforces server-authoritative cryptographic VIP authorization token,
 * account binding, and persistent replay deduplication.
 */
copierRouter.get('/copier/signal', productionTlsGuard, copierRateLimiter(180, 60), async (req: Request, res: Response) => {
  try {
    const account = req.query.account ? String(req.query.account).trim() : '';
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers['x-vip-token'] as string | undefined;
    const tokenQuery = req.query.token as string | undefined;

    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1].trim();
    } else if (tokenHeader) {
      token = tokenHeader.trim();
    } else if (tokenQuery) {
      token = tokenQuery.trim();
    }

    // 1. Mandatory Identity & Token Presence Check (P1-1)
    if (!account) {
      return res.status(401).json({
        hasSignal: false,
        error: 'ACCOUNT_REQUIRED',
        message: 'Nombor akaun cTrader diperlukan. Sila sertakan parameter ?account=<Nombor_Akaun>.'
      });
    }

    if (!token) {
      return res.status(401).json({
        hasSignal: false,
        error: 'AUTH_TOKEN_REQUIRED',
        message: 'VIP Authorization Token (VipAuthToken) diperlukan. Sila sertakan token dalam header Authorization: Bearer <token> atau parameter ?token=<token>.'
      });
    }

    // 2. Server-Authoritative Cryptographic Token & Account Binding Validation (P1-4, P1-5)
    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');
    const authCheck = vipSubscriptionService.verifyVipToken(token, account);

    if (!authCheck.valid) {
      return res.status(403).json({
        hasSignal: false,
        serverTime: Date.now(),
        error: authCheck.error || 'UNAUTHORIZED_VIP_ACCESS',
        message: authCheck.message
      });
    }

    // 3. Find next unconsumed active signal within 2-hour TTL
    loadCopierQueueFromDisk();

    const since = Number(req.query.since) || 0;
    const now = Date.now();
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    const candidateSignal = copierSignalsQueue.find(sig => {
      const isFresh = (now - sig.timestamp) < TWO_HOURS_MS;
      const notDelivered = !vipSubscriptionService.isSignalDelivered(account, sig.id);
      return isFresh && notDelivered;
    });

    if (!candidateSignal) {
      return res.json({ hasSignal: false, serverTime: Date.now() });
    }

    // Mark as delivered to this license
    vipSubscriptionService.recordSignalDelivery(account, candidateSignal.id);

    return res.json({
      hasSignal: true,
      serverTime: Date.now(),
      id: candidateSignal.id,
      action: candidateSignal.action || 'NEW_ORDER',
      pair: candidateSignal.pair,
      direction: candidateSignal.direction,
      entryPrice: candidateSignal.entryPrice,
      stopLoss: candidateSignal.stopLoss,
      takeProfit1: candidateSignal.takeProfit1,
      takeProfit2: candidateSignal.takeProfit2,
      timestamp: candidateSignal.timestamp,
      signal: candidateSignal
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/signal
 * [ADMIN/INTERNAL ONLY] Ingest authoritative trade signal for copier cBots.
 * External/unauthenticated callers are rejected with 401/403.
 */
copierRouter.post('/copier/signal', copierAdminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { pair, direction, entryPrice, stopLoss, takeProfit1, takeProfit2, lotSize, reasons, masterBrokerOrderId, id, timeframe, confidence } = req.body;
    if (!pair || !direction || !entryPrice) {
      return res.status(400).json({ error: 'pair, direction, entryPrice are required' });
    }
    const sig = publishCopierSignal({
      id,
      masterBrokerOrderId,
      pair,
      direction,
      entryPrice: Number(entryPrice),
      stopLoss: Number(stopLoss),
      takeProfit1: Number(takeProfit1),
      takeProfit2: Number(takeProfit2),
      lotSize: Number(lotSize) || 0.02,
      reasons: Array.isArray(reasons) ? reasons : [reasons || 'Quantum AI Quantitative Signal']
    });

    // Also broadcast to Telegram VIP & Community channels
    try {
      const { telegramNotificationService } = await import('../services/telegramNotificationService');
      await telegramNotificationService.broadcastTradeEvent({
        pair,
        direction: direction as 'BUY' | 'SELL',
        timeframe: timeframe || 'M15',
        entryPrice: Number(entryPrice),
        stopLoss: Number(stopLoss),
        takeProfit1: Number(takeProfit1),
        takeProfit2: Number(takeProfit2),
        confidence: Number(confidence) || 95,
        reasons: Array.isArray(reasons) ? reasons : [reasons || 'Quantum AI Quantitative Signal'],
        lotSize: Number(lotSize) || 0.02,
        tier: 'VIP',
        status: 'ENTRY_DISPATCHED',
        brokerOrderId: masterBrokerOrderId || sig.id
      });
    } catch (tgErr: any) {
      console.warn('⚠️ [CopierSignal] Telegram broadcast notice:', tgErr.message);
    }

    res.json({ success: true, signal: sig, telegramBroadcast: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/verify
 * cTrader cBot License Verification Endpoint (Checks if account is ACTIVE)
 * Supports cryptographic token verification or server-side account lookup
 */
copierRouter.get('/copier/verify', productionTlsGuard, copierRateLimiter(180, 60), async (req: Request, res: Response) => {
  try {
    const account = req.query.account ? String(req.query.account).trim() : '';
    if (!account) {
      return res.status(400).json({ valid: false, message: 'Parameter account diperlukan.' });
    }

    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers['x-vip-token'] as string | undefined;
    const tokenQuery = req.query.token as string | undefined;

    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1].trim();
    } else if (tokenHeader) {
      token = tokenHeader.trim();
    } else if (tokenQuery) {
      token = tokenQuery.trim();
    }

    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');

    // If cryptographic token was provided, verify it strictly
    if (token) {
      const tokenResult = vipSubscriptionService.verifyVipToken(token, account);
      return res.json({
        valid: tokenResult.valid,
        status: tokenResult.status,
        accountNumber: account,
        expiresAt: tokenResult.payload?.expiresAt,
        remainingDays: tokenResult.payload?.expiresAt ? Math.max(0, Math.ceil((tokenResult.payload.expiresAt - Date.now()) / (24 * 3600 * 1000))) : 0,
        message: tokenResult.message
      });
    }

    // Default account ledger status check
    const result = vipSubscriptionService.verifyLicense(account);
    res.json({
      valid: result.valid,
      status: result.status,
      accountNumber: account,
      expiresAt: result.expiresAt,
      remainingDays: result.remainingDays,
      message: result.message
    });
  } catch (err: any) {
    res.status(500).json({ valid: false, message: err.message });
  }
});

/**
 * POST /api/copier/register-account
 * Register a cTrader account for VIP access.
 * Unauthenticated callers create a PENDING_VERIFICATION record (no active trading allowed).
 * Admin callers may supply status: 'ACTIVE' and durationDays to immediately activate.
 */
copierRouter.post('/copier/register-account', async (req: Request, res: Response) => {
  try {
    const { accountNumber, telegramId, telegramUsername, name, durationDays, status } = req.body;
    if (!accountNumber) {
      return res.status(400).json({ error: 'accountNumber diperlukan' });
    }

    const isAdmin = hasAdminAuth(req);
    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');

    const record = vipSubscriptionService.registerAccount({
      accountNumber: String(accountNumber),
      telegramId: telegramId ? String(telegramId) : undefined,
      telegramUsername: telegramUsername ? String(telegramUsername) : undefined,
      name,
      durationDays: isAdmin ? (Number(durationDays) || 30) : undefined,
      isAdminApproval: isAdmin,
      status: isAdmin && status === 'ACTIVE' ? 'ACTIVE' : undefined
    });

    res.json({
      success: true,
      authorizedByAdmin: isAdmin,
      subscriber: record,
      message: record.status === 'ACTIVE'
        ? `Akaun ${record.accountNumber} aktif sehingga ${new Date(record.expiresAt).toLocaleDateString()}.`
        : `Akaun ${record.accountNumber} telah didaftarkan dan berstatus PENDING_VERIFICATION. Sila tunggu pengesahan admin sebelum cBot dapat diaktifkan.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/admin/activate-account
 * [ADMIN ONLY] Approve and activate a pending or existing VIP cTrader account
 */
copierRouter.post('/copier/admin/activate-account', copierAdminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { accountNumber, durationDays = 30, approvedBy } = req.body;
    if (!accountNumber) {
      return res.status(400).json({ error: 'accountNumber is required' });
    }
    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');
    const record = vipSubscriptionService.activateAccount(
      String(accountNumber),
      Number(durationDays) || 30,
      approvedBy || (req as any).user?.userId || 'Admin'
    );
    res.json({
      success: true,
      message: `Account ${record.accountNumber} successfully approved and activated for ${durationDays} days.`,
      subscriber: record
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/admin/reject-account
 * [ADMIN ONLY] Reject or suspend a VIP subscriber account
 */
copierRouter.post('/copier/admin/reject-account', copierAdminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { accountNumber, reason } = req.body;
    if (!accountNumber) {
      return res.status(400).json({ error: 'accountNumber is required' });
    }
    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');
    const record = vipSubscriptionService.rejectAccount(String(accountNumber), reason);
    if (!record) {
      return res.status(404).json({ error: 'Subscriber account not found' });
    }
    res.json({
      success: true,
      message: `Account ${record.accountNumber} has been suspended/rejected.`,
      subscriber: record
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/vip-accounts
 * [ADMIN ONLY] List all registered VIP accounts
 */
copierRouter.get('/copier/vip-accounts', copierAdminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');
    const subscribers = vipSubscriptionService.getAllSubscribers();
    res.json({ success: true, count: subscribers.length, subscribers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/report-closed
 * Receives position closed events from cTrader cBot.
 * Marked as UNVERIFIED telemetry until reconciled against broker truth.
 */
copierRouter.post('/copier/report-closed', async (req: Request, res: Response) => {
  try {
    const { label, symbol, tradeType, entryPrice, closePrice, netProfit, pips, account } = req.body;
    if (!account) {
      return res.status(400).json({ error: 'Account number is required for trade telemetry' });
    }

    // Verify the account is a registered subscriber
    const { vipSubscriptionService } = await import('../services/vipSubscriptionService');
    const check = vipSubscriptionService.verifyLicense(String(account));
    if (!check.valid && check.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_ACCOUNT: Unregistered or inactive accounts cannot submit copier telemetry.'
      });
    }

    console.log(`📊 [cBot Trade Closed - UNVERIFIED TELEMETRY] Acc: ${account} | ${symbol} ${tradeType} | Net: €${netProfit} | Pips: ${pips} | Label: ${label}`);

    const isProfit = Number(netProfit) >= 0;
    const isTicket1 = String(label).includes('QAI_T1');

    const { telegramNotificationService } = await import('../services/telegramNotificationService');
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
      brokerOrderId: `TELEMETRY-${label || account}`,
      reasons: [
        `[Client Telemetry: Unverified] ${isTicket1 ? 'Tiket 1 Sasaran TP1 Dicapai & Profit Dikunci' : 'Tiket 2 Runner Ditutup'}`,
        `Net PnL dilaporkan: ${Number(netProfit) >= 0 ? '+' : ''}€${Number(netProfit).toFixed(2)} (${Number(pips).toFixed(1)} pips)`
      ]
    });

    res.json({
      success: true,
      telemetryStatus: 'UNVERIFIED',
      message: 'Trade closed telemetry received and logged.'
    });
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
 * [ADMIN & DEMO ONLY] Diagnostic test order endpoint.
 * Strictly disabled in production and prohibited on live trading accounts.
 */
copierRouter.post('/copier/test-dual-order', copierAdminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // 1. Hard Production Guard: Never permit diagnostic test orders in production
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'TEST_DUAL_ORDER_DISABLED_IN_PRODUCTION: /api/copier/test-dual-order is strictly disabled in production environment.'
      });
    }

    // 2. Non-Live Guard: Never permit on live trading accounts
    const env = (process.env.EXECUTION_ENVIRONMENT || 'DEMO').toUpperCase();
    if (env === 'LIVE') {
      return res.status(403).json({
        success: false,
        error: 'TEST_ORDERS_PROHIBITED_ON_LIVE_ACCOUNTS: Test order execution is strictly prohibited when EXECUTION_ENVIRONMENT is LIVE.'
      });
    }

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
      masterBrokerOrderId: latestMasterTestOrderId || undefined,
      pair,
      direction: direction as 'BUY' | 'SELL',
      entryPrice: Number(entryPrice),
      stopLoss: Number(stopLoss),
      takeProfit1: Number(takeProfit1),
      takeProfit2: Number(takeProfit2),
      lotSize: Number(lotSize),
      reasons: Array.isArray(reasons) ? reasons : [reasons]
    });
    console.log(`✅ [Client cBot Bridge] Copier signal published (ID: ${copierSignal.id}, BrokerOrderId: ${latestMasterTestOrderId})`);

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
 * [ADMIN & DEMO ONLY] Cancels the dual-account test order across OpenAPI, cBot, and Telegram.
 */
copierRouter.post('/copier/cancel-dual-order', copierAdminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_IN_PRODUCTION: /api/copier/cancel-dual-order is strictly disabled in production environment.'
      });
    }

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
      masterBrokerOrderId: latestMasterTestOrderId || undefined,
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

export default copierRouter;

