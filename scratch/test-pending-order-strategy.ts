import 'dotenv/config';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';

async function testPendingOrderParameters() {
  const signalService = SignalIntelligenceService.getInstance();

  // Test setup for GBP/JPY
  const gbpJpySetup = signalService.evaluateCandidateSetup({
    pair: 'GBP/JPY',
    currentPrice: 216.576,
    indicators: {
      ema20: 216.450,
      ema50: 216.700,
      ema200: 216.900,
      rsi: 44.5,
      macd: { histogram: -0.05 },
      superTrend: { trend: 'BEARISH', value: 216.926 },
      adx: { adx: 24.5, trendStrength: 'STRONG' },
      atr: 0.350
    },
    smc: {
      orderBlocks: [{ type: 'BEARISH_OB', high: 216.926, low: 216.576 }],
      fairValueGaps: [],
      lastChoch: { type: 'BEARISH' }
    }
  });

  console.log('=== NEXT AI PENDING ORDER STRUCTURE ===');
  console.log('Pair:', gbpJpySetup.pair);
  console.log('Action:', gbpJpySetup.action);
  console.log('Limit Entry Zone:', gbpJpySetup.entryZone);
  console.log('Stop Loss (SL):', gbpJpySetup.stopLoss);
  console.log('Take Profit 1 (TP1 - 50% Lock):', gbpJpySetup.takeProfit1);
  console.log('Take Profit 2 (TP2 - 50% Runner):', gbpJpySetup.takeProfit2);
  console.log('Break-Even Strategy: SL moves to entry (' + gbpJpySetup.entryZone?.max + ') immediately upon hitting TP1 (' + gbpJpySetup.takeProfit1 + ')');
  console.log('Risk:Reward Ratio to TP1:', gbpJpySetup.riskRewardRatio);

  process.exit(0);
}

testPendingOrderParameters().catch(e => {
  console.error(e);
  process.exit(1);
});
