import dotenv from 'dotenv';
dotenv.config();

import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { Client } from 'pg';

async function fixPosition286376071() {
  console.log('Amending position #286376071 on cTrader...');
  const ctrader = new CTraderAdapter({ accountId: '48282756' });
  await ctrader.connect();

  // Position #286376071: EURJPY SELL Entry: 182.433
  // SL: 182.783 (+35 pips)
  // TP: 181.733 (-70 pips)
  const success = await ctrader.amendPositionSLTP('286376071', 182.783, 181.733);
  console.log(`Amend result on cTrader: ${success}`);

  // Update DB positions table as well
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`
    UPDATE positions 
    SET stop_loss = 182.783, take_profit = 181.733, updated_at = NOW()
    WHERE position_id = 'trade_286376071' OR ticket_id = '286376071' OR (symbol IN ('EUR/JPY', 'EURJPY') AND status = 'OPEN')
  `);
  console.log('✅ PostgreSQL position record updated with SL: 182.783, TP: 181.733');
  await client.end();

  const finalPositions = await ctrader.getOpenPositions();
  console.log('Final open positions on cTrader:');
  console.table(finalPositions.map(p => ({
    id: p.positionId,
    sym: p.symbol,
    side: p.tradeSide,
    entry: p.entryPrice,
    sl: p.stopLoss,
    tp: p.takeProfit
  })));

  process.exit(0);
}

fixPosition286376071().catch(e => {
  console.error(e);
  process.exit(1);
});
