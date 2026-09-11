import 'dotenv/config';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';

async function testGradeASignals() {
  const signalService = SignalIntelligenceService.getInstance();

  const testPairs = [
    {
      pair: 'GBP/JPY' as const,
      price: 216.576,
      indicators: {
        ema20: 216.450,
        ema50: 216.700,
        ema200: 216.900,
        rsi: 44.5,
        macd: { histogram: -0.05 },
        superTrend: { trend: 'BEARISH', value: 216.926 },
        adx: { adx: 28.5, trendStrength: 'STRONG' },
        atr: 0.350
      },
      smc: {
        orderBlocks: [{ type: 'BEARISH_OB', high: 216.926, low: 216.576 }],
        fairValueGaps: [],
        lastChoch: { type: 'BEARISH' }
      }
    },
    {
      pair: 'EUR/USD' as const,
      price: 1.16100,
      indicators: {
        ema20: 1.16250,
        ema50: 1.16050,
        ema200: 1.15800,
        rsi: 58.0,
        macd: { histogram: 0.0012 },
        superTrend: { trend: 'BULLISH', value: 1.15900 },
        adx: { adx: 31.0, trendStrength: 'STRONG' },
        atr: 0.0035
      },
      smc: {
        orderBlocks: [{ type: 'BULLISH_OB', high: 1.16100, low: 1.15950 }],
        fairValueGaps: [{ high: 1.16200, low: 1.16100 }],
        lastBos: { type: 'BULLISH' }
      }
    }
  ];

  console.log('=== GRADE-A MULTI-TARGET POLICY TEST ===\n');
  for (const t of testPairs) {
    const opp = signalService.evaluateCandidateSetup({
      pair: t.pair,
      currentPrice: t.price,
      indicators: t.indicators,
      smc: t.smc
    });

    console.log(`Symbol: ${opp.pair} (${opp.action})`);
    console.log(`- Confidence: ${opp.confidence}% -> GRADE: [ ${opp.grade} ]`);
    console.log(`- Execution Policy: ${opp.executionPolicy}`);
    console.log(`- Multi-Target Active: ${opp.isMultiTarget}`);
    console.log(`- Entry Zone: [ ${opp.entryZone?.min} - ${opp.entryZone?.max} ]`);
    console.log(`- Stop Loss (SL): ${opp.stopLoss}`);
    console.log(`- Take Profit 1 (TP1 - 50% Lock): ${opp.takeProfit1}`);
    console.log(`- Take Profit 2 (TP2 - 50% Runner): ${opp.takeProfit2}`);
    console.log(`- Break-Even Trigger: ${opp.breakEvenTrigger} (Moves SL to entry once TP1 is hit)`);
    console.log('--------------------------------------------------\n');
  }
  process.exit(0);
}

testGradeASignals().catch(e => {
  console.error(e);
  process.exit(1);
});
