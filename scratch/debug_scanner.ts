import 'dotenv/config';
import { fetchRealCandleHistory, aggregateCandles } from '../src/lib/marketDataGenerator';
import { calculateAllIndicators } from '../src/lib/indicators';
import { analyzeSmcStructures, detectSupportResistance } from '../src/lib/smcEngine';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { CurrencyPair, Timeframe } from '../src/types';

const watchlist: CurrencyPair[] = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF',
  'NZD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY', 'XAU/USD', 'NASDAQ', 'BTC/USD'
];
const timeframes: Timeframe[] = ['M15', 'H1', 'H4'];

async function debugScan() {
  console.log('=== DEBUGGING SCANNER FOR ALL 12 PAIRS & 3 TIMEFRAMES ===');
  for (const pair of watchlist) {
    for (const tf of timeframes) {
      try {
        const candles = await fetchRealCandleHistory(pair, tf as any, 100).catch((e) => {
          console.error(`Error fetching candles for ${pair} ${tf}:`, e.message);
          return [];
        });

        if (!candles || candles.length < 15) {
          console.log(`[${pair} ${tf}] Insufficient candles (${candles?.length || 0})`);
          continue;
        }

        const latest = candles[candles.length - 1];
        const currentPrice = latest.close;
        const indicators = calculateAllIndicators(candles);
        const smcData = analyzeSmcStructures(candles, tf);

        const res = await aiDecisionEngine.generateOpinion({
          pair,
          timeframe: tf,
          style: 'DAY_TRADER',
          currentPrice,
          indicators,
          smc: smcData,
          riskSettings: { accountSize: 1000, riskPercent: 1.0 }
        });

        const action = res?.action || (res as any)?.type || (res?.bias === 'BULLISH' ? 'BUY' : res?.bias === 'BEARISH' ? 'SELL' : 'NO_SETUP');
        const conf = res?.confidence || 0;
        console.log(`[${pair} ${tf}] Price: ${currentPrice} | Action: ${action} | Conf: ${conf}% | Bias: ${res?.bias}`);
      } catch (err: any) {
        console.error(`[${pair} ${tf}] Evaluation Error:`, err.message);
      }
    }
  }
  process.exit(0);
}

debugScan();
