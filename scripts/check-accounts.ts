import 'dotenv/config';
import { Pool } from 'pg';

async function checkAccounts() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  console.log('TABLES IN DB:\n', tables.rows.map(r => r.table_name).join(', '));
  
  if (tables.rows.some(r => r.table_name === 'accounts')) {
    const accs = await pool.query('SELECT * FROM accounts');
    console.log('\nACCOUNTS IN DB:');
    console.table(accs.rows);
  }

  if (tables.rows.some(r => r.table_name === 'subscribers')) {
    const subs = await pool.query('SELECT * FROM subscribers');
    console.log('\nSUBSCRIBERS IN DB:');
    console.table(subs.rows);
  }

  await pool.end();
}

checkAccounts().catch(e => console.error(e));
