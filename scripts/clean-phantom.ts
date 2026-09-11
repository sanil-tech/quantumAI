import 'dotenv/config';
import { TradingRepository } from '@iati/database';

async function main() {
  const repo = new TradingRepository();
  const del = await repo.query(`
    DELETE FROM positions 
    WHERE position_id LIKE 'bg_auto_%' 
       OR position_id LIKE 'trade_bg_auto_%' 
       OR ticket_id LIKE 'bg_auto_%'
  `);
  console.log('Deleted phantom bg_auto records:', del.rowCount);

  const remaining = await repo.query(`
    SELECT position_id, ticket_id, symbol, direction, entry_price, close_price, realized_profit, pnl_pips, status, close_reason, closed_at 
    FROM positions 
    ORDER BY closed_at DESC
  `);
  console.log('Remaining verified positions count:', remaining.rows.length);
  for (const r of remaining.rows) {
    console.log(`[${r.status}] Symbol: ${r.symbol}, Dir: ${r.direction}, Ticket: #${r.ticket_id}, Realized: $${r.realized_profit}, Reason: ${r.close_reason}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
