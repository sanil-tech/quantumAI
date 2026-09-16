import 'dotenv/config';
import { Pool } from 'pg';

async function syncTruthSource() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Update EUR/USD position with exact truth source from live broker:
  // Volume: 0.01 (after 50% scale-out)
  // Entry: 1.15462
  // StopLoss: 1.15462 (Break-Even)
  // TakeProfit1: 1.15012 (TP1)
  // TakeProfit2: 1.14562 (TP2 Runner)
  await pool.query(`
    UPDATE positions
    SET
      quantity = 0.01,
      stop_loss = 1.15462,
      take_profit = 1.15012,
      take_profit_2 = 1.14562,
      updated_at = NOW()
    WHERE position_id = 'trade_288564090' OR ticket_id = '288564090'
  `);

  const res = await pool.query(`
    SELECT position_id, symbol, direction, quantity, entry_price, stop_loss, take_profit, take_profit_2, status 
    FROM positions 
    WHERE status = 'OPEN'
    ORDER BY position_id
  `);

  console.log('SYNCED OPEN POSITIONS TRUTH SOURCE:');
  console.table(res.rows);

  await pool.end();
}

syncTruthSource().catch(e => console.error(e));
