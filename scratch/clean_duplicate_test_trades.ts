import dotenv from 'dotenv';
dotenv.config();

import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function closeDuplicateTestPositions() {
  console.log('=== CLEANING UP DUPLICATE TEST POSITIONS ON CTRADER ===');
  const ctrader = new CTraderAdapter({
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
    accessToken: process.env.CTRADER_ACCESS_TOKEN,
    accountId: process.env.CTRADER_ACCOUNT_ID || '48282756'
  });

  await ctrader.connect();
  const positions = await ctrader.getOpenPositions();
  console.log(`Found ${positions.length} open position(s):`);

  // Target the EURUSD test positions created during the 13:14 test run
  // Keep authentic user positions (AUDUSD, USDCAD, XAUUSD, EURJPY)
  for (const pos of positions) {
    const symUpper = pos.symbol.toUpperCase().replace('/', '').replace('_', '');
    console.log(`- Position #${pos.positionId} [${pos.symbol}] Entry=${pos.entryPrice}, Vol=${pos.volumeLots}, Comment="${pos.comment}"`);
    
    // If it's a test EURUSD position created from vitest test runner (or duplicate EURUSD)
    if (symUpper === 'EURUSD') {
      console.log(`🧹 Closing duplicate test position #${pos.positionId} (${pos.symbol} ${pos.tradeSide})...`);
      try {
        const report = await ctrader.closePosition(pos.positionId, pos.volumeLots ? pos.volumeLots * 10000000 : 100000);
        console.log(`✅ Closed Position #${pos.positionId}: Status=${report.status}`);
      } catch (err: any) {
        console.warn(`❌ Failed to close #${pos.positionId}:`, err.message);
      }
    }
  }

  console.log('\n=== RE-CHECKING REMAINING LIVE POSITIONS ===');
  const remaining = await ctrader.getOpenPositions();
  console.log(`Remaining valid positions (${remaining.length}):`);
  for (const r of remaining) {
    console.log(`- #${r.positionId} [${r.symbol}] Side=${r.tradeSide}, Entry=${r.entryPrice}, SL=${r.stopLoss}, TP=${r.takeProfit}`);
  }
}

closeDuplicateTestPositions().catch(console.error);
