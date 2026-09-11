import 'dotenv/config';

async function testFetch() {
  const ports = [3000, 5173, 8080, 5000];
  for (const port of ports) {
    try {
      console.log(`Testing http://localhost:${port}/api/admin/ai-monitoring...`);
      const res = await fetch(`http://localhost:${port}/api/admin/ai-monitoring?accountId=ALL`, {
        headers: { 'x-admin-key': 'admin_demo_key_88' }
      });
      console.log(`Port ${port} HTTP Status:`, res.status);
      const data = await res.json();
      console.log(`Port ${port} Response Success:`, data.success);
      console.log(`Port ${port} realFigures:`, data.realFigures);
      return;
    } catch (e: any) {
      console.log(`Port ${port} failed:`, e.message);
    }
  }
}

testFetch();
