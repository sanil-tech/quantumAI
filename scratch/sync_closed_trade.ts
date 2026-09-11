import 'dotenv/config';
import { Pool } from 'pg';

async function syncClosedTrade() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  // 1. Update the GBP/JPY trade that hit Stop Loss at 216.713
  const updateRes = await pool.query(`
    UPDATE positions 
    SET 
      status = 'CLOSED',
      close_price = 216.713,
      realized_profit = -4.97,
      closed_at = '2026-09-01T09:35:30.881Z',
      close_reason = 'STOP_LOSS_HIT',
      reconciliation_status = 'RECONCILED'
    WHERE entry_price = 216.364 AND symbol = 'GBP/JPY' AND status = 'OPEN'
    RETURNING position_id, symbol, direction, entry_price, close_price, realized_profit, status, closed_at
  `);
  
  console.log('UPDATED POSITIONS:', JSON.stringify(updateRes.rows, null, 2));

  // 2. Count remaining open positions
  const countRes = await pool.query(`
    SELECT COUNT(*)::int as open_count 
    FROM positions 
    WHERE status = 'OPEN'
  `);
  
  console.log('REMAINING OPEN POSITIONS IN DB:', countRes.rows[0]?.open_count);

  await pool.end();
}

syncClosedTrade().catch(console.error);
