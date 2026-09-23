import { quoteUnitsPerUsd } from './fxRiskConversion';
import { assertCopierApproval, requireMasterOrder, selectDirectCopyRecipients, type CopierApproval } from './copierSafetyPolicy';
import EventEmitter from 'events';
import { serverBrokerConnection } from '../routes/broker';
import { sharedAutoTraderState, SharedAutoTrade } from '../routes/execution';
import { ctraderMarketDataFeedService } from './ctraderMarketDataFeedService';

export interface SubscriberAccount {
  id: string;
  name: string;
  email: string;
  accountNumber: string;
  ctidTraderAccountId: number;
  executionChannel?: 'OPEN_API' | 'CBOT';
  environment: 'DEMO' | 'LIVE';
  brokerName: string;
  riskMode: 'CONSERVATIVE' | 'BALANCED' | 'PRO';
  riskPercent: number;
  status: 'ACTIVE' | 'PAUSED' | 'TRIAL' | 'EXPIRED';
  balance: number;
  equity: number;
  connected: boolean;
  latencyMs: number;
  totalCopiedTrades: number;
  lastCopiedAt?: number;
  createdAt: number;
}

export interface CopiedExecutionEvent {
  id: string;
  masterTradeId: string;
  subscriberId: string;
  subscriberName: string;
  accountNumber: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2?: number;
  isMultiTarget?: boolean;
  lotSize: number;
  riskPercent: number;
  orderType?: 'LIMIT' | 'MARKET';
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED_PAUSED' | 'SKIPPED_RISK';
  latencyMs: number;
  executedAt: number;
  brokerTicket?: string;
  error?: string;
}

import * as fs from 'fs';
import * as path from 'path';

class MultiClientCopierService extends EventEmitter {
  private subscribers: Map<string, SubscriberAccount> = new Map();
  private executionAuditLog: CopiedExecutionEvent[] = [];
  private isMasterActive: boolean = true;
  private copyDispatches = new Map<string, number>();
  private filePath: string = path.resolve(process.cwd(), 'data', 'copier_subscribers.json');

  private dispatchPath = path.resolve(process.cwd(), 'data', 'master_copy_dispatches.json');
  private dispatchLedgerReady = true;
  constructor() {
    super();
    this.ensureDataDirectory();
    this.loadFromDisk();
    try {
      if (fs.existsSync(this.dispatchPath)) this.copyDispatches = new Map(JSON.parse(fs.readFileSync(this.dispatchPath, 'utf8')));
    } catch { this.dispatchLedgerReady = false; }
    this.startBalanceSyncLoop();
  }

  private ensureDataDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const list: SubscriberAccount[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const s of list) {
            // VIP-only registrations have no resolved Open API account identity.
            if (!s.executionChannel) s.executionChannel = String(s.ctidTraderAccountId) === s.accountNumber ? 'CBOT' : 'OPEN_API';
            this.subscribers.set(s.id, s);
          }
        }
      }
    } catch (e: any) {
      console.warn('[MultiClientCopierService] Error loading copier subscribers:', e.message);
    }

    // Sync genuine active subscribers from vip_subscribers.json if available
    this.syncFromVipStorage();
  }

  private syncFromVipStorage() {
    try {
      const vipPath = path.resolve(process.cwd(), 'data', 'vip_subscribers.json');
      if (fs.existsSync(vipPath)) {
        const raw = fs.readFileSync(vipPath, 'utf-8');
        const data = JSON.parse(raw);
        if (data && data.subscribers) {
          for (const [accNo, rec] of Object.entries<any>(data.subscribers)) {
            // Only sync active genuine accounts (digits only, valid account numbers 6-9 digits)
            if (rec.status === 'ACTIVE' && /^\d{6,9}$/.test(accNo)) {
              const id = `sub-${accNo}`;
              if (!this.subscribers.has(id)) {
                const sub: SubscriberAccount = {
                  id,
                  name: rec.name || `Trader #${accNo}`,
                  email: `${accNo}@ctrader.client`,
                  accountNumber: accNo,
                  ctidTraderAccountId: Number(accNo),
                  executionChannel: 'CBOT',
                  environment: 'DEMO',
                  brokerName: 'Spotware cTrader Open API',
                  riskMode: 'BALANCED',
                  riskPercent: 1.0,
                  status: 'ACTIVE',
                  balance: 1000.0,
                  equity: 1000.0,
                  connected: true,
                  latencyMs: 38,
                  totalCopiedTrades: 0,
                  createdAt: rec.activatedAt || Date.now()
                };
                this.subscribers.set(id, sub);
              }
            }
          }
        }
      }
      this.saveToDisk();
    } catch (e: any) {
      console.warn('[MultiClientCopierService] Sync from VIP storage notice:', e.message);
    }
  }

  private saveToDisk() {
    try {
      const list = Array.from(this.subscribers.values());
      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[MultiClientCopierService] Error saving copier subscribers:', e.message);
    }
  }

  /**
   * Continuous sync loop to keep all connected cTrader accounts fresh from Spotware Open API
   */
  private startBalanceSyncLoop() {
    setInterval(async () => {
      try {
        const liveList = await ctraderMarketDataFeedService.discoverAndSyncAllAccounts();
        for (const live of liveList) {
          const accNo = String(live.accountNumber);
          const ctid = Number(live.ctidTraderAccountId);
          
          let matched = false;
          for (const sub of this.subscribers.values()) {
            if (sub.accountNumber === accNo || sub.ctidTraderAccountId === ctid) {
              sub.balance = live.balance;
              sub.equity = live.equity || live.balance;
              sub.connected = true;
              sub.latencyMs = 35;
              matched = true;
            }
          }

          // Auto-discover and register newly detected active cTrader accounts
          if (!matched && accNo && accNo !== '5881460') {
            const newId = `sub-${accNo}`;
            const newSub: SubscriberAccount = {
              id: newId,
              name: `cTrader Trader #${accNo}`,
              email: `${accNo}@ctrader.client`,
              accountNumber: accNo,
              ctidTraderAccountId: ctid,
              environment: live.isLive ? 'LIVE' : 'DEMO',
              brokerName: live.brokerTitle || 'Spotware cTrader Open API',
              riskMode: 'BALANCED',
              riskPercent: 1.0,
              status: 'ACTIVE',
              balance: live.balance,
              equity: live.equity,
              connected: true,
              latencyMs: 35,
              totalCopiedTrades: 0,
              createdAt: Date.now()
            };
            this.subscribers.set(newId, newSub);
            this.saveToDisk();
          }
        }
      } catch (err: any) {
        console.warn('[MultiClientCopierService] Sync loop notice:', err.message);
      }
    }, 5000);
  }

  public getStatus() {
    const subs = Array.from(this.subscribers.values());
    const activeSubs = subs.filter(s => s.status === 'ACTIVE' || s.status === 'TRIAL');
    const totalBalance = subs.reduce((acc, s) => acc + s.balance, 0);
    const avgLatency = subs.length > 0 
      ? Math.round(subs.reduce((acc, s) => acc + s.latencyMs, 0) / subs.length) 
      : 38;

    return {
      masterActive: this.isMasterActive,
      totalSubscribers: subs.length,
      activeSubscribers: activeSubs.length,
      totalPortfolioValueUsd: totalBalance,
      avgExecutionLatencyMs: avgLatency,
      totalExecutedCopyTrades: this.executionAuditLog.length,
      lastSyncAt: Date.now()
    };
  }

  public getSubscribers(): SubscriberAccount[] {
    return Array.from(this.subscribers.values());
  }

  public getAllSubscribers(): SubscriberAccount[] {
    return this.getSubscribers();
  }

  public registerOrUpdateSubscriber(sub: SubscriberAccount): void {
    this.subscribers.set(sub.id, sub);
    this.saveToDisk();
  }

  public getAuditLogs(limit: number = 50): CopiedExecutionEvent[] {
    return [...this.executionAuditLog].reverse().slice(0, limit);
  }

  public addSubscriber(data: {
    name: string;
    email: string;
    accountNumber: string;
    ctidTraderAccountId?: number;
    brokerName?: string;
    environment?: 'DEMO' | 'LIVE';
    riskMode?: 'CONSERVATIVE' | 'BALANCED' | 'PRO';
    initialBalance?: number;
  }): SubscriberAccount {
    const accNo = String(data.accountNumber);
    const id = `sub-${accNo}`;
    const riskMode = data.riskMode || 'BALANCED';
    const riskPercent = riskMode === 'CONSERVATIVE' ? 0.5 : riskMode === 'BALANCED' ? 1.0 : 2.0;

    const existing = this.subscribers.get(id);
    const newSub: SubscriberAccount = {
      id,
      name: data.name || (existing ? existing.name : `Trader #${accNo}`),
      email: data.email || (existing ? existing.email : `${accNo}@ctrader.client`),
      accountNumber: accNo,
      ctidTraderAccountId: data.ctidTraderAccountId || (existing ? existing.ctidTraderAccountId : Number(accNo)),
      executionChannel: existing?.executionChannel || (data.ctidTraderAccountId && String(data.ctidTraderAccountId) !== accNo ? 'OPEN_API' : 'CBOT'),
      environment: data.environment || (existing ? existing.environment : 'DEMO'),
      brokerName: data.brokerName || (existing ? existing.brokerName : 'Spotware cTrader Open API'),
      riskMode,
      riskPercent,
      status: 'ACTIVE',
      balance: data.initialBalance || (existing ? existing.balance : 10000.0),
      equity: data.initialBalance || (existing ? existing.equity : 10000.0),
      connected: true,
      latencyMs: 38,
      totalCopiedTrades: existing ? existing.totalCopiedTrades : 0,
      createdAt: existing ? existing.createdAt : Date.now()
    };

    this.subscribers.set(id, newSub);
    this.saveToDisk();
    this.emit('subscriberAdded', newSub);
    return newSub;
  }

  public registerSubscriber(data: {
    name: string;
    email: string;
    accountNumber: string;
    ctidTraderAccountId?: number;
    brokerName?: string;
    environment?: 'DEMO' | 'LIVE';
    riskMode?: 'CONSERVATIVE' | 'BALANCED' | 'PRO';
    balance?: number;
    equity?: number;
    initialBalance?: number;
  }): SubscriberAccount {
    return this.addSubscriber({
      ...data,
      initialBalance: data.balance || data.initialBalance
    });
  }

  public toggleSubscriberStatus(id: string): SubscriberAccount | null {
    const sub = this.subscribers.get(id);
    if (!sub) return null;

    sub.status = sub.status === 'ACTIVE' || sub.status === 'TRIAL' ? 'PAUSED' : 'ACTIVE';
    this.emit('subscriberUpdated', sub);
    return sub;
  }

  public updateSubscriberRisk(id: string, riskMode: 'CONSERVATIVE' | 'BALANCED' | 'PRO'): SubscriberAccount | null {
    const sub = this.subscribers.get(id);
    if (!sub) return null;

    sub.riskMode = riskMode;
    sub.riskPercent = riskMode === 'CONSERVATIVE' ? 0.5 : riskMode === 'BALANCED' ? 1.0 : 2.0;
    this.emit('subscriberUpdated', sub);
    return sub;
  }

  public setMasterStatus(active: boolean) {
    this.isMasterActive = active;
  }

  /**
   * Dispatches a Master Signal in parallel to all active subscriber accounts
   * with custom dynamic lot sizing tailored to each subscriber's balance & risk mode.
   */
  public async dispatchMasterTrade(tradeProposal: {
    pair: string;
    direction: 'BUY' | 'SELL';
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
    isMultiTarget?: boolean;
    confidence?: number;
    strategyId?: string;
  }, approval?: CopierApproval): Promise<{ dispatchedCount: number; results: CopiedExecutionEvent[] }> {
    assertCopierApproval(tradeProposal, approval);
    const master = requireMasterOrder(approval);
    if (!this.isMasterActive) {
      return { dispatchedCount: 0, results: [] };
    }

    if (!this.dispatchLedgerReady) throw new Error('COPY_LEDGER_UNAVAILABLE');
    const subscribers = selectDirectCopyRecipients(Array.from(this.subscribers.values()));
    const results: CopiedExecutionEvent[] = [];

    // Broadcast to direct cBot VIP Copier Bridge queue for desktop cBot receivers
    try {
      const { publishCopierSignal } = await import('../routes/copier');
      publishCopierSignal({
        id: `sig_${tradeProposal.pair.replace(/[^A-Za-z0-9]/g, '')}_${Date.now()}`,
        masterBrokerOrderId: master.orderId,
        action: 'NEW_ORDER',
        pair: tradeProposal.pair,
        direction: tradeProposal.direction,
        entryPrice: tradeProposal.entryPrice,
        stopLoss: tradeProposal.stopLoss,
        takeProfit1: tradeProposal.takeProfit1,
        takeProfit2: tradeProposal.takeProfit2 || 0,
        lotSize: 0.02,
        recommendedRiskPct: 0.50,
        maxRiskPct: 2.00,
        reasons: [`Master Trade Dispatched: ${tradeProposal.pair} ${tradeProposal.direction} (Confidence: ${tradeProposal.confidence || 85}%)`]
      }, approval);
    } catch (copierBridgeErr: any) {
      console.warn('[MultiClientCopierService] Copier bridge broadcast notice:', copierBridgeErr.message);
    }

    const isJpy = tradeProposal.pair.includes('JPY');
    const isGold = tradeProposal.pair.includes('XAU');
    const isNas = tradeProposal.pair.includes('NASDAQ');
    const isBtc = tradeProposal.pair.includes('BTC');
    const pipMultiplier = isJpy ? 0.01 : (isGold || isNas || isBtc) ? 1.0 : 0.0001;

    const slDistance = Math.abs(tradeProposal.entryPrice - tradeProposal.stopLoss) || (30 * pipMultiplier);
    const slPips = slDistance / pipMultiplier;

    // Waiting limit setups must not become market copies.
    if (master.orderType === 'MARKET' && approval.eligibility !== 'ELIGIBLE_FOR_EXECUTION') throw new Error('WAITING_SETUP_REQUIRES_LIMIT');

    // Parallel Async Dispatch
    const copyPromises = subscribers.map(async (sub) => {
      const dispatchKey = master.orderId + ':' + sub.ctidTraderAccountId;
      if (this.copyDispatches.has(dispatchKey)) return;
      this.copyDispatches.set(dispatchKey, Date.now());
      // Claim durably before broker submission. Ambiguous failures require reconciliation, not blind retry.
      fs.writeFileSync(this.dispatchPath, JSON.stringify([...this.copyDispatches]), 'utf8');
      const startTime = Date.now();

      // Check if subscriber is eligible to receive trade
      if (sub.status === 'PAUSED' || sub.status === 'EXPIRED') {
        const skippedEvent: CopiedExecutionEvent = {
          id: `copy-${Date.now()}-${sub.id}`,
          masterTradeId: master.orderId,
          subscriberId: sub.id,
          subscriberName: sub.name,
          accountNumber: sub.accountNumber,
          pair: tradeProposal.pair,
          direction: tradeProposal.direction,
          entryPrice: tradeProposal.entryPrice,
          stopLoss: tradeProposal.stopLoss,
          takeProfit: tradeProposal.takeProfit1,
          takeProfit2: tradeProposal.takeProfit2,
          isMultiTarget: tradeProposal.isMultiTarget,
          lotSize: 0,
          riskPercent: sub.riskPercent,
          status: 'SKIPPED_PAUSED',
          latencyMs: 0,
          executedAt: Date.now(),
          error: `Subscriber status is ${sub.status}`
        };
        results.push(skippedEvent);
        return;
      }

      let calculatedLot = 0;
      const executionLatency = sub.latencyMs + Math.floor(Math.random() * 5);

      try {
        const live = await ctraderMarketDataFeedService.fetchLiveAccountStatus(sub.ctidTraderAccountId);
        if (!live || !Number.isFinite(live.balance) || live.balance <= 0) throw new Error('SUBSCRIBER_BALANCE_UNAVAILABLE');
        sub.balance = live.balance;
        const pair = tradeProposal.pair.replace('/', '');
        if(!/^[A-Z]{6}$/.test(pair))throw Error('UNSUPPORTED_RISK_CONVERSION');
          const quote=pair.slice(3);
          const conversionPair=['GBP','AUD','NZD','EUR'].includes(quote)?quote+'/USD':'USD/'+quote;
          if(quote!=='USD'&&ctraderMarketDataFeedService.getSymbolHealth(conversionPair as any)!=='HEALTHY')throw Error('RISK_CONVERSION_FEED_NOT_HEALTHY');
          const quotePerUsd=quoteUnitsPerUsd(quote,ctraderMarketDataFeedService.getLatestTick(conversionPair));
          const riskAmount = live.balance * Math.min(sub.riskPercent, 2) / 100;
        if (!(riskAmount > 0) || !(slDistance > 0)) throw new Error('INVALID_RISK_BUDGET');
        calculatedLot = Math.floor((riskAmount / (slDistance * 100000 / quotePerUsd)) * 100 + 1e-9) / 100;
        calculatedLot = Math.min(5, calculatedLot);
        if (!(calculatedLot >= 0.01)) throw new Error('RISK_BUDGET_BELOW_MINIMUM_LOT');
        // Execute copy trade into broker ledger
        // Count only confirmed broker fills.

        // Execute live copy trade through cTrader broker Open API ProtoOANewOrderReq (2106)
        let brokerTicket = `cT-${Math.floor(10000000 + Math.random() * 90000000)}`;
        let actualEntryPrice = tradeProposal.entryPrice;
        let executionMode = 'SIMULATED';

        try {
          const { ctraderMarketDataFeedService } = await import('./ctraderMarketDataFeedService');

          // Look up OAuth access token for this subscriber from the auth token store
          let subscriberAccessToken: string | undefined;
          try {
            const { subscriberTokenStore } = await import('../../server/routes/auth');
            const tokenEntry = subscriberTokenStore.get(sub.accountNumber) ||
                               subscriberTokenStore.get(String(sub.ctidTraderAccountId || ''));
            if (tokenEntry?.accessToken) {
              subscriberAccessToken = tokenEntry.accessToken;
              console.log(`[MultiClientCopierService] ✅ OAuth token found for account #${sub.accountNumber} — executing REAL order`);
              executionMode = 'LIVE_OAUTH';
            }
          } catch {}

          const brokerRes = await ctraderMarketDataFeedService.executeMarketOrderForSubscriber({
            ctidTraderAccountId: sub.ctidTraderAccountId || Number(sub.accountNumber),
            symbol: tradeProposal.pair,
            direction: tradeProposal.direction,
            quantity: calculatedLot,
            stopLoss: tradeProposal.stopLoss,
            takeProfit: tradeProposal.takeProfit1,
            entryPrice: tradeProposal.entryPrice,
            accessToken: subscriberAccessToken,
            orderType: master.orderType,
            limitPrice: master.orderType === 'LIMIT' ? tradeProposal.entryPrice : undefined,
            masterOrderId: master.orderId
          });

          if (brokerRes?.success && (brokerRes.positionId || (master.orderType === 'LIMIT' && brokerRes.orderId))) {
            brokerTicket = brokerRes.positionId || brokerRes.orderId!;
            executionMode = 'LIVE_CONFIRMED';
            if (brokerRes.executionPrice && brokerRes.executionPrice > 0) {
              actualEntryPrice = brokerRes.executionPrice;
            }
            console.log(`[MultiClientCopierService] ✅ LIVE order confirmed for #${sub.accountNumber}: positionId=${brokerTicket} price=${actualEntryPrice}`);
          } else { throw new Error(brokerRes?.error || 'BROKER_CONFIRMATION_REQUIRED'); }
        } catch (err: any) { throw new Error(err.message || 'BROKER_EXECUTION_FAILED'); }
        sub.totalCopiedTrades += 1;
        sub.lastCopiedAt = Date.now();
        console.log(`[MultiClientCopierService] Execution mode for #${sub.accountNumber}: ${executionMode} | Ticket: ${brokerTicket}`);

        const successEvent: CopiedExecutionEvent = {
          id: `copy-${Date.now()}-${sub.id}`,
          masterTradeId: master.orderId,
          subscriberId: sub.id,
          subscriberName: sub.name,
          accountNumber: sub.accountNumber,
          pair: tradeProposal.pair,
          direction: tradeProposal.direction,
          entryPrice: actualEntryPrice,
          stopLoss: tradeProposal.stopLoss,
          takeProfit: tradeProposal.takeProfit1,
          takeProfit2: tradeProposal.takeProfit2,
          isMultiTarget: Boolean(tradeProposal.takeProfit2 && tradeProposal.takeProfit2 > 0),
          lotSize: calculatedLot,
          riskPercent: sub.riskPercent,
          status: 'SUCCESS',
          orderType: master.orderType,
          latencyMs: executionLatency,
          executedAt: Date.now(),
          brokerTicket
        };

        results.push(successEvent);
        this.executionAuditLog.push(successEvent);
        this.emit('tradeCopied', successEvent);

        // Persist isolated subscriber position to PostgreSQL
        try {
          const { TradingRepository } = await import('../../../packages/database/src/repository');
          const tradingRepo = new TradingRepository();
          if (master.orderType === 'MARKET') await tradingRepo.savePosition({
            positionId: successEvent.id,
            ticketId: successEvent.brokerTicket,
            accountId: sub.accountNumber,
            symbol: tradeProposal.pair,
            direction: tradeProposal.direction,
            quantity: calculatedLot,
            entryPrice: actualEntryPrice,
            currentPrice: actualEntryPrice,
            stopLoss: tradeProposal.stopLoss,
            takeProfit: tradeProposal.takeProfit1,
            takeProfit2: tradeProposal.takeProfit2,
            status: 'OPEN',
            broker: 'Spotware cTrader Open API',
            environment: sub.environment || 'DEMO',
            openedAt: new Date()
          });
        } catch (dbErr: any) {
          console.warn('[MultiClientCopierService] Position DB save notice:', dbErr.message);
        }
      } catch (err: any) {
        const errorEvent: CopiedExecutionEvent = {
          id: `copy-${Date.now()}-${sub.id}`,
          masterTradeId: master.orderId,
          subscriberId: sub.id,
          subscriberName: sub.name,
          accountNumber: sub.accountNumber,
          pair: tradeProposal.pair,
          direction: tradeProposal.direction,
          entryPrice: tradeProposal.entryPrice,
          stopLoss: tradeProposal.stopLoss,
          takeProfit: tradeProposal.takeProfit1,
          takeProfit2: tradeProposal.takeProfit2,
          isMultiTarget: Boolean(tradeProposal.takeProfit2 && tradeProposal.takeProfit2 > 0),
          lotSize: calculatedLot,
          riskPercent: sub.riskPercent,
          status: 'FAILED',
          latencyMs: Date.now() - startTime,
          executedAt: Date.now(),
          error: err.message
        };
        results.push(errorEvent);
        this.executionAuditLog.push(errorEvent);
      }
    });

    await Promise.all(copyPromises);

    return {
      dispatchedCount: results.filter(r => r.status === 'SUCCESS').length,
      results
    };
  }
}

export const multiClientCopierService = new MultiClientCopierService();
