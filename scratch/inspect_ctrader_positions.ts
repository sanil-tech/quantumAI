import dotenv from 'dotenv';
dotenv.config();

import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function inspectPositions() {
  const broker = new CTraderAdapter({ accountId: '48282756' });
  await broker.connect();
  const positions = await broker.getOpenPositions();
  console.log('=== REAL CTRADER POSITIONS VIA OPEN API ===');
  console.table(positions.map(p => ({
    posId: p.positionId,
    sym: p.symbol,
    side: p.tradeSide,
    vol: p.volume,
    entry: p.entryPrice,
    sl: p.stopLoss,
    tp: p.takeProfit,
    curr: p.currentPrice
  })));
  process.exit(0);
}

inspectPositions().catch(e => {
  console.error(e);
  process.exit(1);
});
