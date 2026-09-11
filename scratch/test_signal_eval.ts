import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { CurrencyPair, Timeframe } from '../src/types';
import { fetchRealCandleHistory } from '../src/lib/marketDataGenerator';
import { calculateAllIndicators } from '../src/lib/indicators';
import { analyzeSmcStructures } from '../src/lib/smcEngine';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';

async function testSignals() {
  console.log('Testing signal generation for all 12 pairs...');
  const watchlist: CurrencyPair[] = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF',
    'NZD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY', 'XAU/USD', 'NASDAQ', 'BTC/USD'
  ];
  const timeframes: Timeframe[] = ['M15', 'H1', 'H4'];
  const sigService = SignalIntelligenceService.getInstance();

  const report: any[] = [];

  for (const pair of watchlist) {
    for (const tf of timeframes) {
      try {
        const candles = await fetchRealCandleHistory(pair, tf as any, 100);
        if (!candles || candles.length < 15) {
          report.push({ pair, tf, status: 'NO_DATA', action: 'NO_DATA', confidence: 0 });
          continue;
        }

        const latest = candles[candles.length - 1];
        const indicators = calculateAllIndicators(candles);
        const smc = analyzeSmcStructures(candles, tf);

        const res = sigService.evaluateCandidateSetup({
          pair,
          timeframe: tf,
          style: 'DAY_TRADER',
          currentPrice: latest.close,
          indicators,
          smc,
          postMortemReviews: []
        });

        report.push({
          pair,
          tf,
          action: res.action,
          bias: res.bias,
          confidence: res.confidence,
          isGradeA: res.confidence >= 70,
          status: res.status,
          entryZone: res.entryZone,
          sl: res.stopLoss,
          tp1: res.takeProfit1,
          reasons: res.reasons || []
        });
      } catch (err: any) {
        report.push({ pair, tf, status: 'ERROR', error: err.message });
      }
    }
  }

  const outPath = path.resolve(process.cwd(), 'scratch', 'signal_evaluation_output.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Saved results to ${outPath}`);
  console.log(`Total setups tested: ${report.length}`);
  const gradeA = report.filter(r => r.isGradeA);
  console.log(`Grade A setups (>=70%): ${gradeA.length}`);
}

testSignals().catch(console.error);
