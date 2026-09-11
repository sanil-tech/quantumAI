import { TradingRepository, PositionRecord } from '@iati/database';
import { CTraderMarketDataFeedService } from './ctraderMarketDataFeedService';
import { calculateAllIndicators } from '../../lib/indicators';
import { analyzeSmcStructures, detectSupportResistance } from '../../lib/smcEngine';
import { CurrencyPair, Timeframe } from '../../types';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { learningService } from './learningService';
import { RiskGovernanceEngine } from '../../../apps/risk-governance/src/modules/governanceEngine';
import { canonicalExecutionRouter } from '../routes/execution';
import { TradeProposal } from '@iati/core-types';

interface AutoTradeConfig {
  enabled: boolean;
  pair: CurrencyPair;
  timeframe: Timeframe;
  maxOpenTrades: number;
  riskPercent: number;
  minConfidence: number;
  accountId: string;
}

interface TradingSignal {
  direction: 'BUY' | 'SELL';
  confidence: number;
  reasons: string[];
  invalidationLevels: number[];
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
}

interface BrokerExecution {
  success: boolean;
  ticketId?: string;
  error?: string;
}

export class AutonomousTradeExecutor {
  private config: AutoTradeConfig;
  private tradingRepo: TradingRepository;
  private marketDataService: CTraderMarketDataFeedService;
  private governanceEngine: RiskGovernanceEngine;
  private isRunning = false;
  private pollIntervalMs = 2000;
  private loopTimeout: NodeJS.Timeout | null = null;
  private activeMonitors = new Map<string, NodeJS.Timeout>();

  constructor(config: AutoTradeConfig) {
    this.config = config;
    this.tradingRepo = new TradingRepository();
    this.marketDataService = new CTraderMarketDataFeedService();
    this.governanceEngine = new RiskGovernanceEngine();
  }

  /**
   * Start autonomous trading loop
   */
  async start() {
    if (this.isRunning) {
      console.log(`🤖 [AUTONOMOUS] Already running for ${this.config.pair}`);
      return;
    }
    this.isRunning = true;
    console.log(`🤖 [AUTONOMOUS] Starting AI trading loop for ${this.config.pair} on ${this.config.timeframe}`);
    this.runTradeLoop();
  }

  /**
   * Main autonomous loop - Steps 1-10
   */
  private async runTradeLoop() {
    try {
      // STEP 1: Read market price & candles
      const candles = await this.marketDataService.getCandles(
        this.config.pair,
        this.config.timeframe,
        100
      );

      if (!candles || candles.length === 0) {
        console.warn(`⚠️ [${this.config.pair}] No candle data available`);
        this.scheduleNext();
        return;
      }

      const latestPrice = candles[candles.length - 1].close;

      // STEP 2: Calculate technical indicators
      const indicators = calculateAllIndicators(candles);
      const smcData = analyzeSmcStructures(candles, this.config.timeframe);
      const srZones = detectSupportResistance(candles, this.config.timeframe);

      // STEP 3: Generate AI trading signal
      const signal = this.generateTradingSignal(
        indicators,
        smcData,
        srZones,
        latestPrice
      );

      if (!signal) {
        console.log(`⏳ [${this.config.pair}] No signal (confidence too low)`);
        this.scheduleNext();
        return;
      }

      console.log(`📊 [SIGNAL] ${signal.direction} ${this.config.pair} @ ${signal.confidence}% confidence`);

      // Check existing open trades
      const openTrades = await this.tradingRepo.getOpenPositions(
        this.config.accountId
      );

      if (openTrades.length >= this.config.maxOpenTrades) {
        console.log(`⚠️ Max open trades (${this.config.maxOpenTrades}) reached`);
        this.scheduleNext();
        return;
      }

      // STEP 4: Risk Governance validation
      const proposal: TradeProposal = {
        id: `auto_${Date.now()}`,
        symbol: this.config.pair,
        direction: signal.direction,
        confidence: signal.confidence,
        evidence: signal.reasons,
        agent_votes: [],
        why_direction: `AI Signal: ${signal.reasons.join(' + ')}`,
        invalidate_conditions: [],
        timestamp: new Date()
      };

      const decision = this.governanceEngine.evaluateTradeProposal(
        proposal,
        this.config.accountId,
        this.config.riskPercent / 100
      );

      if (decision.status !== 'APPROVED' || !decision.token) {
        console.log(`❌ [VETO] Trade rejected by Risk Governance:`, decision.rejection_reasons);
        this.scheduleNext();
        return;
      }

      // STEP 5: Execute trade automatically
      const executionResult = await this.executeTrade(
        signal,
        latestPrice,
        decision.token
      );

      if (!executionResult.success) {
        console.error(`❌ [EXECUTION FAILED]`, executionResult.error);
        this.scheduleNext();
        return;
      }

      console.log(
        `✅ [EXECUTED] ${signal.direction} ${this.config.pair} Entry: ${latestPrice}, SL: ${signal.stopLoss.toFixed(5)}, TP: ${signal.takeProfit1.toFixed(5)}`
      );

      // STEP 6-7: Monitor position until closed (runs in background)
      this.monitorPositionUntilClosed(executionResult.tradeId, signal);

      this.scheduleNext();
    } catch (err: any) {
      console.error(`🔴 [LOOP ERROR]`, err.message);
      this.scheduleNext();
    }
  }

  /**
   * Generate trading signal using AI logic
   */
  private generateTradingSignal(
    indicators: any,
    smcData: any,
    srZones: any,
    currentPrice: number
  ): TradingSignal | null {
    let bullishScore = 0;
    let reasons: string[] = [];

    // EMA crossover
    if (indicators.ema200 && currentPrice > indicators.ema200) {
      bullishScore += 25;
      reasons.push('Price above EMA200');
    } else if (indicators.ema200 && currentPrice < indicators.ema200) {
      bullishScore -= 25;
      reasons.push('Price below EMA200');
    }

    // RSI signal
    if (indicators.rsi > 50 && indicators.rsi < 70) {
      bullishScore += 20;
      reasons.push(`RSI ${indicators.rsi.toFixed(1)} (bullish zone)`);
    } else if (indicators.rsi < 50 && indicators.rsi > 30) {
      bullishScore -= 20;
      reasons.push(`RSI ${indicators.rsi.toFixed(1)} (bearish zone)`);
    }

    // SuperTrend confirmation
    if (indicators.superTrend?.trend === 'BULLISH') {
      bullishScore += 30;
      reasons.push('SuperTrend bullish');
    } else if (indicators.superTrend?.trend === 'BEARISH') {
      bullishScore -= 30;
      reasons.push('SuperTrend bearish');
    }

    // SMC Order Blocks
    if (smcData?.orderBlocks?.length > 0) {
      bullishScore += 15;
      reasons.push(`${smcData.orderBlocks.length} order blocks`);
    }

    // Support/Resistance levels
    if (srZones && srZones.length > 0) {
      const nearestSupport = srZones[0]?.priceStart;
      if (nearestSupport && currentPrice > nearestSupport * 1.001) {
        bullishScore += 10;
        reasons.push('Above support level');
      }
    }

    // Determine direction and confidence
    let confidence = Math.abs(bullishScore);
    confidence = Math.min(confidence, 95);

    if (confidence < this.config.minConfidence) {
      return null; // Signal too weak
    }

    const direction = bullishScore > 0 ? 'BUY' : 'SELL';
    const pipMultiplier = this.config.pair.includes('JPY') ? 0.01 : 0.0001;
    const slPips = 30;
    const tpPips = 60;

    const stopLoss = direction === 'BUY'
      ? currentPrice - (slPips * pipMultiplier)
      : currentPrice + (slPips * pipMultiplier);

    const takeProfit = direction === 'BUY'
      ? currentPrice + (tpPips * pipMultiplier)
      : currentPrice - (tpPips * pipMultiplier);

    return {
      direction,
      confidence,
      reasons,
      invalidationLevels: [stopLoss],
      stopLoss,
      takeProfit1: takeProfit,
      takeProfit2: takeProfit * 0.5
    };
  }

  /**
   * STEP 5: Execute trade - FIXED VERSION with broker execution
   */
  private async executeTrade(signal: TradingSignal, entryPrice: number, token: any) {
    try {
      const proposalId = `auto_${Date.now()}`;
      const tradeId = `auto_trade_${Date.now()}`;

      // ✅ STEP 5A: Send order to broker FIRST
      console.log(`📤 [BROKER] Sending ${signal.direction} order to broker...`);
      const brokerResult = await this.executeWithBroker(signal, entryPrice, 0.1);

      if (!brokerResult.success) {
        console.error(`❌ [BROKER FAILED] ${brokerResult.error}`);
        return { success: false, error: brokerResult.error };
      }

      console.log(`✅ [BROKER CONFIRMED] Ticket: ${brokerResult.ticketId}`);

      // ✅ STEP 5B: Save to database (after broker confirms)
      const position: PositionRecord = {
        positionId: tradeId,
        ticketId: brokerResult.ticketId || tradeId.replace('auto_trade_', '').slice(0, 8),
        setupId: proposalId,
        accountId: this.config.accountId,
        symbol: this.config.pair,
        direction: signal.direction,
        quantity: 0.1,
        entryPrice,
        currentPrice: entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit1,
        takeProfit2: signal.takeProfit2,
        unrealizedProfit: 0,
        realizedProfit: 0,
        pnlPips: 0,
        status: 'ACTIVE' as any,
        broker: 'CTRADER',
        environment: 'DEMO',
        proposalId,
        source: 'AUTONOMOUS_AI_EXECUTOR',
        openedAt: new Date()
      };

      const savedPosition = await this.tradingRepo.savePosition(position);

      // ✅ STEP 5C: Save trade event
      await this.tradingRepo.saveTradeEvent({
        id: `evt_ai_open_${Date.now()}`,
        tradeId,
        setupId: proposalId,
        eventType: 'POSITION_OPENED',
        actor: 'AutonomousTradeExecutor',
        details: {
          signal: signal.direction,
          confidence: signal.confidence,
          reasons: signal.reasons,
          indicators: 'RSI, EMA200, SuperTrend, SMC',
          ticketId: brokerResult.ticketId
        }
      });

      return {
        success: true,
        tradeId,
        ticketId: brokerResult.ticketId,
        savedPosition
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * ✅ NEW: Execute order with broker
   */
  private async executeWithBroker(signal: TradingSignal, entryPrice: number, quantity: number): Promise<BrokerExecution> {
    try {
      // Send to ExecutionRouter (which routes to MT5/cTrader)
      const result = await canonicalExecutionRouter.executeOrder({
        symbol: this.config.pair,
        direction: signal.direction,
        quantity,
        orderType: 'MARKET',
        entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit1,
        timeInForce: 'GTC',
        comment: `AI Signal: ${signal.reasons[0]}`
      });

      if (result.success) {
        return {
          success: true,
          ticketId: result.ticketId || `${Date.now()}`
        };
      } else {
        return {
          success: false,
          error: result.error || 'Broker execution failed'
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: `Broker error: ${err.message}`
      };
    }
  }

  /**
   * STEP 6-7: Monitor position until closed - FIXED VERSION with price monitoring
   */
  private monitorPositionUntilClosed(tradeId: string, signal: TradingSignal) {
    if (this.activeMonitors.has(tradeId)) return;
    
    console.log(`👁️ [MONITOR] Started for ${tradeId}`);
    const startTime = Date.now();
    const maxWaitMs = 60 * 60 * 1000; // 1 hour timeout

    const checkMonitor = async () => {
      try {
        const position = await this.tradingRepo.getPositionById(tradeId);

        if (!position) {
          console.warn(`Position ${tradeId} not found`);
          this.activeMonitors.delete(tradeId);
          return;
        }

        // Check if position is already closed (DB updated from broker)
        if (position.status !== 'ACTIVE') {
          console.log(`✅ [CLOSED] Position ${tradeId} - Status: ${position.status}`);
          await this.triggerLearning(position);
          this.activeMonitors.delete(tradeId);
          return;
        }

        // ✅ FIX: Get current live price
        const currentPrice = await this.marketDataService.getCurrentTick(this.config.pair);

        if (!currentPrice) {
          console.warn(`⚠️ No price data for ${this.config.pair}`);
          this.scheduleMonitor(checkMonitor);
          return;
        }

        // Update current price in database
        position.currentPrice = currentPrice;

        // ✅ FIX: Check Stop Loss hit
        const slHit = position.direction === 'BUY'
          ? currentPrice <= position.stopLoss
          : currentPrice >= position.stopLoss;

        if (slHit) {
          console.log(`🛑 [SL HIT] ${position.symbol} @ ${currentPrice} (SL: ${position.stopLoss})`);
          await this.closePosition(position, currentPrice, 'SL_HIT');
          this.activeMonitors.delete(tradeId);
          return;
        }

        // ✅ FIX: Check Take Profit hit
        const tpHit = position.direction === 'BUY'
          ? currentPrice >= position.takeProfit
          : currentPrice <= position.takeProfit;

        if (tpHit) {
          console.log(`🎯 [TP HIT] ${position.symbol} @ ${currentPrice} (TP: ${position.takeProfit})`);
          await this.closePosition(position, currentPrice, 'TP_HIT');
          this.activeMonitors.delete(tradeId);
          return;
        }

        // ✅ FIX: Check timeout
        if (Date.now() - startTime > maxWaitMs) {
          console.log(`⏱️ [TIMEOUT] Position held > 1 hour, closing`);
          await this.closePosition(position, currentPrice, 'TIMEOUT');
          this.activeMonitors.delete(tradeId);
          return;
        }

        // ✅ FIX: Schedule next check (every 1 second, not 5)
        this.scheduleMonitor(checkMonitor);
      } catch (err: any) {
        console.error(`Monitor error for ${tradeId}:`, err.message);
        this.activeMonitors.delete(tradeId);
      }
    };

    // Start monitoring
    checkMonitor();
  }

  /**
   * ✅ NEW: Close position with broker and database
   */
  private async closePosition(
    position: PositionRecord,
    closePrice: number,
    closeReason: 'SL_HIT' | 'TP_HIT' | 'TIMEOUT' | 'MANUAL'
  ) {
    try {
      // ✅ STEP 1: Send close order to broker
      console.log(`📤 [CLOSE] Sending close order to broker...`);
      const brokerClose = await this.closeWithBroker(position, closePrice, closeReason);

      if (!brokerClose.success) {
        console.error(`❌ [CLOSE FAILED] ${brokerClose.error}`);
        // Retry logic could go here
        return;
      }

      // ✅ STEP 2: Calculate P&L
      const pnl = this.calculatePnL(position, closePrice);

      // ✅ STEP 3: Update database
      await this.tradingRepo.closePositionTransaction({
        positionId: position.positionId,
        closePrice,
        realizedProfit: pnl.dollars,
        pnlPips: pnl.pips,
        closeReason,
        accountId: this.config.accountId
      });

      // ✅ STEP 4: Save close event
      await this.tradingRepo.saveTradeEvent({
        id: `evt_ai_close_${Date.now()}`,
        tradeId: position.positionId,
        setupId: position.setupId,
        eventType: 'POSITION_CLOSED',
        actor: 'AutonomousTradeExecutor',
        details: {
          reason: closeReason,
          entryPrice: position.entryPrice,
          closePrice,
          pnl: pnl.dollars,
          pips: pnl.pips
        }
      });

      console.log(`✅ [CLOSED] ${position.direction} ${position.symbol} @ ${closePrice} (${closeReason}) - P&L: $${pnl.dollars.toFixed(2)} (${pnl.pips.toFixed(1)} pips)`);

      // ✅ STEP 5: Trigger learning
      const closedPosition = {
        ...position,
        closePrice,
        realizedProfit: pnl.dollars,
        pnlPips: pnl.pips,
        closedAt: new Date(),
        status: 'CLOSED'
      };
      await this.triggerLearning(closedPosition);
    } catch (err: any) {
      console.error(`Error closing position:`, err.message);
    }
  }

  /**
   * ✅ NEW: Close order with broker
   */
  private async closeWithBroker(
    position: PositionRecord,
    closePrice: number,
    reason: string
  ): Promise<BrokerExecution> {
    try {
      // Send to ExecutionRouter
      const result = await canonicalExecutionRouter.closeOrder({
        ticketId: position.ticketId,
        symbol: position.symbol,
        quantity: position.quantity,
        closePrice,
        comment: `AI Close: ${reason}`
      });

      if (result.success) {
        return { success: true };
      } else {
        return {
          success: false,
          error: result.error || 'Broker close failed'
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: `Broker error: ${err.message}`
      };
    }
  }

  /**
   * ✅ NEW: Calculate P&L
   */
  private calculatePnL(position: PositionRecord, closePrice: number): { dollars: number; pips: number } {
    const pipMultiplier = position.symbol.includes('JPY') ? 0.01 : 0.0001;
    const priceDifference = closePrice - position.entryPrice;
    const pips = position.direction === 'BUY'
      ? priceDifference / pipMultiplier
      : -priceDifference / pipMultiplier;

    // For XAU/USD: $0.01 per pip per unit
    // For FX: $0.0001 per unit = $10 per pip per 100k units
    const pipValue = position.symbol === 'XAU/USD'
      ? position.quantity * 0.01
      : (position.quantity / 100000) * 10;

    const dollars = pips * pipValue;

    return {
      dollars,
      pips
    };
  }

  /**
   * ✅ NEW: Get current tick price
   */
  private async getCurrentTick(symbol: CurrencyPair): Promise<number | null> {
    try {
      // Get latest candle
      const candles = await this.marketDataService.getCandles(symbol, 'M1', 1);
      if (candles && candles.length > 0) {
        return candles[candles.length - 1].close;
      }
      return null;
    } catch (err) {
      console.error(`Error getting current tick:`, err);
      return null;
    }
  }

  /**
   * ✅ NEW: Schedule monitor check
   */
  private scheduleMonitor(callback: () => Promise<void>) {
    const timeout = setTimeout(callback, 1000); // Check every 1 second
    // Could track timeout for cleanup if needed
  }

  /**
   * STEP 9: Trigger AI learning service
   */
  private async triggerLearning(closedPosition: any) {
    try {
      const payload: TradeClosedPayload = {
        tradeId: closedPosition.positionId,
        positionId: closedPosition.positionId,
        accountId: closedPosition.accountId,
        symbol: closedPosition.symbol,
        direction: closedPosition.direction,
        entryPrice: closedPosition.entryPrice,
        exitPrice: closedPosition.closePrice || closedPosition.currentPrice,
        stopLoss: closedPosition.stopLoss,
        takeProfit: closedPosition.takeProfit,
        pnlDollars: closedPosition.realizedProfit || 0,
        pnlPips: closedPosition.pnlPips || 0,
        proposalId: closedPosition.setupId,
        environment: 'DEMO',
        closedAt: closedPosition.closedAt || new Date()
      };

      await globalEventBus.publish({
        id: `evt_auto_learn_${Date.now()}`,
        type: EventTypes.TradeClosed,
        timestamp: new Date(),
        payload
      });

      const review = await learningService.processClosedTrade(payload);
      console.log(`📚 [LEARNING] Trade analyzed. Outcome: ${review?.outcome || 'PROCESSED'}`);
    } catch (err: any) {
      console.error(`Learning trigger error:`, err.message);
    }
  }

  /**
   * Stop autonomous trading
   */
  async stop() {
    this.isRunning = false;
    if (this.loopTimeout) clearTimeout(this.loopTimeout);
    this.activeMonitors.forEach(timeout => clearTimeout(timeout));
    this.activeMonitors.clear();
    console.log(`🛑 [AUTONOMOUS] Stopped`);
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      pair: this.config.pair,
      timeframe: this.config.timeframe,
      minConfidence: this.config.minConfidence,
      activeMonitors: this.activeMonitors.size
    };
  }

  /**
   * Schedule next loop iteration
   */
  private scheduleNext() {
    if (this.isRunning) {
      this.loopTimeout = setTimeout(() => this.runTradeLoop(), this.pollIntervalMs);
    }
  }
}
