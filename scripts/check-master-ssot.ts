import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

async function checkMasterDaily() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://quantumai:quantumai_test_password@127.0.0.1:54329/quantumai_test'
  });
  await client.connect();

  const masterCtid = (process.env.CTRADER_ACCOUNT_ID || '48282756').trim();
  const masterLogin = '5881460';

  console.log(`Checking SSOT for Master Account [cTID: ${masterCtid} / Login: ${masterLogin}]...`);

  // Daily performance for Master Account only
  const masterDaily = await client.query(`
    SELECT 
      TO_CHAR(closed_at, 'YYYY-MM-DD') as trade_date,
      account_id,
      COUNT(*)::int as trades_count,
      COUNT(CASE WHEN realized_profit > 0 THEN 1 END)::int as wins,
      COUNT(CASE WHEN realized_profit < 0 THEN 1 END)::int as losses,
      ROUND((COUNT(CASE WHEN realized_profit > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100), 1) as win_rate_pct,
      ROUND(SUM(realized_profit)::numeric, 2) as daily_pnl
    FROM positions
    WHERE status = 'CLOSED' 
      AND closed_at IS NOT NULL
      AND account_id IN ($1, $2)
    GROUP BY TO_CHAR(closed_at, 'YYYY-MM-DD'), account_id
    ORDER BY trade_date DESC
    LIMIT 10;
  `, [masterCtid, masterLogin]);

  console.log('\n--- Master Account Only Daily Breakdown ---');
  console.table(masterDaily.rows);

  await client.end();
}

checkMasterDaily().catch(console.error);
