import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

async function exchange(codeOrUrl: string) {
  let code = codeOrUrl.trim();
  if (code.includes('code=')) {
    const match = code.match(/code=([^&]+)/);
    if (match) code = decodeURIComponent(match[1]);
  }

  const clientId = process.env.CTRADER_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.CTRADER_CLIENT_SECRET?.trim() || '';
  const redirectUri = 'http://localhost:3000/api/broker/oauth/callback';

  console.log('--- Testing Multiple Spotware Token Exchange Endpoints ---');

  // 1. https://connect.spotware.com/apps/token
  console.log('1. Testing connect.spotware.com/apps/token...');
  try {
    const u1 = `https://connect.spotware.com/apps/token?grant_type=authorization_code&code=${encodeURIComponent(code)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    const r1 = await fetch(u1);
    const d1 = await r1.json();
    console.log('Response 1:', d1);
    if (d1.accessToken || d1.access_token) return saveTokens(d1);
  } catch (e: any) {
    console.log('Endpoint 1 error:', e.message);
  }

  // 2. https://id.ctrader.com/oauth/v2/token
  console.log('2. Testing id.ctrader.com/oauth/v2/token...');
  try {
    const r2 = await fetch('https://id.ctrader.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code
      })
    });
    const d2 = await r2.json();
    console.log('Response 2:', d2);
    if (d2.accessToken || d2.access_token) return saveTokens(d2);
  } catch (e: any) {
    console.log('Endpoint 2 error:', e.message);
  }

  // 3. https://openapi.ctrader.com/apps/token
  console.log('3. Testing openapi.ctrader.com/apps/token (POST)...');
  try {
    const r3 = await fetch('https://openapi.ctrader.com/apps/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code
      })
    });
    const d3 = await r3.json();
    console.log('Response 3:', d3);
    if (d3.accessToken || d3.access_token) return saveTokens(d3);
  } catch (e: any) {
    console.log('Endpoint 3 error:', e.message);
  }
}

function saveTokens(data: any) {
  const accessToken = data.accessToken || data.access_token;
  const refreshToken = data.refreshToken || data.refresh_token;
  const envPath = path.resolve('.env');
  let content = fs.readFileSync(envPath, 'utf-8');
  content = content.replace(/^CTRADER_ACCESS_TOKEN=.*$/m, `CTRADER_ACCESS_TOKEN=${accessToken}`);
  content = content.replace(/^CTRADER_REFRESH_TOKEN=.*$/m, `CTRADER_REFRESH_TOKEN=${refreshToken}`);
  fs.writeFileSync(envPath, content, 'utf-8');
  console.log('🎉 SUCCESS! Saved new trading tokens to .env:');
  console.log('   Access Token:', accessToken?.slice(0, 10) + '...');
  console.log('   Refresh Token:', refreshToken?.slice(0, 10) + '...');
}

const input = process.argv[2];
if (input) {
  exchange(input).catch(err => console.error(err));
}
