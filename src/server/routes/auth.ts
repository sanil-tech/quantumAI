import { Router, Request, Response } from 'express';
import https from 'https';
import querystring from 'querystring';

export const authRouter = Router();

// In-memory token store (keyed by accountNumber or ctidTraderAccountId)
// In production, store in PostgreSQL/Redis
export const subscriberTokenStore = new Map<string, {
  accountNumber: string;
  ctidTraderAccountId?: string;
  accessToken: string;
  refreshToken?: string;
  scope: string;
  tokenType: string;
  expiresAt?: number;
  registeredAt: number;
}>();

const CLIENT_ID = (process.env.CTRADER_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.CTRADER_CLIENT_SECRET || '').trim();
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').trim();
const REDIRECT_URI = `${APP_URL}/api/auth/ctrader/callback`;

/**
 * GET /api/auth/ctrader
 * Redirect pelanggan ke Spotware OAuth authorization page
 * Query params:
 *   - account: optional account number hint to include in state
 *   - scope: optional scope (default: trading)
 */
authRouter.get('/auth/ctrader', (req: Request, res: Response) => {
  const accountHint = String(req.query.account || '');
  const telegramId = String(req.query.telegramId || req.query.chatId || '');
  const telegramUsername = String(req.query.telegramUsername || req.query.username || '');
  const scope = String(req.query.scope || 'trading');

  // Encode state with account hint & telegram metadata for tracking
  const state = Buffer.from(JSON.stringify({
    account: accountHint,
    telegramId,
    telegramUsername,
    ts: Date.now(),
    origin: req.headers.referer || APP_URL
  })).toString('base64');

  const params = querystring.stringify({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope,
    product: 'web',
    state
  });

  const authUrl = `https://id.ctrader.com/my/settings/openapi/grantingaccess/?${params}`;

  console.log(`[CTRADER-OAUTH] Redirecting (Telegram: ${telegramId || 'None'}) → ${authUrl}`);
  res.redirect(authUrl);
});

/**
 * GET /api/auth/ctrader/callback
 * Spotware redirects here after user authorizes the app
 * Exchanges authorization code for access token
 */
authRouter.get('/auth/ctrader/callback', async (req: Request, res: Response) => {
  // Log everything Spotware sends back
  console.log(`[CTRADER-OAUTH] Callback received. Query params:`, JSON.stringify(req.query));

  const code = String(req.query.code || '');
  const error = String(req.query.error || '');
  const errorDesc = String(req.query.error_description || '');
  const stateRaw = String(req.query.state || '');

  // Handle case where Spotware sends access_token directly (implicit flow)
  const directToken = String(req.query.access_token || '');
  if (directToken && !code) {
    console.log(`[CTRADER-OAUTH] Direct access_token received (implicit flow). Storing token.`);
    req.query.code = '__implicit__';
    // Store the token directly
    let stateData2: any = {};
    try { stateData2 = JSON.parse(Buffer.from(stateRaw, 'base64').toString('utf-8')); } catch {}
    const accountNum = stateData2.account || 'unknown';
    const entry = {
      accountNumber: accountNum,
      ctidTraderAccountId: accountNum,
      accessToken: directToken,
      refreshToken: String(req.query.refresh_token || ''),
      scope: String(req.query.scope || 'trading'),
      tokenType: 'Bearer',
      expiresAt: undefined as any,
      registeredAt: Date.now()
    };
    subscriberTokenStore.set(accountNum, entry);
    console.log(`[CTRADER-OAUTH] ✅ Implicit token stored for account #${accountNum}`);
    return res.send(renderPage('success', { accountNumber: accountNum, scope: entry.scope }));
  }

  // Handle user denied or no code
  if (error || !code) {
    console.warn(`[CTRADER-OAUTH] Error: ${error} — ${errorDesc}`);
    return res.send(renderPage('error', {
      title: '❌ Akses Ditolak',
      message: error ? `${error}: ${errorDesc}` : 'Tiada kod autoriti diterima dari Spotware',
      detail: 'Sila cuba semula. Pastikan anda log masuk dengan akaun cTrader yang betul.'
    }));
  }

  // Decode state
  let stateData: any = {};
  try {
    stateData = JSON.parse(Buffer.from(stateRaw, 'base64').toString('utf-8'));
  } catch {}

  console.log(`[CTRADER-OAUTH] Received authorization code. Exchanging for token...`);

  // Exchange code for access token
  try {
    const tokenData = await exchangeCodeForToken(code);

    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token tidak diterima dari Spotware');
    }

    // Fetch account info to get accountNumber
    const accountInfo = await fetchAccountInfo(tokenData.access_token);

    const accountNumber = accountInfo?.accountNumber || stateData.account || 'unknown';
    const ctidTraderAccountId = accountInfo?.ctidTraderAccountId || stateData.account;

    // Store token
    const tokenEntry = {
      accountNumber: String(accountNumber),
      ctidTraderAccountId: String(ctidTraderAccountId || accountNumber),
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      scope: tokenData.scope || 'trading',
      tokenType: tokenData.token_type || 'Bearer',
      expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : undefined,
      registeredAt: Date.now()
    };

    subscriberTokenStore.set(String(accountNumber), tokenEntry);
    if (ctidTraderAccountId) {
      subscriberTokenStore.set(String(ctidTraderAccountId), tokenEntry);
    }

    console.log(`[CTRADER-OAUTH] ✅ Token stored for account #${accountNumber} (CTID: ${ctidTraderAccountId})`);

    // Auto-register subscriber in copier service & VIP service
    try {
      const { multiClientCopierService } = await import('../services/multiClientCopierService');
      const { vipSubscriptionService } = await import('../services/vipSubscriptionService');

      multiClientCopierService.registerOrUpdateSubscriber({
        id: `sub-${accountNumber}`,
        name: `cTrader Trader #${accountNumber}`,
        email: `${accountNumber}@ctrader.client`,
        accountNumber: String(accountNumber),
        ctidTraderAccountId: Number(ctidTraderAccountId || accountNumber),
        environment: 'DEMO',
        brokerName: 'Spotware cTrader Open API',
        riskMode: 'BALANCED',
        riskPercent: 1.0,
        status: 'ACTIVE',
        balance: 1000,
        equity: 1000,
        connected: true,
        latencyMs: 35,
        totalCopiedTrades: 0,
        createdAt: Date.now()
      });

      // Register or update in VIP Subscription ledger with 7-Day trial
      vipSubscriptionService.registerAccount({
        accountNumber: String(accountNumber),
        telegramId: stateData.telegramId || undefined,
        telegramUsername: stateData.telegramUsername || undefined,
        name: `cTrader #${accountNumber}`,
        isAdminApproval: true
      });

      console.log(`[CTRADER-OAUTH] ✅ Subscriber auto-registered in copier & VIP ledger for account #${accountNumber}`);
    } catch (regErr: any) {
      console.warn('[CTRADER-OAUTH] Subscriber auto-register note:', regErr.message);
    }

    // Return success page
    return res.send(renderPage('success', {
      title: '✅ Akaun Berjaya Disahkan!',
      accountNumber,
      ctidTraderAccountId,
      scope: tokenEntry.scope,
      expiresIn: tokenData.expires_in
    }));

  } catch (err: any) {
    console.error('[CTRADER-OAUTH] Token exchange error:', err.message);
    return res.send(renderPage('error', {
      title: '❌ Gagal Mendapatkan Token',
      message: err.message,
      detail: 'Sila cuba semula. Pastikan anda menggunakan akaun cTrader yang betul.'
    }));
  }
});

/**
 * GET /api/auth/ctrader/connect
 * Shows a beautiful manual token submission page for customers
 */
authRouter.get('/auth/ctrader/connect', (req: Request, res: Response) => {
  const account = String(req.query.account || '');
  res.send(renderConnectPage(account));
});

/**
 * POST /api/auth/ctrader/manual-token
 * Accept manually pasted access token from customer
 */
authRouter.post('/auth/ctrader/manual-token', async (req: Request, res: Response) => {
  const { accountNumber, accessToken, ctidTraderAccountId } = req.body || {};

  if (!accountNumber || !accessToken) {
    return res.status(400).json({
      success: false,
      message: 'accountNumber dan accessToken diperlukan'
    });
  }

  const ctid = ctidTraderAccountId || accountNumber;

  const tokenEntry = {
    accountNumber: String(accountNumber),
    ctidTraderAccountId: String(ctid),
    accessToken: String(accessToken).trim(),
    refreshToken: req.body.refreshToken,
    scope: 'trading',
    tokenType: 'Bearer',
    expiresAt: undefined,
    registeredAt: Date.now()
  };

  subscriberTokenStore.set(String(accountNumber), tokenEntry);
  subscriberTokenStore.set(String(ctid), tokenEntry);

  console.log(`[CTRADER-OAUTH] ✅ Manual token registered for account #${accountNumber}`);

  // Auto-register subscriber
  try {
    const { multiClientCopierService } = await import('../services/multiClientCopierService');
    multiClientCopierService.registerOrUpdateSubscriber({
      id: `sub-${accountNumber}`,
      name: `cTrader Trader #${accountNumber}`,
      email: `${accountNumber}@ctrader.client`,
      accountNumber: String(accountNumber),
      ctidTraderAccountId: Number(ctid),
      environment: 'DEMO',
      brokerName: 'Spotware cTrader Open API',
      riskMode: 'BALANCED',
      riskPercent: 1.0,
      status: 'ACTIVE',
      balance: 1000,
      equity: 1000,
      connected: true,
      latencyMs: 35,
      totalCopiedTrades: 0,
      createdAt: Date.now()
    });
  } catch {}

  res.json({
    success: true,
    message: `✅ Token berjaya didaftarkan untuk akaun #${accountNumber}`,
    accountNumber,
    ctidTraderAccountId: ctid
  });
});

/**
 * GET /api/auth/ctrader/tokens
 * Admin endpoint to list all stored tokens
 */
authRouter.get('/auth/ctrader/tokens', (req: Request, res: Response) => {
  const tokens: any[] = [];
  const seen = new Set<string>();

  subscriberTokenStore.forEach((entry, key) => {
    if (!seen.has(entry.accountNumber)) {
      seen.add(entry.accountNumber);
      tokens.push({
        accountNumber: entry.accountNumber,
        ctidTraderAccountId: entry.ctidTraderAccountId,
        scope: entry.scope,
        hasAccessToken: Boolean(entry.accessToken),
        hasRefreshToken: Boolean(entry.refreshToken),
        expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : 'N/A',
        registeredAt: new Date(entry.registeredAt).toISOString()
      });
    }
  });

  res.json({ success: true, count: tokens.length, tokens });
});

/**
 * GET /api/auth/ctrader/token/:accountNumber
 * Get token for a specific account (used internally by copier service)
 */
authRouter.get('/auth/ctrader/token/:accountNumber', (req: Request, res: Response) => {
  const { accountNumber } = req.params;
  const entry = subscriberTokenStore.get(accountNumber);

  if (!entry) {
    return res.status(404).json({
      success: false,
      message: `Tiada token untuk akaun #${accountNumber}. Pelanggan perlu authorize dahulu.`,
      authUrl: `${APP_URL}/api/auth/ctrader?account=${accountNumber}`
    });
  }

  res.json({
    success: true,
    accountNumber: entry.accountNumber,
    ctidTraderAccountId: entry.ctidTraderAccountId,
    accessToken: entry.accessToken,
    scope: entry.scope,
    expiresAt: entry.expiresAt,
    registeredAt: entry.registeredAt
  });
});

// ─── Helper Functions ───────────────────────────────────────────────────────

async function exchangeCodeForToken(code: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    });

    const options = {
      hostname: 'connect.spotware.com',
      path: '/apps/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Respons token tidak sah: ' + data)); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchAccountInfo(accessToken: string): Promise<{ accountNumber?: string; ctidTraderAccountId?: number } | null> {
  // Try to get account info from cTrader API using the token
  // This is done via the main feed service which is already connected
  try {
    const { ctraderMarketDataFeedService } = await import('../services/ctraderMarketDataFeedService');
    const status = await ctraderMarketDataFeedService.fetchLiveAccountStatus();
    if (status && status.accountNumber) {
      return {
        accountNumber: status.accountNumber,
        ctidTraderAccountId: status.ctidTraderAccountId
      };
    }
  } catch {}
  return null;
}

// ─── HTML Page Renderer ──────────────────────────────────────────────────────

function renderPage(type: 'success' | 'error', data: any): string {
  const isSuccess = type === 'success';

  const content = isSuccess ? `
    <div class="icon">✅</div>
    <h1>Akaun Berjaya Disahkan!</h1>
    <p class="subtitle">Akaun cTrader anda telah berjaya disambungkan ke QuantumAI.</p>
    <div class="info-card">
      <div class="info-row">
        <span class="label">Nombor Akaun</span>
        <span class="value">#${data.accountNumber}</span>
      </div>
      ${data.ctidTraderAccountId ? `<div class="info-row">
        <span class="label">CTID Trader Account</span>
        <span class="value">${data.ctidTraderAccountId}</span>
      </div>` : ''}
      <div class="info-row">
        <span class="label">Skop Akses</span>
        <span class="value badge">${data.scope || 'trading'}</span>
      </div>
      ${data.expiresIn ? `<div class="info-row">
        <span class="label">Token Tamat</span>
        <span class="value">${Math.round(data.expiresIn / 3600)} jam</span>
      </div>` : ''}
    </div>
    <p class="note">🎉 QuantumAI kini boleh menjalankan trade secara automatik dalam akaun anda. Anda boleh tutup halaman ini.</p>
    <a href="/" class="btn">Kembali ke Dashboard</a>
  ` : `
    <div class="icon">❌</div>
    <h1>${data.title || 'Ralat'}</h1>
    <p class="subtitle">${data.message || 'Berlaku ralat yang tidak dijangka.'}</p>
    ${data.detail ? `<p class="detail">${data.detail}</p>` : ''}
    <a href="/api/auth/ctrader" class="btn btn-outline">Cuba Semula</a>
    <a href="/" class="btn">Kembali ke Dashboard</a>
  `;

  return `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isSuccess ? '✅ Akaun Disahkan' : '❌ Ralat'} — QuantumAI</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 50%, #071428 100%);
      padding: 24px;
    }
    .card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 520px;
      width: 100%;
      text-align: center;
      backdrop-filter: blur(20px);
      box-shadow: 0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08);
      animation: fadeUp 0.5s ease-out;
    }
    @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    .icon { font-size: 56px; margin-bottom: 16px; filter: drop-shadow(0 0 20px ${isSuccess ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}); }
    h1 { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 8px; line-height: 1.3; }
    .subtitle { font-size: 15px; color: rgba(255,255,255,0.6); margin-bottom: 28px; line-height: 1.6; }
    .info-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 20px; margin-bottom: 24px; text-align: left; }
    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .info-row:last-child { border-bottom: none; }
    .label { font-size: 13px; color: rgba(255,255,255,0.5); font-weight: 500; }
    .value { font-size: 14px; color: #fff; font-weight: 600; }
    .badge { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.25); border-radius: 6px; padding: 3px 10px; font-size: 12px; }
    .note { font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 24px; line-height: 1.6; background: rgba(34,197,94,0.05); border: 1px solid rgba(34,197,94,0.15); border-radius: 10px; padding: 12px 16px; }
    .detail { font-size: 13px; color: rgba(255,255,255,0.45); margin-bottom: 24px; line-height: 1.6; }
    .btn { display: inline-block; padding: 12px 28px; border-radius: 12px; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; transition: all 0.2s ease; margin: 6px; background: linear-gradient(135deg, #3b82f6, #6366f1); color: #fff; border: none; }
    .btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(99,102,241,0.4); }
    .btn-outline { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.7); }
    .btn-outline:hover { background: rgba(255,255,255,0.06); box-shadow: none; }
    .powered { margin-top: 32px; font-size: 12px; color: rgba(255,255,255,0.25); }
    .powered span { color: rgba(99,102,241,0.7); font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    ${content}
    <p class="powered">Dikuasakan oleh <span>QuantumAI</span> × Spotware Open API</p>
  </div>
</body>
</html>`;
}

// ─── Connect Page (Manual Token Entry) ───────────────────────────────────────

function renderConnectPage(account: string): string {
  const spotwareTokenUrl = `https://id.ctrader.com/my/settings/openapi/`;

  return `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔐 Sambung Akaun cTrader — QuantumAI</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 50%, #071428 100%);
      padding: 24px;
    }
    .card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px;
      padding: 40px;
      max-width: 560px;
      width: 100%;
      backdrop-filter: blur(20px);
      box-shadow: 0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08);
      animation: fadeUp 0.5s ease-out;
    }
    @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
    .logo { font-size: 36px; margin-bottom: 8px; }
    h1 { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 4px; }
    .sub { font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 32px; }
    .steps { text-align: left; margin-bottom: 28px; }
    .step { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; }
    .step-num {
      min-width: 28px; height: 28px; border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      color: #fff; font-size: 13px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .step-text { font-size: 14px; color: rgba(255,255,255,0.75); line-height: 1.6; padding-top: 3px; }
    .step-text a { color: #60a5fa; text-decoration: none; font-weight: 600; }
    .step-text a:hover { text-decoration: underline; }
    .step-text code {
      background: rgba(255,255,255,0.08); border-radius: 5px;
      padding: 2px 7px; font-size: 12px; color: #a5b4fc; font-family: monospace;
    }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 24px 0; }
    label { display: block; font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 6px; font-weight: 500; }
    input {
      width: 100%; padding: 12px 16px; border-radius: 12px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
      color: #fff; font-size: 14px; outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      margin-bottom: 14px; font-family: inherit;
    }
    input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
    input::placeholder { color: rgba(255,255,255,0.25); }
    button {
      width: 100%; padding: 14px; border-radius: 14px;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      color: #fff; font-size: 15px; font-weight: 700;
      border: none; cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      margin-top: 4px;
    }
    button:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(99,102,241,0.45); }
    button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .msg { border-radius: 10px; padding: 12px 16px; font-size: 13px; margin-top: 14px; display: none; }
    .msg.ok { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); color: #4ade80; }
    .msg.err { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f87171; }
    .powered { text-align: center; margin-top: 28px; font-size: 12px; color: rgba(255,255,255,0.2); }
    .powered span { color: rgba(99,102,241,0.6); font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🔐</div>
    <h1>Sambung Akaun cTrader</h1>
    <p class="sub">Hubungkan akaun Spotware anda dengan QuantumAI untuk copy trading sebenar</p>

    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text">
          Buka <a href="${spotwareTokenUrl}" target="_blank">Spotware Open API Settings →</a>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text">
          Log masuk dengan akaun cTrader anda. Cari bahagian <code>Access Tokens</code> atau <code>Personal Tokens</code>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text">
          Salin <strong>Access Token</strong> dan tampal di bawah bersama nombor akaun anda
        </div>
      </div>
    </div>

    <hr class="divider">

    <form id="tokenForm">
      <label for="accountNumber">Nombor Akaun cTrader</label>
      <input type="text" id="accountNumber" name="accountNumber"
             placeholder="cth: 5916063"
             value="${account}" required>

      <label for="accessToken">Access Token Spotware</label>
      <input type="text" id="accessToken" name="accessToken"
             placeholder="Tampal token anda di sini..." required>

      <button type="submit" id="submitBtn">🔗 Sambung Akaun Sekarang</button>
    </form>

    <div class="msg" id="msgBox"></div>

    <p class="powered">Dikuasakan oleh <span>QuantumAI</span> × Spotware Open API</p>
  </div>

  <script>
    document.getElementById('tokenForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      const msg = document.getElementById('msgBox');
      btn.disabled = true;
      btn.textContent = '⏳ Sedang memproses...';
      msg.style.display = 'none';

      const accountNumber = document.getElementById('accountNumber').value.trim();
      const accessToken = document.getElementById('accessToken').value.trim();

      try {
        const res = await fetch('/api/auth/ctrader/manual-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountNumber, accessToken })
        });
        const data = await res.json();

        if (data.success) {
          msg.className = 'msg ok';
          msg.textContent = '✅ ' + data.message + ' — Anda boleh tutup halaman ini.';
          msg.style.display = 'block';
          btn.textContent = '✅ Berjaya Disambungkan!';
          btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
        } else {
          throw new Error(data.message || 'Gagal mendaftarkan token');
        }
      } catch (err) {
        msg.className = 'msg err';
        msg.textContent = '❌ ' + (err.message || 'Ralat tidak dijangka');
        msg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '🔗 Sambung Akaun Sekarang';
      }
    });
  </script>
</body>
</html>`;
}
