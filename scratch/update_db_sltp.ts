import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function updateDbSlTp() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    UPDATE positions
    SET stop_loss = 183.250, take_profit = 182.150, updated_at = NOW()
    WHERE symbol IN ('EUR/JPY', 'EURJPY') AND status = 'OPEN'
  `);

  console.log('✅ Successfully updated all open EUR/JPY positions to SL: 183.250, TP: 182.150 in PostgreSQL!');
  await client.end();
  process.exit(0);
}

updateDbSlTp();
