import 'dotenv/config';

async function testNewOrderSLTP() {
  const res = await fetch('http://localhost:3000/api/autotrader/trade/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pair: 'AUD/USD',
      direction: 'BUY',
      entryPrice: 0.71840,
      stopLoss: 0.71600,
      takeProfit1: 0.72200,
      lotSize: 0.05,
      environment: 'DEMO',
      broker: 'CTRADER',
      confidence: 80,
      why_direction: 'Test AUD/USD with Guaranteed SL and TP'
    })
  });

  const data = await res.json();
  console.log('Trade execution response:', JSON.stringify(data, null, 2));
}

testNewOrderSLTP().catch(console.error);
