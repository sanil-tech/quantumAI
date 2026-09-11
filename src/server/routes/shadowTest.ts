import { Router } from 'express';
import { shadowForwardTestService } from '../services/shadowForwardTestService';
import { ctraderMarketDataFeedService } from '../services/ctraderMarketDataFeedService';
import { TradingRepository } from '@iati/database';

/**
 * Shadow Forward-Test API Routes
 * 
 * SAFETY CONSTRAINTS:
 * - ✅ READ-ONLY access to market data
 * - ✅ No broker execution
 * - ✅ No position modification
 * - ✅ No production state changes
 * - ✅ All decisions logged for analysis only
 */

const router = Router();
const marketDataService = ctraderMarketDataFeedService;
const tradingRepo = new TradingRepository();

/**
 * GET /api/shadow/metrics
 * Get shadow test metrics and agreement rate
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = shadowForwardTestService.getMetrics();
    res.json({
      success: true,
      shadowMode: true,
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shadow/log
 * Get shadow analysis log (limited to last 100 records)
 */
router.get('/log', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const log = shadowForwardTestService.getShadowLog(limit);
    res.json({
      success: true,
      shadowMode: true,
      recordCount: log.length,
      records: log,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shadow/report
 * Generate shadow test report with recommendations
 */
router.get('/report', (req, res) => {
  try {
    const report = shadowForwardTestService.generateReport();
    res.json({
      success: true,
      shadowMode: true,
      report,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shadow/analyze-signal
 * Manually trigger shadow analysis on a signal
 * 
 * This endpoint does NOT execute any trades.
 * It only logs decision comparison data.
 */
router.post('/analyze-signal', async (req, res) => {
  try {
    const {
      pair,
      timeframe,
      signalDirection,
      signalConfidence,
      signalReasons,
      currentPrice,
      accountId
    } = req.body;

    if (!pair || !timeframe) {
      return res.status(400).json({
        error: 'Missing required: pair, timeframe'
      });
    }

    // Get current candles from market data service
    const candles = await marketDataService.getCandles(pair, timeframe, 100);

    if (!candles || candles.length === 0) {
      return res.status(404).json({
        error: 'No candle data available',
        pair,
        timeframe
      });
    }

    // Run shadow analysis
    const analysis = await shadowForwardTestService.analyzeSignalShadow({
      pair,
      timeframe,
      signalDirection: signalDirection || null,
      signalConfidence: signalConfidence || 50,
      signalReasons: signalReasons || [],
      currentPrice: currentPrice || candles[candles.length - 1].close,
      candles,
      accountId: accountId || 'demo',
      environment: 'DEMO'
    });

    res.json({
      success: true,
      shadowMode: true,
      analysis,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/shadow/clear-log
 * Clear shadow test log (maintenance)
 * 
 * ADMIN ONLY
 */
router.post('/clear-log', (req, res) => {
  try {
    const result = shadowForwardTestService.clearShadowLog();
    res.json({
      success: true,
      message: `Cleared ${result.clearedRecords} shadow records`,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shadow/health
 * Shadow test service health check
 */
router.get('/health', (req, res) => {
  const metrics = shadowForwardTestService.getMetrics();
  const isHealthy = metrics.runtimeErrors < (metrics.totalSignals * 0.1);
  
  res.json({
    success: true,
    shadowMode: true,
    healthy: isHealthy,
    status: isHealthy ? 'OPERATIONAL' : 'DEGRADED',
    metrics: {
      totalSignals: metrics.totalSignals,
      agreementRate: metrics.agreementRate,
      runtimeErrors: metrics.runtimeErrors,
      dataErrors: metrics.dataErrors
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
