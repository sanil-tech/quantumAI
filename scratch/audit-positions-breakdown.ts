import 'dotenv/config';
import { getDbPool } from '@iati/database';

async function audit() {
  const pool = getDbPool();
  console.log('=== AUDITING POSITIONS TABLE IN POSTGRESQL ===');
  
  const statusRes = await pool.query(`
    SELECT status, account_id, COUNT(*) as count 
    FROM positions 
    GROUP BY status, account_id
    ORDER BY count DESC;
  `);
  console.log('Breakdown by status and account_id:');
  console.table(statusRes.rows);

  const defaultClosed = await pool.query(`
    SELECT position_id, account_id, symbol, status, realized_profit, pnl_pips, strategy_id
    FROM positions
    WHERE status = 'CLOSED' AND account_id = 'DEFAULT'
  `);
  console.log('\nCLOSED trades for account_id = DEFAULT:');
  console.table(defaultClosed.rows);

  const allClosed = await pool.query(`
    SELECT position_id, account_id, symbol, status, realized_profit, pnl_pips, strategy_id
    FROM positions
    WHERE status = 'CLOSED'
    LIMIT 10
  `);
  console.log('\nSample CLOSED trades across ALL accounts:');
  console.table(allClosed.rows);

  const distinctAccounts = await pool.query(`
    SELECT DISTINCT account_id, COUNT(*) FROM positions GROUP BY account_id
  `);
  console.log('\nDistinct account_ids:');
  console.table(distinctAccounts.rows);

  process.exit(0);
}

audit().catch(e => {
  console.error(e);
  process.exit(1);
});
