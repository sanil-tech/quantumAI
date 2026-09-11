import { Router } from 'express';
import { enhancedVetoLogic } from '../services/enhancedVetoLogic';
import { CTraderMarketDataFeedService } from '../services/ctraderMarketDataFeedService';
import { TradingRepository } from '@iati/database';
import { CurrencyPair } from '../../types';

const router = Router();
const marketDataService = new CTraderMarketDataFeedService();
const tradingRepo = new TradingRepository();

/**
 * GET /api/veto/analyze
 * Analyze a potential trade and get veto decision
 * 
 * Query params:
 *   - pair: CurrencyPair (EUR/USD, AUD/USD, etc)
 *   - setupType: string (e.g., "MOMENTUM_CONTINUATION SELL")
 *   - accountId: string
 *   - timeframe: string (M1, M15, H1, H4, D1)
 */
router.get('/analyze', async (req, res) => {
  try {
    const { pair, setupType, accountId, timeframe } = req.query;

    if (!pair || !setupType || !accountId || !timeframe) {
      return res.status(400).json({
        error: 'Missing required parameters: pair, setupType, accountId, timeframe'
      });
    }

    // Get live candles
    const candles = await marketDataService.getCandles(
      pair as CurrencyPair,
      timeframe as any,
      100
    );

    if (!candles || candles.length === 0) {
      return res.status(404).json({ error: 'No candle data available' });
    }

    const currentPrice = candles[candles.length - 1].close;

    // Analyze with enhanced veto logic
    const analysis = await enhancedVetoLogic.evaluateTradeWithContext(
      setupType as string,
      pair as CurrencyPair,
      currentPrice,
      candles,
      accountId as string
    );

    return res.json({
      success: true,
      pair,
      setupType,
      currentPrice,
      analysis: {
        recommendation: analysis.recommendation,
        confidence: analysis.decision.confidence,
        shouldVeto: analysis.decision.shouldVeto,
        explanation: analysis.decision.explanation,
        conditions: {
          volatilityState: analysis.decision.conditions.volatilityState,
          volatilityPercentage: analysis.decision.conditions.volatilityPercentage.toFixed(2),
          trend: analysis.decision.conditions.trend,
          trendStrength: analysis.decision.conditions.trendStrength.toFixed(1),
          momentum: analysis.decision.conditions.momentum,
          rsi: analysis.decision.conditions.rsi.toFixed(1),
          riskLevel: analysis.decision.conditions.riskLevel
        },
        historicalContext: analysis.historicalContext,
        recommendation_reason: getRecommendationReason(analysis.recommendation, analysis)
      },
      timestamp: analysis.timestamp.toISOString()
    });
  } catch (err: any) {
    console.error('Veto analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/veto/historical-patterns
 * Get all historical failure patterns for a pair
 */
router.get('/historical-patterns', async (req, res) => {
  try {
    const { pair, accountId } = req.query;

    if (!pair || !accountId) {
      return res.status(400).json({
        error: 'Missing required parameters: pair, accountId'
      });
    }

    const closedTrades = await tradingRepo.getClosedPositions(accountId as string, 250);
    const pairTrades = closedTrades.filter(t => t.symbol === pair);

    // Analyze patterns
    const patterns: any = {};

    for (const trade of pairTrades) {
      const setupType = trade.proposalId || 'UNKNOWN';
      if (!patterns[setupType]) {
        patterns[setupType] = {
          setupType,
          totalTrades: 0,
          wins: 0,
          losses: 0,
          failureRate: 0,
          averageWin: 0,
          averageLoss: 0,
          profitFactor: 0,
          trades: []
        };
      }

      patterns[setupType].totalTrades++;
      patterns[setupType].trades.push({
        entryPrice: trade.entryPrice,
        exitPrice: trade.closePrice,
        pnl: trade.realizedProfit,
        pips: trade.pnlPips,
        date: trade.openedAt
      });

      if ((trade.realizedProfit || 0) >= 0) {
        patterns[setupType].wins++;
        patterns[setupType].averageWin += trade.realizedProfit || 0;
      } else {
        patterns[setupType].losses++;
        patterns[setupType].averageLoss += Math.abs(trade.realizedProfit || 0);
      }
    }

    // Calculate ratios
    Object.values(patterns).forEach((p: any) => {
      p.failureRate = (p.losses / p.totalTrades) * 100;
      p.averageWin = p.wins > 0 ? p.averageWin / p.wins : 0;
      p.averageLoss = p.losses > 0 ? p.averageLoss / p.losses : 0;
      p.profitFactor = p.averageLoss > 0 ? p.averageWin / p.averageLoss : 0;
    });

    return res.json({
      success: true,
      pair,
      patternsFound: Object.keys(patterns).length,
      totalTrades: pairTrades.length,
      patterns: Object.values(patterns)
    });
  } catch (err: any) {
    console.error('Pattern analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/veto/market-conditions
 * Get current market conditions for a pair (no veto, just conditions)
 */
router.get('/market-conditions', async (req, res) => {
  try {
    const { pair, timeframe } = req.query;

    if (!pair || !timeframe) {
      return res.status(400).json({
        error: 'Missing required parameters: pair, timeframe'
      });
    }

    const candles = await marketDataService.getCandles(
      pair as CurrencyPair,
      timeframe as any,
      100
    );

    if (!candles || candles.length === 0) {
      return res.status(404).json({ error: 'No candle data available' });
    }

    const currentPrice = candles[candles.length - 1].close;

    // Analyze conditions only (no veto)
    const { realTimeConditionMatcher } = await import('../services/realTimeConditionMatcher');
    const conditions = realTimeConditionMatcher.analyzeMarketConditions(
      pair as CurrencyPair,
      candles,
      currentPrice
    );

    return res.json({
      success: true,
      pair,
      timeframe,
      currentPrice,
      conditions: {
        volatilityState: conditions.volatilityState,
        volatilityPercentage: conditions.volatilityPercentage.toFixed(2),
        trend: conditions.trend,
        trendStrength: conditions.trendStrength.toFixed(1),
        momentum: conditions.momentum,
        rsi: conditions.rsi.toFixed(1),
        priceVsMA20: conditions.priceVsMA20.toFixed(2),
        priceVsMA50: conditions.priceVsMA50.toFixed(2),
        session: conditions.session,
        riskLevel: conditions.riskLevel,
        atr: conditions.atr.toFixed(5)
      },
      timestamp: conditions.timestamp.toISOString()
    });
  } catch (err: any) {
    console.error('Conditions error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/veto/record-decision
 * Record a veto decision to database (for learning)
 */
router.post('/record-decision', async (req, res) => {
  try {
    const { pair, setupType, decision, confidence, explanation, accountId } = req.body;

    if (!pair || !setupType || decision === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: pair, setupType, decision'
      });
    }

    const decisionId = `veto_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await tradingRepo.saveTradeEvent({
      id: decisionId,
      tradeId: '',
      setupId: setupType,
      eventType: 'SIGNAL_VETO_DECISION',
      actor: 'API_VetoRouter',
      details: {
        pair,
        setupType,
        decision,
        confidence: confidence || 0,
        explanation: explanation || '',
        accountId: accountId || 'unknown',
        timestamp: new Date().toISOString()
      }
    });

    return res.json({
      success: true,
      decisionId,
      recorded: true
    });
  } catch (err: any) {
    console.error('Record decision error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper: Get human-readable recommendation reason
 */
function getRecommendationReason(recommendation: string, analysis: any): string {
  if (recommendation === 'ALLOW') {
    return `Current conditions (${analysis.decision.conditions.volatilityState} volatility, ${analysis.decision.conditions.trend} trend) differ from historical failure pattern. Trade is safe to execute.`;
  }

  if (recommendation === 'VETO') {
    return `Current conditions (${analysis.decision.conditions.volatilityState} volatility, ${analysis.decision.conditions.trend} trend) MATCH the pattern that caused ${analysis.historicalContext.recentLosses} recent losses. Trade is blocked for safety.`;
  }

  if (recommendation === 'CAUTION') {
    return `Conditions diverge from historical failures, but current market environment (${analysis.decision.conditions.riskLevel} risk) warrants caution. Monitor carefully if trading.`;
  }

  return 'Unable to determine recommendation';
}

export default router;
