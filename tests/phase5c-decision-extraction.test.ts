import { describe, it, expect } from 'vitest';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { backtestEngine } from '../apps/decision-agent/src/services/backtestEngine';
import { decisionRouter } from '../src/server/routes/decision';

describe('Phase 5C — Decision & AI Signal Extraction', () => {
  it('should verify aiDecisionEngine domain service methods', async () => {
    expect(aiDecisionEngine).toBeDefined();
    expect(typeof aiDecisionEngine.generateOpinion).toBe('function');
    expect(typeof aiDecisionEngine.generateChatReply).toBe('function');
    expect(typeof aiDecisionEngine.createPostMortem).toBe('function');
    expect(typeof aiDecisionEngine.runHomeworkSession).toBe('function');
    expect(typeof aiDecisionEngine.analyzeEntryPattern).toBe('function');
    expect(typeof aiDecisionEngine.getPostMortemReviews).toBe('function');
  });

  it('should verify backtestEngine domain service methods', async () => {
    expect(backtestEngine).toBeDefined();
    expect(typeof backtestEngine.executeSingleBacktest).toBe('function');
    expect(typeof backtestEngine.execute1YearMultiPairBacktest).toBe('function');
    expect(typeof backtestEngine.getLatest1YearBacktestResult).toBe('function');
    expect(typeof backtestEngine.startBackgroundTimer).toBe('function');
  });

  it('should verify decisionRouter is exported correctly as an Express router', () => {
    expect(decisionRouter).toBeDefined();
    expect(typeof decisionRouter).toBe('function');
    expect(decisionRouter.stack).toBeDefined();
    expect(decisionRouter.stack.length).toBeGreaterThan(0);
  });

  it('should verify postMortemReviews memory access in aiDecisionEngine', () => {
    const reviews = aiDecisionEngine.getPostMortemReviews();
    expect(Array.isArray(reviews)).toBe(true);
    expect(reviews.length).toBeGreaterThan(0);

    const initialLength = reviews.length;
    aiDecisionEngine.addPostMortemReview({
      id: `test-pm-${Date.now()}`,
      timestamp: Date.now(),
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.0850,
      exitPrice: 1.0820,
      stopLoss: 1.0820,
      takeProfit: 1.0900,
      pnlDollars: -50,
      outcome: 'LOSS',
      rootCauseMs: 'Test cause',
      rootCauseEn: 'Test cause EN',
      lessonLearnedMs: 'Test lesson',
      lessonLearnedEn: 'Test lesson EN',
      adaptiveRuleMs: 'Rule',
      adaptiveRuleEn: 'Rule EN',
      ratingScore: 3
    });

    const updatedReviews = aiDecisionEngine.getPostMortemReviews();
    expect(updatedReviews.length).toBe(initialLength + 1);
  });
});
