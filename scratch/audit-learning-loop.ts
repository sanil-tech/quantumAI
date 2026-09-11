import dotenv from 'dotenv';
dotenv.config();
import { TradingRepository } from '../packages/database/src/repository';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { LearningService } from '../src/server/services/learningService';

async function main() {
  const repo = new TradingRepository();
  const learningService = LearningService.getInstance(repo);

  console.log('--- REHYDRATING LEARNING SERVICE ---');
  const reviews = await learningService.loadPersistedLearning();

  console.log('\n--- TOTAL REVIEWS IN AI DECISION ENGINE ---');
  console.log('Total post-mortem reviews:', reviews.length);

  console.log('\n--- QUERYING CLOSED POSITIONS FROM DATABASE ---');
  // Get all closed positions
  let closedPositions: any[] = [];
  try {
    const res = await (repo as any).db.query(`
      SELECT * FROM positions 
      ORDER BY closed_at DESC NULLS LAST, created_at DESC 
      LIMIT 100;
    `);
    closedPositions = res.rows || [];
  } catch (err: any) {
    console.log('Direct query fallback:', err.message);
  }

  console.log(`Found ${closedPositions.length} positions in database.`);

  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const lastWeekPositions = closedPositions.filter((p: any) => {
    const t = new Date(p.closed_at || p.created_at).getTime();
    return t >= oneWeekAgo;
  });

  console.log(`\n=== LAST 7 DAYS TRADES (${lastWeekPositions.length}) ===`);
  for (const pos of lastWeekPositions) {
    console.log(`Trade #${pos.position_id || pos.id} | ${pos.symbol} | ${pos.direction} | Status: ${pos.status} | PnL: ${pos.realized_pnl || pos.pnl || 0} | ClosedAt: ${pos.closed_at || 'OPEN'}`);
  }

  console.log(`\n=== PERSISTED LESSONS & POST-MORTEM REVIEWS (${reviews.length}) ===`);
  for (const r of reviews.slice(0, 15)) {
    console.log(`\n[Lesson for ${r.symbol || 'GLOBAL'} (${r.direction || 'N/A'})]`);
    console.log(`Outcome: ${r.outcome} | PnL: ${r.pnl}`);
    console.log(`Lesson: ${r.lessonLearned}`);
    console.log(`Root Cause: ${r.rootCauseAnalysis}`);
    console.log(`Adjustments: ${JSON.stringify(r.systemAdjustments)}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
