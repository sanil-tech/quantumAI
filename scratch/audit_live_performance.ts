import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function auditPerformance() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const totalRes = await client.query(`
    SELECT 
      COUNT(*) as total_trades,
      COUNT(CASE WHEN realized_profit > 0 THEN 1 END) as wins,
      COUNT(CASE WHEN realized_profit < 0 THEN 1 END) as losses,
      COUNT(CASE WHEN realized_profit = 0 THEN 1 END) as breakevens,
      COALESCE(SUM(realized_profit), 0) as net_pnl,
      COALESCE(SUM(CASE WHEN realized_profit > 0 THEN realized_profit ELSE 0 END), 0) as gross_profit,
      COALESCE(SUM(CASE WHEN realized_profit < 0 THEN ABS(realized_profit) ELSE 0 END), 0) as gross_loss,
      COALESCE(AVG(CASE WHEN realized_profit > 0 THEN realized_profit END), 0) as avg_win,
      COALESCE(AVG(CASE WHEN realized_profit < 0 THEN ABS(realized_profit) END), 0) as avg_loss,
      COALESCE(MAX(realized_profit), 0) as largest_win,
      COALESCE(MIN(realized_profit), 0) as largest_loss
    FROM positions
    WHERE status = 'CLOSED'
  `);

  const pairRes = await client.query(`
    SELECT 
      symbol,
      COUNT(*) as trades,
      COUNT(CASE WHEN realized_profit > 0 THEN 1 END) as wins,
      COUNT(CASE WHEN realized_profit < 0 THEN 1 END) as losses,
      ROUND((COUNT(CASE WHEN realized_profit > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 1) as win_rate,
      ROUND(SUM(realized_profit)::numeric, 2) as net_pnl
    FROM positions
    WHERE status = 'CLOSED'
    GROUP BY symbol
    ORDER BY net_pnl DESC
  `);

  console.log('=== OVERALL PERFORMANCE AUDIT ===');
  console.table(totalRes.rows);

  console.log('\n=== PERFORMANCE BY PAIR ===');
  console.table(pairRes.rows);

  await client.end();
  process.exit(0);
}

auditPerformance().catch(e => {
  console.error(e);
  process.exit(1);
});
