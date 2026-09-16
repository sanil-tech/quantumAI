import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function checkGold() {
  const t = new CTraderTransport();
  try {
    await t.connect('demo.ctraderapi.com', 5035);
    await t.sendRequest(2100, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET });
    await t.sendRequest(2102, { ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID), accessToken: process.env.CTRADER_ACCESS_TOKEN });

    const res = await t.sendRequest(2133, {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      fromTimestamp: Date.now() - 90 * 24 * 3600 * 1000,
      toTimestamp: Date.now(),
      maxRows: 500
    });
    const deals = (res.decodedPayload?.deal || []).filter((d: any) => d.closePositionDetail != null && d.symbolId === 41);

    console.log(`Total Gold (XAUUSD) deals: ${deals.length}`);
    let goldPnl = 0;
    let buyPnl = 0;
    let sellPnl = 0;
    let buyCount = 0;
    let sellCount = 0;

    for (const d of deals) {
      const pnl = Number(d.closePositionDetail?.grossProfit || 0) / 100;
      goldPnl += pnl;
      const time = new Date(Number(d.executionTimestamp || 0)).toISOString().split('T')[0];
      const side = d.tradeSide === 1 || d.tradeSide === 'BUY' ? 'BUY' : 'SELL';
      const vol = Number(d.volume || 0) / 10000000;
      if (side === 'BUY') {
        buyPnl += pnl;
        buyCount++;
      } else {
        sellPnl += pnl;
        sellCount++;
      }
      console.log(`Gold [${time}] ${side} Vol=${vol} | PnL: $${pnl.toFixed(2)}`);
    }

    console.log('\n--- RINGKASAN XAUUSD (GOLD) ---');
    console.log(`Jumlah Trade Gold: ${deals.length}`);
    console.log(`Net P&L Gold: $${goldPnl.toFixed(2)}`);
    console.log(`BUY  Gold: ${buyCount} trades | PnL: $${buyPnl.toFixed(2)}`);
    console.log(`SELL Gold: ${sellCount} trades | PnL: $${sellPnl.toFixed(2)}`);

  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await t.disconnect();
    process.exit(0);
  }
}

checkGold();
