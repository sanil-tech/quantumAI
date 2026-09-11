import dotenv from 'dotenv';
dotenv.config();
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { TradingRepository } from '../packages/database/src/repository';

async function reconcile() {
  const adapter = new CTraderAdapter({ accountId: '48282756' });
  await adapter.connect();

  console.log('--- FETCHING LIVE CTRADER BROKER POSITIONS ---');
  const brokerPositions = await adapter.getPositions();
  console.log(`Live Broker Open Positions Count: ${brokerPositions.length}`);
  const brokerPosMap = new Map<number, any>();
  for (const bp of brokerPositions) {
    const pid = Number(bp.positionId || bp.id || bp.ticketId);
    brokerPosMap.set(pid, bp);
    console.log(`  [cTrader LIVE] Pos #${pid} | ${bp.symbol} | ${bp.direction || bp.tradeSide} | Entry: ${bp.entryPrice || bp.price}`);
  }

  console.log('\n--- FETCHING DATABASE OPEN POSITIONS ---');
  const repo = new TradingRepository();
  const dbPositions = await repo.getOpenPositions('48282756');
  console.log(`Database Open Positions Count: ${dbPositions.length}`);
  
  const phantomPositions: any[] = [];
  for (const dbp of dbPositions) {
    const pid = Number(dbp.ticketId || dbp.positionId || dbp.brokerPositionId);
    const onBroker = brokerPosMap.has(pid);
    console.log(`  [Database] Pos #${pid} (ID: ${dbp.positionId}) | ${dbp.symbol} | Status: ${dbp.status} | On Broker: ${onBroker ? 'YES' : 'NO (PHANTOM)'}`);
    if (!onBroker) {
      phantomPositions.push(dbp);
    }
  }

  console.log(`\nFound ${phantomPositions.length} phantom positions in database (closed on cTrader but open in DB):`);
  for (const p of phantomPositions) {
    console.log(`  -> Closing phantom position #${p.ticketId || p.positionId} (${p.symbol}) in DB...`);
    await repo.query(
      `UPDATE positions SET status = 'CLOSED', closed_at = NOW(), close_reason = 'BROKER_RECONCILED' WHERE position_id = $1 OR ticket_id = $1`,
      [p.positionId]
    ).catch(console.error);
  }

  console.log('\nReconciliation complete!');
  process.exit(0);
}

reconcile().catch(console.error);
