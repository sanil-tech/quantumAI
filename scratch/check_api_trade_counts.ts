import axios from 'axios';

async function checkEndpoints() {
  const urls = [
    'http://localhost:3000/api/execution/positions',
    'http://localhost:3000/api/ctrader/autopilot-status',
    'http://localhost:3000/api/autotrader/scanner/status',
    'http://localhost:3000/api/shadow/status',
    'http://localhost:3000/api/shadow/positions',
    'http://localhost:3000/api/forex/learning/campaign-status',
    'http://localhost:3000/api/forex/learning/journal'
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url);
      console.log(`\n=== ${url} ===`);
      if (Array.isArray(res.data)) {
        console.log(`Array of ${res.data.length} items`);
      } else if (res.data && typeof res.data === 'object') {
        console.log(JSON.stringify(res.data, null, 2).slice(0, 500));
      }
    } catch (e: any) {
      console.log(`=== ${url} === ERROR: ${e?.message}`);
    }
  }
}

checkEndpoints();
