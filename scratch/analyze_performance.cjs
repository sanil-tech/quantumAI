const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function analyzePerformance() {
  try {
    console.log('=== QUANTUMAI TRADING PERFORMANCE ANALYSIS (21 DAYS) ===\n');

    // 1. Overall Statistics
    const overall = await pool.query(`
      SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN realized_profit > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN realized_profit <= 0 THEN 1 ELSE 0 END) as losses,
        ROUND((SUM(CASE WHEN realized_profit > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*))::numeric, 2) as win_rate_pct,
        ROUND(SUM(realized_profit)::numeric, 2) as total_pnl,
        ROUND(AVG(realized_profit)::numeric, 2) as avg_pnl_per_trade,
        ROUND(MAX(realized_profit)::numeric, 2) as best_trade,
        ROUND(MIN(realized_profit)::numeric, 2) as worst_trade
      FROM positions
      WHERE status = 'CLOSED'
    `);

    console.log('📊 OVERALL PERFORMANCE');
    console.log('─'.repeat(60));
    const o = overall.rows[0];
    console.log(`Total Closed Trades:        ${o.total_trades}`);
    console.log(`  ✅ Winning Trades:        ${o.wins}`);
    console.log(`  ❌ Losing Trades:         ${o.losses}`);
    console.log(`🎯 Win Rate:                ${o.win_rate_pct}%`);
    console.log(`💰 Total P&L:               $${o.total_pnl}`);
    console.log(`📈 Average P&L/Trade:       $${o.avg_pnl_per_trade}`);
    console.log(`🏆 Best Trade:              $${o.best_trade}`);
    console.log(`💥 Worst Trade:             $${o.worst_trade}`);
    console.log('');

    // 2. Performance by Symbol
    const bySymbol = await pool.query(`
      SELECT 
        symbol,
        COUNT(*) as trades,
        SUM(CASE WHEN realized_profit > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN realized_profit <= 0 THEN 1 ELSE 0 END) as losses,
        ROUND((SUM(CASE WHEN realized_profit > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*))::numeric, 2) as win_rate,
        ROUND(SUM(realized_profit)::numeric, 2) as total_pnl,
        ROUND(AVG(realized_profit)::numeric, 2) as avg_pnl,
        ROUND(MAX(pnl_pips)::numeric, 2) as best_pips,
        ROUND(MIN(pnl_pips)::numeric, 2) as worst_pips
      FROM positions
      WHERE status = 'CLOSED'
      GROUP BY symbol
      ORDER BY total_pnl DESC
    `);

    console.log('📋 PERFORMANCE BY SYMBOL');
    console.log('─'.repeat(100));
    console.log('Symbol      │ Trades │ Wins │ Losses │ Win% │ Total P&L │ Avg P&L │ Best (pips) │ Worst (pips)');
    console.log('─'.repeat(100));
    bySymbol.rows.forEach(row => {
      console.log(
        `${(row.symbol || 'UNKNOWN').padEnd(11)} │ ${String(row.trades).padEnd(6)} │ ${String(row.wins).padEnd(4)} │ ${String(row.losses).padEnd(6)} │ ${String(row.win_rate).padEnd(4)}% │ $${String(row.total_pnl).padEnd(8)} │ $${String(row.avg_pnl).padEnd(6)} │ ${String(row.best_pips).padEnd(11)} │ ${row.worst_pips}`
      );
    });
    console.log('');

    // 3. Daily Performance
    const byDay = await pool.query(`
      SELECT 
        DATE(closed_at) as trade_date,
        COUNT(*) as daily_trades,
        SUM(CASE WHEN realized_profit > 0 THEN 1 ELSE 0 END) as daily_wins,
        ROUND((SUM(CASE WHEN realized_profit > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*))::numeric, 2) as daily_win_rate,
        ROUND(SUM(realized_profit)::numeric, 2) as daily_pnl,
        ROUND(AVG(realized_profit)::numeric, 2) as daily_avg
      FROM positions
      WHERE status = 'CLOSED'
      GROUP BY DATE(closed_at)
      ORDER BY trade_date DESC
      LIMIT 10
    `);

    console.log('📅 RECENT DAILY PERFORMANCE (Last 10 Days)');
    console.log('─'.repeat(80));
    console.log('Date       │ Trades │ Wins │ Win% │ Daily P&L │ Avg P&L');
    console.log('─'.repeat(80));
    byDay.rows.forEach(row => {
      console.log(
        `${row.trade_date} │ ${String(row.daily_trades).padEnd(6)} │ ${String(row.daily_wins).padEnd(4)} │ ${String(row.daily_win_rate).padEnd(4)}% │ $${String(row.daily_pnl).padEnd(8)} │ $${row.daily_avg}`
      );
    });
    console.log('');

    // 4. Direction Analysis
    const byDirection = await pool.query(`
      SELECT 
        direction,
        COUNT(*) as trades,
        SUM(CASE WHEN realized_profit > 0 THEN 1 ELSE 0 END) as wins,
        ROUND((SUM(CASE WHEN realized_profit > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*))::numeric, 2) as win_rate,
        ROUND(SUM(realized_profit)::numeric, 2) as total_pnl,
        ROUND(AVG(realized_profit)::numeric, 2) as avg_pnl
      FROM positions
      WHERE status = 'CLOSED'
      GROUP BY direction
    `);

    console.log('🔄 PERFORMANCE BY DIRECTION (BUY vs SELL)');
    console.log('─'.repeat(70));
    console.log('Direction │ Trades │ Wins │ Win% │ Total P&L │ Avg P&L');
    console.log('─'.repeat(70));
    byDirection.rows.forEach(row => {
      console.log(
        `${row.direction.padEnd(9)} │ ${String(row.trades).padEnd(6)} │ ${String(row.wins).padEnd(4)} │ ${String(row.win_rate).padEnd(4)}% │ $${String(row.total_pnl).padEnd(8)} │ $${row.avg_pnl}`
      );
    });
    console.log('');

    // 5. Profit Distribution
    const profitBuckets = await pool.query(`
      SELECT 
        CASE 
          WHEN realized_profit > 50 THEN '>$50 (Excellent)'
          WHEN realized_profit > 20 THEN '$20-$50 (Great)'
          WHEN realized_profit > 5 THEN '$5-$20 (Good)'
          WHEN realized_profit > 0 THEN '$0-$5 (Minimal Win)'
          WHEN realized_profit > -5 THEN '-$5-$0 (Small Loss)'
          WHEN realized_profit > -20 THEN '-$20--$5 (Moderate Loss)'
          ELSE '<-$20 (Major Loss)'
        END as profit_range,
        COUNT(*) as count
      FROM positions
      WHERE status = 'CLOSED'
      GROUP BY profit_range
      ORDER BY 
        CASE 
          WHEN realized_profit > 50 THEN 1
          WHEN realized_profit > 20 THEN 2
          WHEN realized_profit > 5 THEN 3
          WHEN realized_profit > 0 THEN 4
          WHEN realized_profit > -5 THEN 5
          WHEN realized_profit > -20 THEN 6
          ELSE 7
        END
    `);

    console.log('📊 PROFIT DISTRIBUTION');
    console.log('─'.repeat(50));
    profitBuckets.rows.forEach(row => {
      const percentage = ((row.count / o.total_trades) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(row.count / 2));
      console.log(`${row.profit_range.padEnd(25)} │ ${String(row.count).padEnd(3)} (${String(percentage).padEnd(5)}%) ${bar}`);
    });
    console.log('');

    // 6. Risk Metrics
    const riskMetrics = await pool.query(`
      SELECT 
        ROUND((SELECT SUM(CASE WHEN realized_profit > 0 THEN realized_profit ELSE 0 END) FROM positions WHERE status = 'CLOSED')::numeric, 2) as total_wins,
        ROUND((SELECT ABS(SUM(CASE WHEN realized_profit < 0 THEN realized_profit ELSE 0 END)) FROM positions WHERE status = 'CLOSED')::numeric, 2) as total_losses,
        ROUND((SELECT AVG(ABS(pnl_pips)) FROM positions WHERE status = 'CLOSED' AND realized_profit > 0)::numeric, 2) as avg_winning_pips,
        ROUND((SELECT AVG(ABS(pnl_pips)) FROM positions WHERE status = 'CLOSED' AND realized_profit <= 0)::numeric, 2) as avg_losing_pips,
        ROUND((SELECT COUNT(*) FROM positions WHERE status = 'CLOSED' AND close_reason LIKE '%TP%')::numeric / (SELECT COUNT(*) FROM positions WHERE status = 'CLOSED') * 100, 2) as tp_hit_rate,
        ROUND((SELECT COUNT(*) FROM positions WHERE status = 'CLOSED' AND close_reason LIKE '%SL%')::numeric / (SELECT COUNT(*) FROM positions WHERE status = 'CLOSED') * 100, 2) as sl_hit_rate
    `);

    console.log('⚠️ RISK ANALYSIS');
    console.log('─'.repeat(50));
    const rm = riskMetrics.rows[0];
    console.log(`Total Winning P&L:          $${rm.total_wins}`);
    console.log(`Total Losing P&L:           $${rm.total_losses}`);
    console.log(`Avg Pips (Winning):         ${rm.avg_winning_pips} pips`);
    console.log(`Avg Pips (Losing):          ${rm.avg_losing_pips} pips`);
    console.log(`TP Hit Rate:                ${rm.tp_hit_rate}%`);
    console.log(`SL Hit Rate:                ${rm.sl_hit_rate}%`);
    console.log('');

    // 7. Streaks
    const streaks = await pool.query(`
      WITH ranked_trades AS (
        SELECT 
          position_id,
          realized_profit,
          closed_at,
          ROW_NUMBER() OVER (ORDER BY closed_at) as trade_num,
          CASE WHEN realized_profit > 0 THEN 'W' ELSE 'L' END as result
        FROM positions
        WHERE status = 'CLOSED'
      )
      SELECT STRING_AGG(result, '') as recent_streak
      FROM (
        SELECT result FROM ranked_trades ORDER BY trade_num DESC LIMIT 50
      ) sub
    `);

    console.log('🔥 RECENT TRADE SEQUENCE (Last 50 trades - W=Win, L=Loss)');
    console.log('─'.repeat(70));
    console.log(streaks.rows[0].recent_streak);
    console.log('');

    console.log('═'.repeat(70));
    console.log('Report Generated:', new Date().toISOString());
    console.log('═'.repeat(70));

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

analyzePerformance();
