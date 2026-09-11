import dotenv from 'dotenv';
dotenv.config();

import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function healLivePositions() {
  console.log('=== FIXING LIVE CTRADER OPEN POSITIONS (EURJPY SL/TP REPAIR) ===');
  const ctrader = new CTraderAdapter({
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
    accessToken: process.env.CTRADER_ACCESS_TOKEN,
    accountId: process.env.CTRADER_ACCOUNT_ID || '48282756'
  });

  await ctrader.connect();
  console.log('✅ Connected to cTrader Open API.');

  const positions = await ctrader.getOpenPositions();
  console.log(`Found ${positions.length} open position(s) on account 48282756:`);
  for (const pos of positions) {
    console.log(`- Position #${pos.positionId} [${pos.symbol}] Side=${pos.tradeSide}, Entry=${pos.entryPrice}, SL=${pos.stopLoss ?? 'NONE ❌'}, TP=${pos.takeProfit ?? 'NONE ❌'}`);
    
    // Check if EURJPY or missing SL or corrupted TP
    const symUpper = pos.symbol.toUpperCase().replace('/', '').replace('_', '');
    if (symUpper.includes('EURJPY') || !pos.stopLoss || (symUpper.includes('EURJPY') && pos.takeProfit && pos.takeProfit < 170.0)) {
      const entry = pos.entryPrice;
      let newSl: number;
      let newTp: number;

      if (symUpper.includes('EURJPY')) {
        newSl = pos.tradeSide === 'BUY' ? Number((entry - 0.350).toFixed(3)) : Number((entry + 0.350).toFixed(3));
        newTp = pos.tradeSide === 'BUY' ? Number((entry + 0.700).toFixed(3)) : Number((entry - 0.700).toFixed(3));
      } else if (symUpper.includes('USDJPY')) {
        newSl = pos.tradeSide === 'BUY' ? Number((entry - 0.350).toFixed(3)) : Number((entry + 0.350).toFixed(3));
        newTp = pos.tradeSide === 'BUY' ? Number((entry + 0.700).toFixed(3)) : Number((entry - 0.700).toFixed(3));
      } else if (symUpper.includes('XAU') || symUpper.includes('GOLD')) {
        newSl = pos.tradeSide === 'BUY' ? Number((entry - 20.0).toFixed(2)) : Number((entry + 20.0).toFixed(2));
        newTp = pos.tradeSide === 'BUY' ? Number((entry + 40.0).toFixed(2)) : Number((entry - 40.0).toFixed(2));
      } else {
        newSl = pos.tradeSide === 'BUY' ? Number((entry - 0.0030).toFixed(5)) : Number((entry + 0.0030).toFixed(5));
        newTp = pos.tradeSide === 'BUY' ? Number((entry + 0.0060).toFixed(5)) : Number((entry - 0.0060).toFixed(5));
      }

      console.log(`🔧 Applying Protection to Position #${pos.positionId} (${pos.symbol}): Setting SL=${newSl}, TP=${newTp}...`);
      const success = await ctrader.amendPositionSLTP(pos.positionId, newSl, newTp);
      console.log(`Result for #${pos.positionId}: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
    }
  }

  // Verify again
  console.log('\n=== RE-VERIFYING ALL OPEN POSITIONS ===');
  const updated = await ctrader.getOpenPositions();
  for (const pos of updated) {
    console.log(`- Verified Position #${pos.positionId} [${pos.symbol}] Entry=${pos.entryPrice}, SL=${pos.stopLoss ?? 'NONE'}, TP=${pos.takeProfit ?? 'NONE'}`);
  }
}

healLivePositions().catch(console.error);
