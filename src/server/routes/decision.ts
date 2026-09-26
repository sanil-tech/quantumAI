import { Router, Request, Response } from 'express';
import { aiDecisionEngine } from '../../../apps/decision-agent/src/services/aiDecisionEngine';
import { backtestEngine } from '../../../apps/decision-agent/src/services/backtestEngine';
import { learningService } from '../services/learningService';
import { researchLearningEngine } from '../../../apps/decision-agent/src/services/researchLearningEngine';
import { controlledDemoLearningCampaignService } from '../../../apps/execution-router/src/services/controlledDemoLearningCampaignService';
import { learningJournalService } from '../services/learningJournalService';
import { continuousLearningObservatoryService } from '../services/continuousLearningObservatoryService';
import { shadowObservationRepository } from '../../../packages/database/src/shadowRepository';

export const decisionRouter = Router();

import { manualSignalService } from '../services/manualSignalService';
import { marketMonitoringService } from '../services/marketMonitoringService';

// Handle Manual Trade Signal Generation
async function handleManualSignal(req: Request, res: Response) {
  try {
    const signal = await manualSignalService.generateManualSignal(req.body);
    res.json(signal);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Manual signal error', executionMode: 'MANUAL', brokerExecution: false });
  }
}

// Handle Signal History GET
function handleSignalHistoryGet(req: Request, res: Response) {
  res.json({ signals: manualSignalService.getSignalHistory() });
}

// Handle Manual Trades Journal GET
function handleManualTradesGet(req: Request, res: Response) {
  res.json({ trades: manualSignalService.getManualTrades() });
}

// Handle Manual Trade Record POST
function handleManualTradeRecord(req: Request, res: Response) {
  try {
    const entry = manualSignalService.recordManualTrade(req.body);
    res.json({ success: true, trade: entry });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to record manual trade' });
  }
}

// Handle Manual Trade Close POST
async function handleManualTradeClose(req: Request, res: Response) {
  try {
    const { tradeId } = req.params;
    const closed = await manualSignalService.closeManualTrade(tradeId, req.body);
    res.json({ success: true, trade: closed });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to close manual trade' });
  }
}


// Handle AI Market Opinion
async function handleAiOpinion(req: Request, res: Response) {
  try {
    const result = await aiDecisionEngine.generateOpinion(req.body);
    res.json(result);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.startsWith("MALFORMED_AI_RESPONSE") || msg.startsWith("INVALID_AI_RESPONSE")) {
      return res.status(500).json({
        error: "INVALID_AI_RESPONSE",
        details: msg,
        executable: false
      });
    }
    res.status(500).json({ error: msg, executable: false });
  }
}

// Handle AI Chat
async function handleAiChat(req: Request, res: Response) {
  try {
    const result = await aiDecisionEngine.generateChatReply(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI chat service error' });
  }
}

// Handle Single Backtest
async function handleSingleBacktest(req: Request, res: Response) {
  try {
    const result = await backtestEngine.executeSingleBacktest(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Backtest error' });
  }
}

// Handle 1-Year Backtest GET
async function handle1YearBacktestGet(req: Request, res: Response) {
  try {
    let result = backtestEngine.getLatest1YearBacktestResult();
    if (!result) {
      result = await backtestEngine.execute1YearMultiPairBacktest();
    }
    res.json(result || { status: 'initializing' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// Handle 1-Year Backtest POST
async function handle1YearBacktestPost(req: Request, res: Response) {
  try {
    const result = await backtestEngine.execute1YearMultiPairBacktest();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// Handle Post-Mortem Lessons GET (Loads Canonical Reviews from PostgreSQL)
async function handlePostMortemLessonsGet(req: Request, res: Response) {
  try {
    const { learningService } = await import('../services/learningService');
    const reviews = await learningService.loadPersistedLearning();
    res.json({ reviews, source: 'POSTGRESQL_AUTHORITATIVE' });
  } catch {
    res.json({ reviews: aiDecisionEngine.getPostMortemReviews(), source: 'IN_MEMORY_FALLBACK' });
  }
}

// Handle Post-Mortem POST
async function handlePostMortemPost(req: Request, res: Response) {
  try {
    const tradeId = req.body?.tradeId || req.body?.positionId || req.body?.id;
    const notes = req.body?.userNotes || req.body?.notes;

    if (!tradeId) {
      return res.status(400).json({ error: "TRADE_ID_REQUIRED: POST /api/post-mortem requires a valid tradeId or positionId" });
    }

    const review = await learningService.processClosedTrade({ tradeId }, notes);
    res.json({ success: true, review, totalLessons: aiDecisionEngine.getPostMortemReviews().length });
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("NONEXISTENT_TRADE")) {
      return res.status(404).json({ error: msg });
    }
    if (msg.includes("OPEN_TRADE") || msg.includes("INVALID_LEARNING") || msg.includes("TRADE_ID_REQUIRED")) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
}

// Handle AI Homework Session (Weekly Review & Setup Tuning)
// Handle AI Homework Session (Weekly Review & Setup Tuning)
async function handleAiHomeworkSession(req: Request, res: Response) {
  try {
    let closedTrades = req.body?.closedTrades || [];

    // Automatically load real closed trades from PostgreSQL database or cTrader feed
    try {
      const { TradingRepository } = await import('@iati/database');
      const tradingRepo = new TradingRepository();
      
      if (!closedTrades || closedTrades.length === 0) {
        let positions = await tradingRepo.getClosedPositionsAcrossAccounts(200).catch(() => []);
        
        // If DB has 0 positions, backfill directly from cTrader broker feed into PostgreSQL
        if (!positions || positions.length === 0) {
          try {
            const { ctraderMarketDataFeedService } = await import('../services/ctraderMarketDataFeedService');
            const rawDeals = await ctraderMarketDataFeedService.fetchRawClosedDeals(90, 500);
            const closedDeals = (rawDeals || []).filter((d: any) => d.closePositionDetail != null);
            
            for (const d of closedDeals) {
              const symId = Number(d.symbolId || 1);
              const sym = ctraderMarketDataFeedService.getSymbolName(symId) || 'EUR/USD';
              const moneyDigits = Number(d.closePositionDetail?.moneyDigits ?? 2);
              const divisor = Math.pow(10, moneyDigits);
              const grossProfit = Number(d.closePositionDetail?.grossProfit || 0) / divisor;
              const commission = Number(d.closePositionDetail?.commission || 0) / divisor;
              const swap = Number(d.closePositionDetail?.swap || 0) / divisor;
              const netPnl = grossProfit + commission + swap;
              const entryPrice = Number(d.closePositionDetail?.entryPrice || d.executionPrice);
              const exitPrice = Number(d.executionPrice);
              const closeTime = new Date(Number(d.executionTimestamp));
              const direction = (d.tradeSide === 2 || d.tradeSide === 'SELL') ? 'BUY' : 'SELL';

              await tradingRepo.savePosition({
                positionId: String(d.positionId || d.dealId),
                ticketId: String(d.positionId || d.dealId),
                accountId: String(process.env.CTRADER_ACCOUNT_ID || '48282756'),
                symbol: sym,
                direction,
                entryPrice,
                currentPrice: exitPrice,
                closePrice: exitPrice,
                stopLoss: 0,
                takeProfit: 0,
                lotSize: Number(((Number(d.closePositionDetail?.closedVolume || 100000)) / 10000000).toFixed(2)),
                status: 'CLOSED',
                realizedProfit: Number(netPnl.toFixed(2)),
                pnlPips: 0,
                closedAt: closeTime,
                createdAt: closeTime,
                updatedAt: closeTime
              }).catch(() => {});
            }

            positions = await tradingRepo.getClosedPositionsAcrossAccounts(200).catch(() => []);
          } catch (syncErr: any) {
            console.warn('[decisionRouter] cTrader feed backfill note:', syncErr.message);
          }
        }

        if (positions && positions.length > 0) {
          closedTrades = positions.map((p: any) => {
            const pnl = Number((p.realizedProfit ?? p.realizedPnl ?? p.profit ?? p.pnlDollars ?? 0).toFixed(2));
            return {
              id: p.positionId || p.id,
              ticketId: p.ticketId,
              symbol: p.symbol || p.pair,
              pair: p.symbol || p.pair,
              direction: p.direction || (p.type === 'BUY' ? 'BUY' : 'SELL'),
              entryPrice: Number(p.entryPrice || p.openPrice),
              exitPrice: Number(p.closePrice || p.exitPrice || p.currentPrice || p.entryPrice),
              stopLoss: Number(p.stopLoss || 0),
              takeProfit: Number(p.takeProfit || 0),
              pnlDollars: pnl,
              pnlPips: Number(p.pnlPips || 0),
              outcome: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN',
              closeTime: p.closedAt || p.closeTime || p.updatedAt
            };
          });
        }
      }
    } catch (dbErr: any) {
      console.warn('[decisionRouter] Database trade fetch for homework notice:', dbErr.message);
    }

    const result = await aiDecisionEngine.runHomeworkSession(closedTrades);

    // Optional Telegram broadcast of weekly adaptive learning review
    if (req.body?.broadcastTelegram || process.env.TELEGRAM_BROADCAST_HOMEWORK === 'true') {
      try {
        const { telegramNotificationService } = await import('../services/telegramNotificationService');
        const tuningsText = (result.setupTuningRecommendationsMs || [])
          .map((rec: string) => `• ${rec}`)
          .join('\n');

        const tgReport = [
          `📊 *ULANGKAJI PRESTASI MINGGUAN (BASE44 INVOKELLM)*`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `📈 *Win Rate:* ${result.winRate}% (${result.winCount}W / ${result.lossCount}L)`,
          `💰 *Net PnL:* $${result.netPnLDollars}`,
          `📝 *Ringkasan Eksekutif:*`,
          `_${result.executiveSummaryMs}_`,
          ``,
          `🎯 *Peraturan Adaptif Aktif Baharu:*`,
          `\`${result.primaryActiveRule}\``,
          ``,
          `🛠 *Cadangan Pemantapan Setup & Parameter:*`,
          tuningsText,
          `━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `🤖 _Enjin: Base44 InvokeLLM (Penjimatan Token Aktif: ~380 Token)_`
        ].join('\n');

        await (telegramNotificationService as any).sendRawMessage?.(tgReport);
      } catch (tgErr: any) {
        console.warn('[decisionRouter] Telegram homework notification notice:', tgErr.message);
      }
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// Handle AI Entry Pattern Analysis
async function handleAiEntryPatternAnalysis(req: Request, res: Response) {
  try {
    let userTrades = req.body?.userTrades;
    let reviews: any[] = [];

    try {
      const { TradingRepository } = await import('@iati/database');
      const tradingRepo = new TradingRepository();

      if (!userTrades || userTrades.length === 0) {
        let positions = await tradingRepo.getClosedPositionsAcrossAccounts(200).catch(() => []);

        // If DB has 0 positions, backfill directly from cTrader broker feed into PostgreSQL
        if (!positions || positions.length === 0) {
          try {
            const { ctraderMarketDataFeedService } = await import('../services/ctraderMarketDataFeedService');
            const rawDeals = await ctraderMarketDataFeedService.fetchRawClosedDeals(90, 500);
            const closedDeals = (rawDeals || []).filter((d: any) => d.closePositionDetail != null);
            
            for (const d of closedDeals) {
              const symId = Number(d.symbolId || 1);
              const sym = ctraderMarketDataFeedService.getSymbolName(symId) || 'EUR/USD';
              const moneyDigits = Number(d.closePositionDetail?.moneyDigits ?? 2);
              const divisor = Math.pow(10, moneyDigits);
              const grossProfit = Number(d.closePositionDetail?.grossProfit || 0) / divisor;
              const commission = Number(d.closePositionDetail?.commission || 0) / divisor;
              const swap = Number(d.closePositionDetail?.swap || 0) / divisor;
              const netPnl = grossProfit + commission + swap;
              const entryPrice = Number(d.closePositionDetail?.entryPrice || d.executionPrice);
              const exitPrice = Number(d.executionPrice);
              const closeTime = new Date(Number(d.executionTimestamp));
              const direction = (d.tradeSide === 2 || d.tradeSide === 'SELL') ? 'BUY' : 'SELL';

              await tradingRepo.savePosition({
                positionId: String(d.positionId || d.dealId),
                ticketId: String(d.positionId || d.dealId),
                accountId: String(process.env.CTRADER_ACCOUNT_ID || '48282756'),
                symbol: sym,
                direction,
                entryPrice,
                currentPrice: exitPrice,
                closePrice: exitPrice,
                stopLoss: 0,
                takeProfit: 0,
                lotSize: Number(((Number(d.closePositionDetail?.closedVolume || 100000)) / 10000000).toFixed(2)),
                status: 'CLOSED',
                realizedProfit: Number(netPnl.toFixed(2)),
                pnlPips: 0,
                closedAt: closeTime,
                createdAt: closeTime,
                updatedAt: closeTime
              }).catch(() => {});
            }

            positions = await tradingRepo.getClosedPositionsAcrossAccounts(200).catch(() => []);
          } catch (syncErr: any) {
            console.warn('[decisionRouter] cTrader feed backfill for pattern notice:', syncErr.message);
          }
        }

        if (positions && positions.length > 0) {
          userTrades = positions.map((p: any) => {
            const pnl = Number((p.realizedProfit ?? p.realizedPnl ?? p.profit ?? p.pnlDollars ?? 0).toFixed(2));
            return {
              id: p.positionId || p.id,
              ticketId: p.ticketId,
              symbol: p.symbol || p.pair,
              pair: p.symbol || p.pair,
              direction: p.direction || (p.type === 'BUY' ? 'BUY' : 'SELL'),
              entryPrice: Number(p.entryPrice || p.openPrice),
              exitPrice: Number(p.closePrice || p.exitPrice || p.currentPrice || p.entryPrice),
              stopLoss: Number(p.stopLoss || 0),
              takeProfit: Number(p.takeProfit || 0),
              pnlDollars: pnl,
              pnlPips: Number(p.pnlPips || 0),
              outcome: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN',
              closedAt: p.closedAt || p.closeTime || p.updatedAt
            };
          });
        }
      }

      reviews = await tradingRepo.getPostMortemReviews(50).catch(() => []);
    } catch (dbErr: any) {
      console.warn('[decisionRouter] Database trade fetch for pattern analysis notice:', dbErr.message);
    }

    const result = await aiDecisionEngine.analyzeEntryPattern({
      ...req.body,
      userTrades: userTrades || [],
      postMortemReviews: reviews || []
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// Handle Adaptive Learning Synchronization with PostgreSQL closed trades
async function handleAdaptiveLearningSync(req: Request, res: Response) {
  try {
    const { TradingRepository } = await import('@iati/database');
    const tradingRepo = new TradingRepository();

    // 1. Sync cTrader broker deals into PostgreSQL positions
    let syncedDealsCount = 0;
    try {
      const { ctraderMarketDataFeedService } = await import('../services/ctraderMarketDataFeedService');
      const rawDeals = await ctraderMarketDataFeedService.fetchRawClosedDeals(90, 500);
      const closedDeals = (rawDeals || []).filter((d: any) => d.closePositionDetail != null);

      for (const d of closedDeals) {
        const symId = Number(d.symbolId || 1);
        const sym = ctraderMarketDataFeedService.getSymbolName(symId) || 'EUR/USD';
        const moneyDigits = Number(d.closePositionDetail?.moneyDigits ?? 2);
        const divisor = Math.pow(10, moneyDigits);
        const grossProfit = Number(d.closePositionDetail?.grossProfit || 0) / divisor;
        const commission = Number(d.closePositionDetail?.commission || 0) / divisor;
        const swap = Number(d.closePositionDetail?.swap || 0) / divisor;
        const netPnl = grossProfit + commission + swap;
        const entryPrice = Number(d.closePositionDetail?.entryPrice || d.executionPrice);
        const exitPrice = Number(d.executionPrice);
        const closeTime = new Date(Number(d.executionTimestamp));
        const direction = (d.tradeSide === 2 || d.tradeSide === 'SELL') ? 'BUY' : 'SELL';

        await tradingRepo.savePosition({
          positionId: String(d.positionId || d.dealId),
          ticketId: String(d.positionId || d.dealId),
          accountId: String(process.env.CTRADER_ACCOUNT_ID || '48282756'),
          symbol: sym,
          direction,
          entryPrice,
          currentPrice: exitPrice,
          closePrice: exitPrice,
          stopLoss: 0,
          takeProfit: 0,
          lotSize: Number(((Number(d.closePositionDetail?.closedVolume || 100000)) / 10000000).toFixed(2)),
          status: 'CLOSED',
          realizedProfit: Number(netPnl.toFixed(2)),
          pnlPips: 0,
          closedAt: closeTime,
          createdAt: closeTime,
          updatedAt: closeTime
        }).catch(() => {});
        syncedDealsCount++;
      }
    } catch (dealErr: any) {
      console.warn('[decisionRouter] cTrader deals sync notice:', dealErr.message);
    }

    const { learningService } = await import('../services/learningService');
    const result = await learningService.backfillHistoricalClosedTrades(200);
    const reviews = await learningService.loadPersistedLearning();

    res.json({
      success: true,
      message: `✅ Berjaya menyegerakkan ${syncedDealsCount} rekod cTrader ke PostgreSQL.`,
      result,
      totalReviews: reviews.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// Route definitions (supporting both direct path and /forex prefix path)
decisionRouter.post('/ai-opinion', handleAiOpinion);
decisionRouter.post('/forex/ai-opinion', handleAiOpinion);

decisionRouter.post('/chat', handleAiChat);
decisionRouter.post('/forex/chat', handleAiChat);

decisionRouter.post('/backtest', handleSingleBacktest);
decisionRouter.post('/forex/backtest', handleSingleBacktest);

decisionRouter.get('/backtest-1year', handle1YearBacktestGet);
decisionRouter.get('/forex/backtest-1year', handle1YearBacktestGet);
decisionRouter.post('/backtest-1year', handle1YearBacktestPost);
decisionRouter.post('/forex/backtest-1year', handle1YearBacktestPost);

decisionRouter.get('/post-mortem-lessons', handlePostMortemLessonsGet);
decisionRouter.get('/forex/post-mortem-lessons', handlePostMortemLessonsGet);
decisionRouter.post('/post-mortem', handlePostMortemPost);
decisionRouter.post('/forex/post-mortem', handlePostMortemPost);

decisionRouter.get('/learning/early-learner', async (req: Request, res: Response) => {
  try {
    const payload = researchLearningEngine.getEarlyLearnerPayload();
    const dbStats = await shadowObservationRepository.getAuthoritativeDatabaseStatistics();
    if (dbStats && dbStats.totalClosed > 0) {
      payload.campaignMetrics.closedTrades = dbStats.totalClosed;
      payload.campaignMetrics.winCount = dbStats.winCount;
      payload.campaignMetrics.lossCount = dbStats.lossCount;
      payload.campaignMetrics.breakevenCount = dbStats.breakevenCount;
      payload.campaignMetrics.winRate = dbStats.winRate;
      payload.campaignMetrics.totalRealizedR = dbStats.totalRealizedR;
      payload.campaignMetrics.avgRealizedR = dbStats.totalClosed > 0 ? parseFloat((dbStats.totalRealizedR / dbStats.totalClosed).toFixed(2)) : 0;
    }
    res.json(payload);
  } catch {
    res.json(researchLearningEngine.getEarlyLearnerPayload());
  }
});
decisionRouter.get('/forex/learning/early-learner', async (req: Request, res: Response) => {
  try {
    const payload = researchLearningEngine.getEarlyLearnerPayload();
    const dbStats = await shadowObservationRepository.getAuthoritativeDatabaseStatistics();
    if (dbStats && dbStats.totalClosed > 0) {
      payload.campaignMetrics.closedTrades = dbStats.totalClosed;
      payload.campaignMetrics.winCount = dbStats.winCount;
      payload.campaignMetrics.lossCount = dbStats.lossCount;
      payload.campaignMetrics.breakevenCount = dbStats.breakevenCount;
      payload.campaignMetrics.winRate = dbStats.winRate;
      payload.campaignMetrics.totalRealizedR = dbStats.totalRealizedR;
      payload.campaignMetrics.avgRealizedR = dbStats.totalClosed > 0 ? parseFloat((dbStats.totalRealizedR / dbStats.totalClosed).toFixed(2)) : 0;
    }
    res.json(payload);
  } catch {
    res.json(researchLearningEngine.getEarlyLearnerPayload());
  }
});

// Phase 7I: Controlled DEMO Learning Campaign API
decisionRouter.get('/learning/campaign-status', (req: Request, res: Response) => {
  res.json(controlledDemoLearningCampaignService.getStatus());
});
decisionRouter.get('/forex/learning/campaign-status', (req: Request, res: Response) => {
  res.json(controlledDemoLearningCampaignService.getStatus());
});

decisionRouter.post('/learning/campaign/start', (req: Request, res: Response) => {
  const result = controlledDemoLearningCampaignService.startCampaign();
  res.json(result);
});
decisionRouter.post('/forex/learning/campaign/start', (req: Request, res: Response) => {
  const result = controlledDemoLearningCampaignService.startCampaign();
  res.json(result);
});

decisionRouter.post('/learning/campaign/pause', (req: Request, res: Response) => {
  const reason = req.body?.reason || 'Operator requested pause';
  const result = controlledDemoLearningCampaignService.pauseCampaign(reason);
  res.json(result);
});
decisionRouter.post('/forex/learning/campaign/pause', (req: Request, res: Response) => {
  const reason = req.body?.reason || 'Operator requested pause';
  const result = controlledDemoLearningCampaignService.pauseCampaign(reason);
  res.json(result);
});

decisionRouter.post('/learning/campaign/resume', (req: Request, res: Response) => {
  const result = controlledDemoLearningCampaignService.resumeCampaign();
  res.json(result);
});
decisionRouter.post('/forex/learning/campaign/resume', (req: Request, res: Response) => {
  const result = controlledDemoLearningCampaignService.resumeCampaign();
  res.json(result);
});

decisionRouter.post('/learning/campaign/stop', (req: Request, res: Response) => {
  const reason = req.body?.reason || 'Operator requested stop';
  const result = controlledDemoLearningCampaignService.stopCampaign(reason);
  res.json(result);
});
decisionRouter.post('/forex/learning/campaign/stop', (req: Request, res: Response) => {
  const reason = req.body?.reason || 'Operator requested stop';
  const result = controlledDemoLearningCampaignService.stopCampaign(reason);
  res.json(result);
});

decisionRouter.get('/learning/journal', (req: Request, res: Response) => {
  const filter = {
    setupFingerprint: req.query.setupFingerprint as string,
    eventType: req.query.eventType as any,
    observationType: req.query.observationType as any,
    limit: req.query.limit ? Number(req.query.limit) : 100
  };
  res.json({ count: learningJournalService.getEvents(filter).length, events: learningJournalService.getEvents(filter) });
});
decisionRouter.get('/forex/learning/journal', (req: Request, res: Response) => {
  const filter = {
    setupFingerprint: req.query.setupFingerprint as string,
    eventType: req.query.eventType as any,
    observationType: req.query.observationType as any,
    limit: req.query.limit ? Number(req.query.limit) : 100
  };
  res.json({ count: learningJournalService.getEvents(filter).length, events: learningJournalService.getEvents(filter) });
});

decisionRouter.post('/ai-homework-session', handleAiHomeworkSession);
decisionRouter.post('/forex/ai-homework-session', handleAiHomeworkSession);

decisionRouter.post('/ai-entry-pattern-analysis', handleAiEntryPatternAnalysis);
decisionRouter.post('/forex/ai-entry-pattern-analysis', handleAiEntryPatternAnalysis);

decisionRouter.post('/learning/sync', handleAdaptiveLearningSync);
decisionRouter.post('/forex/learning/sync', handleAdaptiveLearningSync);

decisionRouter.post('/manual-signal', handleManualSignal);
decisionRouter.post('/forex/manual-signal', handleManualSignal);

decisionRouter.get('/signal-history', handleSignalHistoryGet);
decisionRouter.get('/forex/signal-history', handleSignalHistoryGet);

decisionRouter.get('/manual-trades', handleManualTradesGet);
decisionRouter.get('/forex/manual-trades', handleManualTradesGet);
decisionRouter.post('/manual-trades', handleManualTradeRecord);
decisionRouter.post('/forex/manual-trades', handleManualTradeRecord);
decisionRouter.post('/manual-trades/:tradeId/close', handleManualTradeClose);
decisionRouter.post('/forex/manual-trades/:tradeId/close', handleManualTradeClose);

// Handle User Actual Trade Creation POST (Phase 6B)
// Handle User Actual Trade Creation POST (Phase 6C Hardened)
function handleUserActualTradeCreate(req: Request, res: Response) {
  try {
    const trade = manualSignalService.createUserActualTrade(req.body);
    res.json({ success: true, trade });
  } catch (err: any) {
    const status = err?.errorCode ? 400 : 500;
    res.status(status).json({ 
      success: false, 
      error: err?.message || 'Failed to create user actual trade',
      errorCode: err?.errorCode || 'MANUAL_TRADE_CREATION_FAILED'
    });
  }
}

// Handle User Actual Trades GET (Phase 6C)
function handleUserActualTradesGet(req: Request, res: Response) {
  try {
    const status = req.query.status as any;
    const trades = manualSignalService.getUserActualTrades(status);
    res.json({ trades });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to get user actual trades' });
  }
}

// Handle User Actual Trade Close POST (Phase 6C Hardened)
// Handle User Actual Trades Monitoring GET (Phase 6D)
async function handleUserActualTradesMonitoringGet(req: Request, res: Response) {
  try {
    const dataMode = (req.query.mode as any) || (req.query.dataMode as any) || 'LIVE';
    const snapshots = await marketMonitoringService.evaluateAllActiveTrades(dataMode);
    const allAlerts = marketMonitoringService.getTriggeredAlerts();
    res.json({
      success: true,
      activeTradesCount: snapshots.length,
      snapshots,
      alerts: allAlerts,
      timestamp: Date.now()
    });
  } catch (err: any) {
    res.status(500).json({ 
      success: false, 
      error: err?.message || 'Failed to retrieve active manual trades monitoring snapshots' 
    });
  }
}

async function handleUserActualTradeClose(req: Request, res: Response) {
  try {
    const { manualTradeId } = req.params;
    const trade = await manualSignalService.closeUserActualTrade(manualTradeId, req.body);
    res.json({ success: true, trade });
  } catch (err: any) {
    const status = err?.errorCode ? 400 : 500;
    res.status(status).json({ 
      success: false, 
      error: err?.message || 'Failed to close user actual trade',
      errorCode: err?.errorCode || 'MANUAL_TRADE_CLOSE_FAILED'
    });
  }
}

decisionRouter.get('/user-trades/monitoring', handleUserActualTradesMonitoringGet);
decisionRouter.get('/forex/user-trades/monitoring', handleUserActualTradesMonitoringGet);
decisionRouter.post('/user-trades', handleUserActualTradeCreate);
decisionRouter.post('/forex/user-trades', handleUserActualTradeCreate);
decisionRouter.get('/user-trades', handleUserActualTradesGet);
decisionRouter.get('/forex/user-trades', handleUserActualTradesGet);
decisionRouter.post('/user-trades/:manualTradeId/close', handleUserActualTradeClose);
decisionRouter.post('/forex/user-trades/:manualTradeId/close', handleUserActualTradeClose);

// ============================================================================
// PHASE 7J: CONTINUOUS LEARNING OBSERVATORY ENDPOINTS
// ============================================================================

decisionRouter.get('/forex/learning/observatory/status', (req: Request, res: Response) => {
  try {
    const status = continuousLearningObservatoryService.getStatus();
    res.json({ success: true, ...status });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});
decisionRouter.get('/learning/observatory/status', (req: Request, res: Response) => {
  const status = continuousLearningObservatoryService.getStatus();
  res.json({ success: true, ...status });
});

decisionRouter.post('/forex/learning/observatory/start', (req: Request, res: Response) => {
  const result = continuousLearningObservatoryService.startObservatory();
  res.json(result);
});
decisionRouter.post('/learning/observatory/start', (req: Request, res: Response) => {
  const result = continuousLearningObservatoryService.startObservatory();
  res.json(result);
});

decisionRouter.post('/forex/learning/observatory/pause', (req: Request, res: Response) => {
  const { reason } = req.body;
  const result = continuousLearningObservatoryService.pauseObservatory(reason);
  res.json(result);
});
decisionRouter.post('/learning/observatory/pause', (req: Request, res: Response) => {
  const { reason } = req.body;
  const result = continuousLearningObservatoryService.pauseObservatory(reason);
  res.json(result);
});

decisionRouter.post('/forex/learning/observatory/resume', (req: Request, res: Response) => {
  const result = continuousLearningObservatoryService.resumeObservatory();
  res.json(result);
});
decisionRouter.post('/learning/observatory/resume', (req: Request, res: Response) => {
  const result = continuousLearningObservatoryService.resumeObservatory();
  res.json(result);
});

decisionRouter.post('/forex/learning/observatory/stop', (req: Request, res: Response) => {
  const { reason } = req.body;
  const result = continuousLearningObservatoryService.stopObservatory(reason);
  res.json(result);
});
decisionRouter.post('/learning/observatory/stop', (req: Request, res: Response) => {
  const { reason } = req.body;
  const result = continuousLearningObservatoryService.stopObservatory(reason);
  res.json(result);
});

decisionRouter.post('/forex/learning/observatory/evaluate', (req: Request, res: Response) => {
  const result = continuousLearningObservatoryService.evaluateMarketOpportunity(req.body);
  res.json(result);
});
decisionRouter.post('/learning/observatory/evaluate', (req: Request, res: Response) => {
  const result = continuousLearningObservatoryService.evaluateMarketOpportunity(req.body);
  res.json(result);
});

decisionRouter.post('/forex/learning/observatory/tick', (req: Request, res: Response) => {
  const { symbol, currentPrice, highPrice, lowPrice, session } = req.body;
  const closed = continuousLearningObservatoryService.processMarketTick(symbol, currentPrice, highPrice, lowPrice, session);
  res.json({ success: true, closedObservations: closed });
});
decisionRouter.post('/learning/observatory/tick', (req: Request, res: Response) => {
  const { symbol, currentPrice, highPrice, lowPrice, session } = req.body;
  const closed = continuousLearningObservatoryService.processMarketTick(symbol, currentPrice, highPrice, lowPrice, session);
  res.json({ success: true, closedObservations: closed });
});

decisionRouter.get('/forex/learning/observatory/observations', async (req: Request, res: Response) => {
  try {
    const summary = await shadowObservationRepository.getAuthoritativeDatabaseStatistics();
    res.json({
      success: true,
      active: continuousLearningObservatoryService.getActiveObservations(),
      completed: continuousLearningObservatoryService.getCompletedObservations(100),
      summary
    });
  } catch {
    res.json({
      success: true,
      active: continuousLearningObservatoryService.getActiveObservations(),
      completed: continuousLearningObservatoryService.getCompletedObservations(100)
    });
  }
});
decisionRouter.get('/learning/observatory/observations', async (req: Request, res: Response) => {
  try {
    const summary = await shadowObservationRepository.getAuthoritativeDatabaseStatistics();
    res.json({
      success: true,
      active: continuousLearningObservatoryService.getActiveObservations(),
      completed: continuousLearningObservatoryService.getCompletedObservations(100),
      summary
    });
  } catch {
    res.json({
      success: true,
      active: continuousLearningObservatoryService.getActiveObservations(),
      completed: continuousLearningObservatoryService.getCompletedObservations(100)
    });
  }
});
