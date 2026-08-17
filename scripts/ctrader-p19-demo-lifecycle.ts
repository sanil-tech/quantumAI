import 'dotenv/config';
import { CTraderDemoLifecycleHarness, P19HarnessConfig } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';

async function main() {
  console.log('======================================================================');
  console.log(' QUANTUMAI P19');
  console.log(' CONTROLLED DEMO EXECUTION');
  console.log(' NOT LIVE');
  console.log(' MAXIMUM ORDERS: 1');
  console.log(' NO AUTOMATIC RETRY');
  console.log('======================================================================\n');

  const environment = process.env.EXECUTION_ENVIRONMENT || 'DEMO';
  const confirmDemoExecution = process.env.DEMO_CONFIRM_EXECUTION === 'true';

  const rawHost = process.env.CTRADER_HOST !== undefined ? process.env.CTRADER_HOST : 'demo.ctraderapi.com';
  const rawPort = process.env.CTRADER_PORT !== undefined ? (isNaN(Number(process.env.CTRADER_PORT)) ? NaN : Number(process.env.CTRADER_PORT)) : 5035;

  const config: P19HarnessConfig = {
    environment,
    confirmDemoExecution,
    clientId: (process.env.CTRADER_CLIENT_ID || '').trim(),
    clientSecret: (process.env.CTRADER_CLIENT_SECRET || '').trim(),
    accountId: (process.env.CTRADER_ACCOUNT_ID || '').trim(),
    accessToken: (process.env.CTRADER_ACCESS_TOKEN || '').trim(),
    host: rawHost,
    port: rawPort,
    symbol: process.env.P19_TEST_SYMBOL || 'EURUSD',
    side: 'BUY',
    lots: process.env.P19_TEST_LOTS !== undefined ? Number(process.env.P19_TEST_LOTS) : 0.01,
    timeoutMs: 12000
  };

  console.log('PRE-FLIGHT CONFIGURATION SUMMARY:');
  console.log(`- Environment:          ${config.environment}`);
  console.log(`- Broker Host:          ${config.host}:${config.port}`);
  console.log(`- Account ID:           ${CTraderDemoLifecycleHarness.redactAccountId(config.accountId)}`);
  console.log(`- Target Symbol:        ${config.symbol}`);
  console.log(`- Target Order Lots:    ${config.lots}`);
  console.log(`- Order Side:           ${config.side}`);
  console.log(`- Explicit Confirmation:${config.confirmDemoExecution ? ' [CONFIRMED]' : ' [MISSING / UNCONFIRMED]'}\n`);

  if (config.environment !== 'DEMO' || !config.confirmDemoExecution) {
    console.error('SAFETY ABORT: P19 Execution refused. Must set EXECUTION_ENVIRONMENT=DEMO and DEMO_CONFIRM_EXECUTION=true.');
    process.exit(1);
  }

  console.log('Starting Controlled Single-Order DEMO Lifecycle Harness...\n');

  const evidence = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(config);

  console.log('\n======================================================================');
  console.log(` P19 LIFECYCLE RESULT: ${evidence.finalLifecycleStatus}`);
  console.log('======================================================================');
  console.log(`- Test ID:               ${evidence.testId}`);
  console.log(`- Symbol ID:             ${evidence.symbolId}`);
  console.log(`- Normalized Volume:     ${evidence.normalizedVolumeCents} cents (${evidence.normalizationResult?.normalizedLots} lots)`);
  console.log(`- Client Order ID:       ${evidence.clientOrderId}`);
  console.log(`- Broker Order ID:       ${evidence.brokerOrderId || 'N/A'}`);
  console.log(`- Broker Deal ID:        ${evidence.brokerDealId || 'N/A'}`);
  console.log(`- Broker Position ID:    ${evidence.brokerPositionId || 'N/A'}`);
  console.log(`- Open Positions Count:  ${evidence.reconciliationResult?.openPositionsCount ?? 'N/A'}`);
  console.log(`- Position Closed State: ${evidence.closeReconciliationResult?.positionClosed ? 'VERIFIED_CLOSED' : 'UNVERIFIED'}`);

  if (evidence.errorMessage) {
    console.error(`\nError / Diagnostic: ${evidence.errorMessage}`);
  }

  console.log(`\nMachine-Readable Evidence Saved: artifacts/ctrader/P19-demo-lifecycle-evidence.json\n`);

  if (evidence.finalLifecycleStatus === 'DEMO_LIFECYCLE_CONFIRMED') {
    console.log('TASK 8B-P19 DEMO LIFECYCLE COMPLETE & VERIFIED.');
    process.exit(0);
  } else {
    console.error(`TASK 8B-P19 LIFECYCLE FAILED: ${evidence.finalLifecycleStatus}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[UNHANDLED_HARNESS_EXCEPTION]', err);
  process.exit(1);
});
