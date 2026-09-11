import 'dotenv/config';
import { checkDbConnection, getDbPool, TradingRepository } from '@iati/database';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function checkPostgres() {
  console.log('\n========================================');
  console.log('🔍 CHECKING POSTGRESQL DATABASE HEALTH');
  console.log('========================================');
  const start = Date.now();
  try {
    const isConnected = await checkDbConnection();
    const duration = Date.now() - start;
    if (!isConnected) {
      console.log(`❌ PostgreSQL connection FAILED (took ${duration}ms)`);
      return { status: 'FAILED', duration };
    }
    console.log(`✅ PostgreSQL connection SUCCESSFUL (latency: ${duration}ms)`);

    const pool = getDbPool();
    // Query actual tables
    const tableListRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    const tableNames = tableListRes.rows.map((r: any) => r.table_name);
    console.log(`📋 Found ${tableNames.length} tables in PostgreSQL:`, tableNames.join(', '));

    const counts: Record<string, number> = {};
    for (const tbl of tableNames) {
      const c = await pool.query(`SELECT COUNT(*) FROM "${tbl}"`);
      counts[tbl] = parseInt(c.rows[0].count, 10);
    }
    console.log('📊 Table Record Counts:', JSON.stringify(counts, null, 2));

    // Test Repository
    const repo = new TradingRepository();
    const pos = await repo.getPositions({ status: 'ALL' });
    console.log(`✅ TradingRepository.getPositions returned ${pos.total} total positions.`);

    return { status: 'HEALTHY', duration, tables: tableNames, counts };
  } catch (err: any) {
    console.log(`❌ PostgreSQL query error: ${err.message}`);
    return { status: 'ERROR', error: err.message };
  }
}

async function checkCTrader() {
  console.log('\n========================================');
  console.log('🔍 CHECKING CTRADER API HEALTH');
  console.log('========================================');
  const host = process.env.CTRADER_HOST || 'demo.ctraderapi.com';
  const port = Number(process.env.CTRADER_PORT) || 5035;
  const clientId = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  const accountId = Number(process.env.CTRADER_ACCOUNT_ID);
  const accessToken = process.env.CTRADER_ACCESS_TOKEN;

  console.log(`Host: ${host}:${port}`);
  console.log(`Client ID: ${clientId ? clientId.substring(0, 6) + '...' : 'MISSING'}`);
  console.log(`Account ID: ${accountId || 'MISSING'}`);
  console.log(`Access Token: ${accessToken ? accessToken.substring(0, 8) + '...' : 'MISSING'}`);

  if (!clientId || !clientSecret || !accountId || !accessToken) {
    console.log('❌ Missing required cTrader credentials in environment (.env)');
    return { status: 'MISSING_CREDS' };
  }

  const transport = new CTraderTransport();
  const start = Date.now();
  try {
    console.log(`⏳ Connecting to ${host}:${port} via TLS...`);
    await transport.connect(host, port);
    console.log(`✅ TLS Connection established (${Date.now() - start}ms)`);

    console.log(`⏳ Sending Application Authorization (ProtoOAApplicationAuthReq, payloadType 2100)...`);
    await transport.sendRequest(2100, {
      clientId,
      clientSecret,
    }, 8000);
    console.log(`✅ Application Authorized successfully`);

    console.log(`⏳ Sending Account Authorization (ProtoOAAccountAuthReq, payloadType 2102) for account ${accountId}...`);
    await transport.sendRequest(2102, {
      ctidTraderAccountId: accountId,
      accessToken,
    }, 8000);
    console.log(`✅ Account Authorized successfully`);

    console.log(`⏳ Fetching Live Account Reconcile / Trader State (ProtoOAReconcileReq, payloadType 2124)...`);
    const recRes = await transport.sendRequest(2124, {
      ctidTraderAccountId: accountId,
    }, 8000);

    const positions = recRes.decodedPayload?.position || [];
    console.log(`✅ Reconcile returned: ${positions.length} open position(s) on broker.`);

    transport.disconnect();
    return {
      status: 'HEALTHY',
      duration: Date.now() - start,
      openBrokerPositions: positions.length
    };
  } catch (err: any) {
    console.log(`❌ cTrader API communication failed: ${err.message}`);
    transport.disconnect();
    return { status: 'ERROR', error: err.message };
  }
}

async function run() {
  const pgResult = await checkPostgres();
  const ctraderResult = await checkCTrader();

  console.log('\n========================================');
  console.log('📋 OVERALL HEALTH SUMMARY');
  console.log('========================================');
  console.log(`PostgreSQL : ${pgResult.status === 'HEALTHY' ? '🟢 HEALTHY' : '🔴 UNHEALTHY'}`);
  console.log(`cTrader API: ${ctraderResult.status === 'HEALTHY' ? '🟢 HEALTHY' : '🔴 UNHEALTHY'}`);
  console.log('========================================\n');

  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error during health check:', err);
  process.exit(1);
});
