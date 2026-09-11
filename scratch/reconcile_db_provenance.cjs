const { Pool } = require('pg');

async function checkPostgres() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://quantumai:quantumai_test_password@localhost:54329/quantumai_test',
    connectionTimeoutMillis: 3000
  });

  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL successfully.');

    // 1. Total Positions by status
    const posRes = await client.query(`
      SELECT status, COUNT(*) as count 
      FROM positions 
      GROUP BY status
    `);
    console.log('[DB_POSITIONS_STATUS]', JSON.stringify(posRes.rows));

    // 2. Post Mortem Reviews count & provenance
    const pmRes = await client.query(`
      SELECT COUNT(*) as count 
      FROM post_mortem_reviews
    `);
    console.log('[DB_POST_MORTEM_TOTAL]', JSON.stringify(pmRes.rows));

    // 3. Check for any post mortem with open trade
    const openViolationRes = await client.query(`
      SELECT pm.id, pm.trade_id, p.status 
      FROM post_mortem_reviews pm
      JOIN positions p ON p.position_id = pm.trade_id
      WHERE p.status != 'CLOSED'
    `);
    console.log('[DB_OPEN_TRADE_VIOLATIONS_COUNT]', openViolationRes.rows.length);

    // 4. Check for duplicate (trade_id, learning_version)
    const dupRes = await client.query(`
      SELECT trade_id, learning_version, COUNT(*) 
      FROM post_mortem_reviews 
      GROUP BY trade_id, learning_version 
      HAVING COUNT(*) > 1
    `);
    console.log('[DB_DUPLICATE_LEARNING_RECORDS_COUNT]', dupRes.rows.length);

    // 5. Check if any pm-1y-* or synthetic reviews leaked into PostgreSQL table
    const leakRes = await client.query(`
      SELECT id, trade_id 
      FROM post_mortem_reviews 
      WHERE id LIKE 'pm-1y-%' OR id LIKE 'pm-sim-%'
    `);
    console.log('[DB_BACKTEST_LEAKS_TO_POSTGRES_COUNT]', leakRes.rows.length);

    const detailedRes = await client.query(`
      SELECT id, trade_id, learning_version, created_at, review
      FROM post_mortem_reviews
    `);
    console.log('[DB_DETAILED_REVIEWS]', JSON.stringify(detailedRes.rows, null, 2));

    client.release();
    await pool.end();
  } catch (err) {
    console.log('[DB_CONNECTION_NOTE]', err.message);
  }
}

checkPostgres();
