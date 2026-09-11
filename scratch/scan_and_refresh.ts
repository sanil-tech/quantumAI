import dotenv from 'dotenv';
dotenv.config();

import { AutonomousMarketScannerService } from '../src/server/services/autonomousMarketScannerService';

async function scanAndRefresh() {
  console.log('=== TRIGGERING FULL SCAN CYCLE TO REFRESH SETUPS ===');
  const scanner = AutonomousMarketScannerService.getInstance();
  await scanner.triggerScanCycle();
  const setups = scanner.getDiscoveredSetups();
  console.log(`Discovered setups count: ${setups.length}`);
  for (const s of setups) {
    console.log(`- [${s.pair} ${s.timeframe} ${s.direction}] Conf: ${s.confidence}% | Status: ${s.status} | Timestamp: ${new Date(s.timestamp || Date.now()).toLocaleTimeString()}`);
  }
}

scanAndRefresh().catch(console.error);
