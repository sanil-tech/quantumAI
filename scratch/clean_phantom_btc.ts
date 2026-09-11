import 'dotenv/config';
import { TradingRepository } from '../packages/database/src/repository';

async function main() {
  const repo = new TradingRepository();
  // Delete phantom closed BTC record that was prematurely marked closed
  const deleted = await repo.query(`
    DELETE FROM positions 
    WHERE status = 'CLOSED' 
      AND symbol LIKE '%BTC%' 
      AND (close_price = 79237.70120 OR position_id LIKE '%txttg%' OR ticket_id IS NULL OR ticket_id = '')
  `);
  console.log('Deleted phantom closed BTC records:', deleted.rowCount);

  const closed = await repo.query(`
    SELECT position_id, ticket_id, symbol, direction, entry_price, close_price, realized_profit, close_reason 
    FROM positions 
    WHERE status = 'CLOSED'
  `);
  console.log('Verified closed positions in DB:', JSON.stringify(closed.rows, null, 2));

  const open = await repo.query(`
    SELECT position_id, ticket_id, symbol, direction, entry_price, status 
    FROM positions 
    WHERE status = 'OPEN'
  `);
  console.log('Verified open positions in DB:', JSON.stringify(open.rows, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
