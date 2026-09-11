const { Pool } = require('pg');
require('dotenv').config();

async function runExitAudit() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Current market prices from cTrader feed
  const currentPrices = {
    'EUR/USD': { bid: 1.16733, ask: 1.16734 },
    'GBP/USD': { bid: 1.36416, ask: 1.36417 },
    'USD/JPY': { bid: 159.204, ask: 159.205 },
    'AUD/USD': { bid: 0.71625, ask: 0.71626 }
  };

  try {
    const res = await pool.query(`
      SELECT 
        id, symbol, direction, entry_price, stop_loss, take_profit_1, take_profit_2, tp1_hit
      FROM shadow_observations
      WHERE status = 'ACTIVE'
      ORDER BY symbol, created_at ASC;
    `);

    console.log(`=== P26 SECTION 8: EXIT ELIGIBILITY AUDIT (${res.rows.length} Active Records) ===`);

    const eligibilityCounts = {
      WAITING_FOR_TP1: 0,
      WAITING_FOR_TP2: 0,
      WAITING_FOR_SL: 0,
      BREAKEVEN_MONITORING: 0,
      EXIT_CONDITION_CROSSES_SL: 0,
      EXIT_CONDITION_CROSSES_TP1: 0,
      EXIT_CONDITION_CROSSES_TP2: 0
    };

    const details = [];

    for (const obs of res.rows) {
      const priceInfo = currentPrices[obs.symbol];
      if (!priceInfo) continue;

      const current = obs.direction === 'BUY' ? priceInfo.bid : priceInfo.ask;
      const entry = parseFloat(obs.entry_price);
      const sl = parseFloat(obs.stop_loss);
      const tp1 = parseFloat(obs.take_profit_1);
      const tp2 = obs.take_profit_2 ? parseFloat(obs.take_profit_2) : null;
      const tp1Hit = obs.tp1_hit;

      let statusCategory = 'IN_RANGE';

      if (obs.direction === 'BUY') {
        if (current <= sl) {
          statusCategory = 'EXIT_CONDITION_CROSSES_SL';
          eligibilityCounts.EXIT_CONDITION_CROSSES_SL++;
        } else if (!tp1Hit && current >= tp1) {
          statusCategory = 'EXIT_CONDITION_CROSSES_TP1';
          eligibilityCounts.EXIT_CONDITION_CROSSES_TP1++;
        } else if (tp1Hit && tp2 && current >= tp2) {
          statusCategory = 'EXIT_CONDITION_CROSSES_TP2';
          eligibilityCounts.EXIT_CONDITION_CROSSES_TP2++;
        } else if (tp1Hit) {
          statusCategory = 'BREAKEVEN_MONITORING';
          eligibilityCounts.BREAKEVEN_MONITORING++;
        } else {
          statusCategory = 'WAITING_FOR_TP1';
          eligibilityCounts.WAITING_FOR_TP1++;
        }
      } else {
        // SELL
        if (current >= sl) {
          statusCategory = 'EXIT_CONDITION_CROSSES_SL';
          eligibilityCounts.EXIT_CONDITION_CROSSES_SL++;
        } else if (!tp1Hit && current <= tp1) {
          statusCategory = 'EXIT_CONDITION_CROSSES_TP1';
          eligibilityCounts.EXIT_CONDITION_CROSSES_TP1++;
        } else if (tp1Hit && tp2 && current <= tp2) {
          statusCategory = 'EXIT_CONDITION_CROSSES_TP2';
          eligibilityCounts.EXIT_CONDITION_CROSSES_TP2++;
        } else if (tp1Hit) {
          statusCategory = 'BREAKEVEN_MONITORING';
          eligibilityCounts.BREAKEVEN_MONITORING++;
        } else {
          statusCategory = 'WAITING_FOR_TP1';
          eligibilityCounts.WAITING_FOR_TP1++;
        }
      }

      details.push({
        id: obs.id,
        symbol: obs.symbol,
        dir: obs.direction,
        entry,
        sl,
        tp1,
        current,
        category: statusCategory
      });
    }

    console.log('Exit Eligibility Summary:');
    console.table(eligibilityCounts);

    console.log('Sample of 15 classified active observations:');
    console.table(details.slice(0, 15));

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

runExitAudit();
