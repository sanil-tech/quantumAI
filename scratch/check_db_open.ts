import 'dotenv/config';
import { TradingRepository } from '@iati/database';

async function checkOpen() {
  const repo = new TradingRepository();
  const res = await repo.query("SELECT position_id, ticket_id, symbol, quantity, entry_price, status, opened_at FROM positions WHERE status = 'OPEN' ORDER BY opened_at DESC");
  console.log('Current DB OPEN positions count:', res.rows.length);
  res.rows.forEach(r => {
    console.log(`- ID: ${r.position_id} | Ticket: ${r.ticket_id} | Pair: ${r.symbol} | Lots: ${r.quantity} | Entry: ${r.entry_price}`);
  });
}

checkOpen().catch(console.error);
