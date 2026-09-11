import 'dotenv/config';
import { TradingRepository } from '@iati/database';

async function inspect() {
  const repo = new TradingRepository();
  const all = await repo.getPositions({ status: 'ALL' });
  const pos = all.positions.find((p: any) => p.positionId === 'pos_ctrader_demo_285026529' || p.ticketId === '285026529');
  console.log('=== POSTGRESQL POSITION RECORD ===');
  console.log(JSON.stringify(pos, null, 2));

  const events = await repo.getTradeEvents('pos_ctrader_demo_285026529');
  console.log('=== POSTGRESQL TRADE EVENTS ===');
  console.log(JSON.stringify(events, null, 2));

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
