import fetch from 'node-fetch';

async function verifyAuditApi() {
  try {
    const res = await fetch('http://localhost:3000/api/autotrader/technical-audit');
    if (!res.ok) {
      console.log('Server not responding on 3000 yet or returned', res.status);
      return;
    }
    const data = await res.json();
    console.log('API /api/autotrader/technical-audit Status: 200 OK');
    console.log('Health Score:', (data as any).healthScore, '%');
    console.log('Overall Status:', (data as any).overallStatus);
    console.log('Open Positions:', (data as any).openPositionsCount);
    console.log('Performance:', (data as any).performance);
  } catch (err: any) {
    console.log('Could not connect to port 3000 (normal if server runs under separate process):', err.message);
  }
}

verifyAuditApi();
