import 'dotenv/config';
import { TradingRepository } from '@iati/database';

async function testSearch() {
  const repo = new TradingRepository();
  const res = await repo.getAdminTrades({ search: '285026529' });
  console.log('Search Result Count:', res.total);
  console.log('Results:', JSON.stringify(res.trades.map((t: any) => ({
    id: t.positionId,
    ticket: t.ticketId,
    symbol: t.symbol,
    pnl: t.realizedProfit,
    pips: t.pnlPips,
    status: t.status
  })), null, 2));
  process.exit(0);
}

testSearch().catch(e => {
  console.error(e);
  process.exit(1);
});
