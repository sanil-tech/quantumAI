import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function queryTables() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('--- POSITIONS ---');
  const pos = await client.query('SELECT * FROM positions');
  console.log(`Positions count: ${pos.rows.length}`);
  for (const r of pos.rows) {
    console.log(`- ${r.symbol} | side: ${r.direction} | status: ${r.status} | pos_id: ${r.position_id} | lot: ${r.lot_size} | entry: ${r.entry_price}`);
  }

  console.log('\n--- ORDERS ---');
  const ord = await client.query('SELECT * FROM orders ORDER BY id DESC LIMIT 10');
  console.log(`Orders count (last 10): ${ord.rows.length}`);
  for (const r of ord.rows) {
    console.log(`- Order #${r.order_id || r.id} | ${r.symbol} | side: ${r.direction} | status: ${r.status} | price: ${r.price}`);
  }

  console.log('\n--- ADAPTIVE LEARNING / POST MORTEMS ---');
  try {
    const pms = await client.query('SELECT * FROM post_mortems LIMIT 10');
    console.log(`Post mortems count: ${pms.rows.length}`);
    for (const r of pms.rows) {
      console.log(`- [${r.id}] ${r.pair} ${r.outcome} | Root cause: ${r.root_cause_en}`);
    }
  } catch (e: any) {
    console.log('No post_mortems table:', e.message);
  }

  await client.end();
  process.exit(0);
}

queryTables().catch(console.error);
