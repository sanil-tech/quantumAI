import dotenv from 'dotenv';
dotenv.config();

import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { fetchRealCandleHistory } from '../src/lib/marketDataGenerator';

async function fixEurJpyWithCurrentPrice() {
  console.log('=== FIXING EURJPY WITH LIVE CANDLE PRICE ===');
  const candles = await fetchRealCandleHistory('EUR/JPY', 'M1' as any, 5);
  const latestClose = candles && candles.length > 0 ? candles[candles.length - 1].close : 184.35;
  console.log(`Latest EURJPY Price: ${latestClose}`);

  const ctrader = new CTraderAdapter({
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
    accessToken: process.env.CTRADER_ACCESS_TOKEN,
    accountId: process.env.CTRADER_ACCOUNT_ID || '48282756'
  });

  await ctrader.connect();
  const positions = await ctrader.getOpenPositions();

  for (const pos of positions) {
    if (pos.symbol.includes('EURJPY') || !pos.stopLoss) {
      // For SELL position: SL must be HIGHER than both Entry AND Current Market Price
      const minSafeSl = Math.max(pos.entryPrice + 0.350, latestClose + 0.150);
      const safeTp = Number((pos.entryPrice - 0.700).toFixed(3));
      const safeSl = Number(minSafeSl.toFixed(3));

      console.log(`Pos #${pos.positionId} Entry: ${pos.entryPrice}, Live: ${latestClose} -> Setting SL: ${safeSl}, TP: ${safeTp}...`);
      const ok = await ctrader.amendPositionSLTP(pos.positionId, safeSl, safeTp);
      console.log(`Amend Result for #${pos.positionId}: ${ok ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    }
  }

  console.log('\n=== RE-VERIFYING ALL OPEN POSITIONS ON CTRADER ===');
  const updated = await ctrader.getOpenPositions();
  for (const pos of updated) {
    console.log(`- Verified Position #${pos.positionId} [${pos.symbol}] Entry=${pos.entryPrice}, SL=${pos.stopLoss ?? 'NONE ❌'}, TP=${pos.takeProfit ?? 'NONE ❌'}`);
  }
}

fixEurJpyWithCurrentPrice().catch(console.error);
