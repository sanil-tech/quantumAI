import { Router, Request, Response } from 'express';
import { aiDecisionEngine } from '../../../apps/decision-agent/src/services/aiDecisionEngine';
import { backtestEngine } from '../../../apps/decision-agent/src/services/backtestEngine';
import { learningService } from '../services/learningService';
import { researchLearningEngine } from '../../../apps/decision-agent/src/services/researchLearningEngine';
import { controlledDemoLearningCampaignService } from '../../../apps/execution-router/src/services/controlledDemoLearningCampaignService';
import { learningJournalService } from '../services/learningJournalService';
import { continuousLearningObservatoryService } from '../services/continuousLearningObservatoryService';

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

// Handle Post-Mortem Lessons GET
function handlePostMortemLessonsGet(req: Request, res: Response) {
  res.json({ reviews: aiDecisionEngine.getPostMortemReviews() });
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

// Handle AI Homework Session
async function handleAiHomeworkSession(req: Request, res: Response) {
  try {
    const closedTrades = req.body?.closedTrades || [];
    const result = await aiDecisionEngine.runHomeworkSession(closedTrades);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// Handle AI Entry Pattern Analysis
async function handleAiEntryPatternAnalysis(req: Request, res: Response) {
  try {
    const result = await aiDecisionEngine.analyzeEntryPattern(req.body);
    res.json(result);
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

decisionRouter.get('/learning/early-learner', (req: Request, res: Response) => {
  res.json(researchLearningEngine.getEarlyLearnerPayload());
});
decisionRouter.get('/forex/learning/early-learner', (req: Request, res: Response) => {
  res.json(researchLearningEngine.getEarlyLearnerPayload());
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

decisionRouter.get('/forex/learning/observatory/observations', (req: Request, res: Response) => {
  res.json({
    success: true,
    active: continuousLearningObservatoryService.getActiveObservations(),
    completed: continuousLearningObservatoryService.getCompletedObservations(50)
  });
});
decisionRouter.get('/learning/observatory/observations', (req: Request, res: Response) => {
  res.json({
    success: true,
    active: continuousLearningObservatoryService.getActiveObservations(),
    completed: continuousLearningObservatoryService.getCompletedObservations(50)
  });
});
