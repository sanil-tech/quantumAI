import { 
  ManualTradeSignal, 
  ManualTradeJournalEntry, 
  ManualSignalStatus, 
  AiPlannedSetup, 
  UserActualTrade, 
  ManualTradeStatus, 
  ManualTradeExitReason, 
  ManualTradeResult 
} from '@iati/core-types';
import { TradingRepository } from '@iati/database';
import { aiDecisionEngine } from '../../../apps/decision-agent/src/services/aiDecisionEngine';
import { learningService } from './learningService';

export class ManualSignalService {
  private repo: TradingRepository;
  private signalHistory: ManualTradeSignal[] = [];
  private manualTradesJournal: ManualTradeJournalEntry[] = [];
  private userActualTrades: UserActualTrade[] = [];

  constructor(repo?: TradingRepository) {
    this.repo = repo || new TradingRepository();
    // Non-blocking background initial hydration from PostgreSQL
    this.loadPersistedTrades().catch(err => {
      console.warn('[ManualSignalService] Initial DB load notice:', err.message);
    });
  }

  /**
   * PHASE 6E: Hydrate in-memory cache from PostgreSQL source of truth
   */
  public async loadPersistedTrades(): Promise<UserActualTrade[]> {
    try {
      const persisted = await this.repo.getManualTrades();
      if (Array.isArray(persisted) && persisted.length > 0) {
        this.userActualTrades = [...persisted];
        return persisted;
      }
    } catch (err: any) {
      console.warn('[ManualSignalService] DB load fallback:', err.message);
    }
    return this.userActualTrades;
  }

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
        this.signalHistory.unshift(unavailableSignal);
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
        this.signalHistory.unshift(unavailableSignal);
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

    this.signalHistory.unshift(signal);
    if (this.signalHistory.length > 100) {
      this.signalHistory.pop();
    }

    return signal;
  }

  /**
   * PHASE 6C & 6E: Server-Side Strict Entry Validation & Durable Creation.
   * QUANTUMAI GUARANTEE: Never overwrites AI planned setup with user execution drift.
   */
  public createUserActualTrade(params: {
    signal?: ManualTradeSignal;
    signalId?: string;
    direction?: 'BUY' | 'SELL';
    actualEntry: number;
    positionSize: number;
    enteredAt?: string;
    notes?: string;
  }): UserActualTrade {
    const { signalId, actualEntry, positionSize, enteredAt, notes } = params;

    // 1. Resolve Signal
    let targetSignal = params.signal;
    if (!targetSignal && signalId) {
      targetSignal = this.signalHistory.find(s => s.signalId === signalId);
    }

    if (!targetSignal) {
      const error: any = new Error('SIGNAL_NOT_FOUND: The referenced AI trade signal was not found in active signal history.');
      error.errorCode = 'SIGNAL_NOT_FOUND';
      throw error;
    }

    // 2. Validate Expiration
    const now = Date.now();
    if (now > targetSignal.expiresAt) {
      const error: any = new Error(`SIGNAL_EXPIRED: AI Signal ${targetSignal.signalId} expired at ${new Date(targetSignal.expiresAt).toISOString()}`);
      error.errorCode = 'SIGNAL_EXPIRED';
      throw error;
    }

    // 2b. Strict Direction Validation
    let effectiveDirection: 'BUY' | 'SELL' | undefined = params.direction;
    if (!effectiveDirection && (targetSignal.direction === 'BUY' || targetSignal.direction === 'SELL')) {
      effectiveDirection = targetSignal.direction;
    }

    if (effectiveDirection !== 'BUY' && effectiveDirection !== 'SELL') {
      const error: any = new Error(`INVALID_TRADE_DIRECTION: Cannot enter manual trade with direction '${targetSignal.direction}'. Trade direction must be explicitly 'BUY' or 'SELL'.`);
      error.errorCode = 'INVALID_TRADE_DIRECTION';
      throw error;
    }

    // 3. Validate actualEntry price
    const entryPriceNum = Number(actualEntry);
    if (!Number.isFinite(entryPriceNum) || entryPriceNum <= 0) {
      const error: any = new Error(`INVALID_ENTRY_PRICE: Actual entry price must be a positive finite number, received: ${actualEntry}`);
      error.errorCode = 'INVALID_ENTRY_PRICE';
      throw error;
    }

    // 4. Validate positionSize
    const posSizeNum = Number(positionSize);
    if (!Number.isFinite(posSizeNum) || posSizeNum <= 0) {
      const error: any = new Error(`INVALID_POSITION_SIZE: Position size must be a positive finite number, received: ${positionSize}`);
      error.errorCode = 'INVALID_POSITION_SIZE';
      throw error;
    }

    if (posSizeNum > 10.0) {
      const error: any = new Error(`POSITION_SIZE_LIMIT_EXCEEDED: Position size ${posSizeNum} lots exceeds maximum allowable cap of 10.0 lots`);
      error.errorCode = 'POSITION_SIZE_LIMIT_EXCEEDED';
      throw error;
    }

    // 5. Duplicate Protection: Reject multiple ACTIVE trades for same signal
    const existingActiveTrade = this.userActualTrades.find(
      t => t.signalId === targetSignal!.signalId && t.status === 'ACTIVE'
    );
    if (existingActiveTrade) {
      const error: any = new Error(`DUPLICATE_ACTIVE_TRADE: An active manual trade already exists for signal ${targetSignal.signalId} (Trade ID: ${existingActiveTrade.manualTradeId})`);
      error.errorCode = 'DUPLICATE_ACTIVE_TRADE';
      throw error;
    }

    // 6. Entry Deviation Check: 5% maximum deviation from planned entry
    const plannedEntry = (targetSignal.entryZone && typeof targetSignal.entryZone.min === "number") ? (targetSignal.entryZone.min + targetSignal.entryZone.max) / 2 : (targetSignal as any).entryPrice || targetSignal.currentPrice;
    if (plannedEntry > 0) {
      const deviationPercent = Math.abs((entryPriceNum - plannedEntry) / plannedEntry) * 100;
      if (deviationPercent > 5.0) {
        const error: any = new Error(`ENTRY_DEVIATION_TOO_LARGE: Actual entry (${entryPriceNum}) deviates ${deviationPercent.toFixed(2)}% from AI planned entry (${plannedEntry.toFixed(5)}). Maximum allowed slippage is 5.0%`);
        error.errorCode = 'ENTRY_DEVIATION_TOO_LARGE';
        throw error;
      }
    }

    // Build Immutable AI Planned Setup Layer
    const aiPlannedSetup: AiPlannedSetup = {
      signalId: targetSignal.signalId,
      symbol: targetSignal.symbol,
      direction: targetSignal.direction,
      timeframe: targetSignal.timeframe,
      plannedEntry: Number(plannedEntry.toFixed(targetSignal.symbol === 'USD/JPY' ? 3 : 5)),
      entryZone: { ...targetSignal.entryZone },
      stopLoss: targetSignal.stopLoss,
      takeProfit1: targetSignal.takeProfit1,
      takeProfit2: targetSignal.takeProfit2,
      invalidationLevel: targetSignal.invalidationLevel,
      riskReward: targetSignal.riskReward,
      confidence: targetSignal.confidence,
      setupGrade: targetSignal.setupGrade,
      adaptiveLearningRule: targetSignal.adaptiveLearningEvidence?.appliedLessons?.[0] || 'Standard SMC structure',
      createdAt: targetSignal.timestamp
    };

    // Build User Actual Trade Layer
    const userTrade: UserActualTrade = {
      manualTradeId: `MTR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      signalId: targetSignal.signalId,
      symbol: targetSignal.symbol,
      direction: effectiveDirection,
      actualEntry: entryPriceNum,
      positionSize: posSizeNum,
      enteredAt: enteredAt || new Date().toISOString(),
      status: 'ACTIVE',
      result: 'PENDING',
      aiPlannedSetup,
      executionMode: 'MANUAL',
      brokerExecution: false,
      source: 'MANUAL_USER_REPORTED',
      notes: notes || 'Manually placed through user trading account'
    };

    this.userActualTrades.unshift(userTrade);
    if (this.userActualTrades.length > 200) {
      this.userActualTrades.pop();
    }

    // PHASE 6E: Persist to PostgreSQL database asynchronously
    this.repo.saveManualTrade(userTrade).catch(err => {
      console.warn(`[ManualSignalService] DB persist async notice for ${userTrade.manualTradeId}:`, err.message);
    });

    return userTrade;
  }

  /**
   * PHASE 6C & 6E: Hardened Close Validation, Durable Update & Outcome Calculation
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
    const trade = this.userActualTrades.find(t => t.manualTradeId === manualTradeId);
    if (!trade) {
      const error: any = new Error(`TRADE_NOT_FOUND: Manual trade ${manualTradeId} does not exist`);
      error.errorCode = 'TRADE_NOT_FOUND';
      throw error;
    }

    if (trade.status === 'CLOSED') {
      const error: any = new Error(`TRADE_ALREADY_CLOSED: Manual trade ${manualTradeId} has already been closed on ${trade.exitedAt}`);
      error.errorCode = 'TRADE_ALREADY_CLOSED';
      throw error;
    }

    const exitPrice = Number(exitData.exitPrice);
    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      const error: any = new Error(`INVALID_EXIT_PRICE: Exit price must be a positive finite number, received: ${exitData.exitPrice}`);
      error.errorCode = 'INVALID_EXIT_PRICE';
      throw error;
    }

    const pipMultiplier = trade.symbol === 'USD/JPY' ? 100 : (trade.symbol === 'XAU/USD' || trade.symbol === 'NASDAQ' || trade.symbol === 'BTC/USD') ? 1 : 10000;

    let pips = 0;
    if (trade.direction === 'BUY') {
      pips = (exitPrice - trade.actualEntry) * pipMultiplier;
    } else if (trade.direction === 'SELL') {
      pips = (trade.actualEntry - exitPrice) * pipMultiplier;
    } else {
      const error: any = new Error(`INVALID_TRADE_DIRECTION: Trade direction must be BUY or SELL, received '${trade.direction}'`);
      error.errorCode = 'INVALID_TRADE_DIRECTION';
      throw error;
    }

    const pipValuePerLot = trade.symbol === 'USD/JPY' ? 7.0 : (trade.symbol === 'XAU/USD' ? 10.0 : 10.0);
    const realizedPnl = Number((pips * pipValuePerLot * trade.positionSize).toFixed(2));

    trade.exitPrice = exitPrice;
    trade.exitReason = exitData.exitReason || 'MANUAL_EXIT';
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

    // PHASE 6E: Persist closed status to PostgreSQL database
    try {
      await this.repo.saveManualTrade(trade);
    } catch (err: any) {
      console.warn(`[ManualSignalService] DB persist on close notice for ${trade.manualTradeId}:`, err.message);
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
      return this.userActualTrades.filter(t => t.status === status);
    }
    return [...this.userActualTrades];
  }

  /**
   * Clears internal state (for testing)
   */
  public clearInternalState(): void {
    this.signalHistory = [];
    this.userActualTrades = [];
    this.manualTradesJournal = [];
  }

  /**
   * Retrieves recent manual signal history
   */
  public getSignalHistory(): ManualTradeSignal[] {
    const now = Date.now();
    return this.signalHistory.map(sig => {
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

    this.manualTradesJournal.unshift(entry);
    if (this.manualTradesJournal.length > 200) {
      this.manualTradesJournal.pop();
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
    const trade = this.manualTradesJournal.find(t => t.tradeId === tradeId);
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
    return [...this.manualTradesJournal];
  }
}

export const manualSignalService = new ManualSignalService();
