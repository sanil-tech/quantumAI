import { Router, Request, Response } from 'express';
import { aiDecisionEngine } from '../../../apps/decision-agent/src/services/aiDecisionEngine';
import { backtestEngine } from '../../../apps/decision-agent/src/services/backtestEngine';
import { learningService } from '../services/learningService';

export const decisionRouter = Router();

import { manualSignalService } from '../services/manualSignalService';

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
function handleUserActualTradeCreate(req: Request, res: Response) {
  try {
    const trade = manualSignalService.createUserActualTrade(req.body);
    res.json({ success: true, trade });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create user actual trade' });
  }
}

// Handle User Actual Trades GET (Phase 6B)
function handleUserActualTradesGet(req: Request, res: Response) {
  try {
    const status = req.query.status as any;
    const trades = manualSignalService.getUserActualTrades(status);
    res.json({ trades });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to get user actual trades' });
  }
}

// Handle User Actual Trade Close POST (Phase 6B)
async function handleUserActualTradeClose(req: Request, res: Response) {
  try {
    const { manualTradeId } = req.params;
    const trade = await manualSignalService.closeUserActualTrade(manualTradeId, req.body);
    res.json({ success: true, trade });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to close user actual trade' });
  }
}

decisionRouter.post('/user-trades', handleUserActualTradeCreate);
decisionRouter.post('/forex/user-trades', handleUserActualTradeCreate);
decisionRouter.get('/user-trades', handleUserActualTradesGet);
decisionRouter.get('/forex/user-trades', handleUserActualTradesGet);
decisionRouter.post('/user-trades/:manualTradeId/close', handleUserActualTradeClose);
decisionRouter.post('/forex/user-trades/:manualTradeId/close', handleUserActualTradeClose);
