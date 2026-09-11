import 'dotenv/config';

async function testAudTrade() {
  const res = await fetch('http://localhost:3000/api/autotrader/trade/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pair: 'AUD/USD',
      direction: 'BUY',
      entryPrice: 0.71830,
      stopLoss: 0.71600,
      takeProfit1: 0.72200,
      lotSize: 0.05,
      environment: 'DEMO',
      broker: 'CTRADER',
      confidence: 75,
      why_direction: 'Pad Eksekusi Pantas AI Setup AUDUSD'
    })
  });

  const data = await res.json();
  console.log('AUD/USD execution result:', JSON.stringify(data, null, 2));
}

testAudTrade().catch(console.error);
