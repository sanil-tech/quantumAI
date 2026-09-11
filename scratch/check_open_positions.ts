import { getDbPool } from '@iati/database';

async function check() {
  const pool = getDbPool();
  const res = await pool.query(`
    SELECT id, account_id, symbol, side, entry_price, current_price, stop_loss, take_profit, status, opened_at, closed_at, broker_position_id, metadata
    FROM trading_positions 
    WHERE status = 'OPEN'
    ORDER BY opened_at ASC
  `);
  
  console.log('TOTAL OPEN POSITIONS IN DB:', res.rows.length);
  res.rows.forEach((r, i) => {
    console.log(`[${i + 1}] ID: ${r.id} | ${r.symbol} ${r.side} | Entry: ${r.entry_price} | SL: ${r.stop_loss} | TP: ${r.take_profit} | Opened: ${r.opened_at} | BrokerID: ${r.broker_position_id}`);
  });
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
