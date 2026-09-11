const { Pool } = require('pg');
require('dotenv').config();

async function runBreakdowns() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const prePostBreakdown = await pool.query(`
      SELECT 
        symbol,
        SUM(CASE WHEN created_at < '2026-08-25 14:36:05+00' THEN 1 ELSE 0 END) as pre_p25_active,
        SUM(CASE WHEN created_at >= '2026-08-25 14:36:05+00' THEN 1 ELSE 0 END) as post_p25_active,
        COUNT(*) as total_active
      FROM shadow_observations
      WHERE status = 'ACTIVE'
      GROUP BY symbol
      ORDER BY total_active DESC;
    `);
    console.log('=== ACTIVE PRE-P25 VS POST-P25 BREAKDOWN ===');
    console.table(prePostBreakdown.rows);

    const symbolBreakdown = await pool.query(`
      SELECT 
        symbol,
        COUNT(*) as total_active,
        SUM(CASE WHEN direction = 'BUY' THEN 1 ELSE 0 END) as buy_count,
        SUM(CASE WHEN direction = 'SELL' THEN 1 ELSE 0 END) as sell_count,
        MIN(entry_price) as min_entry,
        MAX(entry_price) as max_entry,
        MIN(created_at) as oldest_created,
        MAX(created_at) as newest_created
      FROM shadow_observations
      WHERE status = 'ACTIVE'
      GROUP BY symbol
      ORDER BY total_active DESC;
    `);
    console.log('=== ACTIVE INVENTORY BY SYMBOL ===');
    console.table(symbolBreakdown.rows);

    // Direction breakdown
    const directionBreakdown = await pool.query(`
      SELECT 
        direction,
        COUNT(*) as count
      FROM shadow_observations
      WHERE status = 'ACTIVE'
      GROUP BY direction;
    `);
    console.log('=== ACTIVE INVENTORY BY DIRECTION ===');
    console.table(directionBreakdown.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

runBreakdowns();
