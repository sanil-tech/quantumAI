import 'dotenv/config';
import { TradingRepository } from '@iati/database';

async function updateStatus() {
  const repo = new TradingRepository();
  const res = await repo.query("UPDATE positions SET status = 'CLOSED', close_reason = 'TEST_SUITE_CLEANUP' WHERE position_id LIKE 'pos_ctrader_demo_%' AND status = 'OPEN'");
  console.log('Updated rows:', res.rowCount);
  const openCount = await repo.query("SELECT COUNT(*) FROM positions WHERE status = 'OPEN'");
  console.log('Remaining open positions in PostgreSQL:', openCount.rows[0].count);
}

updateStatus().catch(console.error);
