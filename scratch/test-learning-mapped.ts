import 'dotenv/config';
import { TradingRepository } from '@iati/database';

async function testLearning() {
  const repo = new TradingRepository();
  const res = await repo.getAdminLearningRecords(5, 0);
  console.log(`Total Learning Records: ${res.total}`);
  for (const r of res.learningRecords) {
    console.log(`\nTrade: ${r.tradeId} | Pair: ${r.pair} | Outcome: ${r.outcome} | PnL: $${r.pnlDollars}`);
    console.log(`- Punca Utama (Root Cause): ${r.rootCause}`);
    console.log(`- Pengajaran Utama: ${r.lessonLearnedMs || r.lessonLearnedEn}`);
    console.log(`- Syor Adaptasi Rule: ${r.adaptiveActionRecommended}`);
  }
  process.exit(0);
}

testLearning().catch(e => {
  console.error(e);
  process.exit(1);
});
