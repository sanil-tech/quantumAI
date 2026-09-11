import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function checkDbPositions() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT position_id, symbol, direction, entry_price, stop_loss, take_profit, status, opened_at
    FROM positions
    WHERE status = 'OPEN'
    ORDER BY opened_at DESC
  `);

  console.log(`Found ${res.rows.length} positions:`);
  console.table(res.rows);

  await client.end();
}

checkDbPositions().catch(console.error);
