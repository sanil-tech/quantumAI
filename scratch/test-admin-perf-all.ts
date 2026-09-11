import 'dotenv/config';
import { TradingRepository } from '@iati/database';

async function test() {
  const repo = new TradingRepository();

  console.log('=== PERFORMANCE FOR account_id = "ALL" ===');
  const allPerf = await repo.getAdminPerformance('ALL');
  console.log(JSON.stringify(allPerf, null, 2));

  console.log('\n=== PERFORMANCE FOR account_id = "48282756" (Current cTrader) ===');
  const ctraderPerf = await repo.getAdminPerformance('48282756');
  console.log(JSON.stringify(ctraderPerf, null, 2));

  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});
