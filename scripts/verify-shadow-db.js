require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/iati_trading',
    connectionTimeoutMillis: 2000
  });

  try {
    const obsRes = await pool.query('SELECT id, symbol, direction, entry_price, stop_loss, status, close_reason, realized_r FROM shadow_observations ORDER BY created_at DESC LIMIT 10');
    console.log('=== SHADOW OBSERVATIONS IN POSTGRESQL ===');
    console.table(obsRes.rows);

    const jRes = await pool.query('SELECT id, event_type, setup_fingerprint, outcome, realized_r, reason FROM learning_journal_events ORDER BY created_at DESC LIMIT 10');
    console.log('=== LEARNING JOURNAL EVENTS IN POSTGRESQL ===');
    console.table(jRes.rows);

    const posCount = await pool.query('SELECT COUNT(*) FROM positions');
    console.log('POSITIONS COUNT (Broker):', posCount.rows[0].count);

    const manualCount = await pool.query('SELECT COUNT(*) FROM manual_trades');
    console.log('MANUAL TRADES COUNT:', manualCount.rows[0].count);

    const shadowInPositions = await pool.query("SELECT COUNT(*) FROM positions WHERE position_id LIKE 'shadow-%'");
    console.log('SHADOW RECORDS IN POSITIONS TABLE:', shadowInPositions.rows[0].count);

    const shadowInManual = await pool.query("SELECT COUNT(*) FROM manual_trades WHERE manual_trade_id LIKE 'shadow-%'");
    console.log('SHADOW RECORDS IN MANUAL_TRADES TABLE:', shadowInManual.rows[0].count);
  } catch (err) {
    console.error('Error querying database:', err.message);
  } finally {
    await pool.end();
  }
}

main();
