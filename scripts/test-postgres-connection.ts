import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

async function testPostgres() {
  const dbUrl = process.env.DATABASE_URL;
  console.log('====================================================');
  console.log('   QUANTUMAI — POSTGRESQL CONNECTION DIAGNOSTIC     ');
  console.log('====================================================');
  console.log('Raw DATABASE_URL present:', !!dbUrl);
  if (dbUrl) {
    console.log('Target URL:', dbUrl.replace(/:[^:@]+@/, ':****@'));
  }

  const client = new Client({
    connectionString: dbUrl || 'postgresql://quantumai:quantumai_test_password@127.0.0.1:54329/quantumai_test',
    connectionTimeoutMillis: 5000,
  });

  try {
    const start = Date.now();
    await client.connect();
    const pingMs = Date.now() - start;
    console.log(`\n✅ Successfully connected to PostgreSQL in ${pingMs}ms!\n`);

    // 1. Session and Version Info
    const info = await client.query(`
      SELECT 
        current_database() as database,
        current_user as user,
        inet_server_addr() as server_ip,
        inet_server_port() as server_port,
        version() as pg_version,
        NOW() as server_time;
    `);
    console.log('--- Server & Connection Info ---');
    console.log(`• Database:    ${info.rows[0].database}`);
    console.log(`• User:        ${info.rows[0].user}`);
    console.log(`• Server IP:   ${info.rows[0].server_ip || 'local container'}`);
    console.log(`• Server Port: ${info.rows[0].server_port || '5432 (mapped to 54329)'}`);
    console.log(`• Server Time: ${info.rows[0].server_time}`);
    console.log(`• Version:     ${info.rows[0].pg_version}`);

    // 2. Table Inspection
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`\n--- Public Schema Tables (${tables.rowCount} total) ---`);
    for (const row of tables.rows) {
      try {
        const countRes = await client.query(`SELECT COUNT(*)::int as count FROM "${row.table_name}";`);
        console.log(`  • ${row.table_name.padEnd(30)} : ${countRes.rows[0].count} rows`);
      } catch (err: any) {
        console.log(`  • ${row.table_name.padEnd(30)} : [error reading count: ${err.message}]`);
      }
    }

    console.log('\n====================================================');
    console.log('✅ PostgreSQL connection check COMPLETED successfully.');
    console.log('====================================================');

    await client.end();
  } catch (err: any) {
    console.error('\n❌ PostgreSQL Connection Failed:');
    console.error('Error Message:', err.message);
    if (err.code) console.error('Error Code:   ', err.code);
    process.exit(1);
  }
}

testPostgres();
