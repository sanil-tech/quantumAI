import dotenv from 'dotenv';
dotenv.config();

import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function fixTwoEurJpy() {
  const broker = new CTraderAdapter({ accountId: '48282756' });
  await broker.connect();

  console.log('Amending position 286356668...');
  const res1 = await broker.amendPositionSLTP('286356668', 183.250, 182.150);
  console.log('Result 1:', res1.success, res1.error || 'OK');

  console.log('Amending position 286356825...');
  const res2 = await broker.amendPositionSLTP('286356825', 183.250, 182.150);
  console.log('Result 2:', res2.success, res2.error || 'OK');

  const positions = await broker.getOpenPositions();
  console.log('\nUpdated cTrader positions:');
  console.table(positions.map(p => ({
    posId: p.positionId,
    sym: p.symbol,
    side: p.tradeSide,
    entry: p.entryPrice,
    sl: p.stopLoss,
    tp: p.takeProfit
  })));

  process.exit(0);
}

fixTwoEurJpy().catch(e => {
  console.error(e);
  process.exit(1);
});
