const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runComprehensiveAudit() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('====================================================');
    console.log('QUANTUMAI P26 FORENSIC AUDIT (COMPREHENSIVE)');
    console.log('====================================================\n');

    // 1. INVENTORY BREAKDOWN
    console.log('--- 1. ACTIVE INVENTORY BREAKDOWN ---');
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
    console.table(symbolBreakdown.rows);

    // 2. CUTOVER TIMESTAMP ANALYSIS
    // P25 Cutover: 2026-08-25 14:31:00 UTC (commit/implementation in continuousLearningObservatoryService.ts)
    // Server restarted: 2026-08-25 14:36:05 UTC
    const cutoverTimestamp = '2026-08-25T14:31:00.000Z';
    console.log('--- 2. P25 CUTOVER TIMESTAMP ---');
    console.log(`P25_CUTOVER_TIMESTAMP = ${cutoverTimestamp}\n`);

    // 3. PRE-P25 VS POST-P25 BREAKDOWN
    console.log('--- 3. PRE-P25 VS POST-P25 CLASSIFICATION ---');
    const prePostBreakdown = await pool.query(`
      SELECT 
        symbol,
        SUM(CASE WHEN created_at < $1 THEN 1 ELSE 0 END) as pre_p25,
        SUM(CASE WHEN created_at >= $1 THEN 1 ELSE 0 END) as post_p25,
        COUNT(*) as total
      FROM shadow_observations
      WHERE status = 'ACTIVE'
      GROUP BY symbol
      ORDER BY total DESC;
    `, [cutoverTimestamp]);
    console.table(prePostBreakdown.rows);

    // Breakdown of post-P25 active records (if any)
    const postP25Details = await pool.query(`
      SELECT id, symbol, direction, entry_price, status, created_at, updated_at
      FROM shadow_observations
      WHERE status = 'ACTIVE' AND created_at >= $1
      ORDER BY created_at ASC;
    `, [cutoverTimestamp]);
    console.log(`Post-P25 ACTIVE observations (Count: ${postP25Details.rows.length}):`);
    console.table(postP25Details.rows);

    // 4. EXIT ELIGIBILITY & PRICE LEVEL AUDIT
    // Let's sample active observations and check their SL/TP thresholds
    console.log('\n--- 4. SAMPLE ACTIVE OBSERVATION TARGETS & RANGES ---');
    const sampleActive = await pool.query(`
      SELECT 
        id, 
        symbol, 
        direction, 
        entry_price, 
        stop_loss, 
        take_profit_1, 
        take_profit_2,
        tp1_hit,
        mfe_pips,
        mae_pips,
        highest_price_seen,
        lowest_price_seen,
        created_at,
        updated_at
      FROM shadow_observations
      WHERE status = 'ACTIVE'
      ORDER BY created_at DESC
      LIMIT 10;
    `);
    console.table(sampleActive.rows);

    // 5. LEGACY CLASSIFICATION (A through H)
    console.log('\n--- 5. LEGACY OBSERVATION CLASSIFICATION (A-H) ---');
    // Let's analyze the entire active dataset:
    const allActive = await pool.query(`
      SELECT 
        id, 
        symbol, 
        direction, 
        entry_price, 
        stop_loss, 
        take_profit_1, 
        take_profit_2,
        tp1_hit,
        created_at
      FROM shadow_observations
      WHERE status = 'ACTIVE'
      ORDER BY symbol, created_at ASC;
    `);

    let legCount = 0; // First observation per symbol (Legitimate legacy)
    let dupLegacyCount = 0; // Subsequent observations per symbol before cutover
    let postP25LegCount = 0; // Post-P25 legitimate
    let postP25DupCount = 0; // Post-P25 duplicate
    let missingFieldsCount = 0; // Missing SL / TP / entryPrice

    const seenSymbols = new Set();
    for (const row of allActive.rows) {
      const isPost = new Date(row.created_at) >= new Date(cutoverTimestamp);
      if (!row.entry_price || !row.stop_loss || !row.take_profit_1) {
        missingFieldsCount++;
      }
      if (!isPost) {
        if (!seenSymbols.has(row.symbol)) {
          seenSymbols.add(row.symbol);
          legCount++;
        } else {
          dupLegacyCount++;
        }
      } else {
        // Post-P25
        if (row.id.includes('test') || row.id.includes('hyd') || row.id.includes('multi')) {
          // Vitest test runner artifacts
          postP25LegCount++;
        } else {
          postP25DupCount++;
        }
      }
    }

    console.log(`A. Legitimate primary legacy observations (1 per symbol): ${legCount}`);
    console.log(`B. Duplicate legacy observations (pre-P25): ${dupLegacyCount}`);
    console.log(`C. Post-P25 legitimate/test observations: ${postP25LegCount}`);
    console.log(`D. Post-P25 duplicate live admissions: ${postP25DupCount}`);
    console.log(`H. Missing/invalid lifecycle fields: ${missingFieldsCount}`);

    // 6. WAL CONSISTENCY
    console.log('\n--- 6. WAL DIRECTORY & PERSISTENCE CONSISTENCY ---');
    const walDir = path.join(process.cwd(), '.wal', 'shadow');
    let walFiles = [];
    if (fs.existsSync(walDir)) {
      walFiles = fs.readdirSync(walDir);
    }
    console.log(`WAL directory exists: ${fs.existsSync(walDir)} (${walDir})`);
    console.log(`WAL pending files count: ${walFiles.length}`);

  } catch (err) {
    console.error('Comprehensive audit error:', err);
  } finally {
    await pool.end();
  }
}

runComprehensiveAudit();
