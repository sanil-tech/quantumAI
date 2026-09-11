import 'dotenv/config';
import { TradingRepository } from '@iati/database';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';

async function testGeminiDeepAnalysis() {
  const repo = new TradingRepository();
  console.log('Fetching performance & post-mortems from PostgreSQL...');
  const perf = await repo.getAdminPerformance('ALL');
  const closedRes = await repo.getPositions({ status: 'CLOSED', limit: 30 });
  const pmRes = await repo.getAdminLearningRecords(30, 0);

  console.log(`Analyzing ${perf.totalTrades} trades with Gemini AI...`);
  const analysis = await aiDecisionEngine.generatePortfolioDeepAnalysis({
    totalTrades: perf.totalTrades,
    winRate: perf.winRatePercent,
    totalPnl: perf.totalPnlDollars,
    profitFactor: perf.profitFactor,
    bestPair: perf.bestPair,
    worstPair: perf.worstPair,
    pairPerformance: perf.pairPerformance,
    recentTrades: closedRes.positions || [],
    learningRecords: pmRes.learningRecords || []
  });

  console.log('\n=== GEMINI DEEP ANALYSIS RESULT ===');
  console.log('Source:', analysis.source);
  console.log('Portfolio Grade:', analysis.portfolioGrade);
  console.log('Executive Summary (BM):', analysis.executiveSummaryMs);
  console.log('\nFailure Patterns (BM):', analysis.failurePatternsMs);
  console.log('\nAction Plan (BM):', analysis.actionPlanMs);
  console.log('\nRecommended Pairs:', analysis.recommendedPairs);
  console.log('Risk Warning (BM):', analysis.riskWarningMs);
  process.exit(0);
}

testGeminiDeepAnalysis().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
