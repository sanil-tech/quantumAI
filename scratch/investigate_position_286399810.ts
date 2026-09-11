import 'dotenv/config';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function run() {
  const c = new CTraderAdapter({ accountId: '48282756' });
  await c.connect();

  const openPos = await c.getOpenPositions();
  console.log("Live open positions on cTrader:");
  console.table(openPos);

  const pending = await c.getPendingOrders();
  console.log("Live pending orders on cTrader:");
  console.table(pending);

  process.exit(0);
}
run().catch(console.error);
