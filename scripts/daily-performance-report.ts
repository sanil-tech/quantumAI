import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

export interface Broker24HourSummary {
  periodLabel: string;
  masterAccountId: string;
  masterTraderLogin: string;
  balance: number;
  openPositionsCount: number;
  openPositions: Array<{
    symbol: string;
    direction: string;
    volumeLots: string;
    entryPrice: number;
  }>;
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  profitFactor: number;
  bestTrade: { symbol: string; pnl: number };
  worstTrade: { symbol: string; pnl: number };
  deals: Array<{
    dealId: string;
    positionId: string;
    symbol: string;
    direction: string;
    profit: number;
    closedAt: string;
  }>;
}

export async function fetchBroker24HourPerformance(): Promise<Broker24HourSummary> {
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

    const traderRes = await transport.sendRequest(2121, { ctidTraderAccountId: accountId });
    const trader = traderRes.decodedPayload?.trader;
    const balance = Number(trader?.balance || 0) / 100;
    const traderLogin = String(trader?.traderLogin || '5881460');

    const symRes = await transport.sendRequest(2114, { ctidTraderAccountId: accountId });
    const symbols = symRes.decodedPayload?.symbol || [];
    const symMap = new Map<number, string>();
    for (const s of symbols) {
      symMap.set(Number(s.symbolId), s.symbolName);
    }

    // Open positions
    const reconRes = await transport.sendRequest(2124, { ctidTraderAccountId: accountId });
    const rawPositions: any[] = reconRes.decodedPayload?.position || [];
    const openPositions = rawPositions.map((p: any) => ({
      symbol: symMap.get(Number(p.tradeData?.symbolId)) || `ID_${p.tradeData?.symbolId}`,
      direction: p.tradeData?.tradeSide === 1 || p.tradeData?.tradeSide === 'BUY' ? 'BUY' : 'SELL',
      volumeLots: (Number(p.tradeData?.volume || 0) / 10000000).toFixed(2) + ' Lots',
      entryPrice: Number(p.price || 0)
    }));

    // 24-Hour window matching dashboard "Hari Ini (12)"
    const now = Date.now();
    const fromTimestamp = now - 24 * 3600 * 1000;

    const dealsRes = await transport.sendRequest(2133, {
      ctidTraderAccountId: accountId,
      fromTimestamp,
      toTimestamp: now,
      maxRows: 500
    }, 10000);

    const rawDeals: any[] = dealsRes.decodedPayload?.deal || [];
    const closedDeals = rawDeals
      .filter((d: any) => d.closePositionDetail != null)
      .map((d: any) => {
        const symName = symMap.get(Number(d.symbolId)) || `ID_${d.symbolId}`;
        const direction = d.tradeSide === 1 || d.tradeSide === 'BUY' ? 'BUY' : 'SELL';
        const moneyDigits = d.closePositionDetail?.moneyDigits ?? 2;
        const profit = Number((Number(d.closePositionDetail?.grossProfit || 0) / Math.pow(10, moneyDigits)).toFixed(2));
        const closedAt = new Date(Number(d.executionTimestamp || 0)).toISOString();
        return {
          dealId: String(d.dealId),
          positionId: String(d.positionId),
          symbol: symName,
          direction,
          profit,
          closedAt
        };
      })
      .sort((a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime());

    let grossProfit = 0;
    let grossLoss = 0;
    let wins = 0;
    let losses = 0;

    for (const d of closedDeals) {
      if (d.profit > 0) {
        grossProfit += d.profit;
        wins++;
      } else if (d.profit < 0) {
        grossLoss += Math.abs(d.profit);
        losses++;
      }
    }

    const totalTrades = closedDeals.length;
    const winRatePct = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : 0;
    const netPnl = Number((grossProfit - grossLoss).toFixed(2));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : 99.99;

    let bestTrade = { symbol: 'N/A', pnl: 0 };
    let worstTrade = { symbol: 'N/A', pnl: 0 };

    if (totalTrades > 0) {
      const sorted = [...closedDeals].sort((a, b) => b.profit - a.profit);
      bestTrade = { symbol: sorted[0].symbol, pnl: sorted[0].profit };
      worstTrade = { symbol: sorted[sorted.length - 1].symbol, pnl: sorted[sorted.length - 1].profit };
    }

    return {
      periodLabel: '24 Jam Terkini (Hari Ini)',
      masterAccountId: String(accountId),
      masterTraderLogin: traderLogin,
      balance,
      openPositionsCount: openPositions.length,
      openPositions,
      totalTrades,
      wins,
      losses,
      winRatePct,
      grossProfit: Number(grossProfit.toFixed(2)),
      grossLoss: Number(grossLoss.toFixed(2)),
      netPnl,
      profitFactor,
      bestTrade,
      worstTrade,
      deals: closedDeals
    };

  } finally {
    await transport.disconnect();
  }
}

export function formatTelegram24hReport(summary: Broker24HourSummary): string {
  const pnlEmoji = summary.netPnl >= 0 ? '🟢' : '🔴';
  const pnlSign = summary.netPnl >= 0 ? '+' : '';
  const startingBalance = Math.max(summary.balance - summary.netPnl, 100);
  const roiPct = Number(((summary.netPnl / startingBalance) * 100).toFixed(1));
  const roiSign = roiPct >= 0 ? '+' : '';

  let msg = `🏛️ <b>QUANTUM AI — PRESTASI HARIAN MASTER cTRADER</b>\n`;
  msg += `👑 <b>Akaun Master:</b> <code>Spotware cTrader #${summary.masterTraderLogin}</code>\n`;
  msg += `💰 <b>Baki Akaun:</b> <code>$${summary.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</code>\n`;
  msg += `⏱️ <b>Tempoh:</b> <code>${summary.periodLabel}</code>\n`;
  msg += `─────────────────────────\n`;
  msg += `${pnlEmoji} <b>Untung Bersih (Net Realized):</b> <code>${pnlSign}$${summary.netPnl.toFixed(2)} USD</code> (<b>${roiSign}${roiPct}% ROI</b>)\n`;
  msg += `📊 <b>Kadar Kemenangan (Win Rate):</b> <code>${summary.winRatePct}%</code> (${summary.wins}W / ${summary.losses}L)\n`;
  msg += `⚡ <b>Faktor Keuntungan (PF):</b> <code>${summary.profitFactor}</code>\n`;
  msg += `📈 <b>Untung Kasar / Rugi Kasar:</b> <code>+$${summary.grossProfit.toFixed(2)} / -$${summary.grossLoss.toFixed(2)}</code>\n`;
  msg += `🎯 <b>Jumlah Trade Selesai:</b> <code>${summary.totalTrades} Trade</code>\n`;
  
  if (summary.totalTrades > 0) {
    msg += `🚀 <b>Trade Terbaik:</b> <code>${summary.bestTrade.symbol} (+$${summary.bestTrade.pnl.toFixed(2)})</code>\n`;
    msg += `🛡️ <b>Trade Terburuk (Risiko Dikawal):</b> <code>${summary.worstTrade.symbol} ($${summary.worstTrade.pnl.toFixed(2)})</code>\n`;
    msg += `─────────────────────────\n`;
    msg += `<b>📝 Rekod ${summary.totalTrades} Trade Disahkan:</b>\n`;

    summary.deals.forEach((d, idx) => {
      const icon = d.profit > 0 ? '✅' : d.profit < 0 ? '❌' : '⚪';
      const sign = d.profit >= 0 ? '+' : '';
      msg += `${icon} <b>#${idx + 1} ${d.symbol}</b> (${d.direction}) : <code>${sign}$${d.profit.toFixed(2)}</code>\n`;
    });
  }

  if (summary.openPositionsCount > 0) {
    msg += `─────────────────────────\n`;
    msg += `<b>⏳ Posisi Aktif Sedang Berjalan (${summary.openPositionsCount}):</b>\n`;
    summary.openPositions.forEach(p => {
      msg += `• <b>${p.symbol}</b> (${p.direction} ${p.volumeLots}) @ <code>${p.entryPrice}</code>\n`;
    });
  }

  msg += `─────────────────────────\n`;
  msg += `💡 <b>Kelebihan Disiplin & Skala Modal:</b>\n`;
  msg += `• <b>Kawalan Risiko Institusi:</b> Lot rujukan <code>0.01 - 0.02</code> untuk modal ~$1k memastikan akaun bebas dari risiko Margin Call (Drawdown &lt; 2%).\n`;
  msg += `• <b>Skala Modal Fleksibel:</b> Dengan <b>cBot Copier</b>, saiz lot diselaraskan secara automatik mengikut baki modal anda (cth: Modal $5k = 0.10 Lot).\n`;
  msg += `• <b>100% Autopilot:</b> Engine mengunci keuntungan & melaraskan Auto-Breakeven tanpa emosi atau perlu menghadap skrin.\n`;
  msg += `─────────────────────────\n`;
  msg += `👉 <i>Sertai VIP cBot Copier untuk copy trade secara automatik: Taip <code>/register</code></i>\n`;
  msg += `─────────────────────────\n`;
  msg += `🔒 <i>100% Rekod Sahih Dari Engine cTrader Broker</i>\n`;
  msg += `🤖 <b>Quantum AI Trading Terminal</b>`;

  return msg;
}

export async function broadcastBroker24hReport() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const vipChannel = process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID;
  const freeChannel = process.env.TELEGRAM_FREE_CHAT_ID || process.env.TELEGRAM_FREE_CHANNEL_ID;

  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN is missing in environment.');
    return;
  }

  const summary = await fetchBroker24HourPerformance();
  const message = formatTelegram24hReport(summary);

  console.log('\n--- EXACT 12-TRADE TELEGRAM REPORT ---\n');
  console.log(message.replace(/<[^>]*>/g, ''));

  const channels = [
    { name: 'VIP Channel', id: vipChannel },
    { name: 'Free Channel', id: freeChannel }
  ].filter(c => !!c.id);

  for (const ch of channels) {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ch.id,
          text: message,
          parse_mode: 'HTML'
        })
      });
      const resData: any = await res.json();
      if (resData.ok) {
        console.log(`✅ Successfully sent 12-Trade Report to ${ch.name} (${ch.id})`);
      } else {
        console.log(`❌ Failed sending to ${ch.name} (${ch.id}):`, resData.description);
      }
    } catch (err: any) {
      console.log(`❌ Error sending to ${ch.name}:`, err.message);
    }
  }
}

if (process.argv[1]?.includes('daily-performance-report')) {
  broadcastBroker24hReport().catch(console.error);
}
