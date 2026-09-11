import 'dotenv/config';
import { getGeminiClient, callGeminiSafe } from '../apps/decision-agent/src/services/geminiClient';

async function testSafePacing() {
  const ai = getGeminiClient();
  console.log('Testing callGeminiSafe with 20 RPM rate-limiting pacing & backoff...');

  try {
    const res = await callGeminiSafe(ai, {
      contents: 'You are a forex trading assistant. Answer in 1 word: Ready'
    });
    console.log('✅ Gemini Response:', res.text?.trim());
  } catch (err: any) {
    console.log('⚠️ Caught handled error:', err.message);
  }
}

testSafePacing().catch(console.error);
