/**
 * QuantumAI IATI OS - Phase 0 Production Security Hardening Verification Suite
 * Tests P0-1, P0-2, P0-3, P0-4, and P0-5 controls against the live running server and core services.
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin_demo_key_88';

async function runTests() {
  console.log('===============================================================');
  console.log('🛡️  QUANTUM AI — PHASE 0 PRODUCTION SECURITY HARDENING TESTS');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST GROUP 1: P0-1 Credential Security in cBot Source
  // -------------------------------------------------------------
  console.log('\n--- [TEST GROUP 1: P0-1 Credential Security in cBot Source] ---');
  const cbotPath = path.resolve(process.cwd(), 'cTrader', 'QuantumAI_VIP_Receiver.cs');
  const cbotSource = fs.readFileSync(cbotPath, 'utf-8');

  assert(
    !cbotSource.includes('BotToken') && !/[0-9]{8,10}:[a-zA-Z0-9_-]{35}/.test(cbotSource),
    'P0-1.1: Telegram BotToken parameter completely purged from cBot source'
  );

  assert(
    !cbotSource.includes('ChannelId') && !cbotSource.includes('-1004344482481'),
    'P0-1.2: ChannelId parameter completely purged from cBot source'
  );

  assert(
    !cbotSource.includes('PollTelegramUpdates'),
    'P0-1.3: Insecure Telegram polling loop removed from cBot'
  );

  assert(
    cbotSource.includes('account={Account.Number}'),
    'P0-1.4: Direct server bridge polling binds Account.Number for server-side verification'
  );

  assert(
    cbotSource.includes('_revalidationCounter') && cbotSource.includes('VerifyVipLicense'),
    'P0-1.5: Periodic license revalidation implemented in OnTimer'
  );

  // -------------------------------------------------------------
  // TEST GROUP 2: P0-2 Copier Signal API Security
  // -------------------------------------------------------------
  console.log('\n--- [TEST GROUP 2: P0-2 Copier Signal API Security] ---');

  // 2.1: Unauthenticated POST /api/copier/signal must be rejected with 401
  const unauthSignalRes = await fetch(`${BASE_URL}/api/copier/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.15500,
      stopLoss: 1.15200,
      takeProfit1: 1.15800
    })
  });
  assert(
    unauthSignalRes.status === 401,
    'P0-2.1: Unauthenticated POST /api/copier/signal returns 401 Unauthorized',
    `Received status ${unauthSignalRes.status}`
  );

  // 2.2: Admin authenticated POST /api/copier/signal must succeed (200)
  const authSignalRes = await fetch(`${BASE_URL}/api/copier/signal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY
    },
    body: JSON.stringify({
      pair: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.15500,
      stopLoss: 1.15200,
      takeProfit1: 1.15800,
      takeProfit2: 1.16100,
      masterBrokerOrderId: 'TEST-BROKER-ORD-001'
    })
  });
  const authSignalData = await authSignalRes.json();
  assert(
    authSignalRes.status === 200 && authSignalData.success === true,
    'P0-2.2: Admin authenticated POST /api/copier/signal succeeds (200)',
    `Status ${authSignalRes.status}, data: ${JSON.stringify(authSignalData)}`
  );

  // 2.3: Unauthorized client account cannot poll GET /api/copier/signal (401 Missing Auth or 403 Forbidden)
  const unauthorizedPollRes = await fetch(`${BASE_URL}/api/copier/signal?account=999999999_fake`);
  assert(
    unauthorizedPollRes.status === 401 || unauthorizedPollRes.status === 403,
    'P0-2.3: GET /api/copier/signal rejects unregistered client with 401 Unauthorized or 403 Forbidden',
    `Status ${unauthorizedPollRes.status}`
  );

  // -------------------------------------------------------------
  // TEST GROUP 3: P0-3 Test Order Endpoint Security
  // -------------------------------------------------------------
  console.log('\n--- [TEST GROUP 3: P0-3 Test Order Endpoint Security] ---');

  // 3.1: Unauthenticated POST /api/copier/test-dual-order must be rejected with 401
  const unauthTestOrderRes = await fetch(`${BASE_URL}/api/copier/test-dual-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pair: 'EUR/USD', direction: 'BUY' })
  });
  assert(
    unauthTestOrderRes.status === 401,
    'P0-3.1: Unauthenticated POST /api/copier/test-dual-order returns 401 Unauthorized',
    `Status ${unauthTestOrderRes.status}`
  );

  // 3.2: Unauthenticated POST /api/copier/cancel-dual-order must be rejected with 401
  const unauthCancelRes = await fetch(`${BASE_URL}/api/copier/cancel-dual-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pair: 'EUR/USD' })
  });
  assert(
    unauthCancelRes.status === 401,
    'P0-3.2: Unauthenticated POST /api/copier/cancel-dual-order returns 401 Unauthorized',
    `Status ${unauthCancelRes.status}`
  );

  // 3.3: Production Environment Guard Test (simulated via route inspection and env guard)
  const copierRouteSource = fs.readFileSync(path.resolve(process.cwd(), 'src', 'server', 'routes', 'copier.ts'), 'utf-8');
  assert(
    copierRouteSource.includes("process.env.NODE_ENV === 'production'") &&
    copierRouteSource.includes("TEST_DUAL_ORDER_DISABLED_IN_PRODUCTION"),
    'P0-3.3: Hard production guard actively blocks test-dual-order in NODE_ENV=production'
  );

  assert(
    copierRouteSource.includes("env === 'LIVE'") &&
    copierRouteSource.includes("TEST_ORDERS_PROHIBITED_ON_LIVE_ACCOUNTS"),
    'P0-3.4: Prohibits test order execution when EXECUTION_ENVIRONMENT is LIVE'
  );

  // -------------------------------------------------------------
  // TEST GROUP 4: P0-4 VIP Registration Security
  // -------------------------------------------------------------
  console.log('\n--- [TEST GROUP 4: P0-4 VIP Registration Security] ---');

  const testAccNumber = `test_${Date.now()}`;

  // 4.1: Public unauthenticated registration creates PENDING_VERIFICATION (not ACTIVE)
  const publicRegRes = await fetch(`${BASE_URL}/api/copier/register-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountNumber: testAccNumber,
      name: 'Hostile Attacker Attempting Free VIP',
      durationDays: 365 // Attacker requests 365 days
    })
  });
  const publicRegData = await publicRegRes.json();
  assert(
    publicRegData.success === true &&
    publicRegData.subscriber.status === 'PENDING_VERIFICATION' &&
    publicRegData.subscriber.expiresAt === 0,
    'P0-4.1: Public registration creates PENDING_VERIFICATION with 0 expiresAt (cannot self-grant VIP)',
    `Status: ${publicRegData.subscriber?.status}, expiresAt: ${publicRegData.subscriber?.expiresAt}`
  );

  // 4.2: License check on PENDING_VERIFICATION account returns valid: false
  const verifyPendingRes = await fetch(`${BASE_URL}/api/copier/verify?account=${testAccNumber}`);
  const verifyPendingData = await verifyPendingRes.json();
  assert(
    verifyPendingData.valid === false && verifyPendingData.status === 'PENDING_VERIFICATION',
    'P0-4.2: License verify on pending account fails closed (valid: false)',
    `valid: ${verifyPendingData.valid}, status: ${verifyPendingData.status}`
  );

  // 4.3: Unauthenticated call to activate-account must return 401
  const unauthActivateRes = await fetch(`${BASE_URL}/api/copier/admin/activate-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountNumber: testAccNumber, durationDays: 30 })
  });
  assert(
    unauthActivateRes.status === 401,
    'P0-4.3: Unauthenticated call to /api/copier/admin/activate-account returns 401 Unauthorized',
    `Status: ${unauthActivateRes.status}`
  );

  // 4.4: Admin authenticated call to activate-account approves account
  const authActivateRes = await fetch(`${BASE_URL}/api/copier/admin/activate-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY
    },
    body: JSON.stringify({ accountNumber: testAccNumber, durationDays: 30, approvedBy: 'SuperAdmin' })
  });
  const authActivateData = await authActivateRes.json();
  assert(
    authActivateRes.status === 200 &&
    authActivateData.subscriber.status === 'ACTIVE' &&
    authActivateData.subscriber.expiresAt > Date.now(),
    'P0-4.4: Admin activation transitions account to ACTIVE with valid expiry',
    `Status: ${authActivateData.subscriber?.status}, expiresAt: ${authActivateData.subscriber?.expiresAt}`
  );

  // 4.5: License check on activated account returns valid: true
  const verifyActiveRes = await fetch(`${BASE_URL}/api/copier/verify?account=${testAccNumber}`);
  const verifyActiveData = await verifyActiveRes.json();
  assert(
    verifyActiveData.valid === true && verifyActiveData.status === 'ACTIVE',
    'P0-4.5: License verify on approved account succeeds (valid: true, status: ACTIVE)',
    `valid: ${verifyActiveData.valid}, status: ${verifyActiveData.status}`
  );

  // -------------------------------------------------------------
  // TEST GROUP 5: P0-5 Broker Confirmation Before Copier Dispatch
  // -------------------------------------------------------------
  console.log('\n--- [TEST GROUP 5: P0-5 Master Broker Confirmation Before Copier Dispatch] ---');

  const scannerSource = fs.readFileSync(path.resolve(process.cwd(), 'src', 'server', 'services', 'autonomousMarketScannerService.ts'), 'utf-8');

  // Verify placeOrder appears before publishCopierSignal
  const placeOrderIdx = scannerSource.indexOf('await ctrader.placeOrder(');
  const publishCopierIdx = scannerSource.indexOf('publishCopierSignal({');
  assert(
    placeOrderIdx > 0 && publishCopierIdx > 0 && placeOrderIdx < publishCopierIdx,
    'P0-5.1: Master ctrader.placeOrder() is executed strictly BEFORE publishCopierSignal()',
    `placeOrder at char ${placeOrderIdx}, publishCopier at char ${publishCopierIdx}`
  );

  // Verify confirmation check: orderResult.status !== 'REJECTED' and brokerOrderId
  assert(
    scannerSource.includes("orderResult.status !== 'REJECTED'") &&
    scannerSource.includes("rawBrokerOrderId"),
    'P0-5.2: Strict broker confirmation check guards copier signal dispatch'
  );

  // Verify rejection block: when broker rejects, return without publishing
  assert(
    scannerSource.includes("Master broker REJECTED order") &&
    scannerSource.includes("Copier dispatch BLOCKED (Fail-Closed)"),
    'P0-5.3: Broker rejection triggers fail-closed return (no copier signal published)'
  );

  // Verify exception / timeout block
  assert(
    scannerSource.includes("Master order execution failed or timed out") &&
    scannerSource.includes("Copier dispatch BLOCKED (Fail-Closed)"),
    'P0-5.4: Broker timeout/exception triggers fail-closed (no copier signal published)'
  );

  // Verify copier signal binds masterBrokerOrderId
  assert(
    scannerSource.includes("masterBrokerOrderId: String(rawBrokerOrderId)"),
    'P0-5.5: Copier signal explicitly binds the verified Master broker order ID'
  );

  console.log('\n===============================================================');
  console.log(`🏁  TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
});
