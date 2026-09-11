import 'dotenv/config';

async function testGeminiEndpoint() {
  try {
    const res = await fetch('http://localhost:3000/api/admin/gemini-analysis?accountId=ALL', {
      headers: { 'x-admin-key': 'admin_demo_key_88' }
    });
    console.log('HTTP Status:', res.status);
    const data = await res.json();
    console.log('Endpoint Success:', data.success);
    console.log('Portfolio Grade:', data.portfolioGrade);
    console.log('Executive Summary (BM):', data.executiveSummaryMs);
    console.log('Failure Patterns (BM):', data.failurePatternsMs);
    console.log('Action Plan (BM):', data.actionPlanMs);
  } catch (e: any) {
    console.error('Fetch error:', e.message);
  }
  process.exit(0);
}

testGeminiEndpoint();
