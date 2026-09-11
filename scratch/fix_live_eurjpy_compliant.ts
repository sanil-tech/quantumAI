import dotenv from 'dotenv';
dotenv.config();

import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { ctraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';

async function fixLiveEurJpyWithLiveSpread() {
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
    if (pos.symbol.includes('EURJPY') || pos.symbol.includes('JPY') || !pos.stopLoss) {
      const isJpy = pos.symbol.includes('JPY');
      const slOffset = isJpy ? 0.350 : 0.0030;
      const tpOffset = isJpy ? 0.700 : 0.0060;

      const liveTick = ctraderMarketDataFeedService.getLatestTick(pos.symbol as any) ||
                       ctraderMarketDataFeedService.getLatestTick(pos.symbol.replace('/', '') as any);
      const currentAsk = liveTick?.ask && liveTick.ask > 0 ? liveTick.ask : (pos.entryPrice + 0.50);
      const currentBid = liveTick?.bid && liveTick.bid > 0 ? liveTick.bid : (pos.entryPrice - 0.50);

      const buffer = isJpy ? 0.050 : 0.0005; // 5 pips safe margin buffer beyond live ask/bid

      let newSl: number;
      let newTp: number;

      if (pos.tradeSide === 'SELL') {
        // For SELL: SL must be >= current Ask + buffer
        const desiredSl = pos.entryPrice + slOffset;
        newSl = Number(Math.max(desiredSl, currentAsk + buffer).toFixed(3));
        newTp = Number((pos.entryPrice - tpOffset).toFixed(3));
      } else {
        // For BUY: SL must be <= current Bid - buffer
        const desiredSl = pos.entryPrice - slOffset;
        newSl = Number(Math.min(desiredSl, currentBid - buffer).toFixed(3));
        newTp = Number((pos.entryPrice + tpOffset).toFixed(3));
      }

      console.log(`Live Ask: ${currentAsk}, Bid: ${currentBid}. Applying safe compliant SL=${newSl}, TP=${newTp} to #${pos.positionId} (${pos.symbol})...`);
      const ok = await ctrader.amendPositionSLTP(pos.positionId, newSl, newTp);
      console.log(`Result: ${ok ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    }
  }

  const updated = await ctrader.getOpenPositions();
  console.log('\nVerified positions on cTrader:');
  for (const pos of updated) {
    console.log(`- #${pos.positionId} [${pos.symbol}] Side=${pos.tradeSide}, Entry=${pos.entryPrice}, SL=${pos.stopLoss}, TP=${pos.takeProfit}`);
  }
}

fixLiveEurJpyWithLiveSpread().catch(console.error);
