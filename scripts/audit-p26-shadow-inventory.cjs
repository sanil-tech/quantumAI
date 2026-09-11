const { Pool } = require('pg');
require('dotenv').config();

async function runAudit() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('=== P26 AUDIT: QUERYING POSTGRESQL SHADOW OBSERVATIONS ===');

    // 1. Overall counts
    const statusCountsRes = await pool.query(`
      SELECT status, count(*) as count 
      FROM shadow_observations 
      GROUP BY status;
    `);
    console.log('Status counts:', statusCountsRes.rows);

    // 2. Active by Symbol
    const symbolCountsRes = await pool.query(`
      SELECT symbol, count(*) as count 
      FROM shadow_observations 
      WHERE status = 'ACTIVE' 
      GROUP BY symbol 
      ORDER BY count DESC;
    `);
    console.log('Active by symbol:', symbolCountsRes.rows);

    // 3. Active by Direction
    const directionCountsRes = await pool.query(`
      SELECT direction, count(*) as count 
      FROM shadow_observations 
      WHERE status = 'ACTIVE' 
      GROUP BY direction;
    `);
    console.log('Active by direction:', directionCountsRes.rows);

    // 4. Oldest & Newest Active
    const timeRangeRes = await pool.query(`
      SELECT 
        MIN(created_at) as oldest_created,
        MAX(created_at) as newest_created,
        MIN(updated_at) as oldest_updated,
        MAX(updated_at) as newest_updated,
        COUNT(*) as total_active
      FROM shadow_observations
      WHERE status = 'ACTIVE';
    `);
    console.log('Active timestamps summary:', timeRangeRes.rows[0]);

    // 5. Total Closed & Timestamps
    const closedSummaryRes = await pool.query(`
      SELECT 
        MIN(created_at) as oldest_closed_created,
        MAX(created_at) as newest_closed_created,
        MIN(closed_at) as oldest_closed_at,
        MAX(closed_at) as newest_closed_at,
        COUNT(*) as total_closed
      FROM shadow_observations
      WHERE status = 'CLOSED';
    `);
    console.log('Closed summary:', closedSummaryRes.rows[0]);

    // 6. Distribution of active observations by creation hour / 10-minute buckets
    const bucketRes = await pool.query(`
      SELECT 
        date_trunc('hour', created_at) as bucket,
        count(*) as count,
        array_agg(DISTINCT symbol) as symbols
      FROM shadow_observations
      WHERE status = 'ACTIVE'
      GROUP BY bucket
      ORDER BY bucket ASC;
    `);
    console.log('Active creation time buckets:');
    console.table(bucketRes.rows);

  } catch (err) {
    console.error('Audit query error:', err);
  } finally {
    await pool.end();
  }
}

runAudit();
