import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function inspectEurJpy() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('=== INSPECTING RECENT ORDERS ===');
  const res = await client.query(`SELECT * FROM orders WHERE symbol ILIKE '%EURJPY%' OR symbol ILIKE '%JPY%' ORDER BY created_at DESC LIMIT 10`);
  for (const r of res.rows) {
    console.log(JSON.stringify(r, null, 2));
  }

  console.log('\n=== INSPECTING RECENT POSITIONS ===');
  const pos = await client.query(`SELECT * FROM positions WHERE symbol ILIKE '%EURJPY%' OR symbol ILIKE '%JPY%' ORDER BY created_at DESC LIMIT 10`);
  for (const p of pos.rows) {
    console.log(JSON.stringify(p, null, 2));
  }

  await client.end();
  process.exit(0);
}

inspectEurJpy().catch(console.error);
