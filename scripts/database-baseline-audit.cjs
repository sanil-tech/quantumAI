const dotenv = require('dotenv');
dotenv.config();
const { Pool } = require('pg');

async function runForensicDatabaseBaseline() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  const report = {};

  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log('========================================================================');
    console.log('QUANTUMAI — PROVENANCE BOUNDARY DATABASE BASELINE & RUNTIME AUDIT');
    console.log('========================================================================\n');
    console.log('DATABASE CONNECTION:');
    console.log('Host:', url.hostname);
    console.log('Port:', url.port || '5432');
    console.log('Database:', url.pathname.replace('/', ''));
    console.log('User:', url.username);

    // 1. POSITIONS
    console.log('\n========================================================================');
    console.log('1. POSITIONS BASELINE');
    console.log('========================================================================');
    const posColsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'positions'
    `);
    console.log('Columns in positions:', posColsRes.rows.map(c => c.column_name).join(', '));

    const posRes = await pool.query(`
      SELECT * FROM positions ORDER BY opened_at ASC
    `);
    console.table(posRes.rows.map(p => ({
      position_id: p.position_id,
      symbol: p.symbol,
      status: p.status,
      direction: p.direction,
      entry_price: p.entry_price,
      current_price: p.current_price,
      realized_profit: p.realized_profit,
      opened_at: p.opened_at,
      closed_at: p.closed_at
    })));
    const openPos = posRes.rows.filter(p => p.status === 'OPEN');
    const closedPos = posRes.rows.filter(p => p.status === 'CLOSED');
    console.log(`Total Positions: ${posRes.rows.length} | OPEN: ${openPos.length} | CLOSED: ${closedPos.length}`);

    // 2. POST_MORTEM_REVIEWS
    console.log('\n========================================================================');
    console.log('2. POST_MORTEM_REVIEWS BASELINE');
    console.log('========================================================================');
    const pmColsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'post_mortem_reviews'
    `);
    console.log('Columns in post_mortem_reviews:', pmColsRes.rows.map(c => c.column_name).join(', '));

    const pmRes = await pool.query(`
      SELECT id, trade_id, learning_version, review, created_at
      FROM post_mortem_reviews
      ORDER BY created_at ASC
    `);

    // Parse JSON review field for provenance/authority distribution
    const parsedReviews = pmRes.rows.map(r => {
      const parsed = typeof r.review === 'string' ? JSON.parse(r.review) : r.review;
      return {
        id: r.id,
        trade_id: r.trade_id,
        learning_version: r.learning_version,
        symbol: parsed?.pair || parsed?.symbol || 'UNKNOWN',
        direction: parsed?.direction,
        outcome: parsed?.outcome || 'UNKNOWN',
        pnlDollars: parsed?.pnlDollars || parsed?.realizedPnl || 0,
        provenance: parsed?.provenance || 'REAL_TRADE',
        authority: parsed?.authority || 'POSTGRESQL',
        dataSource: parsed?.dataSource || 'POSTGRESQL_CLOSED_POSITION',
        fallbackUsed: parsed?.fallbackUsed ?? false,
        created_at: r.created_at
      };
    });

    console.log(`Total Post-Mortem Reviews: ${pmRes.rows.length}`);
    console.table(parsedReviews);

    // 3. REAL-TRADE LEARNING INVARIANTS
    console.log('\n========================================================================');
    console.log('3. REAL-TRADE LEARNING INVARIANTS');
    console.log('========================================================================');
    // A. Check linkage
    const linkedToPos = await pool.query(`
      SELECT pm.id, pm.trade_id, p.status, p.symbol, p.realized_profit
      FROM post_mortem_reviews pm
      JOIN positions p ON pm.trade_id = p.position_id
    `);
    console.log('Reviews mapped to positions:', linkedToPos.rows.length);

    // B. Check open trade violations
    const openViolations = await pool.query(`
      SELECT pm.id, pm.trade_id, p.status, p.symbol
      FROM post_mortem_reviews pm
      JOIN positions p ON pm.trade_id = p.position_id
      WHERE p.status != 'CLOSED'
    `);
    console.log('Open Trade Learning Violations (must be 0):', openViolations.rows.length);

    // C. Check orphan reviews
    const orphanReviews = await pool.query(`
      SELECT pm.id, pm.trade_id
      FROM post_mortem_reviews pm
      LEFT JOIN positions p ON pm.trade_id = p.position_id
      WHERE pm.trade_id IS NOT NULL AND p.position_id IS NULL
    `);
    console.log('Orphan Post-Mortem Reviews (must be 0):', orphanReviews.rows.length);

    // D. Duplicate reviews
    const duplicateReviews = await pool.query(`
      SELECT trade_id, COUNT(*)
      FROM post_mortem_reviews
      WHERE trade_id IS NOT NULL
      GROUP BY trade_id
      HAVING COUNT(*) > 1
    `);
    console.log('Duplicate Post-Mortem Reviews for same trade_id (must be 0):', duplicateReviews.rows.length);

    // 4. BACKTEST/SYNTHETIC CONTAMINATION TEST
    console.log('\n========================================================================');
    console.log('4. BACKTEST / SYNTHETIC CONTAMINATION TEST IN POSTGRESQL');
    console.log('========================================================================');
    const backtestInDb = await pool.query(`
      SELECT id, trade_id, review
      FROM post_mortem_reviews
      WHERE id LIKE '%pm-1y%'
         OR review::text LIKE '%HISTORICAL_BACKTEST%'
         OR review::text LIKE '%SYNTHETIC_SIMULATION%'
         OR review::text LIKE '%1-Year Backtest%'
         OR review::text LIKE '%BACKTEST_ENGINE%'
         OR review::text LIKE '%SIMULATION_ONLY%'
    `);
    console.log('Backtest / Synthetic Contamination Rows in PostgreSQL (must be 0):', backtestInDb.rows.length);

    // 5. CLOSED-TRADE LEARNING COMPLETENESS
    console.log('\n========================================================================');
    console.log('5. CLOSED-TRADE LEARNING COMPLETENESS');
    console.log('========================================================================');
    const unlearnedClosed = await pool.query(`
      SELECT p.position_id, p.symbol, p.realized_profit, p.closed_at
      FROM positions p
      LEFT JOIN post_mortem_reviews pm ON p.position_id = pm.trade_id
      WHERE p.status = 'CLOSED' AND pm.id IS NULL
    `);
    console.log(`CLOSED POSITIONS TOTAL: ${closedPos.length}`);
    console.log(`LEARNED CLOSED POSITIONS: ${linkedToPos.rows.length}`);
    console.log(`UNLEARNED CLOSED POSITIONS (must be 0): ${unlearnedClosed.rows.length}`);

    // 9. CROSS-PAIR CONTAMINATION & 12-PAIR MATRIX
    console.log('\n========================================================================');
    console.log('9. 12-PAIR CROSS-PAIR ISOLATION MATRIX');
    console.log('========================================================================');
    const all12Pairs = [
      'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD',
      'USD/CHF', 'NZD/USD', 'USD/CAD', 'EUR/JPY',
      'GBP/JPY', 'XAU/USD', 'NASDAQ', 'BTC/USD'
    ];

    const pairMatrix = [];
    for (const pair of all12Pairs) {
      const pairReviews = parsedReviews.filter(r => r.symbol === pair || r.symbol === pair.replace('/', ''));
      const realN = pairReviews.length;
      const wins = pairReviews.filter(r => r.outcome === 'WIN').length;
      const losses = pairReviews.filter(r => r.outcome === 'LOSS').length;
      const failureRate = realN > 0 ? ((losses / realN) * 100).toFixed(1) + '%' : '0.0%';
      const vetoEligible = realN >= 3;

      pairMatrix.push({
        Pair: pair,
        'REAL N': realN,
        Wins: wins,
        Losses: losses,
        'Failure Rate': failureRate,
        'Veto Eligible': vetoEligible ? 'YES (N>=3)' : 'NO (N<3)'
      });
    }
    console.table(pairMatrix);

    // 12. EUR/USD SPECIFIC FORENSIC IDS
    console.log('\n========================================================================');
    console.log('12. EUR/USD SPECIFIC FORENSIC RECORD AUDIT');
    console.log('========================================================================');
    const targetIds = [
      'pm-1y-1787680102312-36',
      'pm-1y-1787679502288-36',
      'pm-1y-1787678903133-36'
    ];
    const eurusdForensicInDb = await pool.query(`
      SELECT id FROM post_mortem_reviews WHERE id = ANY($1)
    `, [targetIds]);
    console.log('Forensic pm-1y-* IDs Persisted in PostgreSQL (must be 0):', eurusdForensicInDb.rows.length);

    // 13. SHADOW ISOLATION
    console.log('\n========================================================================');
    console.log('13. SHADOW & EVENT JOURNAL COUNTS');
    console.log('========================================================================');
    const shadowCount = await pool.query('SELECT COUNT(*)::int as count FROM shadow_observations');
    const journalCount = await pool.query('SELECT COUNT(*)::int as count FROM learning_journal_events');
    console.log('shadow_observations table count:', shadowCount.rows[0].count);
    console.log('learning_journal_events table count:', journalCount.rows[0].count);

  } catch (err) {
    console.error('Database Baseline Error:', err);
  } finally {
    await pool.end();
  }
}

runForensicDatabaseBaseline();
