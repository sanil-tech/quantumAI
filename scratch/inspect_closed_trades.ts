import 'dotenv/config';
import { TradingRepository } from '../packages/database/src/repository.ts';

async function main() {
  const repo = new TradingRepository();
  const res = await repo.query(`
    SELECT position_id, account_id, symbol, direction, entry_price, close_price, realized_profit, pnl_pips, status, opened_at, closed_at 
    FROM positions 
    WHERE status = 'CLOSED' 
    ORDER BY closed_at DESC 
    LIMIT 20
  `);

  console.log('=== CLOSED POSITIONS IN DATABASE ===');
  console.table(res.rows.map((r: any) => ({
    id: r.id,
    posId: r.position_id,
    account: r.account_id,
    symbol: r.symbol,
    dir: r.direction,
    entry: r.entry_price,
    closePrice: r.close_price,
    pnlDollars: r.realized_profit,
    pnlPips: r.pnl_pips,
    closedAt: r.closed_at
  })));

  process.exit(0);
}

main().catch(console.error);
