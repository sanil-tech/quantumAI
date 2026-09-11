import { getDbPool } from '@iati/database';

async function listPositions() {
  const pool = getDbPool();
  const res = await pool.query(`
    SELECT *
    FROM positions
    WHERE status = 'OPEN'
    ORDER BY created_at ASC
  `);
  
  console.log('TOTAL OPEN IN POSITIONS TABLE:', res.rows.length);
  res.rows.forEach((r, i) => {
    console.log(`[${i + 1}] ID: ${r.position_id || r.id} | Account: ${r.account_id} | Symbol: ${r.symbol} | Side: ${r.side} | Lots: ${r.volume_lots || r.volume} | Entry: ${r.entry_price} | Created: ${r.created_at || r.opened_at}`);
  });
  
  process.exit(0);
}

listPositions().catch(e => {
  console.error(e);
  process.exit(1);
});
