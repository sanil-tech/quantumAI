import { generateCandleHistory, fetchRealCandleHistory, PAIR_CONFIGS } from '../src/lib/marketDataGenerator';

async function testGold() {
  console.log('PAIR_CONFIGS XAU/USD base price:', PAIR_CONFIGS['XAU/USD'].basePrice);

  const synthCandles = generateCandleHistory('XAU/USD', 'H4', 10);
  console.log('Synthetic Gold H4 Last Candle Close:', synthCandles[synthCandles.length - 1].close);

  try {
    const realCandles = await fetchRealCandleHistory('XAU/USD', 'H4', 10);
    console.log('Real Gold H4 Last Candle Close:', realCandles[realCandles.length - 1].close);
  } catch (err: any) {
    console.log('Real fetch error:', err.message);
  }

  process.exit(0);
}

testGold();
