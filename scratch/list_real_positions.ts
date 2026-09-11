import 'dotenv/config';
import { Pool } from 'pg';

async function listPositionsWithEnv() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  const res = await pool.query(`
    SELECT position_id, account_id, symbol, direction, quantity, entry_price, current_price, status, opened_at, close_reason, metadata
    FROM positions
    WHERE status = 'OPEN'
    ORDER BY opened_at ASC
  `);
  
  console.log('TOTAL OPEN IN POSITIONS TABLE (PORT 54329):', res.rows.length);
  res.rows.forEach((r, i) => {
    console.log(`[${i + 1}] ID: ${r.position_id} | ${r.symbol} ${r.direction} | Lots: ${r.quantity} | Entry: ${r.entry_price} | Opened: ${r.opened_at}`);
  });
  
  await pool.end();
}

listPositionsWithEnv().catch(console.error);
