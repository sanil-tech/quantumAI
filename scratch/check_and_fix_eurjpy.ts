import dotenv from 'dotenv';
dotenv.config();

import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function checkAndFixEurJpy() {
  const ctrader = new CTraderAdapter({
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
    accessToken: process.env.CTRADER_ACCESS_TOKEN,
    accountId: process.env.CTRADER_ACCOUNT_ID || '48282756'
  });

  await ctrader.connect();
  const positions = await ctrader.getOpenPositions();
  console.log(`Open positions (${positions.length}):`);
  for (const pos of positions) {
    console.log(`- #${pos.positionId} [${pos.symbol}] Side=${pos.tradeSide}, Entry=${pos.entryPrice}, SL=${pos.stopLoss ?? 'NONE ❌'}, TP=${pos.takeProfit ?? 'NONE ❌'}`);
    
    if (pos.symbol.includes('EURJPY') || pos.symbol.includes('JPY') || !pos.stopLoss) {
      const entry = pos.entryPrice;
      const isJpy = pos.symbol.includes('JPY');
      const slOffset = isJpy ? 0.350 : 0.0030;
      const tpOffset = isJpy ? 0.700 : 0.0060;

      const newSl = pos.tradeSide === 'BUY' ? Number((entry - slOffset).toFixed(3)) : Number((entry + slOffset).toFixed(3));
      const newTp = pos.tradeSide === 'BUY' ? Number((entry + tpOffset).toFixed(3)) : Number((entry - tpOffset).toFixed(3));

      console.log(`Applying safe absolute SL/TP to #${pos.positionId} (${pos.symbol}): SL=${newSl}, TP=${newTp}...`);
      const ok = await ctrader.amendPositionSLTP(pos.positionId, newSl, newTp);
      console.log(`Result: ${ok ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    }
  }

  const updated = await ctrader.getOpenPositions();
  console.log('\nVerified positions:');
  for (const pos of updated) {
    console.log(`- #${pos.positionId} [${pos.symbol}] Entry=${pos.entryPrice}, SL=${pos.stopLoss}, TP=${pos.takeProfit}`);
  }
}

checkAndFixEurJpy().catch(console.error);
