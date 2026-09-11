import fetch from 'node-fetch';

async function testEndpoint() {
  try {
    const res = await fetch('http://localhost:3000/api/autotrader/state');
    const json = await res.json() as any;
    console.log('=== /api/autotrader/state Response ===');
    console.log(`Open Trades count: ${json.openTrades?.length || 0}`);
    console.table(json.openTrades);
    console.log(`\nClosed Trades total count: ${json.closedTrades?.length || 0}`);
    console.log(`Win rate: ${json.stats?.winRate}% | Realized P&L: $${json.stats?.totalPnlDollars}`);
  } catch (err: any) {
    console.error('Fetch error:', err.message);
  }
}

testEndpoint();
