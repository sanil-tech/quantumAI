import 'dotenv/config';
import { Pool } from 'pg';

async function inspectSchema() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'positions'
    ORDER BY ordinal_position
  `);
  console.log('COLUMNS IN POSITIONS TABLE:');
  console.table(res.rows);
  await pool.end();
}

inspectSchema().catch(e => console.error(e));
