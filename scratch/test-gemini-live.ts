import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('API Key present:', Boolean(apiKey && apiKey.length > 5));
  console.log('API Key prefix:', apiKey?.slice(0, 8));

  const ai = new GoogleGenAI({ apiKey: apiKey || '' });

  const modelsToTest = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.5-pro',
    'gemini-3.6-flash'
  ];

  for (const m of modelsToTest) {
    try {
      console.log(`\nTesting model: ${m}...`);
      const start = Date.now();
      const res = await ai.models.generateContent({
        model: m,
        contents: 'Hello, reply with only "OK"'
      });
      const latency = Date.now() - start;
      console.log(`[SUCCESS] ${m} responded in ${latency}ms:`, res.text?.trim());
    } catch (e: any) {
      console.log(`[FAILED] ${m}:`, e?.message || e);
    }
  }
}

testGemini().catch(console.error);
