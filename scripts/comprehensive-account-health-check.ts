import 'dotenv/config';
import pg from 'pg';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

const { Client } = pg;

async function runComprehensiveAccountHealthCheck() {
  console.log('================================================================');
  console.log('      QUANTUMAI — MULTI-ACCOUNT & SYSTEM HEALTH CHECK           ');
  console.log('================================================================\n');

  // 1. POSTGRESQL & DB ACCOUNTS
  console.log('[1/3] Checking PostgreSQL & Database Accounts...');
  const dbClient = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://quantumai:quantumai_test_password@127.0.0.1:54329/quantumai_test',
    connectionTimeoutMillis: 4000
  });

  let dbAccounts: any[] = [];
  let accountStates: any[] = [];
  let positionCounts: any[] = [];

  try {
    const dbStart = Date.now();
    await dbClient.connect();
    const dbLatency = Date.now() - dbStart;

    const bAccRes = await dbClient.query('SELECT * FROM broker_accounts;');
    dbAccounts = bAccRes.rows;

    const accStateRes = await dbClient.query('SELECT * FROM account_state;');
    accountStates = accStateRes.rows;

    const posRes = await dbClient.query(`
      SELECT account_id, status, count(*)::int as count 
      FROM positions 
      GROUP BY account_id, status;
    `);
    positionCounts = posRes.rows;

    console.log(`  ✅ PostgreSQL: ONLINE (${dbLatency}ms latency)`);
    console.log(`  • Broker Accounts registered: ${dbAccounts.length}`);
    console.log(`  • Account States recorded:    ${accountStates.length}`);
    await dbClient.end();
  } catch (err: any) {
    console.log(`  ❌ PostgreSQL: FAILED (${err.message})`);
  }

  // 2. cTRADER MULTI-ACCOUNT DISCOVERY & HEALTH
  console.log('\n[2/3] Checking cTrader Open API Connected Accounts...');
  const host = 'demo.ctraderapi.com';
  const port = 5035;
  const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
  const accessToken = (process.env.CTRADER_ACCESS_TOKEN || '').trim();
  const configuredAccountId = (process.env.CTRADER_ACCOUNT_ID || '').trim();

  const transport = new CTraderTransport();
  const discoveredAccounts: any[] = [];

  try {
    await transport.connect(host, port, 10000);
    const appAuthRes = await transport.sendRequest(2100, { clientId, clientSecret });
    
    if (appAuthRes.payloadType === 2101) {
      console.log('  ✅ cTrader TLS & App Authorization: PASS');

      const accListRes = await transport.sendRequest(2149, { accessToken });
      const rawAccounts: any[] = accListRes.decodedPayload?.ctidTraderAccount || [];
      console.log(`  ✅ Discovered ${rawAccounts.length} cTrader account(s) linked to OAuth Token.`);

      for (const acc of rawAccounts) {
        const ctidTraderAccountId = Number(acc.ctidTraderAccountId);
        const isLive = !!acc.isLive;
        const traderLogin = acc.traderLogin ? String(acc.traderLogin) : 'N/A';
        const isConfigured = String(ctidTraderAccountId) === configuredAccountId || traderLogin === configuredAccountId;

        let authStatus = 'UNKNOWN';
        let balance = 'N/A';
        let currency = 'USD';
        let leverage = 'N/A';
        let openPositionsCount = 0;

        try {
          const authRes = await transport.sendRequest(2102, {
            ctidTraderAccountId,
            accessToken
          });

          if (authRes.payloadType === 2103) {
            authStatus = 'AUTHENTICATED';
            
            // Get balance & details
            const traderRes = await transport.sendRequest(2121, { ctidTraderAccountId });
            const trader = traderRes.decodedPayload?.trader;
            if (trader) {
              const moneyDigits = trader.moneyDigits ?? 2;
              const rawBal = Number(trader.balance ?? 0);
              balance = (rawBal / Math.pow(10, moneyDigits)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              currency = trader.depositCurrency || 'USD';
              leverage = `1:${trader.leverageInCents ? trader.leverageInCents / 100 : trader.leverage || 'N/A'}`;
            }

            // Reconcile open positions
            const reconRes = await transport.sendRequest(2124, { ctidTraderAccountId });
            if (reconRes.payloadType === 2125) {
              openPositionsCount = reconRes.decodedPayload?.position?.length || 0;
            }
          } else {
            authStatus = `FAILED (Code ${authRes.payloadType})`;
          }
        } catch (e: any) {
          authStatus = `ERROR: ${e.message}`;
        }

        discoveredAccounts.push({
          ctidTraderAccountId,
          isLive: isLive ? 'LIVE' : 'DEMO',
          traderLogin,
          authStatus,
          balance: `${currency} ${balance}`,
          leverage,
          openPositionsCount,
          isConfigured
        });
      }
    } else {
      console.log(`  ❌ cTrader App Auth Failed (Payload: ${appAuthRes.payloadType})`);
    }
  } catch (err: any) {
    console.log(`  ❌ cTrader Open API: FAILED (${err.message})`);
  } finally {
    try {
      await transport.disconnect();
    } catch (e) {}
  }

  // 3. TELEGRAM BOT & NOTIFICATIONS
  console.log('\n[3/3] Checking Telegram Bot Alert Gateways...');
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const data = await resp.json();
      if (data.ok) {
        console.log(`  ✅ Telegram Bot: ONLINE (@${data.result.username} - "${data.result.first_name}")`);
      } else {
        console.log(`  ⚠️ Telegram Bot: ${data.description}`);
      }
    } catch (err: any) {
      console.log(`  ⚠️ Telegram: Network error (${err.message})`);
    }
  }

  // SUMMARY OUTPUT
  console.log('\n================================================================');
  console.log('      cTRADER CONNECTED ACCOUNTS & HEALTH MATRIX                ');
  console.log('================================================================');
  if (discoveredAccounts.length > 0) {
    console.table(discoveredAccounts.map(a => ({
      'cTID Account ID': a.ctidTraderAccountId,
      'Environment': a.isLive,
      'Trader Login': a.traderLogin,
      'Connection Health': a.authStatus === 'AUTHENTICATED' ? '✅ HEALTHY' : `❌ ${a.authStatus}`,
      'Broker Balance': a.balance,
      'Leverage': a.leverage,
      'Open Positions': a.openPositionsCount,
      'Config Status': a.isConfigured ? '★ PRIMARY (Active in .env)' : 'AVAILABLE'
    })));
  } else {
    console.log('No cTrader accounts discovered.');
  }

  console.log('\n================================================================');
  console.log('      INTERNAL DATABASE ACCOUNT STATES                          ');
  console.log('================================================================');
  if (accountStates.length > 0) {
    console.table(accountStates.map((s: any) => ({
      'Account ID': s.account_id,
      'Balance': `$${s.balance}`,
      'Environment': s.environment || 'DEMO',
      'Tracked Positions': positionCounts.filter((p: any) => p.account_id === s.account_id).reduce((sum: number, cur: any) => sum + cur.count, 0),
      'Last Updated': s.updated_at
    })));
  }

  console.log('================================================================');
  console.log('✅ ALL ACCOUNT CONNECTION HEALTH CHECKS COMPLETE.');
  console.log('================================================================\n');
}

runComprehensiveAccountHealthCheck().catch(console.error);
