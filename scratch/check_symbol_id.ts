import dotenv from 'dotenv';
dotenv.config();

import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function checkSymbolId() {
  const broker = new CTraderAdapter({ accountId: '48282756' });
  await broker.connect();
  const positions = await broker.getOpenPositions();
  console.log('Open positions detail:');
  console.table(positions.map(p => ({
    id: p.positionId,
    symId: p.symbolId,
    symName: p.symbol,
    side: p.tradeSide,
    entry: p.entryPrice,
    sl: p.stopLoss,
    tp: p.takeProfit
  })));
  process.exit(0);
}

checkSymbolId();
