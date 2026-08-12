import { Router, Request, Response } from 'express';
import { CurrencyPair, Timeframe } from '../../types';
import { fetchRealCandleEnvelope } from '../../lib/marketDataGenerator';
import { calculateAllIndicators } from '../../lib/indicators';
import { analyzeSmcStructures, detectCandlestickPatterns, detectSupportResistance } from '@iati/core';

export const marketDataRouter = Router();

/**
 * GET /api/forex/candles (or /candles when mounted at /api/forex)
 */
async function handleCandlesRequest(req: Request, res: Response) {
  try {
    const pair = (req.query.pair as CurrencyPair) || "EUR/USD";
    const timeframe = (req.query.timeframe as Timeframe) || "H1";
    const count = Number(req.query.count) || 150;
    const dataMode = (req.query.mode as any) || (req.query.dataMode as any) || "LIVE";

    const envelope = await fetchRealCandleEnvelope(pair, timeframe, count, dataMode);

    if (dataMode === 'LIVE' && (envelope.status !== 'VALID' || !envelope.executable)) {
      let errorCode = envelope.reason || 'LIVE_MARKET_DATA_UNAVAILABLE';
      if (envelope.status === 'STALE' && (!envelope.reason || envelope.reason.startsWith('MARKET_DATA_STALE'))) {
        errorCode = 'STALE_MARKET_DATA';
      } else if (envelope.status === 'INVALID' && !envelope.reason) {
        errorCode = 'INVALID_MARKET_DATA';
      }
      return res.status(503).json({
        error: errorCode,
        status: envelope.status,
        executable: false,
        envelope
      });
    }

    res.json({ pair, timeframe, count: envelope.data.length, candles: envelope.data, envelope });
  } catch (err: any) {
    res.status(503).json({ error: err.message || 'LIVE_MARKET_DATA_UNAVAILABLE', status: 'UNAVAILABLE', executable: false });
  }
}

/**
 * GET /api/forex/analysis (or /analysis when mounted at /api/forex)
 */
async function handleAnalysisRequest(req: Request, res: Response) {
  try {
    const pair = (req.query.pair as CurrencyPair) || "EUR/USD";
    const entryTf = (req.query.timeframe as Timeframe) || "M15";
    const dataMode = (req.query.mode as any) || (req.query.dataMode as any) || "LIVE";

    const [entryEnv, trendEnv, higherEnv] = await Promise.all([
      fetchRealCandleEnvelope(pair, entryTf, 150, dataMode),
      fetchRealCandleEnvelope(pair, "H4", 150, dataMode),
      fetchRealCandleEnvelope(pair, "D1", 150, dataMode)
    ]);

    if (dataMode === 'LIVE' && (entryEnv.status !== 'VALID' || trendEnv.status !== 'VALID' || higherEnv.status !== 'VALID')) {
      const failedEnv = [entryEnv, trendEnv, higherEnv].find(e => e.status !== 'VALID') || entryEnv;
      let errorCode = 'LIVE_MARKET_DATA_UNAVAILABLE';
      if (failedEnv.status === 'STALE') errorCode = 'STALE_MARKET_DATA';
      if (failedEnv.status === 'INVALID') errorCode = 'INVALID_MARKET_DATA';

      return res.status(503).json({
        error: errorCode,
        status: failedEnv.status,
        executable: false,
        reason: 'Live market data unavailable for multi-timeframe analysis',
        envelopes: { entry: entryEnv, trend: trendEnv, higher: higherEnv }
      });
    }

    const entryCandles = entryEnv.data;
    const trendCandles = trendEnv.data;
    const higherCandles = higherEnv.data;

    const entryIndicators = calculateAllIndicators(entryCandles);
    const trendIndicators = calculateAllIndicators(trendCandles);
    const higherIndicators = calculateAllIndicators(higherCandles);

    const smcEntry = analyzeSmcStructures(entryCandles, entryTf);
    const smcTrend = analyzeSmcStructures(trendCandles, "H4");

    const srZones = detectSupportResistance(entryCandles, entryTf);
    const candlePatterns = detectCandlestickPatterns(entryCandles);

    res.json({
      pair,
      entryTimeframe: entryTf,
      currentPrice: entryCandles[entryCandles.length - 1]?.close,
      indicators: entryIndicators,
      higherTimeframeIndicators: higherIndicators,
      trendTimeframeIndicators: trendIndicators,
      smc: smcEntry,
      higherSmc: smcTrend,
      supportResistance: srZones,
      patterns: candlePatterns,
      lineage: {
        dataClass: entryEnv.dataMode,
        provider: entryEnv.provenance.provider,
        symbol: pair,
        timeframe: entryTf,
        timestamp: entryEnv.provenance.receivedAt,
        receivedAt: entryEnv.provenance.receivedAt
      },
      envelope: entryEnv
    });
  } catch (err: any) {
    res.status(503).json({ error: err.message || 'LIVE_MARKET_DATA_UNAVAILABLE', status: 'UNAVAILABLE', executable: false });
  }
}

marketDataRouter.get('/candles', handleCandlesRequest);
marketDataRouter.get('/forex/candles', handleCandlesRequest);
marketDataRouter.get('/analysis', handleAnalysisRequest);
marketDataRouter.get('/forex/analysis', handleAnalysisRequest);
