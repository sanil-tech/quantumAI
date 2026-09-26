import 'dotenv/config';
import { multiClientCopierService, SubscriberAccount } from '../src/server/services/multiClientCopierService';
import { confirmMasterOrder, approveCopierSignal } from '../src/server/services/copierSafetyPolicy';

async function runMultiTenantSimulation() {
  console.log('================================================================');
  console.log('       QUANTUM AI - MULTI-TENANT ORDER DISPATCH SIMULATION      ');
  console.log('================================================================\n');

  // 1. Simulasikan pendaftaran 3 akaun pelanggan dengan emel dan baki berbeza
  const tenant1: SubscriberAccount = {
    id: 'tenant-user-001',
    name: 'Ahmad Faiz (Beta Tester 1)',
    email: 'ahmad.faiz@example.com',
    accountNumber: '5916063',
    ctidTraderAccountId: 48739330,
    environment: 'DEMO',
    brokerName: 'IC Markets cTrader Demo',
    riskMode: 'BALANCED',
    riskPercent: 1.0, // 1% risk
    status: 'ACTIVE',
    balance: 2000,
    equity: 2000,
    connected: true,
    latencyMs: 24,
    totalCopiedTrades: 0,
    createdAt: Date.now()
  };

  const tenant2: SubscriberAccount = {
    id: 'tenant-user-002',
    name: 'Siti Sarah (Beta Tester 2)',
    email: 'siti.sarah@example.com',
    accountNumber: '6012894',
    ctidTraderAccountId: 49821045,
    environment: 'DEMO',
    brokerName: 'Pepperstone cTrader Demo',
    riskMode: 'CONSERVATIVE',
    riskPercent: 0.5, // 0.5% risk (Separuh risiko)
    status: 'ACTIVE',
    balance: 1000,
    equity: 1000,
    connected: true,
    latencyMs: 31,
    totalCopiedTrades: 0,
    createdAt: Date.now()
  };

  const tenant3: SubscriberAccount = {
    id: 'tenant-user-003',
    name: 'Zul Hakim (Akaun Dijeda / Paused)',
    email: 'zul.hakim@example.com',
    accountNumber: '7103452',
    ctidTraderAccountId: 51203490,
    environment: 'DEMO',
    brokerName: 'FxPro cTrader Demo',
    riskMode: 'PRO',
    riskPercent: 2.0,
    status: 'PAUSED', // Sengaja dijeda
    balance: 5000,
    equity: 5000,
    connected: true,
    latencyMs: 40,
    totalCopiedTrades: 0,
    createdAt: Date.now()
  };

  console.log('--- 1. MENDAFTARKAN 3 AKAUN PELANGGAN (MULTI-TENANT) ---');
  multiClientCopierService.addSubscriber(tenant1);
  multiClientCopierService.addSubscriber(tenant2);
  multiClientCopierService.addSubscriber(tenant3);

  const activeSubscribers = multiClientCopierService.getSubscribers();
  console.log(`Jumlah Pelanggan Berdaftar: ${activeSubscribers.length}`);
  activeSubscribers.slice(-3).forEach((s, idx) => {
    console.log(`  [${idx + 1}] ${s.name} (${s.email})`);
    console.log(`      Akaun: #${s.accountNumber} | Modal: $${s.balance} | Risiko: ${s.riskPercent}% | Status: ${s.status}`);
  });

  // 2. Simulasi AI Signal Execution
  console.log('\n--- 2. MENJANA ISYARAT TRADING AI MASTER ---');
  const masterSignal = {
    signalId: `signal-alpha-${Date.now()}`,
    symbol: 'GBPUSD',
    direction: 'BUY' as const,
    confidence: 88,
    validationStatus: 'PASS',
    validationErrors: [],
    expiryTime: Date.now() + 60000,
    executionStatus: 'VALID',
    entryPrice: 1.33500,
    stopLoss: 1.33200, // 30 pips SL
    takeProfit1: 1.34100, // 60 pips TP1 (1:2 RR)
    takeProfit2: 1.34700  // 120 pips TP2 (1:4 RR)
  };

  console.log(`Isyarat: ${masterSignal.direction} ${masterSignal.symbol} @ ${masterSignal.entryPrice}`);
  console.log(`Stop Loss: ${masterSignal.stopLoss} | Take Profit: ${masterSignal.takeProfit1}`);

  // 3. Kelulusan Governance & Safety Policy (broker_order_id strictly numeric per institutional safety policy)
  const approval = confirmMasterOrder(
    approveCopierSignal(masterSignal as any, 'ELIGIBLE_FOR_EXECUTION'),
    { status: 'ACCEPTED', broker_order_id: '99881234' },
    'MARKET'
  );

  console.log('\n--- 3. MELAKSANAKAN ORDER FAN-OUT KE SEMUA AKAUN PELANGGAN ---');
  const dispatchResult = await multiClientCopierService.dispatchMasterTrade(
    {
      pair: masterSignal.symbol,
      direction: masterSignal.direction,
      entryPrice: masterSignal.entryPrice,
      stopLoss: masterSignal.stopLoss,
      takeProfit1: masterSignal.takeProfit1,
      takeProfit2: masterSignal.takeProfit2
    },
    approval
  );

  console.log(`\nKeputusan Fan-Out:`);
  console.log(`- Jumlah akaun diproses: ${dispatchResult.results.length}`);
  console.log(`- Berjaya dihantar: ${dispatchResult.dispatchedCount} akaun`);
  console.log(`- Perincian Setiap Akaun:`);
  dispatchResult.results.forEach((r, idx) => {
    console.log(`  [${idx + 1}] Akaun: ${r.subscriberName} (#${r.accountNumber})`);
    console.log(`      Status: ${r.status}`);
    console.log(`      Saiz Lot: ${r.lotSize} Lots (Dilaraskan mengikut modal & profil risiko)`);
    console.log(`      Latensi: ${r.latencyMs}ms`);
    if (r.error) console.log(`      Punca/Catatan: ${r.error}`);
  });

  console.log('\n================================================================');
  console.log('✅ UJIAN SIMULASI MULTI-TENANT BERJAYA DILAKSANAKAN DENGAN SEMPURNA!');
  console.log('================================================================');
}

runMultiTenantSimulation().catch(err => {
  console.error('Simulasi gagal:', err);
  process.exit(1);
});
