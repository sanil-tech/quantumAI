import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/quantum_ai_db'
});

async function run() {
  const allRes = await pool.query(`
    SELECT 
      count(*) as total,
      count(case when ticket_id ~ '^[0-9]{7,10}$' OR position_id ~ '^trade_[0-9]{7,10}$' then 1 end) as authentic_ctrader,
      count(case when position_id LIKE 'pos_%' OR position_id LIKE '%mock%' OR ticket_id LIKE 'tkt_%' or ticket_id LIKE 'ctrader-pos-%' then 1 end) as synthetic_dev_trades
    FROM positions
    WHERE status = 'CLOSED';
  `);
  console.log('Breakdown of Closed Trades in DB:', allRes.rows[0]);

  const realStats = await pool.query(`
    SELECT 
      count(*) as count,
      count(case when realized_profit > 0 then 1 end) as wins,
      count(case when realized_profit < 0 then 1 end) as losses,
      sum(realized_profit) as net_pnl,
      sum(case when realized_profit > 0 then realized_profit else 0 end) as total_profit,
      sum(case when realized_profit < 0 then abs(realized_profit) else 0 end) as total_loss
    FROM positions 
    WHERE (ticket_id ~ '^[0-9]{7,10}$' OR position_id ~ '^trade_[0-9]{7,10}$') 
      AND status = 'CLOSED';
  `);
  console.log('Authentic cTrader Closed Trades Stats:', realStats.rows[0]);

  process.exit(0);
}

run().catch(console.error);
