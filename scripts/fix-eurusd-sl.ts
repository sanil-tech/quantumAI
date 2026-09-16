import 'dotenv/config';
import { Pool } from 'pg';

async function fix() {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await p.query(`
    UPDATE positions 
    SET stop_loss = 1.15462, updated_at = NOW() 
    WHERE position_id = 'trade_288564090' 
    RETURNING position_id, symbol, stop_loss, take_profit, take_profit_2;
  `);
  console.log('Result:', res.rows[0]);
  await p.end();
}

fix();
