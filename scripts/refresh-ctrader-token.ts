/**
 * refresh-ctrader-token.ts
 * Uses the stored CTRADER_REFRESH_TOKEN to obtain a fresh access token
 * and updates the .env file automatically.
 *
 * Usage:  npx tsx scripts/refresh-ctrader-token.ts
 */
import 'dotenv/config';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const ENV_PATH = path.resolve('.env');

function readEnv(): Record<string, string> {
  const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) result[m[1]] = m[2];
  }
  return result;
}

function writeEnvKey(key: string, value: string) {
  let content = fs.readFileSync(ENV_PATH, 'utf-8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    content = content.replace(re, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
}

function httpsPost(hostname: string, path: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function refreshToken() {
  const env = readEnv();
  const clientId = env.CTRADER_CLIENT_ID?.trim();
  const clientSecret = env.CTRADER_CLIENT_SECRET?.trim();
  const refreshToken = env.CTRADER_REFRESH_TOKEN?.trim();

  console.log('\n=== cTrader Token Refresh ===');

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('❌ Missing CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, or CTRADER_REFRESH_TOKEN in .env');
    process.exit(1);
  }

  console.log(`Client ID    : ${clientId.slice(0, 6)}...`);
  console.log(`Refresh Token: ${refreshToken.slice(0, 6)}...`);
  console.log('Requesting new access token from OpenAPI...\n');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }).toString();

  let raw: string;
  try {
    raw = await httpsPost('openapi.ctrader.com', '/apps/token', body);
  } catch (err: any) {
    console.error('❌ HTTP request failed:', err.message);
    process.exit(1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('❌ Could not parse response:', raw);
    process.exit(1);
  }

  if (parsed.error || parsed.errorCode) {
    console.error('❌ Token refresh failed:');
    console.error('   error      :', parsed.error || parsed.errorCode);
    console.error('   description:', parsed.error_description || parsed.description || '(none)');
    console.error('\nTo manually obtain tokens, visit:');
    console.error('  https://openapi.ctrader.com/apps/auth');
    process.exit(1);
  }

  const newAccessToken: string = parsed.accessToken || parsed.access_token;
  const newRefreshToken: string = parsed.refreshToken || parsed.refresh_token;

  if (!newAccessToken) {
    console.error('❌ No access_token in response:', raw);
    process.exit(1);
  }

  writeEnvKey('CTRADER_ACCESS_TOKEN', newAccessToken);
  if (newRefreshToken) {
    writeEnvKey('CTRADER_REFRESH_TOKEN', newRefreshToken);
  }

  console.log('✅ Token refreshed and .env updated.');
  console.log(`   New access token: ${newAccessToken.slice(0, 6)}...${newAccessToken.slice(-4)}`);
  if (newRefreshToken) {
    console.log(`   New refresh token: ${newRefreshToken.slice(0, 6)}...${newRefreshToken.slice(-4)}`);
  }
  console.log('\nRun: npx tsx scripts/diagnose-ctrader.ts  to verify connection.\n');
}

refreshToken().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
