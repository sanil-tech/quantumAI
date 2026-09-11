import 'dotenv/config';

async function testUsdJpyTrade() {
  const res = await fetch('http://localhost:3000/api/autotrader/trade/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pair: 'USD/JPY',
      direction: 'BUY',
      entryPrice: 159.230,
      stopLoss: 158.800,
      takeProfit1: 160.000,
      lotSize: 0.05,
      environment: 'DEMO',
      broker: 'CTRADER',
      confidence: 85,
      why_direction: 'Multi-pair Expansion Test USD/JPY'
    })
  });

  const data = await res.json();
  console.log('USD/JPY execution result:', JSON.stringify(data, null, 2));
}

testUsdJpyTrade().catch(console.error);
