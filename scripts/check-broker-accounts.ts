import 'dotenv/config';
import { Pool } from 'pg';

async function checkBrokerAccounts() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bAcc = await pool.query('SELECT * FROM broker_accounts');
  console.log('BROKER ACCOUNTS:');
  console.table(bAcc.rows);

  const br = await pool.query('SELECT * FROM brokers');
  console.log('BROKERS:');
  console.table(br.rows);

  const accState = await pool.query('SELECT account_id, balance, equity, margin_level, environment FROM account_state');
  console.log('ACCOUNT STATE:');
  console.table(accState.rows);

  await pool.end();
}
checkBrokerAccounts().catch(e => console.error(e));
