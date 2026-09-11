import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function testPg() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 1500
  });

  try {
    console.log('Connecting to PG at:', process.env.DATABASE_URL);
    await client.connect();
    console.log('PG CONNECTED SUCCESSFULLY!');
    const res = await client.query('SELECT NOW()');
    console.log('PG Time:', res.rows[0]);
    await client.end();
  } catch (err: any) {
    console.log('PG Connection Error (Postgres container is likely not running):', err.message);
  }
  process.exit(0);
}

testPg().catch(console.error);
