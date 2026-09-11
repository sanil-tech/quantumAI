import dotenv from 'dotenv';
dotenv.config();

import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function fixTrade286357278() {
  const broker = new CTraderAdapter({ accountId: '48282756' });
  await broker.connect();

  console.log('Amending position 286357278...');
  const res = await broker.amendPositionSLTP('286357278', 183.250, 182.150);
  console.log('Result:', res);

  const positions = await broker.getOpenPositions();
  console.log('\nFinal Open positions on cTrader:');
  console.table(positions.map(p => ({
    id: p.positionId,
    sym: p.symbol,
    side: p.tradeSide,
    entry: p.entryPrice,
    sl: p.stopLoss,
    tp: p.takeProfit
  })));

  process.exit(0);
}

fixTrade286357278().catch(e => {
  console.error(e);
  process.exit(1);
});
