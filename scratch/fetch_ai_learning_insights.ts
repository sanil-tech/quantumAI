import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';

async function fetchAiLearningInsights() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('=== AI LEARNING RECORDS IN POSTGRESQL ===');
  const res = await client.query(`
    SELECT 
      record_id,
      symbol,
      strategy_name,
      outcome,
      pnl_pips,
      realized_profit,
      market_regime,
      lesson_learned,
      confidence_adjustment,
      created_at
    FROM ai_learning_records
    ORDER BY created_at DESC
    LIMIT 10
  `).catch(e => {
    console.warn('Table query error:', e.message);
    return { rows: [] };
  });

  if (res.rows.length > 0) {
    console.table(res.rows.map(r => ({
      Symbol: r.symbol,
      Strategy: r.strategy_name,
      Outcome: r.outcome,
      'Pnl ($)': Number(r.realized_profit || 0).toFixed(2),
      Regime: r.market_regime,
      Adjustment: r.confidence_adjustment,
      Lesson: r.lesson_learned?.slice(0, 80) + '...'
    })));
  } else {
    console.log('No rows in ai_learning_records, checking positions count...');
    const posRes = await client.query(`SELECT count(*) as total, count(*) FILTER (WHERE status = 'CLOSED') as closed FROM positions`);
    console.log('Total positions:', posRes.rows[0]);
  }

  await client.end();
}

fetchAiLearningInsights().catch(console.error);
