import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { ctraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';

async function testStateSync() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('Connecting to cTrader...');
  const broker = new CTraderAdapter({ accountId: '48282756' });
  await broker.connect();
  const liveBrokerPositions = await broker.getOpenPositions();
  console.log(`Live cTrader open positions: ${liveBrokerPositions.length}`);
  console.table(liveBrokerPositions.map(p => ({
    id: p.positionId,
    sym: p.symbol,
    side: p.tradeSide,
    entry: p.entryPrice
  })));

  const brokerTicketSet = new Set(liveBrokerPositions.map(p => String(p.positionId)));

  const dbOpenRes = await client.query(`SELECT position_id, ticket_id, symbol, direction, entry_price, quantity, status FROM positions WHERE status = 'OPEN'`);
  console.log(`\nDB currently has ${dbOpenRes.rows.length} OPEN positions:`);
  console.table(dbOpenRes.rows);

  for (const dbPos of dbOpenRes.rows) {
    const ticket = String(dbPos.ticket_id || dbPos.position_id.replace('trade_', ''));
    if (!brokerTicketSet.has(ticket)) {
      console.log(`\nReconciling closed trade: ${dbPos.position_id} (${dbPos.symbol}) - not found in broker open positions!`);
      const rawSym = (dbPos.symbol || 'EUR/USD').toUpperCase();
      const isFx = !rawSym.includes('XAU') && !rawSym.includes('BTC') && !rawSym.includes('NASDAQ');
      const isJpy = rawSym.includes('JPY');
      const pipFactor = isJpy ? 100 : isFx ? 10000 : 10;
      const liveTick = ctraderMarketDataFeedService.getLatestTick(dbPos.symbol as any);
      const livePrice = liveTick ? (dbPos.direction === 'BUY' ? liveTick.bid : liveTick.ask) : Number(dbPos.entry_price);
      const priceDiff = dbPos.direction === 'BUY' ? (livePrice - Number(dbPos.entry_price)) : (Number(dbPos.entry_price) - livePrice);
      const pnlPips = Number((priceDiff * pipFactor).toFixed(1));
      const pnlDollars = Number((pnlPips * 10 * Number(dbPos.quantity || 0.05)).toFixed(2));

      await client.query(`
        UPDATE positions
        SET status = 'CLOSED',
            close_price = $1,
            realized_profit = $2,
            pnl_pips = $3,
            close_reason = 'BROKER_SIDE_CLOSED',
            closed_at = NOW(),
            updated_at = NOW()
        WHERE position_id = $4
      `, [livePrice, pnlDollars, pnlPips, dbPos.position_id]);
      console.log(`✅ Closed ${dbPos.position_id} in DB!`);
    } else {
      console.log(`Maintaining OPEN trade: ${dbPos.position_id} (${dbPos.symbol}) - actively open on broker.`);
    }
  }

  const finalOpen = await client.query(`SELECT position_id, symbol, direction, entry_price, status FROM positions WHERE status = 'OPEN'`);
  console.log(`\nFinal DB OPEN positions (${finalOpen.rows.length}):`);
  console.table(finalOpen.rows);

  await client.end();
  process.exit(0);
}

testStateSync().catch(e => {
  console.error(e);
  process.exit(1);
});
