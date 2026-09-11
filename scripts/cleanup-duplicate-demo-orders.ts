import dotenv from 'dotenv';
dotenv.config();

import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';
import { CTraderSymbolRegistry } from '../src/integrations/ctrader/ctraderSymbolService';

async function cleanupDuplicateOrders() {
  console.log('================================================================================');
  console.log('CLEANING UP DUPLICATE & STALE CTRADER DEMO PENDING ORDERS');
  console.log('================================================================================\n');

  const accountId = Number(process.env.CTRADER_ACCOUNT_ID || 48282756);
  const transport = new CTraderTransport();

  console.log(`1. Connecting to cTrader Open API (${process.env.CTRADER_HOST || 'demo.ctraderapi.com'}:5035)...`);
  await transport.connect(process.env.CTRADER_HOST || 'demo.ctraderapi.com', 5035);

  console.log('2. Authorizing Application and Account...');
  await transport.sendRequest(2100, {
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET
  });
  await transport.sendRequest(2102, {
    ctidTraderAccountId: accountId,
    accessToken: process.env.CTRADER_ACCESS_TOKEN
  });

  console.log('3. Reconciling active orders and positions from broker...');
  const recon = await transport.sendRequest(2124, { ctidTraderAccountId: accountId });
  const activeOrders = recon.decodedPayload?.order || [];
  const openPositions = recon.decodedPayload?.position || [];

  console.log(`- Found ${activeOrders.length} active pending orders on broker.`);
  console.log(`- Found ${openPositions.length} active open positions on broker.\n`);

  if (activeOrders.length === 0) {
    console.log('✅ No pending orders to clean up.');
    await transport.disconnect();
    return;
  }

  // Group pending orders by symbolId
  const ordersBySymbol: Map<number, any[]> = new Map();
  for (const order of activeOrders) {
    const symId = order.tradeData?.symbolId || order.symbolId;
    if (!ordersBySymbol.has(symId)) {
      ordersBySymbol.set(symId, []);
    }
    ordersBySymbol.get(symId)!.push(order);
  }

  let cancelledCount = 0;

  for (const [symId, orders] of ordersBySymbol.entries()) {
    const spec = CTraderSymbolRegistry.getSymbolById(symId);
    const symName = spec ? spec.symbolName : `Symbol_${symId}`;
    console.log(`Analyzing ${symName} (Symbol ID ${symId}): ${orders.length} pending order(s)`);

    // Sort orders newest first (by orderId descending)
    orders.sort((a, b) => Number(b.orderId) - Number(a.orderId));

    // Keep the newest single order, cancel the rest
    const [keepOrder, ...duplicateOrders] = orders;
    console.log(`  -> KEEPING newest order #${keepOrder.orderId}: ${keepOrder.tradeData?.tradeSide === 1 ? 'BUY' : 'SELL'} Limit @ ${keepOrder.limitPrice}`);

    for (const dup of duplicateOrders) {
      console.log(`  -> CANCELING duplicate order #${dup.orderId}: ${dup.tradeData?.tradeSide === 1 ? 'BUY' : 'SELL'} Limit @ ${dup.limitPrice}`);
      try {
        await transport.sendRequest(2108, {
          ctidTraderAccountId: accountId,
          orderId: Number(dup.orderId)
        });
        console.log(`     ✅ Successfully cancelled order #${dup.orderId}`);
        cancelledCount++;
      } catch (err: any) {
        console.warn(`     ❌ Failed to cancel order #${dup.orderId}: ${err.message}`);
      }
    }
  }

  console.log(`\n================================================================================`);
  console.log(`CLEANUP COMPLETE: Cancelled ${cancelledCount} duplicate orders.`);
  console.log(`================================================================================`);

  await transport.disconnect();
}

cleanupDuplicateOrders().catch((err) => {
  console.error('Fatal cleanup error:', err);
  process.exit(1);
});
