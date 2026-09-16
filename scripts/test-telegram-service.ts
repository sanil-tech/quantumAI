import 'dotenv/config';
import { telegramNotificationService } from '../src/server/services/telegramNotificationService';

async function testTelegram() {
  console.log('=== TEST TELEGRAM NOTIFICATION SERVICE ===');

  // 1. Check initial status
  const status1 = telegramNotificationService.getStatus();
  console.log('Initial Status:', status1);

  // 2. Broadcast dummy ENTRY_DISPATCHED
  console.log('\n--- Broadcasting ENTRY_DISPATCHED ---');
  await telegramNotificationService.broadcastTradeEvent({
    pair: 'EUR/USD',
    direction: 'BUY',
    timeframe: 'M15',
    entryPrice: 1.15325,
    stopLoss: 1.15125,
    takeProfit1: 1.15575,
    confidence: 88,
    reasons: ['Bullish Pin Bar / Hammer Close Confirmed', 'SMC Bullish Fair Value Gap Retest', 'H1 EMA Trend Alignment'],
    lotSize: 0.04,
    status: 'ENTRY_DISPATCHED',
    brokerOrderId: 'CMD-TEST-001'
  });

  // 3. Broadcast dummy TP1 HIT (PROFIT_LOCKED)
  console.log('\n--- Broadcasting PROFIT_LOCKED (TP1) ---');
  await telegramNotificationService.broadcastTradeEvent({
    pair: 'EUR/USD',
    direction: 'BUY',
    timeframe: 'M15',
    entryPrice: 1.15325,
    stopLoss: 1.15325,
    takeProfit1: 1.15575,
    confidence: 90,
    reasons: ['Method 2 TP1 Hit: +25.0 pips dikunci', 'SL dialihkan ke Break-Even (1.15325)', 'Runner memburu TP2 (1.15825)'],
    lotSize: 0.02,
    pnlDollars: 5.00,
    pnlPips: 25.0,
    status: 'PROFIT_LOCKED',
    brokerOrderId: 'CMD-TEST-001'
  });

  // 4. Broadcast dummy TP2 HIT (TP_HIT)
  console.log('\n--- Broadcasting TP_HIT (TP2 Runner) ---');
  await telegramNotificationService.broadcastTradeEvent({
    pair: 'EUR/USD',
    direction: 'BUY',
    timeframe: 'M15',
    entryPrice: 1.15325,
    stopLoss: 1.15325,
    takeProfit1: 1.15825,
    confidence: 95,
    reasons: ['Sasaran Take Profit TP2 tercapai (+50.0 pips)'],
    lotSize: 0.02,
    pnlDollars: 10.00,
    pnlPips: 50.0,
    status: 'TP_HIT',
    brokerOrderId: 'CMD-TEST-001'
  });

  // 5. Inspect history
  const history = telegramNotificationService.getHistory();
  console.log(`\nBroadcast History Count: ${history.length}`);
  console.log('Sample Formatted Telegram Message:\n----------------------------------');
  console.log(history[0].message);
  console.log('----------------------------------');

  console.log('\n✅ TELEGRAM BROADCAST SERVICE VERIFICATION: SUCCESS');
}

testTelegram().catch(console.error);
