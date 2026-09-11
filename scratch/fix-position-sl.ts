import dotenv from 'dotenv';
dotenv.config();
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function fixPosition() {
  const adapter = new CTraderAdapter({ accountId: '48282756' });
  await adapter.connect();

  console.log('Amending Gold position #285909909 (Entry: 4456.70, Dir: SELL)...');
  const amendPayload = {
    ctidTraderAccountId: 48282756,
    positionId: 285909909,
    stopLoss: 4476.70,   // $20 above entry (4456.70 + 20)
    takeProfit: 4416.70  // $40 below entry (4456.70 - 40)
  };

  const res = await (adapter as any).transport.sendRequest(2110, amendPayload, 10000);
  console.log('Position #285909909 amended response:', res);
  process.exit(0);
}

fixPosition().catch(console.error);
