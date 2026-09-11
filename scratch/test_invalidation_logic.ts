import dotenv from 'dotenv';
dotenv.config();

import { AutonomousMarketScannerService, DiscoveredSetup } from '../src/server/services/autonomousMarketScannerService';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function testInvalidationBehavior() {
  console.log('=== TESTING INVALID SIGNAL BEHAVIOR & 2-MINUTE COOLDOWN ===');
  const scanner = AutonomousMarketScannerService.getInstance();
  const mockCtrader = new CTraderAdapter({ accountId: '48282756' });

  // 1. Create a simulated setup that is invalidated (e.g. SL breached)
  const dummySetup: DiscoveredSetup = {
    id: `setup_TEST_M15_BUY_${Date.now()}`,
    timestamp: Date.now() - 5000,
    pair: 'EUR/USD',
    timeframe: 'M15',
    direction: 'BUY',
    confidence: 85,
    entryPrice: 1.16000,
    stopLoss: 1.15800,
    takeProfit1: 1.16500,
    reasons: ['Test setup'],
    status: 'DISCOVERED',
    isValid: true
  };

  (scanner as any).discoveredSetups.push(dummySetup);
  console.log('1. Injected candidate test setup into scanner.');

  // Manually trigger pruning with an invalidated price (current price 1.15700 < SL 1.15800)
  dummySetup.status = 'INVALID';
  dummySetup.isValid = false;
  dummySetup.invalidatedAt = Date.now();
  dummySetup.invalidationReason = 'Harga pasaran (1.15700) melepasi SL (1.15800)';

  console.log('2. Signal marked INVALID. Testing cooling-off period:');
  await scanner.pruneInvalidAndExpiredSetups();

  const found = scanner.getDiscoveredSetups().find(s => s.id === dummySetup.id);
  console.log(`- Still in 2m cooldown? ${found ? 'YES (Visible in radar) ✅' : 'NO'}`);
  console.log(`- Status: ${found?.status}, isValid: ${found?.isValid}`);

  // Test age > 2 minutes (121 seconds ago)
  dummySetup.invalidatedAt = Date.now() - 121000;
  await scanner.pruneInvalidAndExpiredSetups();

  const purged = scanner.getDiscoveredSetups().find(s => s.id === dummySetup.id);
  console.log(`3. After 2 minutes elapsed: is setup auto-deleted? ${!purged ? 'YES (Auto-deleted!) ✅' : 'NO ❌'}`);
  process.exit(0);
}

testInvalidationBehavior().catch((e) => {
  console.error(e);
  process.exit(1);
});
