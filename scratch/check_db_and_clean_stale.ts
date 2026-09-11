import dotenv from 'dotenv';
dotenv.config();

import { TradingRepository } from '@iati/database';

async function checkDb() {
  const repo = new TradingRepository();
  console.log('Checking database positions...');
  const positions = await repo.query(`SELECT id, position_id, symbol, direction, status, lot_size, entry_price, current_price, created_at, updated_at FROM positions`);
  console.log(`Total positions in DB: ${positions.rows.length}`);
  for (const row of positions.rows) {
    console.log(`- ID: ${row.id} | PosID: ${row.position_id} | Symbol: ${row.symbol} | Dir: ${row.direction} | Status: ${row.status} | Lots: ${row.lot_size} | Entry: ${row.entry_price} | Created: ${row.created_at}`);
  }

  const openPositions = await repo.query(`SELECT * FROM positions WHERE status = 'OPEN'`);
  console.log(`\nOpen positions in DB: ${openPositions.rows.length}`);
  for (const row of openPositions.rows) {
    console.log(`  * [OPEN] ${row.symbol} ${row.direction} | ID: ${row.position_id || row.id}`);
  }

  process.exit(0);
}

checkDb().catch(console.error);
