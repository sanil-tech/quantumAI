import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function computeOverallPerformance() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('=== CALCULATING HISTORICAL & REAL-TIME PERFORMANCE ===');

  // 1. Database Stats
  const res = await client.query(`
    SELECT 
      count(*) as total_trades,
      count(*) FILTER (WHERE status = 'CLOSED') as closed_trades,
      count(*) FILTER (WHERE status = 'OPEN') as open_trades,
      count(*) FILTER (WHERE status = 'CLOSED' AND realized_profit > 0) as win_count,
      count(*) FILTER (WHERE status = 'CLOSED' AND realized_profit < 0) as loss_count,
      count(*) FILTER (WHERE status = 'CLOSED' AND (realized_profit = 0 OR realized_profit IS NULL)) as breakeven_count,
      COALESCE(SUM(realized_profit) FILTER (WHERE status = 'CLOSED'), 0) as total_pnl,
      COALESCE(SUM(realized_profit) FILTER (WHERE status = 'CLOSED' AND realized_profit > 0), 0) as gross_profit,
      COALESCE(ABS(SUM(realized_profit) FILTER (WHERE status = 'CLOSED' AND realized_profit < 0)), 0) as gross_loss,
      COALESCE(SUM(pnl_pips) FILTER (WHERE status = 'CLOSED'), 0) as total_pips
    FROM positions
  `);

  const s = res.rows[0];
  const winCount = Number(s.win_count || 0);
  const lossCount = Number(s.loss_count || 0);
  const decisiveTrades = winCount + lossCount;
  const winRate = decisiveTrades > 0 ? ((winCount / decisiveTrades) * 100).toFixed(1) : 'N/A';
  const grossProfit = Number(s.gross_profit || 0);
  const grossLoss = Number(s.gross_loss || 0);
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 'MAX' : '1.00');

  console.log({
    totalPositions: Number(s.total_trades),
    closedPositions: Number(s.closed_trades),
    openPositions: Number(s.open_trades),
    wins: winCount,
    losses: lossCount,
    breakevenOrCleaned: Number(s.breakeven_count),
    winRate: `${winRate}%`,
    realizedPnl: `$${Number(s.total_pnl).toFixed(2)}`,
    grossProfit: `$${grossProfit.toFixed(2)}`,
    grossLoss: `$${grossLoss.toFixed(2)}`,
    profitFactor,
    totalPips: `${Number(s.total_pips).toFixed(1)} pips`
  });

  // 2. Breakdown by Symbol
  const symRes = await client.query(`
    SELECT 
      symbol,
      count(*) as total,
      count(*) FILTER (WHERE realized_profit > 0) as wins,
      count(*) FILTER (WHERE realized_profit < 0) as losses,
      COALESCE(SUM(realized_profit), 0) as pnl,
      COALESCE(SUM(pnl_pips), 0) as pips
    FROM positions
    WHERE status = 'CLOSED'
    GROUP BY symbol
    ORDER BY pnl DESC
  `);

  console.log('\n=== PERFORMANCE BREAKDOWN BY PAIR / ASSET ===');
  console.table(symRes.rows.map(r => ({
    Symbol: r.symbol,
    Total: Number(r.total),
    Wins: Number(r.wins),
    Losses: Number(r.losses),
    'Win Rate': (Number(r.wins) + Number(r.losses)) > 0 ? `${((Number(r.wins) / (Number(r.wins) + Number(r.losses))) * 100).toFixed(1)}%` : '-',
    'Net PnL ($)': `$${Number(r.pnl).toFixed(2)}`,
    'Net Pips': `${Number(r.pips).toFixed(1)}`
  })));

  // 3. Live cTrader Open Positions
  const ctrader = new CTraderAdapter({
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
    accessToken: process.env.CTRADER_ACCESS_TOKEN,
    accountId: process.env.CTRADER_ACCOUNT_ID || '48282756'
  });

  await ctrader.connect();
  const openPos = await ctrader.getOpenPositions();
  console.log(`\n=== LIVE OPEN CTRADER POSITIONS (${openPos.length}) ===`);
  console.table(openPos.map(p => ({
    PosId: p.positionId,
    Symbol: p.symbol,
    Side: p.tradeSide,
    Volume: p.volume,
    Entry: p.entryPrice,
    SL: p.stopLoss,
    TP: p.takeProfit
  })));

  await client.end();
}

computeOverallPerformance().catch(console.error);
