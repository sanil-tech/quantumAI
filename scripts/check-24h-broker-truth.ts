import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function check24HourDeals() {
  const host = 'demo.ctraderapi.com';
  const port = 5035;
  const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
  const accessToken = (process.env.CTRADER_ACCESS_TOKEN || '').trim();
  const accountId = Number((process.env.CTRADER_ACCOUNT_ID || '48282756').trim());

  const transport = new CTraderTransport();
  await transport.connect(host, port, 10000);

  try {
    await transport.sendRequest(2100, { clientId, clientSecret });
    await transport.sendRequest(2102, { ctidTraderAccountId: accountId, accessToken });

    const symRes = await transport.sendRequest(2114, { ctidTraderAccountId: accountId });
    const symbols = symRes.decodedPayload?.symbol || [];
    const symMap = new Map<number, string>();
    for (const s of symbols) {
      symMap.set(Number(s.symbolId), s.symbolName);
    }

    const now = Date.now();
    const from24h = now - 24 * 3600 * 1000;

    const dealsRes = await transport.sendRequest(2133, {
      ctidTraderAccountId: accountId,
      fromTimestamp: from24h,
      toTimestamp: now,
      maxRows: 100
    }, 10000);

    const rawDeals: any[] = dealsRes.decodedPayload?.deal || [];
    const closedDeals = rawDeals.filter((d: any) => d.closePositionDetail != null);

    console.log('\n====================================================');
    console.log('   cTRADER 24-HOUR ACTIVE TRADING WINDOW (12 TRADES)  ');
    console.log('====================================================\n');

    let totalProfit = 0;
    let totalLoss = 0;
    let wins = 0;
    let losses = 0;

    const parsed = closedDeals.map((d: any, idx: number) => {
      const symName = symMap.get(Number(d.symbolId)) || 'Sym_' + d.symbolId;
      const side = d.tradeSide === 1 || d.tradeSide === 'BUY' ? 'BUY' : 'SELL';
      const moneyDigits = d.closePositionDetail?.moneyDigits ?? 2;
      const profit = Number((Number(d.closePositionDetail?.grossProfit || 0) / Math.pow(10, moneyDigits)).toFixed(2));
      const closeTime = new Date(Number(d.executionTimestamp || 0)).toISOString();

      if (profit > 0) {
        totalProfit += profit;
        wins++;
      } else if (profit < 0) {
        totalLoss += Math.abs(profit);
        losses++;
      }

      return {
        '#': idx + 1,
        'Deal ID': d.dealId,
        'Position ID': d.positionId,
        'Symbol': symName,
        'Side': side,
        'Profit ($)': profit >= 0 ? '+$' + profit.toFixed(2) : '-$' + Math.abs(profit).toFixed(2),
        'Closed Time (UTC)': closeTime
      };
    });

    console.table(parsed);
    const netPnl = totalProfit - totalLoss;
    const pf = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : 'N/A';
    const wr = closedDeals.length > 0 ? ((wins / closedDeals.length) * 100).toFixed(1) + '%' : '0%';

    console.log('\n--- 24-HOUR STATISTICAL SUMMARY (EXACT DASHBOARD MATCH) ---');
    console.log('Jumlah Trade (Total Trades) : ' + closedDeals.length);
    console.log('Kadar Kemenangan (Win Rate)  : ' + wr + ' (' + wins + 'W / ' + losses + 'L)');
    console.log('Untung Kasar (Total Profit)  : +$' + totalProfit.toFixed(2));
    console.log('Rugi Kasar (Total Loss)      : -$' + totalLoss.toFixed(2));
    console.log('Untung Bersih (Net Realized) : ' + (netPnl >= 0 ? '+' : '') + '$' + netPnl.toFixed(2));
    console.log('Faktor Keuntungan (PF)       : ' + pf);

    console.log('\n====================================================\n');

  } finally {
    await transport.disconnect();
  }
}

check24HourDeals().catch(console.error);
