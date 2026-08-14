import 'dotenv/config';
import { CTraderConfigValidator } from '../src/server/services/ctraderConfigValidator';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function runDemoConnectivityCheck() {
  console.log('====================================================');
  console.log('QuantumAI Phase 3B — Real cTrader DEMO Connectivity Check');
  console.log('====================================================\n');

  try {
    const config = CTraderConfigValidator.validateDemoConfig();
    console.log(`[CONFIG] EXECUTION_ENVIRONMENT: ${config.environment}`);
    console.log(`[CONFIG] Target Broker: ctrader-broker-01`);
    console.log(`[CONFIG] Account ID: ${config.accountId}`);
    console.log(`[CONFIG] Host: ${config.host}:${config.port}\n`);

    console.log('[CONNECT] Attempting connection to cTrader Open API...');
    const adapter = new CTraderAdapter(config);
    await adapter.connect();

    console.log('[CONNECT] Successfully authenticated and connected.');
    const accountStatus = await adapter.getAccountStatus();
    const sanitized = CTraderConfigValidator.sanitizeAccountStatus('CONNECTED', accountStatus);

    console.log('\n====================================================');
    console.log('REAL CTRADER DEMO CONNECTIVITY RESULT: CONNECTED');
    console.log('====================================================');
    console.log(JSON.stringify(sanitized, null, 2));
    console.log('\nNOTE: This script performs connectivity validation ONLY. No trade was placed.');
    process.exit(0);
  } catch (err: any) {
    console.error('\n====================================================');
    console.error('REAL CTRADER DEMO CONNECTIVITY RESULT: FAILED');
    console.error('====================================================');
    console.error(`Error Code: ${err.message}`);
    console.error('\nEnsure CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_ACCOUNT_ID, CTRADER_ACCESS_TOKEN are configured in .env');
    process.exit(1);
  }
}

runDemoConnectivityCheck();
