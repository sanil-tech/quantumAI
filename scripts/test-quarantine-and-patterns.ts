import 'dotenv/config';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { SmcCandle } from '@iati/core';

async function testQuarantineAndCandleTriggers() {
  console.log('====================================================================');
  console.log(' QUANTUMAI: VERIFIKASI KUARANTIN XAUUSD & PENGESAHAN BENTUK CANDLE');
  console.log('====================================================================\n');

  const svc = SignalIntelligenceService.getInstance();

  // -------------------------------------------------------------
  // TEST 1: XAU/USD QUARANTINE VETO
  // -------------------------------------------------------------
  console.log('--- TEST 1: UJIAN KUARANTIN XAU/USD (EMAS) ---');
  const xauRes = svc.evaluateCandidateSetup({
    pair: 'XAU/USD' as any,
    currentPrice: 2500.0,
    indicators: { rsi: 65, ema20: 2510, ema50: 2490, atr: 15.0 }
  });

  console.log(`Action: ${xauRes.action} | Status: ${xauRes.status} | Confidence: ${xauRes.confidence}%`);
  console.log(`Reason: ${xauRes.reasons[0]}`);
  if (xauRes.action === 'VETO' && xauRes.status === 'VETOED') {
    console.log('✅ TEST 1 LULUS: XAU/USD berjaya dikuarantin dan disekat 100% (VETOED).\n');
  } else {
    console.error('❌ TEST 1 GAGAL: XAU/USD tidak disekat!');
    process.exit(1);
  }

  // -------------------------------------------------------------
  // TEST 2: CANDLE CONFIRMATION - FALLING KNIFE (NO REJECTION CANDLE)
  // -------------------------------------------------------------
  console.log('--- TEST 2: UJIAN "FALLING KNIFE" TANPA REJECTION (BELUM CONFIRM) ---');
  // 3 consecutive strong red down candles with tiny wicks
  const fallingCandles: SmcCandle[] = [
    { time: 1000, open: 1.3550, high: 1.3555, low: 1.3520, close: 1.3525 },
    { time: 2000, open: 1.3525, high: 1.3530, low: 1.3500, close: 1.3502 },
    { time: 3000, open: 1.3502, high: 1.3505, low: 1.3470, close: 1.3472 } // Strong red candle closing at low
  ];

  const fallingRes = svc.evaluateCandidateSetup({
    pair: 'GBP/USD' as any,
    currentPrice: 1.3472,
    indicators: {
      rsi: 55,
      ema20: 1.3490,
      ema50: 1.3450,
      atr: 0.0020,
      superTrend: { trend: 'BULLISH' },
      adx: 26
    },
    smc: {
      orderBlocks: [{ type: 'BULLISH', high: 1.3480, low: 1.3460 }]
    },
    candles: fallingCandles
  });

  console.log(`Action: ${fallingRes.action} | Status: ${fallingRes.status}`);
  console.log(`Confirmation Req: ${fallingRes.confirmationRequirements.join(' | ')}`);
  if (fallingRes.action === 'WAIT_FOR_CONFIRMATION') {
    console.log('✅ TEST 2 LULUS: Bot tidak membeli semasa harga sedang terjunam merah padat (Berjaya dihalang ke status WAIT_FOR_CONFIRMATION).\n');
  } else {
    console.error('❌ TEST 2 GAGAL: Bot tersilap masuk tanpa candle rejection!');
    process.exit(1);
  }

  // -------------------------------------------------------------
  // TEST 3: CANDLE CONFIRMATION - HAMMER / PIN BAR REJECTION AT SUPPORT (CONFIRMED BUY)
  // -------------------------------------------------------------
  console.log('--- TEST 3: UJIAN HAMMER / PIN BAR REJECTION DI SOKONGAN (CONFIRMED BUY) ---');
  // Previous candle down, current candle is a classic hammer (huge lower tail rejection)
  const hammerCandles: SmcCandle[] = [
    { time: 1000, open: 1.3520, high: 1.3525, low: 1.3480, close: 1.3485 },
    { time: 2000, open: 1.3485, high: 1.3490, low: 1.3450, close: 1.3460 },
    // Hammer: open=1.3460, close=1.3465 (body=0.0005), low=1.3430 (lower wick=0.0030, which is 6x body!), high=1.3468 (upper wick=0.0003)
    { time: 3000, open: 1.3460, high: 1.3468, low: 1.3430, close: 1.3465 }
  ];

  const hammerRes = svc.evaluateCandidateSetup({
    pair: 'GBP/USD' as any,
    currentPrice: 1.3465,
    indicators: {
      rsi: 56,
      ema20: 1.3490,
      ema50: 1.3440,
      atr: 0.0020,
      superTrend: { trend: 'BULLISH' },
      adx: 26
    },
    smc: {
      orderBlocks: [{ type: 'BULLISH', high: 1.3480, low: 1.3430 }]
    },
    candles: hammerCandles
  });

  console.log(`Action: ${hammerRes.action} | Status: ${hammerRes.status} | Confidence: ${hammerRes.confidence}%`);
  console.log(`Technical Evidence: ${hammerRes.technicalEvidence.filter(e => e.includes('CANDLE')).join(' | ')}`);
  if (hammerRes.action === 'BUY' && hammerRes.status === 'VALID_PROPOSAL') {
    console.log('✅ TEST 3 LULUS: Pengesahan Bullish Pin Bar / Hammer berjaya meluluskan BUY dengan bonus markah konfluens.\n');
  } else {
    console.error('❌ TEST 3 GAGAL: Hammer candle tidak meluluskan BUY!');
    process.exit(1);
  }

  // -------------------------------------------------------------
  // TEST 4: CANDLE CONFIRMATION - SHOOTING STAR AT RESISTANCE (CONFIRMED SELL)
  // -------------------------------------------------------------
  console.log('--- TEST 4: UJIAN SHOOTING STAR DI RINTANGAN (CONFIRMED SELL) ---');
  // Previous candle up, current candle is a shooting star (huge upper wick rejection)
  const shootingStarCandles: SmcCandle[] = [
    { time: 1000, open: 208.20, high: 208.50, low: 208.10, close: 208.45 },
    { time: 2000, open: 208.45, high: 208.80, low: 208.40, close: 208.75 },
    // Shooting star: open=208.75, close=208.70 (body=0.05), high=209.10 (upper wick=0.35, 7x body!), low=208.68 (lower wick=0.02)
    { time: 3000, open: 208.75, high: 209.10, low: 208.68, close: 208.70 }
  ];

  const sellRes = svc.evaluateCandidateSetup({
    pair: 'GBP/JPY' as any,
    currentPrice: 208.70,
    indicators: {
      rsi: 40,
      ema20: 208.30,
      ema50: 208.90,
      atr: 0.25,
      superTrend: { trend: 'BEARISH' },
      adx: 26
    },
    smc: {
      orderBlocks: [{ type: 'BEARISH', high: 209.20, low: 208.70 }]
    },
    candles: shootingStarCandles
  });

  console.log(`Action: ${sellRes.action} | Status: ${sellRes.status} | Confidence: ${sellRes.confidence}%`);
  console.log(`Technical Evidence: ${sellRes.technicalEvidence.filter(e => e.includes('CANDLE')).join(' | ')}`);
  if (sellRes.action === 'SELL' && sellRes.status === 'VALID_PROPOSAL') {
    console.log('✅ TEST 4 LULUS: Pengesahan Bearish Shooting Star berjaya meluluskan SELL dengan tepat.\n');
  } else {
    console.error('❌ TEST 4 GAGAL: Shooting star tidak meluluskan SELL!');
    process.exit(1);
  }

  console.log('====================================================================');
  console.log(' KESEMUA 4 UJIAN VERIFIKASI BERJAYA DENGAN CEMERLANG! (100% PASS)');
  console.log('====================================================================');
}

testQuarantineAndCandleTriggers().catch(err => {
  console.error('Test Error:', err);
  process.exit(1);
});
