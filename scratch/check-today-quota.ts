import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

async function checkTodayQuota() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('Timestamp:', new Date().toISOString());
  console.log('API Key configured:', Boolean(apiKey && apiKey.length > 5));

  const ai = new GoogleGenAI({ apiKey: apiKey || '' });

  try {
    console.log('Calling gemini-3.6-flash...');
    const start = Date.now();
    const res = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: 'Ping test. Reply with: GEMINI_ONLINE'
    });
    const elapsed = Date.now() - start;
    console.log(`\n✅ STATUS: SUCCESS! Gemini replied in ${elapsed}ms:`);
    console.log('Response:', res.text?.trim());
  } catch (err: any) {
    console.log('\n❌ STATUS: FAILED / EXHAUSTED');
    console.log('Error message:', err?.message || err);
    if (err?.status) console.log('HTTP Status:', err.status);
    if (err?.error) console.log('Error details:', JSON.stringify(err.error, null, 2));
  }
}

checkTodayQuota();
