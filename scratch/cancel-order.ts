import dotenv from 'dotenv';
dotenv.config();
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function cancelBuggy() {
  const adapter = new CTraderAdapter({ accountId: '48282756' });
  await adapter.connect();
  console.log('Cancelling buggy EURJPY order #316170515 (submitted at 159.637)...');
  const res = await adapter.cancelOrder('316170515');
  console.log('Cancel result:', res);
  process.exit(0);
}

cancelBuggy().catch(console.error);
