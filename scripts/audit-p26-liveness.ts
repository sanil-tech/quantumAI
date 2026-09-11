import 'dotenv/config';
import { CTraderMarketDataFeedService } from '../src/server/services/ctraderMarketDataFeedService';
import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';

async function checkLiveness() {
  console.log('=== P26 SECTION 6 & 7: CTRADER LIVENESS & OBSERVATION PROGRESSION ===');

  const feed = CTraderMarketDataFeedService.getInstance();
  await feed.startFeed();

  console.log('Waiting 6 seconds for fresh spot ticks...');
  await new Promise(r => setTimeout(r, 6000));

  const health = feed.getFeedHealth();
  console.log('Overall Health:', health.overallState, 'Connection:', health.connectionState);

  const symbols = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
  const livenessTable = [];

  for (const sym of symbols) {
    const symHealth = health.symbols[sym];
    livenessTable.push({
      symbol: sym,
      bid: symHealth?.bid,
      ask: symHealth?.ask,
      mid: symHealth?.mid,
      ageMs: symHealth?.ageMs,
      state: symHealth?.state,
      ticksReceived: symHealth?.ticksReceived
    });
  }

  console.log('cTrader Liveness by Symbol:');
  console.table(livenessTable);

  await feed.stopFeed();
}

checkLiveness();
