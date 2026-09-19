import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

async function testRedirectUris(code: string) {
  const clientId = process.env.CTRADER_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.CTRADER_CLIENT_SECRET?.trim() || '';

  const possibleRedirectUris = [
    'http://localhost:3000',
    'http://localhost:3000/',
    'http://localhost:3000/api/broker/oauth/callback',
    'https://localhost:3000/api/broker/oauth/callback',
    'http://127.0.0.1:3000/api/broker/oauth/callback',
    'http://localhost:5173',
    'http://localhost:5173/'
  ];

  for (const uri of possibleRedirectUris) {
    console.log(`Testing redirect_uri: "${uri}"...`);
    try {
      const u = `https://openapi.ctrader.com/apps/token?grant_type=authorization_code&code=${encodeURIComponent(code)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=${encodeURIComponent(uri)}`;
      const res = await fetch(u);
      const data = await res.json();
      console.log('Result for ' + uri + ':', data);
      if (data.accessToken || data.access_token) {
        console.log('🎉 FOUND MATCHING REDIRECT URI:', uri);
        const accessToken = data.accessToken || data.access_token;
        const refreshToken = data.refreshToken || data.refresh_token;
        const envPath = path.resolve('.env');
        let content = fs.readFileSync(envPath, 'utf-8');
        content = content.replace(/^CTRADER_ACCESS_TOKEN=.*$/m, `CTRADER_ACCESS_TOKEN=${accessToken}`);
        content = content.replace(/^CTRADER_REFRESH_TOKEN=.*$/m, `CTRADER_REFRESH_TOKEN=${refreshToken}`);
        fs.writeFileSync(envPath, content, 'utf-8');
        console.log('Saved to .env successfully!');
        return;
      }
    } catch (e: any) {
      console.log('Error:', e.message);
    }
  }
}

testRedirectUris('e9e4fca5a719860b6c178ecb8a37ab62240fb6e8216b9f741a16ab72809b78ec85e21dffaeded2f8b6b064');
