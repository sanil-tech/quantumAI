import dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';

async function checkRow() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`SELECT * FROM positions WHERE position_id = 'trade_286357278'`);
  console.table(res.rows);
  await client.end();
  process.exit(0);
}
checkRow();
