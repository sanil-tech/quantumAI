import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function deepDive() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('=== PARAMETER ADAPTATIONS & POST-MORTEM LESSONS ===');
  const adaptRes = await pool.query(`
    SELECT event_type, symbol, direction, session, reason, previous_parameter, applied_parameter, bounded_adjustment, confidence_basis, timestamp
    FROM learning_journal_events
    WHERE event_type IN ('PARAMETER_ADAPTED', 'LEARNING_APPLIED', 'POST_MORTEM_CREATED', 'SAFETY_BLOCK')
    ORDER BY timestamp DESC
    LIMIT 30;
  `);

  console.log(`Found ${adaptRes.rows.length} parameter adaptation / post-mortem events:`);
  for (const row of adaptRes.rows) {
    console.log(`\n[${row.event_type}] ${row.symbol || 'ALL'} ${row.direction || ''} (${row.session || 'ALL_SESSIONS'})`);
    console.log(`Reason: ${row.reason}`);
    if (row.applied_parameter) console.log(`Adjustment: ${row.previous_parameter} -> ${row.applied_parameter}`);
    if (row.bounded_adjustment) console.log(`Bounded: ${row.bounded_adjustment}`);
    if (row.confidence_basis) console.log(`Confidence: ${row.confidence_basis}`);
  }

  console.log('\n=== REALIZED R PERFORMANCE BY SYMBOL (LAST WEEK) ===');
  const pnlBySymbol = await pool.query(`
    SELECT 
      symbol,
      COUNT(*) as total_trades,
      SUM(CASE WHEN realized_r > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN realized_r < 0 THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN realized_r = 0 THEN 1 ELSE 0 END) as be,
      ROUND(AVG(realized_r)::numeric, 2) as avg_r,
      ROUND(SUM(realized_r)::numeric, 2) as total_r,
      ROUND(AVG(mfe_pips)::numeric, 1) as avg_mfe,
      ROUND(AVG(mae_pips)::numeric, 1) as avg_mae
    FROM shadow_observations
    WHERE status = 'CLOSED'
    GROUP BY symbol
    ORDER BY total_r DESC;
  `);
  console.table(pnlBySymbol.rows);

  console.log('\n=== PERFORMANCE BY SESSION (LAST WEEK) ===');
  const pnlBySession = await pool.query(`
    SELECT 
      session,
      COUNT(*) as total_trades,
      SUM(CASE WHEN realized_r > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN realized_r < 0 THEN 1 ELSE 0 END) as losses,
      ROUND(SUM(realized_r)::numeric, 2) as total_r
    FROM shadow_observations
    WHERE status = 'CLOSED'
    GROUP BY session
    ORDER BY total_r DESC;
  `);
  console.table(pnlBySession.rows);

  process.exit(0);
}

deepDive().catch(err => {
  console.error(err);
  process.exit(1);
});
