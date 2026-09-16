import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function analyzePerformance() {
  const t = new CTraderTransport();
  try {
    await t.connect('demo.ctraderapi.com', 5035);
    await t.sendRequest(2100, {
      clientId: process.env.CTRADER_CLIENT_ID,
      clientSecret: process.env.CTRADER_CLIENT_SECRET
    }, 5000);
    await t.sendRequest(2102, {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      accessToken: process.env.CTRADER_ACCESS_TOKEN
    }, 5000);

    const now = Date.now();
    const days90 = now - 90 * 24 * 3600 * 1000;
    const res = await t.sendRequest(2133, {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      fromTimestamp: days90,
      toTimestamp: now,
      maxRows: 500
    }, 10000);

    const rawDeals = res.decodedPayload?.deal || [];
    const closedDeals = rawDeals.filter((d: any) => d.closePositionDetail != null);

    console.log(`=== CTRADER REAL DEALS ANALYSIS (TOTAL: ${closedDeals.length}) ===\n`);

    // Sort chronologically ascending
    closedDeals.sort((a: any, b: any) => Number(a.executionTimestamp || 0) - Number(b.executionTimestamp || 0));

    let cumPnl = 0;
    let maxDrawdown = 0;
    let peak = 0;

    const pairStats: Record<string, { total: number; wins: number; losses: number; pnl: number; buyPnl: number; sellPnl: number; buyWins: number; buyCount: number; sellWins: number; sellCount: number }> = {};
    const sideStats = {
      BUY: { count: 0, wins: 0, losses: 0, pnl: 0 },
      SELL: { count: 0, wins: 0, losses: 0, pnl: 0 }
    };

    // Time buckets (e.g., first 100 trades vs middle vs last 50 trades)
    const segments: Array<{ label: string; count: number; wins: number; pnl: number; start: string; end: string }> = [];

    // Let's inspect trade by trade
    const parsedDeals = closedDeals.map((d: any, idx: number) => {
      const pnlCents = Number(d.closePositionDetail?.grossProfit || 0);
      const moneyDigits = d.closePositionDetail?.moneyDigits ?? 2;
      const netPnl = pnlCents / Math.pow(10, moneyDigits);
      const side = d.tradeSide === 1 || d.tradeSide === 'BUY' ? 'BUY' : 'SELL';
      const symId = d.symbolId;
      const vol = Number(d.volume || 0) / 10000000;
      const time = new Date(Number(d.executionTimestamp || 0));

      cumPnl += netPnl;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDrawdown) maxDrawdown = dd;

      // Side stats
      if (side === 'BUY') {
        sideStats.BUY.count++;
        sideStats.BUY.pnl += netPnl;
        if (netPnl > 0) sideStats.BUY.wins++;
        else if (netPnl < 0) sideStats.BUY.losses++;
      } else {
        sideStats.SELL.count++;
        sideStats.SELL.pnl += netPnl;
        if (netPnl > 0) sideStats.SELL.wins++;
        else if (netPnl < 0) sideStats.SELL.losses++;
      }

      // Pair stats
      const symKey = `Sym_${symId}`;
      if (!pairStats[symKey]) {
        pairStats[symKey] = { total: 0, wins: 0, losses: 0, pnl: 0, buyPnl: 0, sellPnl: 0, buyWins: 0, buyCount: 0, sellWins: 0, sellCount: 0 };
      }
      pairStats[symKey].total++;
      pairStats[symKey].pnl += netPnl;
      if (netPnl > 0) pairStats[symKey].wins++;
      else if (netPnl < 0) pairStats[symKey].losses++;

      if (side === 'BUY') {
        pairStats[symKey].buyCount++;
        pairStats[symKey].buyPnl += netPnl;
        if (netPnl > 0) pairStats[symKey].buyWins++;
      } else {
        pairStats[symKey].sellCount++;
        pairStats[symKey].sellPnl += netPnl;
        if (netPnl > 0) pairStats[symKey].sellWins++;
      }

      return { idx, time: time.toISOString(), netPnl, cumPnl, side, symId, vol };
    });

    console.log('--- STATISTIK KESELURUHAN BUY vs SELL ---');
    console.log(`BUY : ${sideStats.BUY.count} trades | Wins: ${sideStats.BUY.wins} (${((sideStats.BUY.wins/sideStats.BUY.count)*100).toFixed(1)}%) | PnL: $${sideStats.BUY.pnl.toFixed(2)}`);
    console.log(`SELL: ${sideStats.SELL.count} trades | Wins: ${sideStats.SELL.wins} (${((sideStats.SELL.wins/sideStats.SELL.count)*100).toFixed(1)}%) | PnL: $${sideStats.SELL.pnl.toFixed(2)}`);

    // Split into 3 phases:
    // Phase 1: Early trades (e.g. before the big drawdown drop)
    // Phase 2: The drawdown drop trades
    // Phase 3: The recovery phase (recent trades)
    // Find min cumPnl index
    let minCumIdx = 0;
    let minCum = 0;
    parsedDeals.forEach((p, i) => {
      if (p.cumPnl < minCum) {
        minCum = p.cumPnl;
        minCumIdx = i;
      }
    });

    console.log(`\n--- TIKET TERENDAH (MAX DRAWDOWN BOTTOM) ---`);
    console.log(`Titik terendah berlaku pada trade #${minCumIdx + 1} (${parsedDeals[minCumIdx]?.time}) dengan Kumulatif PnL: $${minCum.toFixed(2)}`);

    const preDrop = parsedDeals.slice(0, 50);
    const dropPhase = parsedDeals.slice(50, minCumIdx + 1);
    const recoveryPhase = parsedDeals.slice(minCumIdx + 1);

    const calcPhase = (arr: typeof parsedDeals, name: string) => {
      const wins = arr.filter(x => x.netPnl > 0);
      const losses = arr.filter(x => x.netPnl < 0);
      const pnl = arr.reduce((acc, x) => acc + x.netPnl, 0);
      const winRate = arr.length > 0 ? (wins.length / arr.length) * 100 : 0;
      const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b.netPnl, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b.netPnl, 0) / losses.length) : 0;
      console.log(`\n[${name}] (${arr.length} trades: ${arr[0]?.time} -> ${arr[arr.length-1]?.time})`);
      console.log(`   P&L Bersih : $${pnl.toFixed(2)}`);
      console.log(`   Win Rate   : ${winRate.toFixed(1)}% (${wins.length}W / ${losses.length}L)`);
      console.log(`   Purata Win : +$${avgWin.toFixed(2)} | Purata Loss: -$${avgLoss.toFixed(2)}`);
    };

    calcPhase(parsedDeals.slice(0, minCumIdx + 1), 'FASA 1 & 2: SEBELUM & SEMASA KEJATUHAN (DULU)');
    calcPhase(recoveryPhase, 'FASA 3: FASA PEMULIHAN / RECENT RECOVERY (TERKINI)');

    console.log('\n--- 10 TRADE TERAKHIR (LATEST 10 TRADES) ---');
    parsedDeals.slice(-10).forEach(d => {
      console.log(`Trade #${d.idx + 1} [${d.time.split('T')[0]}] ${d.side} Sym#${d.symId} Vol=${d.vol} | PnL: $${d.netPnl.toFixed(2)} (Cum: $${d.cumPnl.toFixed(2)})`);
    });

  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await t.disconnect();
    process.exit(0);
  }
}

analyzePerformance();
