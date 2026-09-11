import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { CurrencyPair, Timeframe } from '../src/types';
import { fetchRealCandleHistory } from '../src/lib/marketDataGenerator';
import { calculateAllIndicators } from '../src/lib/indicators';
import { analyzeSmcStructures } from '../src/lib/smcEngine';
import { detectChartPatterns } from '../src/lib/chartPatternEngine';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';

async function refreshSetups() {
  console.log('=== REFRESHING SCANNER DISCOVERED SETUPS (GRADE A LIVE AUDIT) ===');
  const watchlist: CurrencyPair[] = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF',
    'NZD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY', 'XAU/USD', 'NASDAQ', 'BTC/USD'
  ];
  const timeframes: Timeframe[] = ['M15', 'H1', 'H4'];
  const sigService = SignalIntelligenceService.getInstance();

  const discoveredSetups: any[] = [];

  for (const pair of watchlist) {
    const candidateSetups: any[] = [];

    for (const tf of timeframes) {
      try {
        const candles = await fetchRealCandleHistory(pair, tf as any, 100);
        if (!candles || candles.length < 15) continue;

        const latest = candles[candles.length - 1];
        const currentPrice = latest.close;
        const indicators = calculateAllIndicators(candles);
        const smc = analyzeSmcStructures(candles, tf);

        const res = sigService.evaluateCandidateSetup({
          pair,
          timeframe: tf,
          style: 'DAY_TRADER',
          currentPrice,
          indicators,
          smc,
          postMortemReviews: []
        });

        if (res && res.confidence >= 70 && (res.action === 'BUY' || res.action === 'SELL')) {
          const patterns = detectChartPatterns(candles, tf);
          const primaryPattern = patterns.find(p => (res.action === 'BUY' && p.direction === 'UP') || (res.action === 'SELL' && p.direction === 'DOWN')) || patterns[0];

          const isJpy = pair.includes('JPY');
          const isGold = pair.includes('XAU') || pair.includes('GOLD');
          const isBtc = pair.includes('BTC');
          const isNas = pair.includes('NAS') || pair.includes('TECH') || pair.includes('USTEC');

          const pipMultiplier = isJpy ? 0.01 : (isGold || isBtc || isNas) ? 1 : 0.0001;
          const pullbackPips = isJpy ? 15.0 : (isGold ? 8.0 : (isNas ? 40.0 : (isBtc ? 200.0 : 10.0)));
          const slPips = isJpy ? 35.0 : (isGold ? 20.0 : (isNas ? 100.0 : (isBtc ? 500.0 : 30.0)));
          const tpPips = isJpy ? 70.0 : (isGold ? 40.0 : (isNas ? 200.0 : (isBtc ? 1000.0 : 60.0)));

          const entryPrice = res.action === 'BUY' 
            ? currentPrice - (pullbackPips * pipMultiplier) 
            : currentPrice + (pullbackPips * pipMultiplier);
          const stopLoss = res.action === 'BUY'
            ? entryPrice - (slPips * pipMultiplier)
            : entryPrice + (slPips * pipMultiplier);
          const takeProfit1 = res.action === 'BUY'
            ? entryPrice + (tpPips * pipMultiplier)
            : entryPrice - (tpPips * pipMultiplier);

          candidateSetups.push({
            id: `setup_${pair.replace('/', '')}_${tf}_${res.action}`,
            timestamp: Date.now(),
            pair,
            timeframe: tf,
            direction: res.action,
            confidence: res.confidence,
            entryPrice: Number(entryPrice.toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5)),
            stopLoss: Number(stopLoss.toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5)),
            takeProfit1: Number(takeProfit1.toFixed(isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5)),
            reasons: res.reasons || [],
            pattern: primaryPattern,
            status: 'DISCOVERED'
          });
        }
      } catch (e: any) {
        console.warn(`Error on ${pair} ${tf}:`, e.message);
      }
    }

    if (candidateSetups.length > 0) {
      candidateSetups.sort((a, b) => b.confidence - a.confidence);
      discoveredSetups.push(candidateSetups[0]); // Pick best setup per pair
    }
  }

  const cachePath = path.resolve(process.cwd(), 'data', 'scanner_discovered_setups.json');
  fs.writeFileSync(cachePath, JSON.stringify(discoveredSetups, null, 2), 'utf-8');
  console.log(`\nSuccessfully discovered and saved ${discoveredSetups.length} Grade A setups to data/scanner_discovered_setups.json:`);
  for (const s of discoveredSetups) {
    console.log(`- 🌟 [${s.pair} ${s.timeframe}] ${s.direction} Limit @ ${s.entryPrice} | SL: ${s.stopLoss} | TP: ${s.takeProfit1} | Conf: ${s.confidence}% | Status: ${s.status}`);
  }
}

refreshSetups().catch(console.error);
