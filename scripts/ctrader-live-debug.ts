import 'dotenv/config';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { CTraderConfigValidator } from '../src/server/services/ctraderConfigValidator';

async function main() {
  const config = CTraderConfigValidator.validateDemoConfig();
  const adapter = new CTraderAdapter(config);
  console.log('CONNECTING TO LIVE cTrader OPEN API...');
  await adapter.connect();
  console.log('CONNECTED SUCCESSFULLY!');
  console.log('FETCHING TRADER DETAILS...');
  try {
    const traderData = await adapter.fetchTraderDetails();
    console.log('TRADER DATA:', JSON.stringify(traderData, null, 2));
  } catch (err: any) {
    console.error('TRADER ERROR:', err.message);
  }
  console.log('RECONCILING STATE...');
  try {
    const reconData = await adapter.reconcileState();
    console.log('RECON DATA:', JSON.stringify(reconData, null, 2));
  } catch (err: any) {
    console.error('RECON ERROR:', err.message);
  }
  console.log('FETCHING SYMBOLS...');
  try {
    const symbolsData = await adapter.fetchSymbols();
    console.log('SYMBOLS COUNT:', symbolsData?.symbols?.length);
  } catch (err: any) {
    console.error('SYMBOLS ERROR:', err.message);
  }
  await adapter.disconnect();
}

main().catch(err => console.error('MAIN CATCH:', err));
