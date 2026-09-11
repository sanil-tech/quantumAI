import dotenv from 'dotenv';
dotenv.config();

import { brokerReconciliationService } from '../apps/execution-router/src/services/brokerReconciliationService';
import { Client } from 'pg';

async function runLiveReconcile() {
  console.log('=== RUNNING LIVE RECONCILIATION WITH CTRADER ===');
  const report = await brokerReconciliationService.reconcile('48282756');
  console.log('Report result:', {
    totalBrokerPositions: report.totalBrokerPositions,
    totalDatabasePositions: report.totalDatabasePositions,
    matchedCount: report.matchedCount,
    brokerOnlyCount: report.brokerOnlyCount,
    databaseOnlyCount: report.databaseOnlyCount,
    results: (report.results || []).map(d => ({
      symbol: d.symbol,
      status: d.status,
      reason: d.details?.discrepancyReason
    }))
  });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const openRes = await client.query(`SELECT position_id, symbol, direction, entry_price, status FROM positions WHERE status = 'OPEN'`);
  console.log(`\nRemaining Database OPEN positions (${openRes.rows.length}):`);
  console.table(openRes.rows);

  const closedRes = await client.query(`SELECT position_id, symbol, direction, entry_price, close_price, realized_profit, pnl_pips, close_reason FROM positions WHERE status = 'CLOSED' ORDER BY closed_at DESC LIMIT 5`);
  console.log(`\nLatest Database CLOSED positions:`);
  console.table(closedRes.rows);

  await client.end();
  process.exit(0);
}

runLiveReconcile().catch(e => {
  console.error(e);
  process.exit(1);
});
