import 'dotenv/config';
import { ctraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';

async function checkLiveFeed() {
  await ctraderMarketDataFeedService.startFeed();
  // wait 2s
  await new Promise(resolve => setTimeout(resolve, 2000));
  const rawPos = await ctraderMarketDataFeedService.fetchRawOpenPositions();
  console.log(`Feed Raw Open Positions Count: ${rawPos.length}`);
  for (const p of rawPos) {
    console.log(`  Ticket: ${p.positionId} | SymId: ${p.tradeData?.symbolId || p.symbolId} | Side: ${p.tradeData?.tradeSide || p.tradeSide} | Vol: ${p.tradeData?.volume || p.volume} | Price: ${p.price || p.tradeData?.entryPrice} | SL: ${p.stopLoss} | TP: ${p.takeProfit}`);
  }
  process.exit(0);
}

checkLiveFeed().catch(console.error);
