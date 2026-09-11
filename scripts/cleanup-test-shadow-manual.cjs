const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function cleanup() {
  console.log('=== CLEANING UP TEST SHADOW & MANUAL TRADE ENTRIES ===');
  
  // 1. Check before counts
  const beforeManual = await pool.query('SELECT count(*) FROM manual_trades');
  const beforeShadow = await pool.query('SELECT count(*) FROM shadow_observations');
  const beforeJournal = await pool.query('SELECT count(*) FROM learning_journal_events');
  const beforePositions = await pool.query('SELECT count(*) FROM positions');
  const beforeReviews = await pool.query('SELECT count(*) FROM post_mortem_reviews');

  console.log(`BEFORE -> manual_trades: ${beforeManual.rows[0].count}, shadow_observations: ${beforeShadow.rows[0].count}, journal: ${beforeJournal.rows[0].count}`);
  console.log(`PRESERVED -> positions: ${beforePositions.rows[0].count}, post_mortem_reviews: ${beforeReviews.rows[0].count}`);

  // 2. Safely truncate test tables
  await pool.query('TRUNCATE TABLE manual_trade_alerts, manual_trades CASCADE');
  await pool.query('TRUNCATE TABLE shadow_observations, learning_journal_events CASCADE');

  // 3. Check after counts
  const afterManual = await pool.query('SELECT count(*) FROM manual_trades');
  const afterShadow = await pool.query('SELECT count(*) FROM shadow_observations');
  const afterPositions = await pool.query('SELECT count(*) FROM positions');
  const afterReviews = await pool.query('SELECT count(*) FROM post_mortem_reviews');

  console.log('\nAFTER CLEANUP:');
  console.log(`manual_trades: ${afterManual.rows[0].count} (Cleaned)`);
  console.log(`shadow_observations: ${afterShadow.rows[0].count} (Cleaned)`);
  console.log(`positions: ${afterPositions.rows[0].count} (Canonical Positions Preserved)`);
  console.log(`post_mortem_reviews: ${afterReviews.rows[0].count} (Authoritative Learning Preserved)`);

  await pool.end();
  console.log('\n✅ Test shadow and manual trade cleanup complete.');
}

cleanup().catch(err => {
  console.error('Cleanup error:', err);
  process.exit(1);
});
