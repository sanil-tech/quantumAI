import { Router, Request, Response } from 'express';
import { aiDecisionEngine } from '../../../apps/decision-agent/src/services/aiDecisionEngine';
import { backtestEngine } from '../../../apps/decision-agent/src/services/backtestEngine';
import { learningService } from '../services/learningService';

export const decisionRouter = Router();

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
