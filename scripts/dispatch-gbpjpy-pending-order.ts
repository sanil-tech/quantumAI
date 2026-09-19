import 'dotenv/config';
import { publishCopierSignal } from '../src/server/routes/copier';
import { telegramNotificationService } from '../src/server/services/telegramNotificationService';

async function dispatchGbpJpyPendingOrder() {
  console.log('🚀 Publishing GBP/JPY Pending Limit Order to Copier Bridge & Telegram...');

  const pair = 'GBPJPY';
  const direction = 'SELL';
  const plannedEntry = 208.506;
  const stopLoss = 208.856;
  const takeProfit1 = 207.806;
  const takeProfit2 = 207.246;
  const lotSize = 0.02;
  const signalId = `SIG-GBPJPY-${Date.now()}`;

  // 1. Publish to Copier Bridge for cBot Automate receivers
  const copierSig = publishCopierSignal({
    id: signalId,
    masterBrokerOrderId: signalId,
    action: 'NEW_ORDER',
    pair: 'GBP/JPY',
    direction,
    entryPrice: plannedEntry,
    stopLoss,
    takeProfit1,
    takeProfit2,
    lotSize,
    reasons: [
      'GBP/JPY live price holding below 50 EMA trend filter.',
      'RSI (14) sitting at 43.0 with ADX (21.4) confirming trending bearish.',
      'SuperTrend filter is BEARISH and ATR volatility is 0.617.'
    ]
  });

  console.log('✅ Signal Published to Copier Bridge Queue:', copierSig.id);

  // 2. Broadcast to Telegram VIP and Free Channels
  console.log(`📡 Broadcasting Confirmed Order #${signalId} to Telegram Channels...`);
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
      'GBP/JPY live price (208.209) holding below 50 EMA trend filter.',
      'RSI (14) sitting at 43.0 with ADX (21.4) confirming trending bearish.',
      'SuperTrend filter is BEARISH and ATR volatility is 0.617.'
    ],
    lotSize,
    tier: 'VIP',
    status: 'ENTRY_DISPATCHED',
    brokerOrderId: signalId
  });

  console.log('🎉 Successfully published to Copier queue and broadcasted to Telegram!');
}

dispatchGbpJpyPendingOrder().catch(console.error);

