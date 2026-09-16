import 'dotenv/config';
import { telegramNotificationService } from '../src/server/services/telegramNotificationService';

async function main() {
  console.log('--- 1. Testing System Test Alert in Standard English ---');
  const testRes = await telegramNotificationService.sendTestMessage('1671017575');
  console.log('Test alert in English result:', testRes);

  console.log('--- 2. Testing Macro News Alert in Standard English ---');
  const newsRes = await telegramNotificationService.broadcastNewsAlert({
    eventId: 'us-cpi-en-001',
    title: 'US Core Consumer Price Index (CPI) m/m',
    currency: 'USD',
    impact: 'HIGH',
    flag: '🇺🇸',
    timeStr: '20:30 UTC',
    timestamp: Date.now() + 25 * 60 * 1000,
    forecast: '0.3%',
    previous: '0.2%',
    affectedPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY'],
    type: 'UPCOMING_30M'
  });
  console.log('Macro News alert in English result:', newsRes);

  console.log('--- 3. Testing Free Community Signal in Standard English ---');
  const freeRes = await telegramNotificationService.broadcastTradeEvent({
    pair: 'EUR/USD',
    direction: 'SELL',
    timeframe: 'M15',
    entryPrice: 1.15380,
    stopLoss: 1.15600,
    takeProfit1: 1.15080,
    takeProfit2: 1.14780,
    confidence: 88,
    reasons: [
      'Shooting Star Rejection at H1 Resistance / Bearish Order Block',
      'SMC Premium Fair Value Gap (FVG) Mitigation',
      'H4 200 EMA Downtrend Alignment'
    ],
    tier: 'FREE',
    status: 'ENTRY_DISPATCHED'
  });
  console.log('Free Community Signal in English result:', freeRes);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
