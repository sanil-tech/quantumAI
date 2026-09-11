const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  console.log('=== FORENSIC DATABASE TABLE INVENTORY ===');

  const tables = ['positions', 'post_mortem_reviews', 'shadow_observations', 'learning_journal_events', 'manual_trades'];
  
  for (const t of tables) {
    try {
      const res = await pool.query(`SELECT count(*) FROM ${t}`);
      console.log(`Table '${t}': ${res.rows[0].count} rows`);
    } catch (err) {
      console.log(`Table '${t}': ERROR (${err.message})`);
    }
  }

  // Inspect shadow_observations
  try {
    const shadowStatus = await pool.query(`SELECT status, outcome, count(*) FROM shadow_observations GROUP BY status, outcome`);
    console.log('\n--- shadow_observations Breakdown ---');
    console.table(shadowStatus.rows);
  } catch (err) {
    console.log('shadow_observations error:', err.message);
  }

  // Inspect positions table
  try {
    const posRows = await pool.query(`SELECT position_id, symbol, status, direction, realized_profit FROM positions`);
    console.log('\n--- positions Table Breakdown ---');
    console.table(posRows.rows);
  } catch (err) {
    console.log('positions error:', err.message);
  }

  // Inspect post_mortem_reviews
  try {
    const pmRows = await pool.query(`SELECT id, trade_id, learning_version, created_at FROM post_mortem_reviews`);
    console.log('\n--- post_mortem_reviews Table ---');
    console.table(pmRows.rows);
  } catch (err) {
    console.log('post_mortem_reviews error:', err.message);
  }

  await pool.end();
}

check().catch(console.error);
