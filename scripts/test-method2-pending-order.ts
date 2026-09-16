import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function testPendingOrder() {
  console.log('===========================================================');
  console.log('🧪 METHOD 2 SETUP VERIFICATION: PENDING LIMIT ORDER TEST');
  console.log('===========================================================');

  const transport = new CTraderTransport();
  await transport.connect('demo.ctraderapi.com', 5035);

  // 1. Authenticate Application
  await transport.sendRequest(2100, {
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET
  });

  // 2. Authenticate Trader Account
  await transport.sendRequest(2102, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    accessToken: process.env.CTRADER_ACCESS_TOKEN
  });

  console.log('✅ Connected and authenticated with cTrader Demo Account #' + process.env.CTRADER_ACCOUNT_ID);

  // 3. Target Symbol: USD/CAD (Symbol ID: 8)
  // Let's place a BUY LIMIT below current market (e.g., 1.34500)
  // 0.02 lots = 200,000 cents (perfect for 50% scale-out when filled)
  const symbolId = 8; // USDCAD
  const entryPrice = 1.34500;
  const stopLoss = 1.34000;   // -50 pips
  const takeProfit1 = 1.35500; // +100 pips (TP1)
  const takeProfit2 = 1.36500; // +200 pips (TP2 - Runner)
  const volumeCents = 200000; // 0.02 lots

  console.log('\n📋 Placing Method 2 BUY LIMIT Pending Order:');
  console.log(`   - Symbol: USDCAD (ID: ${symbolId})`);
  console.log(`   - Order Type: BUY LIMIT (Pending)`);
  console.log(`   - Volume: 0.02 lots (${volumeCents} cents)`);
  console.log(`   - Limit Price: ${entryPrice}`);
  console.log(`   - Initial Stop Loss: ${stopLoss}`);
  console.log(`   - Take Profit 1 (Scale-Out Target): ${takeProfit1}`);
  console.log(`   - Take Profit 2 (Runner Target): ${takeProfit2}`);

  // Send ProtoOANewOrderReq (2106)
  const orderReq = {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    symbolId,
    orderType: 2, // LIMIT
    tradeSide: 1, // BUY
    volume: volumeCents,
    limitPrice: entryPrice,
    stopLoss,
    takeProfit: takeProfit1,
    comment: `M2_PENDING_TP2_${takeProfit2}`
  };

  const res = await transport.sendRequest(2106, orderReq);

  if (res.payloadType === 2126) {
    const rawOrder = res.decodedPayload?.order;
    console.log('\n🎉 SUCCESS: Pending Order Accepted by cTrader Broker!');
    console.log(`   - Broker Order ID: #${rawOrder?.orderId}`);
    console.log(`   - Order Status: ${rawOrder?.orderStatus || 'ACCEPTED / PENDING'}`);
    console.log(`   - Limit Entry: ${rawOrder?.limitPrice}`);
    console.log(`   - Broker SL: ${rawOrder?.stopLoss}`);
    console.log(`   - Broker TP1: ${rawOrder?.takeProfit}`);
    console.log(`   - Stored Comment / Metadata: "${rawOrder?.tradeData?.comment}"`);
    console.log('\n💡 LIFECYCLE BEHAVIOR:');
    console.log('   1. The order is now PENDING on cTrader order book.');
    console.log('   2. BE SL and TP2 do NOT move yet because the order is not filled (no active risk).');
    console.log('   3. When price touches 1.34500, broker executes order -> converts to LIVE position.');
    console.log('   4. When live price touches TP1 (1.35500), Method 2 triggers:');
    console.log('      • Closes 0.01 lot (50%) to lock in profit.');
    console.log('      • Automatically adjusts SL to Break-Even (1.34500).');
    console.log('      • Adjusts TP to TP2 (1.36500) for the 0.01 lot runner.');
  } else {
    console.log('Response:', res);
  }

  await transport.disconnect();
}

testPendingOrder().catch(err => {
  console.error('Error testing pending order:', err.message);
  process.exit(1);
});
