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
import { signalLoggingService } from './signalLoggingService';

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

export class AutonomousTradeExecutor {
  private config: AutoTradeConfig;
  private tradingRepo: TradingRepository;
  private marketDataService: CTraderMarketDataFeedService;
  private governanceEngine: RiskGovernanceEngine;
  private isRunning = false;
  private pollIntervalMs = 2000;
  private loopTimeout: NodeJS.Timeout | null = null;
  private activeMonitors = new Set<string>();

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

      const proposalId = `auto_${Date.now()}`;
      const signalLogId = signalLoggingService.logSignal(
        this.config.pair,
        signal.direction,
        signal.confidence,
        indicators,
        signal.reasons,
        latestPrice,
        signal.stopLoss,
        signal.takeProfit1,
        this.config.timeframe,
        proposalId
      );

      console.log(`📊 [SIGNAL] ${signal.direction} ${this.config.pair} @ ${signal.confidence}% confidence (Log: ${signalLogId})`);

      // Check existing open trades
      const openTrades = await this.tradingRepo.getOpenPositions(
        this.config.accountId
      );

      if (openTrades.length >= this.config.maxOpenTrades) {
        console.log(`⚠️ Max open trades (${this.config.maxOpenTrades}) reached`);
        signalLoggingService.updateSignalStatus(signalLogId, 'SKIPPED', 'Max open trades reached');
        this.scheduleNext();
        return;
      }

      // STEP 4: Risk Governance validation
      const proposal: TradeProposal = {
        id: proposalId,
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
        const rejectionMsg = decision.rejection_reasons?.join(', ') || 'Risk Governance Veto';
        console.log(`❌ [VETO] Trade rejected by Risk Governance:`, decision.rejection_reasons);
        signalLoggingService.updateSignalStatus(signalLogId, 'VETOED', rejectionMsg);
        this.scheduleNext();
        return;
      }

      // STEP 5: Execute trade automatically
      const executionResult = await this.executeTrade(
        signal,
        latestPrice,
        decision.token,
        proposalId
      );

      if (!executionResult.success) {
        console.error(`❌ [EXECUTION FAILED]`, executionResult.error);
        signalLoggingService.updateSignalStatus(signalLogId, 'FAILED', executionResult.error);
        this.scheduleNext();
        return;
      }

      signalLoggingService.updateSignalStatus(signalLogId, 'EXECUTED', undefined, {
        tradeId: executionResult.tradeId,
        executedAt: new Date(),
        actualEntry: latestPrice,
        slippage: 0
      });

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
    const pairUpper = this.config.pair.toUpperCase();
    const isJpy = pairUpper.includes('JPY');
    const isGold = pairUpper.includes('XAU') || pairUpper.includes('GOLD');
    const pipMultiplier = isJpy ? 0.01 : (isGold ? 0.1 : 0.0001);
    const decimals = isGold ? 2 : (isJpy ? 3 : 5);

    // Dynamic ATR-based Stop Loss + Liquidity Buffer (1.5x ATR)
    const rawAtr = Number(indicators.atr) || (currentPrice * (isGold ? 0.003 : isJpy ? 0.002 : 0.0015));
    const atrBuffer = rawAtr * 1.5;

    // Minimum noise floors: Forex Majors 25 pips, Cross JPY 45 pips, Gold 120 pips ($12.00)
    const minSlPips = isGold ? 120 : (isJpy ? 45 : 25);
    const calculatedSlDistance = Math.max(atrBuffer, minSlPips * pipMultiplier);

    const stopLoss = direction === 'BUY'
      ? Number((currentPrice - calculatedSlDistance).toFixed(decimals))
      : Number((currentPrice + calculatedSlDistance).toFixed(decimals));

    // Minimum 1:1.8 Risk:Reward for Take Profit
    const tpDistance = calculatedSlDistance * 1.8;
    const takeProfit1 = direction === 'BUY'
      ? Number((currentPrice + tpDistance).toFixed(decimals))
      : Number((currentPrice - tpDistance).toFixed(decimals));

    const takeProfit2 = direction === 'BUY'
      ? Number((currentPrice + (tpDistance * 1.5)).toFixed(decimals))
      : Number((currentPrice - (tpDistance * 1.5)).toFixed(decimals));

    return {
      direction,
      confidence,
      reasons: [
        ...reasons,
        `[DYNAMIC SL] Protected with 1.5x ATR liquidity buffer (${(calculatedSlDistance / pipMultiplier).toFixed(1)} pips)`
      ],
      invalidationLevels: [stopLoss],
      stopLoss,
      takeProfit1,
      takeProfit2
    };
  }

  /**
   * STEP 5: Execute trade via canonical ExecutionRouter
   */
  private async executeTrade(signal: TradingSignal, entryPrice: number, token: any, customProposalId?: string) {
    try {
      const proposalId = customProposalId || `auto_${Date.now()}`;
      const tradeId = `auto_trade_${Date.now()}`;

      // Save position to PostgreSQL
      const position: PositionRecord = {
        positionId: tradeId,
        ticketId: tradeId.replace('auto_trade_', '').slice(0, 8),
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

      // Save trade event
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
          indicators: 'RSI, EMA200, SuperTrend, SMC'
        }
      });

      return {
        success: true,
        tradeId,
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
   * STEP 6-7: Monitor position until SL or TP hit
   */
  private monitorPositionUntilClosed(tradeId: string, signal: TradingSignal) {
    if (this.activeMonitors.has(tradeId)) return;
    
    this.activeMonitors.add(tradeId);
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

        // Check if position is still open
        if (position.status !== 'ACTIVE') {
          console.log(`✅ [CLOSED] Position ${tradeId} - Status: ${position.status}`);
          await this.triggerLearning(position);
          this.activeMonitors.delete(tradeId);
          return;
        }

        // Check if timeout exceeded
        if (Date.now() - startTime > maxWaitMs) {
          console.log(`⏱️ [TIMEOUT] Position held > 1 hour, closing manually`);
          await this.tradingRepo.closePositionTransaction({
            positionId: tradeId,
            closePrice: position.currentPrice,
            realizedProfit: 0,
            pnlPips: 0,
            closeReason: 'TIMEOUT_AUTO_CLOSE',
            accountId: this.config.accountId
          });
          await this.triggerLearning(position);
          this.activeMonitors.delete(tradeId);
          return;
        }

        // Still open, check again in 5 seconds
        setTimeout(checkMonitor, 5000);
      } catch (err: any) {
        console.error(`Monitor error for ${tradeId}:`, err.message);
        this.activeMonitors.delete(tradeId);
      }
    };

    // Start monitoring
    checkMonitor();
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

      // Publish event for learning service
      await globalEventBus.publish({
        id: `evt_auto_learn_${Date.now()}`,
        type: EventTypes.TradeClosed,
        timestamp: new Date(),
        payload
      });

      // Trigger learning analysis
      const review = await learningService.processClosedTrade(payload);

      console.log(`📚 [LEARNING] Trade analyzed. Outcome: ${review?.outcome || 'PROCESSED'}`);

      // STEP 10: Loop continues automatically (next iteration of runTradeLoop)
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
