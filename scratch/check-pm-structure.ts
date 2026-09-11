import 'dotenv/config';
import { getDbPool } from '@iati/database';

async function checkPostMortemRows() {
  const pool = getDbPool();
  const res = await pool.query('SELECT * FROM post_mortem_reviews ORDER BY created_at DESC LIMIT 5');
  console.log('Sample post_mortem_reviews rows:');
  for (const row of res.rows) {
    console.log('\n--- Row ID:', row.id, 'Trade ID:', row.trade_id);
    console.log('review JSON keys:', typeof row.review === 'object' ? Object.keys(row.review) : typeof row.review);
    console.log('review content:', JSON.stringify(row.review, null, 2));
  }
  process.exit(0);
}

checkPostMortemRows().catch(e => {
  console.error(e);
  process.exit(1);
});
