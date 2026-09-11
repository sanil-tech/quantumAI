import 'dotenv/config';
import { Pool } from 'pg';

async function describePositions() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  const cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'positions'
  `);
  console.log('COLUMNS IN POSITIONS TABLE:');
  cols.rows.forEach(c => console.log(`- ${c.column_name} (${c.data_type})`));
  
  const res = await pool.query(`
    SELECT position_id, symbol, direction, quantity, entry_price, current_price, status, opened_at, close_reason
    FROM positions
    WHERE status = 'OPEN'
    ORDER BY opened_at ASC
  `);
  
  console.log('\nTOTAL OPEN IN POSITIONS TABLE (PORT 54329):', res.rows.length);
  res.rows.forEach((r, i) => {
    console.log(`[${i + 1}] ID: ${r.position_id} | ${r.symbol} ${r.direction} | Lots: ${r.quantity} | Entry: ${r.entry_price} | Opened: ${r.opened_at}`);
  });
  
  await pool.end();
}

describePositions().catch(console.error);
