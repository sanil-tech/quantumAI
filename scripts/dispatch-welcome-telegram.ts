import { telegramNotificationService } from '../src/server/services/telegramNotificationService';

async function main() {
  const result = await telegramNotificationService.broadcastTradeEvent({
    pair: 'EUR/USD',
    direction: 'SELL',
    timeframe: 'M15',
    entryPrice: 1.15325,
    stopLoss: 1.15525,
    takeProfit1: 1.15075,
    confidence: 88,
    reasons: [
      'Bearish Shooting Star Rejection Candle Confirmed',
      'SMC Fair Value Gap (FVG) Mitigation',
      'H4 200 EMA Downtrend Confluence'
    ],
    lotSize: 0.04,
    status: 'ENTRY_DISPATCHED',
    brokerOrderId: '288564090'
  });

  console.log('TELEGRAM LIVE BROADCAST RESULT:', result);
}

main().catch(console.error);
