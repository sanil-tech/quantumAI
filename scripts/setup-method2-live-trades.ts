import 'dotenv/config';
import { Pool } from 'pg';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';
import { PairDailyRangeService } from '../src/server/services/pairDailyRangeService';

async function setupMethod2LiveTrades() {
  console.log('===========================================================');
  console.log('⚡ APPLYING METHOD 2 SETUP TO ACTIVE LIVE POSITIONS');
  console.log('===========================================================');

  const transport = new CTraderTransport();
  await transport.connect('demo.ctraderapi.com', 5035);

  await transport.sendRequest(2100, {
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET
  });

  await transport.sendRequest(2102, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    accessToken: process.env.CTRADER_ACCESS_TOKEN
  });

  // Reconcile open positions
  const reconRes = await transport.sendRequest(2124, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  });

  const positions = reconRes.decodedPayload?.position || [];
  console.log(`Found ${positions.length} active live positions on cTrader.\n`);

  const symbolsRes = await transport.sendRequest(2114, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  });
  const symbolMap: Record<number, string> = {};
  (symbolsRes.decodedPayload?.symbol || []).forEach((s: any) => {
    symbolMap[s.symbolId] = s.symbolName;
  });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const configuredTrades: any[] = [];

  for (const pos of positions) {
    const rawSym = symbolMap[pos.tradeData?.symbolId] || 'UNKNOWN';
    const formattedSym = rawSym.length === 6 ? `${rawSym.slice(0, 3)}/${rawSym.slice(3)}` : rawSym;
    const direction = pos.tradeData?.tradeSide === 2 ? 'SELL' : 'BUY';
    const volumeLots = Number(pos.tradeData?.volume || 200000) / 10000000;
    const entryPrice = Number(pos.price);
    const posId = pos.positionId;

    // Calculate Intraday TP1 and TP2 based on Pair ADR Profile:
    const intraday = PairDailyRangeService.calculateIntradayTargets(formattedSym, direction as 'BUY' | 'SELL', entryPrice);
    const tp1 = intraday.tp1Price;
    const tp2 = intraday.tp2Price;
    const currentSl = Number(pos.stopLoss || intraday.slPrice);
    const breakEvenSl = entryPrice;

    console.log(`📌 Position #${posId} | ${formattedSym} (${direction}) | ${volumeLots} Lots:`);
    console.log(`   • ADR (20-day Range): ${intraday.adrPips} pips`);
    console.log(`   • Entry Price: ${entryPrice}`);
    console.log(`   • Current SL:  ${currentSl} (${intraday.slPips} pips)`);
    console.log(`   • Break-Even SL Level: ${breakEvenSl}`);
    console.log(`   • Stage 1 (TP1): ${tp1} (+${intraday.tp1Pips} pips) -> Jangkaan: ${intraday.expectedDurationHours.tp1}`);
    console.log(`   • Stage 2 (TP2): ${tp2} (+${intraday.tp2Pips} pips) -> Jangkaan: ${intraday.expectedDurationHours.tp2}`);

    // Update in database with dual targets
    await pool.query(`
      UPDATE positions
      SET
        take_profit = $1,
        take_profit_2 = $2,
        updated_at = NOW()
      WHERE position_id = $3 OR ticket_id = $4
    `, [tp1, tp2, `trade_${posId}`, String(posId)]);

    configuredTrades.push({
      positionId: posId,
      symbol: formattedSym,
      direction,
      lots: volumeLots,
      entryPrice,
      currentSl,
      breakEvenSl,
      takeProfit1: tp1,
      takeProfit2: tp2,
      method2Status: 'ACTIVE_ARMED'
    });
    console.log('   ✅ Method 2 Configured & Armed in database.\n');
  }

  await pool.end();
  await transport.disconnect();

  return configuredTrades;
}

setupMethod2LiveTrades().catch(err => {
  console.error('Setup error:', err.message);
  process.exit(1);
});
