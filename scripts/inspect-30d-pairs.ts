import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function checkRecentPairs() {
  const t = new CTraderTransport();
  try {
    await t.connect('demo.ctraderapi.com', 5035);
    await t.sendRequest(2100, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET });
    await t.sendRequest(2102, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID), accessToken: process.env.CTRADER_ACCESS_TOKEN });

    // 30 days
    const res = await t.sendRequest(2133, {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      fromTimestamp: Date.now() - 30 * 24 * 3600 * 1000,
      toTimestamp: Date.now(),
      maxRows: 500
    });
    const deals = (res.decodedPayload?.deal || []).filter((d: any) => d.closePositionDetail != null);

    // Also let's get symbol names by symbolId
    const symListRes = await t.sendRequest(2114, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID), includeArchivedSymbols: false });
    const symbols = symListRes.decodedPayload?.symbol || [];
    const symMap = new Map<number, string>();
    symbols.forEach((s: any) => symMap.set(Number(s.symbolId), s.symbolName));

    const bySym: Record<string, { count: number; wins: number; pnl: number }> = {};
    for (const d of deals) {
      const symName = symMap.get(Number(d.symbolId)) || ('ID#' + d.symbolId);
      if (!bySym[symName]) bySym[symName] = { count: 0, wins: 0, pnl: 0 };
      const pnl = Number(d.closePositionDetail?.grossProfit || 0) / 100;
      bySym[symName].count++;
      bySym[symName].pnl += pnl;
      if (pnl > 0) bySym[symName].wins++;
    }

    console.log('--- 30-DAY PERFORMANCE BY PAIR ---');
    Object.entries(bySym).sort((a, b) => b[1].pnl - a[1].pnl).forEach(([k, v]) => {
      const winRate = ((v.wins / v.count) * 100).toFixed(1);
      console.log(k.padEnd(16) + `Trades: ${v.count.toString().padEnd(4)} | Wins: ${v.wins.toString().padEnd(3)} (${winRate}%) | Net P&L: $${v.pnl.toFixed(2)}`);
    });

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await t.disconnect();
    process.exit(0);
  }
}
checkRecentPairs();
