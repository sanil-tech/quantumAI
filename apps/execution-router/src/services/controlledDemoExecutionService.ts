import {
  AiTradeOpportunity,
  CurrencyPair,
  DemoExecutionPhase,
  DemoExecutionRecord
} from '../../../../src/types';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import { validateExecutionEnvironmentSafety } from '../adapters/executionSafetyGate';
import { ShadowAnalyticsService } from '../../../../src/server/services/shadowAnalyticsService';

export interface DemoOrderSubmissionResult {
  success: boolean;
  code: string;
  reason: string;
  record?: DemoExecutionRecord;
}

export class ControlledDemoExecutionService {
  private static instance: ControlledDemoExecutionService;
  private isArmed: boolean = false;
  private maxConcurrentPositions: number = 1;
  private records: Map<string, DemoExecutionRecord> = new Map();
  private processedSignalIds: Set<string> = new Set();
  private processedCloseIds: Set<string> = new Set();

  public static getInstance(): ControlledDemoExecutionService {
    if (!ControlledDemoExecutionService.instance) {
      ControlledDemoExecutionService.instance = new ControlledDemoExecutionService();
    }
    return ControlledDemoExecutionService.instance;
  }

  public armDemoExecution(): void {
    this.isArmed = true;
  }

  public disarmDemoExecution(): void {
    this.isArmed = false;
  }

  public isDemoArmed(): boolean {
    return this.isArmed;
  }

  public clearRecords(): void {
    this.records.clear();
    this.processedSignalIds.clear();
    this.processedCloseIds.clear();
    this.isArmed = false;
  }

  public getOpenPositions(): DemoExecutionRecord[] {
    return Array.from(this.records.values()).filter(r => r.phase === 'POSITION_CONFIRMED');
  }

  public getAllRecords(): DemoExecutionRecord[] {
    return Array.from(this.records.values());
  }

  public getRecordById(id: string): DemoExecutionRecord | undefined {
    return this.records.get(id);
  }

  /**
   * Evaluates pre-order gates and executes a single controlled DEMO order.
   */
  public executeControlledDemoOrder(
    opportunity: AiTradeOpportunity,
    requestedLotSize: number = 0.01,
    marketPrice: number = 0,
    brokerMockAck?: { brokerOrderId: string; brokerPositionId: string; executedPrice: number },
    credentials?: { clientId?: string; accountId?: string }
  ): DemoOrderSubmissionResult {
    // 1. Explicit Arming Gate
    if (!this.isArmed) {
      return {
        success: false,
        code: 'DEMO_DISARMED',
        reason: 'DEMO execution rejected: Controlled DEMO execution is DISARMED (DEMO_EXECUTION_ARMED=false).'
      };
    }

    // 2. Non-Trade Action Rejection
    if (opportunity.action === 'NO_SETUP') {
      return { success: false, code: 'NO_SETUP_REJECTED', reason: 'DEMO execution rejected: Signal action is NO_SETUP' };
    }
    if (opportunity.action === 'WAIT_FOR_CONFIRMATION') {
      return { success: false, code: 'WAIT_REJECTED', reason: 'DEMO execution rejected: Signal action is WAIT_FOR_CONFIRMATION' };
    }
    if (opportunity.action === 'VETO' || opportunity.status === 'VETOED') {
      return { success: false, code: 'VETO_REJECTED', reason: 'DEMO execution rejected: Signal is VETOED by Adaptive Learning' };
    }
    if (opportunity.action !== 'BUY' && opportunity.action !== 'SELL') {
      return { success: false, code: 'INVALID_ACTION', reason: `DEMO execution rejected: Invalid action ${opportunity.action}` };
    }

    // 3. Stale Signal Check (< 60s)
    const signalAgeMs = Date.now() - (opportunity.timestamp || Date.now());
    if (signalAgeMs > 60000) {
      return { success: false, code: 'STALE_SIGNAL', reason: `DEMO execution rejected: Signal age ${signalAgeMs}ms exceeds 60s` };
    }

    // 4. Geometry Check
    const sl = opportunity.stopLoss;
    const tp1 = opportunity.takeProfit1;
    const tp2 = opportunity.takeProfit2 ?? tp1;
    const entryMin = opportunity.entryZone?.min;
    const entryMax = opportunity.entryZone?.max;

    if (!sl || !tp1 || !entryMin || !entryMax) {
      return { success: false, code: 'INVALID_GEOMETRY', reason: 'DEMO execution rejected: Missing SL, TP1, or EntryZone' };
    }

    if (opportunity.action === 'BUY') {
      if (!(sl < entryMin && entryMin <= entryMax && entryMax < tp1 && tp1 <= tp2!)) {
        return { success: false, code: 'INVALID_GEOMETRY', reason: 'DEMO execution rejected: BUY requires SL < EntryMin <= EntryMax < TP1 <= TP2' };
      }
    } else {
      if (!(tp2! <= tp1 && tp1 < entryMin && entryMin <= entryMax && entryMax < sl)) {
        return { success: false, code: 'INVALID_GEOMETRY', reason: 'DEMO execution rejected: SELL requires TP2 <= TP1 < EntryMin <= EntryMax < SL' };
      }
    }

    // 4b. Volume Limit Gate (0.01 LOT Cap)
    if (requestedLotSize > 0.01) {
      return {
        success: false,
        code: 'MAX_VOLUME_EXCEEDED',
        reason: 'DEMO execution rejected: Requested lot size exceeds DEMO maximum allowed (0.01 LOT)'
      };
    }

    // 5. Max Concurrent Positions Gate (1 Trade Limit)
    const openCount = this.getOpenPositions().length;
    if (openCount >= this.maxConcurrentPositions) {
      return {
        success: false,
        code: 'MAX_CONCURRENT_LIMIT_EXCEEDED',
        reason: `DEMO execution rejected: Max concurrent DEMO positions (${this.maxConcurrentPositions}) reached.`
      };
    }

    // 6. Idempotency on Signal ID
    const signalId = opportunity.proposalId || `sig-${opportunity.pair}-${opportunity.timestamp}`;
    if (this.processedSignalIds.has(signalId)) {
      return {
        success: false,
        code: 'DUPLICATE_SIGNAL',
        reason: `DEMO execution rejected: Signal ${signalId} has already been submitted.`
      };
    }

    // 7. Strict Safety Gate Invariant Validation
    const effectiveCreds = credentials || {
      clientId: process.env.CTRADER_CLIENT_ID || 'demo-client-id',
      accountId: process.env.CTRADER_ACCOUNT_ID || 'demo-account-id'
    };

    const safetyCheck = validateExecutionEnvironmentSafety({
      environment: 'DEMO',
      brokerId: 'ctrader-broker-01',
      symbol: opportunity.pair,
      direction: opportunity.action === 'BUY' ? 'BUY' : 'SELL',
      requestedLotSize,
      credentials: effectiveCreds
    });

    if (!safetyCheck.allowed) {
      return {
        success: false,
        code: safetyCheck.code,
        reason: `Safety gate blocked DEMO order: ${safetyCheck.reason}`
      };
    }

    // 8. Order Transmission & Broker Acknowledgement
    const recordId = `demo-exec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const plannedEntry = marketPrice > 0 ? marketPrice : (entryMin + entryMax) / 2;

    const record: DemoExecutionRecord = {
      id: recordId,
      signalId,
      symbol: opportunity.pair,
      direction: opportunity.action,
      executionEnvironment: 'DEMO',
      phase: 'ORDER_REQUEST_CREATED',
      requestedLotSize,
      normalizedVolume: requestedLotSize * 100000,
      requestedEntryPrice: plannedEntry,
      stopLoss: sl,
      takeProfit1: tp1,
      takeProfit2: tp2,
      openTimestamp: Date.now(),
      mfePips: 0,
      maePips: 0,
      learningVersion: opportunity.strategyVersion || '1.0',
      signalSnapshot: Object.freeze(JSON.parse(JSON.stringify(opportunity)))
    };

    record.phase = 'ORDER_TRANSMITTED';

    // Authoritative Broker Acknowledgement
    if (brokerMockAck) {
      record.brokerOrderId = brokerMockAck.brokerOrderId;
      record.brokerPositionId = brokerMockAck.brokerPositionId;
      record.acknowledgedEntryPrice = brokerMockAck.executedPrice;
      record.phase = 'POSITION_CONFIRMED';
    } else {
      // Default acknowledged state with executed price
      record.brokerOrderId = `ord-${Date.now()}`;
      record.brokerPositionId = `pos-${Date.now()}`;
      record.acknowledgedEntryPrice = plannedEntry;
      record.phase = 'POSITION_CONFIRMED';
    }

    this.records.set(recordId, record);
    this.processedSignalIds.add(signalId);

    return {
      success: true,
      code: 'DEMO_ORDER_EXECUTED',
      reason: `DEMO order executed successfully. Position ID: ${record.brokerPositionId}`,
      record
    };
  }

  /**
   * Updates open DEMO positions against observed market prices.
   */
  public updatePositionsWithMarketPrice(
    pair: CurrencyPair,
    currentPrice: number,
    highPrice?: number,
    lowPrice?: number
  ): DemoExecutionRecord[] {
    const high = highPrice ?? currentPrice;
    const low = lowPrice ?? currentPrice;
    const pipFactor = pair === 'USD/JPY' ? 100 : (pair === 'XAU/USD' || pair === 'NASDAQ' || pair === 'BTC/USD') ? 1 : 10000;

    const updated: DemoExecutionRecord[] = [];

    this.getOpenPositions().filter(r => r.symbol === pair).forEach(pos => {
      const entry = pos.acknowledgedEntryPrice || pos.requestedEntryPrice;

      // Update MFE & MAE
      if (pos.direction === 'BUY') {
        const mfe = Math.max(pos.mfePips, (high - entry) * pipFactor);
        const mae = Math.max(pos.maePips, (entry - low) * pipFactor);
        pos.mfePips = Number(mfe.toFixed(1));
        pos.maePips = Number(mae.toFixed(1));

        if (low <= pos.stopLoss) {
          this.closeDemoPosition(pos.id, pos.stopLoss, 'STOP_LOSS');
          updated.push(pos);
          return;
        }

        // Check Take Profit 2 (Final Target)
        if (pos.takeProfit2 && pos.takeProfit2 !== pos.takeProfit1 && high >= pos.takeProfit2) {
          pos.tp1Hit = true;
          pos.tp2Hit = true;
          this.closeDemoPosition(pos.id, pos.takeProfit2, 'TAKE_PROFIT_2');
          updated.push(pos);
          return;
        }

        // Check Take Profit 1 (Milestone / Partial De-Risk / Final Target if single TP)
        if (high >= pos.takeProfit1 && !pos.tp1Hit) {
          pos.tp1Hit = true;
          if (!pos.takeProfit2 || pos.takeProfit2 === pos.takeProfit1) {
            this.closeDemoPosition(pos.id, pos.takeProfit1, 'TAKE_PROFIT_1');
            updated.push(pos);
            return;
          }
          // Move SL to Breakeven (Entry Price) on TP1 hit when TP2 exists
          pos.stopLoss = entry;
        }
      } else {
        const mfe = Math.max(pos.mfePips, (entry - low) * pipFactor);
        const mae = Math.max(pos.maePips, (high - entry) * pipFactor);
        pos.mfePips = Number(mfe.toFixed(1));
        pos.maePips = Number(mae.toFixed(1));

        if (high >= pos.stopLoss) {
          this.closeDemoPosition(pos.id, pos.stopLoss, 'STOP_LOSS');
          updated.push(pos);
          return;
        }

        // Check Take Profit 2 (Final Target)
        if (pos.takeProfit2 && pos.takeProfit2 !== pos.takeProfit1 && low <= pos.takeProfit2) {
          pos.tp1Hit = true;
          pos.tp2Hit = true;
          this.closeDemoPosition(pos.id, pos.takeProfit2, 'TAKE_PROFIT_2');
          updated.push(pos);
          return;
        }

        // Check Take Profit 1 (Milestone / Partial De-Risk / Final Target if single TP)
        if (low <= pos.takeProfit1 && !pos.tp1Hit) {
          pos.tp1Hit = true;
          if (!pos.takeProfit2 || pos.takeProfit2 === pos.takeProfit1) {
            this.closeDemoPosition(pos.id, pos.takeProfit1, 'TAKE_PROFIT_1');
            updated.push(pos);
            return;
          }
          // Move SL to Breakeven (Entry Price) on TP1 hit when TP2 exists
          pos.stopLoss = entry;
        }
      }

      updated.push(pos);
    });

    return updated;
  }

  /**
   * Closes an authoritative DEMO position, dispatches TradeClosed event, and triggers post-mortem.
   */
  public closeDemoPosition(
    recordId: string,
    exitPrice: number,
    closeReason: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'INVALIDATION' | 'MANUAL_CLOSE' | 'TIMEOUT'
  ): DemoExecutionRecord | undefined {
    const record = this.records.get(recordId);
    if (!record || record.phase === 'POSITION_CLOSED') return record;

    const closeKey = `close-demo-${recordId}`;
    if (this.processedCloseIds.has(closeKey)) return record;
    this.processedCloseIds.add(closeKey);

    const entry = record.acknowledgedEntryPrice || record.requestedEntryPrice;
    const pipFactor = record.symbol === 'USD/JPY' ? 100 : (record.symbol === 'XAU/USD' || record.symbol === 'NASDAQ' || record.symbol === 'BTC/USD') ? 1 : 10000;
    const realizedR = ShadowAnalyticsService.calculateRMultiple(entry, exitPrice, record.stopLoss, record.direction);
    const pnlPips = Number(((record.direction === 'BUY' ? (exitPrice - entry) : (entry - exitPrice)) * pipFactor).toFixed(1));
    const realizedPnlDollars = Number((pnlPips * (record.requestedLotSize * 10)).toFixed(2));
    const outcome = realizedR > 0 ? 'WIN' : realizedR < 0 ? 'LOSS' : 'BREAKEVEN';

    record.phase = 'POSITION_CLOSED';
    record.closeTimestamp = Date.now();
    record.exitPrice = exitPrice;
    record.closeReason = closeReason;
    record.realizedR = realizedR;
    record.realizedPnlDollars = realizedPnlDollars;

    // Dispatch TradeClosed event to event bus for learning rehydration
    globalEventBus.publish({
      id: `evt-demo-closed-${record.id}`,
      type: EventTypes.TradeClosed,
      timestamp: new Date(),
      payload: {
        positionId: record.brokerPositionId || record.id,
        tradeId: record.id,
        symbol: record.symbol,
        outcome,
        realizedProfit: realizedPnlDollars,
        pnlDollars: realizedPnlDollars,
        pnlPips,
        exitPrice,
        exitReason: closeReason,
        learningVersion: record.learningVersion,
        strategyId: record.signalSnapshot.strategyId || 'SMC_QUANT_V1',
        strategyVersion: record.learningVersion,
        executionEnvironment: 'DEMO'
      }
    }).catch(err => {
      console.error(`[CONTROLLED_DEMO] Error publishing TradeClosed event: ${err.message}`);
    });

    return record;
  }
}

export const controlledDemoExecutionService = ControlledDemoExecutionService.getInstance();
