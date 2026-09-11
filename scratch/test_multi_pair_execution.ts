import 'dotenv/config';

async function testMultiPair() {
  const pairsToTest = [
    { pair: 'USD/CAD', direction: 'BUY', entryPrice: 1.3878, sl: 1.3850, tp: 1.3930, lot: 0.05 },
    { pair: 'USD/CHF', direction: 'BUY', entryPrice: 0.8053, sl: 0.8030, tp: 0.8100, lot: 0.05 }
  ];

  for (const item of pairsToTest) {
    console.log(`\nExecuting test trade for ${item.pair}...`);
    const res = await fetch('http://localhost:3000/api/autotrader/trade/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pair: item.pair,
        direction: item.direction,
        entryPrice: item.entryPrice,
        stopLoss: item.sl,
        takeProfit1: item.tp,
        lotSize: item.lot,
        environment: 'DEMO',
        broker: 'CTRADER',
        confidence: 80,
        why_direction: `Multi-Pair Expansion Test: ${item.pair}`
      })
    });

    const data = await res.json();
    console.log(`${item.pair} Result:`, JSON.stringify(data, null, 2));
    await new Promise(r => setTimeout(r, 1000));
  }
}

testMultiPair().catch(console.error);
