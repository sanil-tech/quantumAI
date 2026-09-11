import dotenv from 'dotenv';
dotenv.config();

import { autonomousMarketScannerService } from '../src/server/services/autonomousMarketScannerService';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function investigateScanner() {
  console.log('================================================================================');
  console.log('INVESTIGATING AUTONOMOUS MARKET SCANNER & CTRADER DEMO PENDING ORDERS');
  console.log('================================================================================\n');

  console.log('1. Checking Scanner Status before cycle...');
  const statusBefore = autonomousMarketScannerService.getStatus();
  console.log(`- Watchlist: ${statusBefore.watchlist.join(', ')}`);
  console.log(`- Timeframes: ${statusBefore.timeframes.join(', ')}`);
  console.log(`- Discovered setups count: ${statusBefore.discoveredSetupsCount}`);

  console.log('\n2. Triggering Full Scanner Cycle now...');
  await autonomousMarketScannerService.triggerScanCycle();

  console.log('\n3. Checking Discovered Setups after cycle:');
  const statusAfter = autonomousMarketScannerService.getStatus();
  console.log(`- Discovered setups count: ${statusAfter.discoveredSetupsCount}`);

  const gradeASetups = statusAfter.recentSetups.filter((s: any) => s.confidence >= 70);
  console.log(`- Grade A Setups Found (${gradeASetups.length}):`);
  for (const s of gradeASetups) {
    console.log(`  * [${s.pair} ${s.timeframe}] ${s.direction} | Conf: ${s.confidence}% | Status: ${s.status} | Entry: ${s.entryPrice} | SL: ${s.stopLoss} | TP: ${s.takeProfit1}`);
  }

  console.log('\n4. Checking Live Pending Orders on cTrader DEMO Book:');
  const transport = new CTraderTransport();
  await transport.connect(process.env.CTRADER_HOST || 'demo.ctraderapi.com', 5035);
  await transport.sendRequest(2100, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET });
  await transport.sendRequest(2102, { ctidTraderAccountId: 48282756, accessToken: process.env.CTRADER_ACCESS_TOKEN });
  const recon = await transport.sendRequest(2124, { ctidTraderAccountId: 48282756 });

  const activeOrders = recon.decodedPayload?.order || [];
  console.log(`- Total Pending Orders on cTrader: ${activeOrders.length}`);
  for (const o of activeOrders) {
    console.log(`  * Order #${o.orderId} | SymbolId: ${o.tradeData?.symbolId} | ${o.tradeData?.tradeSide === 1 ? 'BUY' : 'SELL'} LIMIT | Price: ${o.limitPrice} | SL: ${o.stopLoss} | TP: ${o.takeProfit} | Comment: ${o.tradeData?.comment}`);
  }

  const openPositions = recon.decodedPayload?.position || [];
  console.log(`\n- Total Open Positions on cTrader: ${openPositions.length}`);
  for (const p of openPositions) {
    console.log(`  * Pos #${p.positionId} | SymbolId: ${p.tradeData?.symbolId} | ${p.tradeData?.tradeSide === 1 ? 'BUY' : 'SELL'} | OpenPrice: ${p.price} | SL: ${p.stopLoss} | TP: ${p.takeProfit}`);
  }

  await transport.disconnect();
  console.log('\n================================================================================');
  process.exit(0);
}

investigateScanner().catch(console.error);
