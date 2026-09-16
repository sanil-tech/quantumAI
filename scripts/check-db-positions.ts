import 'dotenv/config';
import { Pool } from 'pg';

async function checkDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`
    SELECT position_id, symbol, direction, quantity, entry_price, stop_loss, take_profit, take_profit_2, status 
    FROM positions 
    WHERE status = 'OPEN'
  `);
  console.log('OPEN POSITIONS IN DATABASE:');
  console.table(res.rows);
  await pool.end();
}

checkDb().catch(e => console.error(e));
