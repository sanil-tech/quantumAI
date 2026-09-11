import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { brokerReconciliationService } from '../apps/execution-router/src/services/brokerReconciliationService';

async function checkSync() {
  console.log('=== 1. CHECKING DIRECT CTRADER POSITIONS ===');
  const ctrader = new CTraderAdapter({
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
    accessToken: process.env.CTRADER_ACCESS_TOKEN,
    accountId: process.env.CTRADER_ACCOUNT_ID || '48282756'
  });

  await ctrader.connect();
  const brokerPositions = await ctrader.getOpenPositions();
  console.log(`cTrader Live Open Positions count: ${brokerPositions.length}`);
  console.table(brokerPositions.map(p => ({
    PosId: p.positionId,
    Symbol: p.symbol,
    Side: p.tradeSide,
    Entry: p.entryPrice,
    SL: p.stopLoss,
    TP: p.takeProfit
  })));

  console.log('\n=== 2. RUNNING RECONCILIATION ===');
  const reconResult = await brokerReconciliationService.reconcile(process.env.CTRADER_ACCOUNT_ID || '48282756');
  console.log('Reconciliation result summary:', {
    brokerPositionsCount: reconResult.brokerPositionsCount,
    databasePositionsCount: reconResult.databasePositionsCount,
    matchedCount: reconResult.matchedCount,
    discrepanciesCount: reconResult.discrepancies.length,
    autoReconciledCount: reconResult.autoReconciledCount
  });

  console.log('\n=== 3. CHECKING POSTGRESQL DATABASE POSITIONS (status = OPEN) ===');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const dbRes = await client.query(`
    SELECT position_id, symbol, direction, entry_price, stop_loss, take_profit, status, opened_at
    FROM positions
    WHERE status = 'OPEN'
    ORDER BY opened_at DESC
  `);
  console.log(`DB Open Positions count: ${dbRes.rows.length}`);
  console.table(dbRes.rows);

  await client.end();
}

checkSync().catch(console.error);
