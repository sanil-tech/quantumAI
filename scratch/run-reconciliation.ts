import 'dotenv/config';
import { brokerReconciliationService } from '../apps/execution-router/src/services/brokerReconciliationService';
import { ctraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';

async function runReconcile() {
  await ctraderMarketDataFeedService.startFeed();
  await new Promise(r => setTimeout(r, 2000));
  const report = await brokerReconciliationService.reconcile('48282756');
  console.log('Reconciliation Report Summary:');
  console.log(`  Total Broker Positions: ${report.totalBrokerPositions}`);
  console.log(`  Total DB Positions: ${report.totalDatabasePositions}`);
  console.log(`  Matched: ${report.matchedPositions}`);
  console.log(`  Broker Only (Added): ${report.brokerOnlyPositions}`);
  console.log(`  DB Only (Closed): ${report.databaseOnlyPositions}`);
  console.log(`  Diverged: ${report.divergedPositions}`);
  for (const res of report.results) {
    console.log(`  [${res.status}] ${res.symbol} | brokerId: ${res.brokerPositionId} | dbId: ${res.databasePositionId}`);
  }
  process.exit(0);
}

runReconcile().catch(console.error);
