import 'dotenv/config';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { telegramNotificationService } from '../src/server/services/telegramNotificationService';

async function testPlaceGbpJpyOpenApiPendingOrder() {
  console.log('🚀 Connecting to cTrader Open API with new TRADING-ENABLED Token...');
  const ctrader = new CTraderAdapter({ accountId: '48282756', environment: 'DEMO' });
  await ctrader.connect();

  const pair = 'GBPJPY';
  const direction = 'SELL';
  const plannedEntry = 208.506;
  const stopLoss = 208.856;
  const takeProfit1 = 207.806;
  const takeProfit2 = 207.246;
  const lotSize = 0.02;

  try {
    console.log(`📡 Placing LIMIT SELL order on ${pair} at price ${plannedEntry} (SL: ${stopLoss}, TP: ${takeProfit1}, Lot: ${lotSize})...`);
    const orderResult = await ctrader.placeOrder({
      order_id: `ord_${Date.now()}`,
      proposal_id: `prop_gbpjpy_${Date.now()}`,
      symbol: pair,
      direction,
      order_type: 'LIMIT',
      quantity: lotSize,
      price: plannedEntry,
      stop_loss: stopLoss,
      take_profit: takeProfit1,
      time_in_force: 'GTC',
      broker_id: 'ctrader-broker-01',
      timestamp: new Date()
    });

    console.log('🎉 DIRECT CTRADER BROKER OPEN API ORDER SUCCESSFUL!');
    console.log('Broker Execution Report:', JSON.stringify(orderResult, null, 2));

    const brokerOrderId = orderResult.broker_order_id || orderResult.brokerOrderId || orderResult.report_id || `ORD-${Date.now()}`;

    // Broadcast to Telegram
    await telegramNotificationService.broadcastTradeEvent({
      pair: 'GBP/JPY',
      direction,
      timeframe: 'H4' as any,
      entryPrice: plannedEntry,
      stopLoss,
      takeProfit1,
      takeProfit2,
      confidence: 82,
      reasons: [
        'GBP/JPY live price holding below 50 EMA trend filter.',
        'RSI (14) sitting at 43.0 with ADX (21.4) confirming trending bearish.',
        'SuperTrend filter is BEARISH and ATR volatility is 0.617.'
      ],
      lotSize,
      tier: 'VIP',
      status: 'ENTRY_DISPATCHED',
      brokerOrderId: String(brokerOrderId)
    });

    console.log(`✅ Order #${brokerOrderId} successfully placed in Master Account & broadcast to Telegram!`);
  } catch (err: any) {
    console.error('❌ Error placing Open API order:', err.message);
  } finally {
    await ctrader.disconnect();
  }
}

testPlaceGbpJpyOpenApiPendingOrder().catch(console.error);
