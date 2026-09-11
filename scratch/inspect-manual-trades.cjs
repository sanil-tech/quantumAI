const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'manual_trades'");
  console.log('Columns:', cols.rows.map(c => c.column_name).join(', '));
  
  const counts = await pool.query('SELECT status, count(*) FROM manual_trades GROUP BY status');
  console.log('Counts by status:', counts.rows);

  const sample = await pool.query('SELECT manual_trade_id, signal_id, symbol, direction, actual_entry, status, entered_at, created_at FROM manual_trades ORDER BY created_at DESC LIMIT 10');
  console.log('Sample rows:');
  console.table(sample.rows);

  // Check oldest and newest created_at
  const timeRange = await pool.query('SELECT min(created_at) as oldest, max(created_at) as newest FROM manual_trades');
  console.log('Time range of manual_trades in PostgreSQL:', timeRange.rows[0]);

  await pool.end();
}

run().catch(console.error);
