import 'dotenv/config';
import { TradingRepository, checkDbConnection } from '@iati/database';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function main() {
  console.log('=== 1. VERIFY BROKER REAL STATE ===');
  const adapter = new CTraderAdapter({
    environment: 'DEMO',
    host: process.env.CTRADER_HOST || 'demo.ctraderapi.com',
    port: Number(process.env.CTRADER_PORT) || 5035,
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
    accountId: process.env.CTRADER_ACCOUNT_ID,
    accessToken: process.env.CTRADER_ACCESS_TOKEN,
    timeoutMs: 15000
  });

  await adapter.connect();
  const reconcile = await adapter.reconcileState();
  const openPositions = reconcile?.positions || [];
  const targetPos = openPositions.find((p: any) => String(p.positionId) === '285026529');
  console.log(`Total open positions on cTrader DEMO account: ${openPositions.length}`);
  console.log(`Position 285026529 found in open positions list?: ${targetPos ? 'YES (STILL OPEN)' : 'NO (CLOSED)'}`);
  await adapter.disconnect();

  console.log('\n=== 2. VERIFY POSTGRESQL DATABASE STATE ===');
  const dbConnected = await checkDbConnection();
  console.log(`Database connected: ${dbConnected}`);
  const repo = new TradingRepository();

  const allDb = await repo.getPositions({ status: 'ALL' });
  console.log(`Total database positions: ${allDb.totalCount}`);
  for (const pos of allDb.positions) {
    console.log(`- Position ID: ${pos.positionId} | Ticket: ${pos.ticketId} | Broker Pos: ${pos.brokerPositionId} | Status: ${pos.status} | Entry: ${pos.entryPrice} | Close: ${pos.closePrice} | Realized PnL: ${pos.realizedProfit}`);
  }

  const openDb = await repo.getPositions({ status: 'OPEN' });
  const openMatching = openDb.positions.filter((p: any) => p.brokerPositionId === '285026529' || p.ticketId === '285026529');
  console.log(`Open DB positions matching 285026529: ${openMatching.length}`);

  console.log('\n=== 3. VERIFICATION SUMMARY ===');
  if (!targetPos && openMatching.length === 0) {
    console.log('RECONCILIATION RESULT: 100% MATCHED & CLOSED');
  } else {
    console.error('RECONCILIATION RESULT: DISCREPANCY DETECTED');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
