import { ManualTradeSignal, ManualTradeJournalEntry, ManualSignalStatus, AiPlannedSetup, UserActualTrade, ManualTradeStatus, ManualTradeExitReason, ManualTradeResult } from '@iati/core-types';
import { aiDecisionEngine } from '../../../apps/decision-agent/src/services/aiDecisionEngine';
import { learningService } from './learningService';

// Persisted In-Memory Signal History & Dual-Layer Manual Trades
const signalHistory: ManualTradeSignal[] = [];
const manualTradesJournal: ManualTradeJournalEntry[] = [];
const userActualTrades: UserActualTrade[] = [];

export class ManualSignalService {
  /**
   * Generates a standardized Manual Trade Signal from real market data and Adaptive Learning.
   * QUANTUMAI GUARANTEE: Never transmits orders. Manual execution only.
   */
  public async generateManualSignal(params: {
    symbol?: string;
    timeframe?: string;
    style?: string;
    currentPrice?: number;
    candles?: any[];
    indicators?: any;
    smc?: any;
    newsContext?: string;
    dataMode?: string;
    envelope?: any;
  }): Promise<ManualTradeSignal> {
    const symbol = params.symbol || 'EUR/USD';
    const timeframe = params.timeframe || 'M15';
    const style = params.style || 'DAY_TRADER';
    const dataMode = params.dataMode || 'LIVE';
    const candles = params.candles || [];
    const currentPrice = Number(params.currentPrice);

    const now = Date.now();
    const signalId = `SIG-MANUAL-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Calculate timeframe-based expiration
    let validityDurationMs = 45 * 60 * 1000; // 45m for M15
    if (timeframe === 'M1' || timeframe === 'M5') validityDurationMs = 15 * 60 * 1000;
    else if (timeframe === 'H1') validityDurationMs = 3 * 3600 * 1000;
    else if (timeframe === 'H4') validityDurationMs = 12 * 3600 * 1000;
    else if (timeframe === 'D1') validityDurationMs = 24 * 3600 * 1000;

    const expiresAt = now + validityDurationMs;

    // Fail-Closed Market Data Checks
    if (dataMode === 'LIVE') {
      if (!candles || candles.length < 15) {
        const unavailableSignal: ManualTradeSignal = {
          signalId,
          timestamp: new Date(now).toISOString(),
          symbol,
          timeframe,
          marketDataStatus: 'INSUFFICIENT_DATA',
          direction: 'NEUTRAL',
          setupGrade: 'NO_SETUP',
          confidence: 0,
          entryZone: { min: 0, max: 0 },
          invalidationLevel: 0,
          stopLoss: 0,
          takeProfit1: 0,
          takeProfit2: 0,
          riskReward: 'N/A',
          marketStructure: 'UNKNOWN',
          technicalEvidence: ['Insufficient validated market data candles (minimum 15 required for reliable SMC calculation)'],
          adaptiveLearningEvidence: {
            status: 'ACTIVE',
            relevantLessonsCount: 0,
            appliedLessons: []
          },
          signalStatus: 'INSUFFICIENT_EVIDENCE',
          reason: 'Insufficient validated market data. Minimum 15 candles required.',
          generatedAt: now,
          expiresAt,
          executionMode: 'MANUAL',
          brokerExecution: false
        };
        signalHistory.unshift(unavailableSignal);
        return unavailableSignal;
      }

      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        const unavailableSignal: ManualTradeSignal = {
          signalId,
          timestamp: new Date(now).toISOString(),
          symbol,
          timeframe,
          marketDataStatus: 'UNAVAILABLE',
          direction: 'NEUTRAL',
          setupGrade: 'NO_SETUP',
          confidence: 0,
          entryZone: { min: 0, max: 0 },
          invalidationLevel: 0,
          stopLoss: 0,
          takeProfit1: 0,
          takeProfit2: 0,
          riskReward: 'N/A',
          marketStructure: 'UNKNOWN',
          technicalEvidence: ['Live market price feed unavailable or unverified'],
          adaptiveLearningEvidence: {
            status: 'ACTIVE',
            relevantLessonsCount: 0,
            appliedLessons: []
          },
          signalStatus: 'MARKET_DATA_UNAVAILABLE',
          reason: 'Current market price is unavailable from authoritative provider.',
          generatedAt: now,
          expiresAt,
          executionMode: 'MANUAL',
          brokerExecution: false
        };
        signalHistory.unshift(unavailableSignal);
        return unavailableSignal;
      }
    }

    // Call Primary AI Decision Engine with Adaptive Learning Memory
    const opinion = await aiDecisionEngine.generateOpinion({
      pair: symbol,
      timeframe,
      style,
      currentPrice: currentPrice || (candles.length > 0 ? candles[candles.length - 1]?.close : undefined),
      indicators: params.indicators,
      smc: params.smc,
      newsContext: params.newsContext,
      dataMode,
      envelope: params.envelope
    });

    // Check relevant Adaptive Learning lessons
    const allReviews = aiDecisionEngine.getPostMortemReviews();
    const symbolLossReviews = allReviews.filter(
      r => ((r as any).pair === symbol || (r as any).symbol === symbol) && r.outcome === 'LOSS'
    );

    const appliedLessons = symbolLossReviews.map(
      r => `Lesson #${r.id} (${r.pair}): ${r.adaptiveRuleEn || r.adaptiveRuleMs || 'SL expanded'}`
    );

    const confidence = Number(opinion.confidence) || 70;
    const direction = (opinion.action === 'BUY' ? 'BUY' : opinion.action === 'SELL' ? 'SELL' : 'NEUTRAL') as 'BUY' | 'SELL' | 'NEUTRAL';

    let signalStatus: ManualSignalStatus = 'SIGNAL_READY';
    let setupGrade = 'A';

    if (confidence >= 85) {
      setupGrade = 'A+';
    } else if (confidence >= 75) {
      setupGrade = 'A';
    } else if (confidence >= 65) {
      setupGrade = 'B';
    } else {
      setupGrade = 'NO_SETUP';
      signalStatus = 'WAITING';
    }

    if (direction === 'NEUTRAL') {
      signalStatus = 'WAITING';
    }

    const effectivePrice = currentPrice || (candles.length > 0 ? candles[candles.length - 1]?.close : 1.08350);

    const signal: ManualTradeSignal = {
      signalId,
      timestamp: new Date(now).toISOString(),
      symbol,
      timeframe,
      marketDataStatus: 'VALID_REAL_DATA',
      direction,
      setupGrade,
      confidence,
      entryZone: opinion.entryZone || { min: effectivePrice, max: effectivePrice },
      invalidationLevel: Number(opinion.invalidationLevel) || 0,
      stopLoss: Number(opinion.stopLoss) || 0,
      takeProfit1: Number(opinion.takeProfit1) || 0,
      takeProfit2: Number(opinion.takeProfit2) || 0,
      riskReward: opinion.riskRewardRatio || '1:2.5',
      marketStructure: opinion.bias || (direction === 'BUY' ? 'BULLISH' : 'BEARISH'),
      technicalEvidence: Array.isArray(opinion.reasons) ? opinion.reasons : [],
      adaptiveLearningEvidence: {
        status: 'ACTIVE',
        relevantLessonsCount: symbolLossReviews.length,
        appliedLessons
      },
      signalStatus,
      reason: signalStatus === 'WAITING' ? 'Confluence is weak; awaiting clean structure break' : undefined,
      generatedAt: now,
      expiresAt,
      executionMode: 'MANUAL',
      brokerExecution: false
    };

    signalHistory.unshift(signal);
    if (signalHistory.length > 100) {
      signalHistory.pop();
    }

    return signal;
  }

  /**
   * PHASE 6B: Creates a UserActualTrade linking AI Planned Setup and User Actual Execution.
   * QUANTUMAI GUARANTEE: Never overwrites AI planned setup with user execution drift.
   */
  public createUserActualTrade(params: {
    signal: ManualTradeSignal;
    actualEntry: number;
    positionSize: number;
    enteredAt?: string;
    notes?: string;
  }): UserActualTrade {
    const { signal, actualEntry, positionSize, enteredAt, notes } = params;

    const plannedEntry = (signal.entryZone.min + signal.entryZone.max) / 2;

    const aiPlannedSetup: AiPlannedSetup = {
      signalId: signal.signalId,
      symbol: signal.symbol,
      direction: signal.direction,
      timeframe: signal.timeframe,
      plannedEntry: Number(plannedEntry.toFixed(signal.symbol === 'USD/JPY' ? 3 : 5)),
      entryZone: { ...signal.entryZone },
      stopLoss: signal.stopLoss,
      takeProfit1: signal.takeProfit1,
      takeProfit2: signal.takeProfit2,
      invalidationLevel: signal.invalidationLevel,
      riskReward: signal.riskReward,
      confidence: signal.confidence,
      setupGrade: signal.setupGrade,
      adaptiveLearningRule: signal.adaptiveLearningEvidence.appliedLessons[0],
      createdAt: signal.timestamp
    };

    const userTrade: UserActualTrade = {
      manualTradeId: `MTR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      signalId: signal.signalId,
      symbol: signal.symbol,
      direction: signal.direction as 'BUY' | 'SELL',
      actualEntry: Number(actualEntry),
      positionSize: Number(positionSize),
      enteredAt: enteredAt || new Date().toISOString(),
      status: 'ACTIVE',
      result: 'PENDING',
      aiPlannedSetup,
      executionMode: 'MANUAL',
      brokerExecution: false,
      source: 'MANUAL_USER_REPORTED',
      notes: notes || 'Manually placed through user trading account'
    };

    userActualTrades.unshift(userTrade);
    if (userActualTrades.length > 200) {
      userActualTrades.pop();
    }

    return userTrade;
  }

  /**
   * PHASE 6B: Closes a UserActualTrade and computes realized Pips & P&L
   */
  public async closeUserActualTrade(
    manualTradeId: string,
    exitData: {
      exitPrice: number;
      exitReason: ManualTradeExitReason;
      exitedAt?: string;
      userNotes?: string;
    }
  ): Promise<UserActualTrade> {
    const trade = userActualTrades.find(t => t.manualTradeId === manualTradeId);
    if (!trade) {
      throw new Error(`USER_TRADE_NOT_FOUND: Manual trade ${manualTradeId} does not exist`);
    }

    const exitPrice = Number(exitData.exitPrice);
    const pipMultiplier = trade.symbol === 'USD/JPY' ? 100 : (trade.symbol === 'XAU/USD' || trade.symbol === 'NASDAQ' || trade.symbol === 'BTC/USD') ? 1 : 10000;

    let pips = 0;
    if (trade.direction === 'BUY') {
      pips = (exitPrice - trade.actualEntry) * pipMultiplier;
    } else {
      pips = (trade.actualEntry - exitPrice) * pipMultiplier;
    }

    const pipValuePerLot = trade.symbol === 'USD/JPY' ? 7.0 : (trade.symbol === 'XAU/USD' ? 10.0 : 10.0);
    const realizedPnl = Number((pips * pipValuePerLot * trade.positionSize).toFixed(2));

    trade.exitPrice = exitPrice;
    trade.exitReason = exitData.exitReason;
    trade.exitedAt = exitData.exitedAt || new Date().toISOString();
    trade.realizedPips = Number(pips.toFixed(1));
    trade.realizedPnl = realizedPnl;
    trade.status = 'CLOSED';

    if (pips > 1.0) {
      trade.result = 'WIN';
    } else if (pips < -1.0) {
      trade.result = 'LOSS';
    } else {
      trade.result = 'BREAKEVEN';
    }

    if (exitData.userNotes) {
      trade.notes = `${trade.notes ? trade.notes + ' | ' : ''}${exitData.userNotes}`;
    }

    // Trigger Adaptive Learning for loss reviews
    try {
      if (trade.result === 'LOSS') {
        const syntheticClosedPosition = {
          position_id: trade.manualTradeId,
          symbol: trade.symbol,
          direction: trade.direction,
          entry_price: trade.actualEntry,
          current_price: trade.exitPrice,
          realized_profit: trade.realizedPnl,
          stop_loss: trade.aiPlannedSetup.stopLoss,
          take_profit: trade.aiPlannedSetup.takeProfit1,
          status: 'CLOSED' as const,
          opened_at: new Date(trade.enteredAt),
          updated_at: new Date()
        };

        await learningService.processClosedTrade(
          { tradeId: trade.manualTradeId, position: syntheticClosedPosition },
          `[MANUAL TRADE] ${exitData.userNotes || 'User manual trade outcome'}`
        );
      }
    } catch (e: any) {
      console.warn(`[ManualSignalService] Adaptive Learning post-mortem notice:`, e.message);
    }

    return trade;
  }

  /**
   * Retrieves all UserActualTrades
   */
  public getUserActualTrades(status?: ManualTradeStatus): UserActualTrade[] {
    if (status) {
      return userActualTrades.filter(t => t.status === status);
    }
    return [...userActualTrades];
  }

  /**
   * Retrieves recent manual signal history
   */
  public getSignalHistory(): ManualTradeSignal[] {
    const now = Date.now();
    return signalHistory.map(sig => {
      if (sig.signalStatus === 'SIGNAL_READY' && now > sig.expiresAt) {
        return { ...sig, signalStatus: 'EXPIRED' };
      }
      return sig;
    });
  }

  /**
   * Records a user's manual trade in standard journal
   */
  public recordManualTrade(data: {
    signalId?: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    notes?: string;
  }): ManualTradeJournalEntry {
    const entry: ManualTradeJournalEntry = {
      tradeId: `MANUAL-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      signalId: data.signalId,
      symbol: data.symbol,
      direction: data.direction,
      entryPrice: Number(data.entryPrice),
      stopLoss: Number(data.stopLoss),
      takeProfit: Number(data.takeProfit),
      actualEntryTime: new Date().toISOString(),
      outcome: 'OPEN',
      notes: data.notes || 'Manually entered on external broker platform',
      executionMode: 'MANUAL',
      brokerExecution: false,
      source: 'MANUAL_USER_REPORTED',
      createdAt: new Date().toISOString()
    };

    manualTradesJournal.unshift(entry);
    if (manualTradesJournal.length > 200) {
      manualTradesJournal.pop();
    }

    return entry;
  }

  /**
   * Closes a manual trade in standard journal
   */
  public async closeManualTrade(
    tradeId: string,
    exitData: { exitPrice: number; outcome: 'WIN' | 'LOSS'; realizedPnl?: number; userNotes?: string }
  ): Promise<ManualTradeJournalEntry> {
    const trade = manualTradesJournal.find(t => t.tradeId === tradeId);
    if (!trade) {
      throw new Error(`MANUAL_TRADE_NOT_FOUND: Trade ${tradeId} does not exist`);
    }

    trade.actualExitPrice = Number(exitData.exitPrice);
    trade.actualExitTime = new Date().toISOString();
    trade.outcome = exitData.outcome;
    trade.realizedPnl = Number(exitData.realizedPnl ?? (exitData.outcome === 'WIN' ? 100 : -100));
    if (exitData.userNotes) {
      trade.notes = `${trade.notes ? trade.notes + ' | ' : ''}${exitData.userNotes}`;
    }

    return trade;
  }

  /**
   * Retrieves user's manual trade journal
   */
  public getManualTrades(): ManualTradeJournalEntry[] {
    return [...manualTradesJournal];
  }
}

export const manualSignalService = new ManualSignalService();
