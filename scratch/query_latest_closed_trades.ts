import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function fetchLatestClosedTrades() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('=== 10 LATEST CLOSED TRADES IN DATABASE (POSTGRESQL) ===');
  const res = await client.query(`
    SELECT 
      position_id, 
      symbol, 
      direction, 
      entry_price, 
      close_price, 
      realized_profit, 
      pnl_pips, 
      close_reason, 
      opened_at, 
      closed_at,
      updated_at
    FROM positions 
    WHERE status = 'CLOSED' 
    ORDER BY COALESCE(closed_at, updated_at, opened_at) DESC 
    LIMIT 10
  `);

  console.table(res.rows.map(r => ({
    PositionId: r.position_id,
    Symbol: r.symbol,
    Side: r.direction,
    Entry: Number(r.entry_price),
    Close: Number(r.close_price),
    'PnL ($)': Number(r.realized_profit || 0).toFixed(2),
    Pips: Number(r.pnl_pips || 0).toFixed(1),
    Reason: r.close_reason,
    ClosedAt: r.closed_at ? new Date(r.closed_at).toISOString() : (r.updated_at ? new Date(r.updated_at).toISOString() : 'N/A')
  })));

  await client.end();
}

fetchLatestClosedTrades().catch(console.error);
