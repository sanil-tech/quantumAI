import 'dotenv/config';
import { Pool } from 'pg';

async function checkDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/quantumai'
  });
  const res = await pool.query("SELECT position_id, ticket_id, symbol, direction, quantity, entry_price, status FROM positions WHERE status = 'OPEN'");
  console.log(`DB Open Positions Count: ${res.rows.length}`);
  for (const r of res.rows) {
    console.log(`  id: ${r.position_id} | ticket: ${r.ticket_id} | ${r.symbol} | ${r.direction} | ${r.quantity} lots | status: ${r.status}`);
  }
  await pool.end();
}

checkDb().catch(console.error);
