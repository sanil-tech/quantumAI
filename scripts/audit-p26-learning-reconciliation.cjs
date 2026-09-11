const { Pool } = require('pg');
require('dotenv').config();

async function runAudit() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const P25_CUTOVER = '2026-08-25T14:36:05.000Z';

  try {
    console.log('========================================');
    console.log('P26.2 LEARNING RECONCILIATION FORENSIC AUDIT');
    console.log('========================================\n');

    // 1. Database Authoritative Inventory
    const totalRes = await pool.query(`SELECT COUNT(*) as count FROM shadow_observations;`);
    const activeRes = await pool.query(`SELECT COUNT(*) as count FROM shadow_observations WHERE status = 'ACTIVE';`);
    const closedRes = await pool.query(`SELECT COUNT(*) as count FROM shadow_observations WHERE status = 'CLOSED';`);

    const totalRecords = parseInt(totalRes.rows[0].count, 10);
    const activeRecords = parseInt(activeRes.rows[0].count, 10);
    const closedRecords = parseInt(closedRes.rows[0].count, 10);

    console.log('1. DATABASE AUTHORITATIVE INVENTORY:');
    console.log(`- Total Records in DB:  ${totalRecords}`);
    console.log(`- Total ACTIVE:         ${activeRecords}`);
    console.log(`- Total CLOSED:         ${closedRecords}\n`);

    // D. Closed by Symbol
    const bySymbolRes = await pool.query(`
      SELECT symbol, COUNT(*) as count 
      FROM shadow_observations 
      WHERE status = 'CLOSED' 
      GROUP BY symbol 
      ORDER BY count DESC;
    `);
    console.log('D. Closed by Symbol:');
    console.table(bySymbolRes.rows);

    // E. Closed by Direction
    const byDirectionRes = await pool.query(`
      SELECT direction, COUNT(*) as count 
      FROM shadow_observations 
      WHERE status = 'CLOSED' 
      GROUP BY direction 
      ORDER BY count DESC;
    `);
    console.log('E. Closed by Direction:');
    console.table(byDirectionRes.rows);

    // F. Closed by Close Reason
    const byReasonRes = await pool.query(`
      SELECT close_reason, COUNT(*) as count, 
             SUM(CASE WHEN realized_r > 0 THEN 1 ELSE 0 END) as wins,
             SUM(CASE WHEN realized_r < 0 THEN 1 ELSE 0 END) as losses,
             SUM(CASE WHEN realized_r = 0 THEN 1 ELSE 0 END) as be,
             SUM(realized_r) as net_r
      FROM shadow_observations 
      WHERE status = 'CLOSED' 
      GROUP BY close_reason 
      ORDER BY count DESC;
    `);
    console.log('F. Closed by Close Reason:');
    console.table(byReasonRes.rows);

    // G & H. Time Boundaries
    const timeRes = await pool.query(`
      SELECT 
        MIN(created_at) as min_created, MAX(created_at) as max_created,
        MIN(closed_at) as min_closed, MAX(closed_at) as max_closed
      FROM shadow_observations 
      WHERE status = 'CLOSED';
    `);
    console.log('G & H. Closed Time Span:');
    console.table(timeRes.rows);

    // I. PRE-P25 vs POST-P25
    const prePostRes = await pool.query(`
      SELECT 
        CASE WHEN created_at < $1 THEN 'PRE_P25' ELSE 'POST_P25' END as era,
        status,
        COUNT(*) as count,
        SUM(CASE WHEN close_reason LIKE '%TAKE_PROFIT%' OR realized_r > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN close_reason = 'STOP_LOSS' OR (realized_r < 0 AND close_reason != 'BREAKEVEN') THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN close_reason = 'BREAKEVEN' OR realized_r = 0 THEN 1 ELSE 0 END) as be,
        SUM(realized_r) as net_r
      FROM shadow_observations
      GROUP BY 1, 2
      ORDER BY 1, 2;
    `, [P25_CUTOVER]);
    console.log(`I. PRE-P25 vs POST-P25 Cutover (${P25_CUTOVER}):`);
    console.table(prePostRes.rows);

    // Journal Events Audit
    const journalTotalRes = await pool.query(`SELECT COUNT(*) as count FROM learning_journal_events;`);
    const journalByOutcome = await pool.query(`
      SELECT outcome, event_type, COUNT(*) as count 
      FROM learning_journal_events 
      GROUP BY outcome, event_type;
    `);
    console.log('LEARNING JOURNAL EVENTS IN DB:');
    console.log(`- Total Journal Events: ${journalTotalRes.rows[0].count}`);
    console.table(journalByOutcome.rows);

    // Closed shadow observation IDs
    const dbClosedIdsRes = await pool.query(`SELECT id, symbol, direction, close_reason, realized_r, created_at, closed_at FROM shadow_observations WHERE status = 'CLOSED';`);
    const dbClosedIds = new Set(dbClosedIdsRes.rows.map(r => r.id));

    // Journal linked observation IDs
    const journalObsIdsRes = await pool.query(`SELECT DISTINCT observation_id FROM learning_journal_events WHERE observation_id IS NOT NULL;`);
    const journalObsIds = new Set(journalObsIdsRes.rows.map(r => r.observation_id));

    const intersectionJournalDb = [...journalObsIds].filter(id => dbClosedIds.has(id));
    const journalOnly = [...journalObsIds].filter(id => !dbClosedIds.has(id));
    const dbWithoutJournal = [...dbClosedIds].filter(id => !journalObsIds.has(id));

    console.log('\nID RECONCILIATION (DB CLOSED vs LEARNING JOURNAL EVENTS):');
    console.log(`- DB Closed IDs:                      ${dbClosedIds.size}`);
    console.log(`- Journal Distinct Observation IDs:   ${journalObsIds.size}`);
    console.log(`- Intersection (In DB & Journal):      ${intersectionJournalDb.length}`);
    console.log(`- Journal Only (No DB match):         ${journalOnly.length}`);
    console.log(`- DB Closed without Journal Event:    ${dbWithoutJournal.length}`);

    // Check for any duplicate IDs in DB
    const duplicateIdsRes = await pool.query(`
      SELECT id, COUNT(*) as count 
      FROM shadow_observations 
      GROUP BY id 
      HAVING COUNT(*) > 1;
    `);
    console.log(`- Duplicate Primary Keys in DB:       ${duplicateIdsRes.rows.length}`);

  } catch (err) {
    console.error('Audit error:', err);
  } finally {
    await pool.end();
  }
}

runAudit();
