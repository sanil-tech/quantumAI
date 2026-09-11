const { Pool } = require('pg');
require('dotenv').config();

async function inspectCutover() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('=== P26 AUDIT: INSPECTING OBSERVATIONS BY CREATION TIME ===');

    const res = await pool.query(`
      SELECT 
        id, 
        symbol, 
        direction, 
        entry_price, 
        stop_loss, 
        take_profit_1, 
        take_profit_2,
        status, 
        created_at, 
        updated_at
      FROM shadow_observations
      WHERE status = 'ACTIVE'
      ORDER BY created_at DESC
      LIMIT 30;
    `);

    console.log(`Top 30 newest ACTIVE observations:`);
    console.table(res.rows);

    const post1430 = await pool.query(`
      SELECT 
        id, 
        symbol, 
        direction, 
        entry_price, 
        status, 
        created_at
      FROM shadow_observations
      WHERE status = 'ACTIVE' AND created_at >= '2026-08-25 14:30:00+00'
      ORDER BY created_at ASC;
    `);

    console.log(`ACTIVE observations created after 14:30:00 UTC (Count: ${post1430.rows.length}):`);
    console.table(post1430.rows);

    const post1436 = await pool.query(`
      SELECT 
        id, 
        symbol, 
        direction, 
        entry_price, 
        status, 
        created_at
      FROM shadow_observations
      WHERE status = 'ACTIVE' AND created_at >= '2026-08-25 14:36:00+00'
      ORDER BY created_at ASC;
    `);

    console.log(`ACTIVE observations created after server restart at 14:36:05 UTC (Count: ${post1436.rows.length}):`);
    console.table(post1436.rows);

  } catch (err) {
    console.error('Audit query error:', err);
  } finally {
    await pool.end();
  }
}

inspectCutover();
