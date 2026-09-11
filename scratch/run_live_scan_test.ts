import dotenv from 'dotenv';
dotenv.config();

import { autonomousMarketScannerService } from '../src/server/services/autonomousMarketScannerService';

async function runLiveScan() {
  console.log('--- TRIGGERING LIVE AUTONOMOUS MARKET SCANNER CYCLE ---');
  await autonomousMarketScannerService.triggerScanCycle();

  const status = autonomousMarketScannerService.getStatus();
  console.log('\n--- SCANNER STATUS AFTER CYCLE ---');
  console.log(`- Watchlist count: ${status.watchlist.length}`);
  console.log(`- Discovered setups count: ${status.discoveredSetupsCount}`);
  console.log(`- Recent Setups in status:`);
  for (const s of status.recentSetups) {
    console.log(`  * [${s.pair} ${s.timeframe}] ${s.direction} | Conf: ${s.confidence}% | Status: ${s.status} | Entry: ${s.entryPrice} | SL: ${s.stopLoss} | TP: ${s.takeProfit1}`);
  }

  process.exit(0);
}

runLiveScan().catch(err => {
  console.error('Scan error:', err);
  process.exit(1);
});
