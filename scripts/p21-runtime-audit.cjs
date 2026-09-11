require('dotenv').config();
const { Pool } = require('pg');

async function runAudit() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/iati_trading',
    connectionTimeoutMillis: 2000
  });

  console.log('======================================================================');
  console.log('QUANTUMAI — P21 PRODUCTION RUNTIME & DATABASE CONSISTENCY AUDIT');
  console.log('======================================================================');

  // 1. Check DB observations
  const obsRes = await pool.query('SELECT * FROM shadow_observations ORDER BY created_at DESC');
  console.log('Total Shadow Observations in PostgreSQL:', obsRes.rowCount);
  
  // 2. Check Journal events
  const jRes = await pool.query('SELECT * FROM learning_journal_events ORDER BY created_at DESC');
  console.log('Total Journal Events in PostgreSQL:', jRes.rowCount);

  // 3. Check Accounting Isolation
  const posRes = await pool.query('SELECT COUNT(*) FROM positions');
  const ordRes = await pool.query('SELECT COUNT(*) FROM orders');
  const fillsRes = await pool.query('SELECT COUNT(*) FROM order_fills');
  const manRes = await pool.query('SELECT COUNT(*) FROM manual_trades');

  const shadowPos = await pool.query("SELECT COUNT(*) FROM positions WHERE position_id LIKE 'shadow-%'");
  const shadowOrd = await pool.query("SELECT COUNT(*) FROM orders WHERE order_id LIKE 'shadow-%'");
  const shadowFills = await pool.query("SELECT COUNT(*) FROM order_fills WHERE fill_id LIKE 'shadow-%'");
  const shadowMan = await pool.query("SELECT COUNT(*) FROM manual_trades WHERE manual_trade_id LIKE 'shadow-%'");

  console.log('\n--- 1. ACCOUNTING ISOLATION VERIFICATION ---');
  console.log('Broker Positions:', posRes.rows[0].count, '| Shadow in Positions:', shadowPos.rows[0].count);
  console.log('Broker Orders:', ordRes.rows[0].count, '| Shadow in Orders:', shadowOrd.rows[0].count);
  console.log('Broker Order Fills:', fillsRes.rows[0].count, '| Shadow in Fills:', shadowFills.rows[0].count);
  console.log('Manual Trades:', manRes.rows[0].count, '| Shadow in Manual Trades:', shadowMan.rows[0].count);

  // 4. Check Consistency of each closed observation
  console.log('\n--- 2. CLOSED OBSERVATIONS INTEGRITY ---');
  const closedObs = obsRes.rows.filter(r => r.status === 'CLOSED');
  console.log(`Total CLOSED Observations: ${closedObs.length}`);
  
  for (const c of closedObs.slice(0, 5)) {
    const entry = parseFloat(c.entry_price);
    const exit = parseFloat(c.exit_price);
    const sl = parseFloat(c.initial_stop_loss);
    const dir = c.direction;
    const risk = Math.abs(entry - sl);
    const gain = dir === 'BUY' ? (exit - entry) : (entry - exit);
    const expectedR = Number((gain / risk).toFixed(2));
    const recordedR = parseFloat(c.realized_r);
    
    console.log(`- [${c.id}] ${c.symbol} ${dir} Entry:${entry} Exit:${exit} SL:${sl} Reason:${c.close_reason} RealizedR:${recordedR} ExpectedR:${expectedR} MATCH:${recordedR === expectedR}`);
  }

  // 5. Check Active observations integrity
  console.log('\n--- 3. ACTIVE OBSERVATIONS INTEGRITY ---');
  const activeObs = obsRes.rows.filter(r => r.status === 'ACTIVE');
  console.log(`Total ACTIVE Observations: ${activeObs.length}`);
  for (const a of activeObs.slice(0, 5)) {
    console.log(`- [${a.id}] ${a.symbol} ${a.direction} Entry:${a.entry_price} CurrentSL:${a.stop_loss} InitialSL:${a.initial_stop_loss} TP1:${a.take_profit_1} TP2:${a.take_profit_2} TP1_Hit:${a.tp1_hit}`);
  }

  // 6. Check Journal Event Correlation
  console.log('\n--- 4. JOURNAL CORRELATION & EXACT-ONCE ---');
  const tradeClosedEvents = jRes.rows.filter(r => r.event_type === 'TRADE_CLOSED');
  console.log(`TRADE_CLOSED Events: ${tradeClosedEvents.length}`);
  for (const tc of tradeClosedEvents.slice(0, 5)) {
    console.log(`- [${tc.id}] Fingerprint:${tc.setup_fingerprint} RealizedR:${tc.realized_r} Reason:"${tc.reason}"`);
  }

  await pool.end();
}

runAudit().catch(console.error);
