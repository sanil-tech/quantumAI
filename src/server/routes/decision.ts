import { Router, Request, Response } from 'express';
import { aiDecisionEngine } from '../../../apps/decision-agent/src/services/aiDecisionEngine';
import { backtestEngine } from '../../../apps/decision-agent/src/services/backtestEngine';

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
    const review = await aiDecisionEngine.createPostMortem(req.body);
    res.json({ success: true, review, totalLessons: aiDecisionEngine.getPostMortemReviews().length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
