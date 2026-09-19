import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://quantumai:quantumai_test_password@127.0.0.1:54329/quantumai_test'
  });
  await client.connect();

  console.log('Target Master Account from .env:', process.env.CTRADER_ACCOUNT_ID);

  const res = await client.query(`
    SELECT 
      COALESCE(account_id, 'NULL') as account_id,
      status,
      COUNT(*)::int as count,
      ROUND(SUM(realized_profit)::numeric, 2) as sum_pnl
    FROM positions 
    GROUP BY account_id, status 
    ORDER BY account_id, status;
  `);
  console.log('\n--- Positions grouped by account_id ---');
  console.table(res.rows);

  const distinctAccs = await client.query(`
    SELECT DISTINCT account_id FROM positions;
  `);
  console.log('\nDistinct account_ids in positions:', distinctAccs.rows);

  await client.end();
}

run().catch(console.error);
