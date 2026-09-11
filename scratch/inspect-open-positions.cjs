const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const openPos = await pool.query("SELECT * FROM positions WHERE status = 'OPEN'");
  console.log('=== 2 OPEN POSITIONS IN POSTGRESQL ===');
  console.log(JSON.stringify(openPos.rows, null, 2));
  await pool.end();
}

run().catch(console.error);
