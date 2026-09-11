import 'dotenv/config';

async function testTrade() {
  const res = await fetch('http://localhost:3000/api/autotrader/trade/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pair: 'GBP/USD',
      direction: 'BUY',
      entryPrice: 1.35965,
      stopLoss: 1.35700,
      takeProfit1: 1.36300,
      lotSize: 0.05,
      environment: 'DEMO',
      broker: 'CTRADER',
      confidence: 75,
      why_direction: 'Pad Eksekusi Pantas AI Setup GBPUSD'
    })
  });

  const data = await res.json();
  console.log('Trade execution response:', JSON.stringify(data, null, 2));
}

testTrade().catch(console.error);
