import 'dotenv/config';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter.ts';

async function main() {
  const ctrader = new CTraderAdapter({ accountId: '48282756' });
  await ctrader.connect();

  console.log('=== OPEN POSITIONS ON CTRADER ===');
  const pos = await ctrader.getOpenPositions();
  console.log(`Total Open Positions: ${pos.length}`);
  console.table(pos.map(p => ({
    posId: p.positionId,
    symbol: p.symbol,
    side: p.tradeSide,
    entry: p.entryPrice,
    sl: p.stopLoss,
    tp: p.takeProfit,
    volume: p.volume,
    comment: p.comment
  })));

  console.log('=== PENDING ORDERS ON CTRADER ===');
  const pending = await ctrader.getPendingOrders();
  console.log(`Total Pending Orders: ${pending.length}`);
  console.table(pending.map(o => ({
    orderId: o.orderId,
    symbol: o.symbol,
    orderType: o.orderType,
    side: o.tradeSide,
    limitPrice: o.limitPrice,
    sl: o.stopLoss,
    tp: o.takeProfit,
    volume: o.volume,
    comment: o.comment
  })));

  process.exit(0);
}

main().catch(console.error);
