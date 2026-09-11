import 'dotenv/config';
import { TradingRepository } from '@iati/database';

async function test() {
  const repo = new TradingRepository();

  console.log('Testing getAdminPerformance("ALL")...');
  const perf = await repo.getAdminPerformance('ALL');
  console.log(`Total Trades: ${perf.totalTrades} | Wins: ${perf.winCount} | Losses: ${perf.lossCount} | WinRate: ${perf.winRatePercent}%`);
  console.log(`Pairs count: ${perf.pairPerformance.length}`);
  console.log('Top 3 Pairs:', perf.pairPerformance.slice(0, 3));

  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});
