import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function checkLiveBroker() {
  const adapter = new CTraderAdapter({ accountId: '48282756' });
  await adapter.connect();
  const positions = await adapter.getPositions();
  console.log(`Live Broker Position Count: ${positions.length}`);
  for (const p of positions) {
    console.log(`  Ticket: ${p.ticketId} | Sym: ${p.symbol} | Dir: ${p.direction} | Lots: ${p.volumeLots} | Entry: ${p.entryPrice} | SL: ${p.stopLoss} | TP: ${p.takeProfit}`);
  }
  process.exit(0);
}

checkLiveBroker().catch(console.error);
