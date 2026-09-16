import 'dotenv/config';
import { Pool } from 'pg';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';
import { PairDailyRangeService } from '../src/server/services/pairDailyRangeService';

async function applyAdrToLiveTrades() {
  console.log('===========================================================');
  console.log('⚡ APPLYING NEW ADR INTRADAY RULES TO LIVE CTRADER BROKER POSITIONS');
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

  // 1. Reconcile live positions from broker
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

  for (const pos of positions) {
    const rawSym = symbolMap[pos.tradeData?.symbolId] || 'UNKNOWN';
    const formattedSym = rawSym.length === 6 ? `${rawSym.slice(0, 3)}/${rawSym.slice(3)}` : rawSym;
    const direction = pos.tradeData?.tradeSide === 2 ? 'SELL' : 'BUY';
    const volumeLots = Number(pos.tradeData?.volume || 0) / 10000000;
    const entryPrice = Number(pos.price);
    const posId = pos.positionId;

    const intraday = PairDailyRangeService.calculateIntradayTargets(formattedSym, direction as 'BUY' | 'SELL', entryPrice);

    // If position is already scaled down to 0.01 lot (like EUR/USD), active broker TP is TP2 (runner)
    // If position is 0.02 lots (unscaled), active broker TP is TP1
    const isScaled = volumeLots <= 0.0101 && pos.symbolId === 1; // EUR/USD runner
    const targetTp = isScaled ? intraday.tp2Price : intraday.tp1Price;
    const currentSl = Number(pos.stopLoss || intraday.slPrice);

    console.log(`📌 Updating Position #${posId} (${formattedSym} ${direction} ${volumeLots} lots):`);
    console.log(`   • Entry: ${entryPrice}`);
    console.log(`   • ADR Target: TP1=${intraday.tp1Price} (${intraday.tp1Pips} pips), TP2=${intraday.tp2Price} (${intraday.tp2Pips} pips)`);
    console.log(`   • Setting Broker cTrader TP to: ${targetTp}`);

    // Send amend request to cTrader broker
    try {
      const amendRes = await transport.sendRequest(2110, {
        ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
        positionId: posId,
        stopLoss: currentSl,
        takeProfit: targetTp
      });
      console.log(`   ✅ cTrader Broker Response: PayloadType ${amendRes.payloadType} (TP successfully amended on broker!)`);
    } catch (err: any) {
      console.warn(`   ⚠️ Broker amend notice for #${posId}: ${err.message}`);
    }

    // Update in PostgreSQL Database
    await pool.query(`
      UPDATE positions
      SET
        take_profit = $1,
        take_profit_2 = $2,
        updated_at = NOW()
      WHERE position_id = $3 OR ticket_id = $4
    `, [intraday.tp1Price, intraday.tp2Price, `trade_${posId}`, String(posId)]);

    console.log(`   ✅ Synced to Database & State.\n`);
  }

  // 2. Fetch back from cTrader to verify actual applied prices
  console.log('===========================================================');
  console.log('🔍 VERIFYING CTRADER BROKER APPLIED VALUES AFTER UPDATE:');
  console.log('===========================================================');
  const verifyRes = await transport.sendRequest(2124, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  });
  const updatedPositions = verifyRes.decodedPayload?.position || [];
  for (const p of updatedPositions) {
    const rawSym = symbolMap[p.tradeData?.symbolId] || 'UNKNOWN';
    const formattedSym = rawSym.length === 6 ? `${rawSym.slice(0, 3)}/${rawSym.slice(3)}` : rawSym;
    console.log(`• #${p.positionId} ${formattedSym} | Lots: ${Number(p.tradeData?.volume || 0) / 10000000} | SL: ${p.stopLoss} | Active Broker TP: ${p.takeProfit}`);
  }

  await pool.end();
  await transport.disconnect();
}

applyAdrToLiveTrades().catch(console.error);
