import 'dotenv/config';
import dns from 'dns/promises';
import net from 'net';
import tls from 'tls';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

interface DiagnosticResult {
  dns: { ip: string; latencyMs: number };
  tcp: { port: number; latencyMs: number };
  tls: { latencyMs: number; protocol: string; cipher?: string };
  appAuth: { success: boolean; latencyMs: number };
  accountAuth: { success: boolean; latencyMs: number; accountId: string };
  pingRtt: { min: number; max: number; avg: number; jitter: number; samples: number[] };
  accountHealth: { balance: number; equity?: number; currency: string; leverage: number };
  positionsCount: number;
  positionsSummary: Array<{ id: string; symbolId: number; volumeLots: number; price: number; sl: number; tp: number }>;
  marketDataTickTest: {
    durationMs: number;
    ticksReceived: number;
    ticksPerSecond: number;
    latestBid?: number;
    latestAsk?: number;
    pairsWithTicks: string[];
  };
  overallStatus: 'STABLE' | 'DEGRADED' | 'DISCONNECTED';
}

async function runStabilityDiagnostic(): Promise<void> {
  console.log('===============================================================');
  console.log(' QUANTUMAI cTrader OPEN API LIVE STABILITY & HEALTH DIAGNOSTIC');
  console.log('===============================================================\n');

  const host = 'demo.ctraderapi.com';
  const port = 5035;
  const accountIdStr = process.env.CTRADER_ACCOUNT_ID || '48282756';
  const clientId = process.env.CTRADER_CLIENT_ID || '';
  const clientSecret = process.env.CTRADER_CLIENT_SECRET || '';
  const accessToken = process.env.CTRADER_ACCESS_TOKEN || '';

  const results: Partial<DiagnosticResult> = {};

  // 1. DNS Resolution
  process.stdout.write('1. Menguji Resolusi DNS (demo.ctraderapi.com)... ');
  const dnsStart = Date.now();
  const ips = await dns.resolve4(host);
  const dnsLatency = Date.now() - dnsStart;
  console.log(`OK [IP: ${ips[0]}, Masa: ${dnsLatency}ms]`);
  results.dns = { ip: ips[0], latencyMs: dnsLatency };

  // 2. TCP Handshake
  process.stdout.write(`2. Menguji Sambungan TCP ke port ${port}... `);
  const tcpStart = Date.now();
  await new Promise<void>((resolve, reject) => {
    const s = net.createConnection({ host, port, timeout: 5000 }, () => {
      const tcpLatency = Date.now() - tcpStart;
      results.tcp = { port, latencyMs: tcpLatency };
      console.log(`OK [Masa: ${tcpLatency}ms]`);
      s.end();
      resolve();
    });
    s.on('timeout', () => { s.destroy(); reject(new Error('TCP connection timeout')); });
    s.on('error', (err) => reject(err));
  });

  // 3. TLS Handshake
  process.stdout.write(`3. Menguji TLS Handshake & Sijil Keselamatan... `);
  const tlsStart = Date.now();
  await new Promise<void>((resolve, reject) => {
    const s = tls.connect({ host, port, servername: host, timeout: 6000, rejectUnauthorized: false }, () => {
      const tlsLatency = Date.now() - tlsStart;
      const protocol = s.getProtocol() || 'TLS';
      const cipher = s.getCipher()?.name;
      results.tls = { latencyMs: tlsLatency, protocol, cipher };
      console.log(`OK [Protokol: ${protocol}, Cipher: ${cipher}, Masa: ${tlsLatency}ms]`);
      s.end();
      resolve();
    });
    s.on('timeout', () => { s.destroy(); reject(new Error('TLS handshake timeout')); });
    s.on('error', (err) => reject(err));
  });

  // 4. CTraderTransport Session & Authentication
  console.log('\n--- DIAGNOSTIK SESI APLIKASI & AKAUN (Open API Proto) ---');
  const transport = new CTraderTransport();
  await transport.connect(host, port, 10000);

  // App Auth
  process.stdout.write('4. Pengesahan Aplikasi (ProtoOAApplicationAuthReq 2100)... ');
  const appStart = Date.now();
  const appRes = await transport.sendRequest(2100, { clientId, clientSecret }, 8000);
  const appLatency = Date.now() - appStart;
  if (appRes.payloadType === 2101) {
    console.log(`BERJAYA [${appLatency}ms]`);
    results.appAuth = { success: true, latencyMs: appLatency };
  } else {
    console.log(`GAGAL (payload ${appRes.payloadType})`);
    results.appAuth = { success: false, latencyMs: appLatency };
  }

  // Account Auth
  process.stdout.write(`5. Pengesahan Akaun cTrader #${accountIdStr} (ProtoOAAccountAuthReq 2102)... `);
  const accStart = Date.now();
  const accRes = await transport.sendRequest(2102, {
    cTraderAccountId: Number(accountIdStr),
    accessToken
  }, 8000);
  const accLatency = Date.now() - accStart;
  if (accRes.payloadType === 2103) {
    console.log(`BERJAYA [${accLatency}ms]`);
    results.accountAuth = { success: true, latencyMs: accLatency, accountId: accountIdStr };
  } else {
    console.log(`GAGAL (payload ${accRes.payloadType})`);
    results.accountAuth = { success: false, latencyMs: accLatency, accountId: accountIdStr };
  }

  // 6. Round-Trip Time (RTT) & Jitter Test (5 Pusingan menggunakan ProtoOAVersionReq 2104)
  console.log('\n--- UJIAN LATENSI & JITTER (5 Pusingan) ---');
  const samples: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const t0 = Date.now();
    // Use ProtoOAVersionReq (2104) for ultra-lightweight ping
    const verRes = await transport.sendRequest(2104, {}, 5000);
    const dt = Date.now() - t0;
    samples.push(dt);
    console.log(`   Ping #${i}: ${dt}ms (cTrader API Version: ${verRes.decodedPayload?.version || 'N/A'})`);
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  const jitter = max - min;
  results.pingRtt = { min, max, avg, jitter, samples };
  console.log(`   Statistik RTT: Min=${min}ms, Max=${max}ms, Purata=${avg}ms, Jitter=${jitter}ms`);

  // 7. Semakan Kesihatan Akaun (ProtoOATraderReq 2121)
  console.log('\n--- STATUS KEWANGAN & MARGIN BROKER ---');
  const traderRes = await transport.sendRequest(2121, {
    ctidTraderAccountId: Number(accountIdStr)
  }, 8000);
  const traderData = traderRes.decodedPayload?.trader || {};
  const balance = Number(traderData.balance || 0) / 100;
  const leverageInCents = Number(traderData.leverageInCents || 10000);
  const leverage = leverageInCents / 100;
  console.log(`   Baki Akaun (Balance): $${balance.toFixed(2)} USD`);
  console.log(`   Leveraj Semasa: 1:${leverage}`);
  results.accountHealth = {
    balance,
    currency: 'USD',
    leverage
  };

  // 8. Semakan Kedudukan Terbuka (ProtoOAReconcileReq 2124)
  console.log('\n--- KEDUDUKAN TERBUKA SEMASA (LIVE OPEN POSITIONS) ---');
  const reconRes = await transport.sendRequest(2124, {
    ctidTraderAccountId: Number(accountIdStr)
  }, 8000);
  const rawPositions = reconRes.decodedPayload?.position || [];
  results.positionsCount = rawPositions.length;
  results.positionsSummary = [];

  for (const pos of rawPositions) {
    const volLots = Number(pos.tradeData?.volume || 0) / 10000000;
    const summary = {
      id: String(pos.positionId),
      symbolId: Number(pos.tradeData?.symbolId || 0),
      volumeLots: volLots,
      price: Number(pos.price || 0),
      sl: Number(pos.stopLoss || 0),
      tp: Number(pos.takeProfit || 0)
    };
    results.positionsSummary.push(summary);
    console.log(`   Posisi #${pos.positionId} (Symbol #${pos.tradeData?.symbolId}): Lot=${volLots.toFixed(2)}, Entry=${pos.price}, SL=${pos.stopLoss}, TP=${pos.takeProfit}`);
  }

  // 9. Ujian Langganan & Aliran Data Pasaran Langsung (Spot Ticks Stream)
  console.log('\n--- UJIAN ALIRAN DATA PASARAN (SPOT TICKS STREAMING) ---');
  console.log('   Melanggan EUR/USD (ID 1) & GBP/USD (ID 2) selama 5 saat...');
  
  let ticksCount = 0;
  const pairsWithTicksSet = new Set<string>();
  let latestBid: number | undefined;
  let latestAsk: number | undefined;

  transport.on('spotEvent', (evt: any) => {
    ticksCount++;
    const symId = evt.symbolId;
    pairsWithTicksSet.add(symId === 1 ? 'EUR/USD' : symId === 2 ? 'GBP/USD' : `Symbol #${symId}`);
    if (evt.bid) latestBid = evt.bid;
    if (evt.ask) latestAsk = evt.ask;
  });

  // Subscribe to symbol 1 (EURUSD) & 2 (GBPUSD) via 2127 (ProtoOASubscribeSpotsReq)
  await transport.sendRequest(2127, {
    ctidTraderAccountId: Number(accountIdStr),
    symbolId: [1, 2]
  }, 5000);

  const streamDurationMs = 5000;
  await new Promise((r) => setTimeout(r, streamDurationMs));

  const ticksPerSecond = Number((ticksCount / (streamDurationMs / 1000)).toFixed(2));
  console.log(`   Jumlah Tick Diterima: ${ticksCount} ticks dalam 5s (${ticksPerSecond} ticks/saat)`);
  console.log(`   Pasangan Menerima Tick: ${Array.from(pairsWithTicksSet).join(', ') || 'Tiada (Pasaran mungkin tenang)'}`);
  if (latestBid && latestAsk) {
    console.log(`   Harga Terkini Dikesan: Bid=${latestBid}, Ask=${latestAsk}`);
  }

  results.marketDataTickTest = {
    durationMs: streamDurationMs,
    ticksReceived: ticksCount,
    ticksPerSecond,
    latestBid,
    latestAsk,
    pairsWithTicks: Array.from(pairsWithTicksSet)
  };

  // Unsubscribe via 2129 (ProtoOAUnsubscribeSpotsReq)
  try {
    await transport.sendRequest(2129, {
      ctidTraderAccountId: Number(accountIdStr),
      symbolId: [1, 2]
    }, 5000);
  } catch (e) {}

  await transport.disconnect();

  // Penilaian Kestabilan
  const isDnsOk = results.dns && results.dns.latencyMs < 500;
  const isTcpOk = results.tcp && results.tcp.latencyMs < 500;
  const isAuthOk = results.appAuth?.success && results.accountAuth?.success;
  const isPingStable = results.pingRtt && results.pingRtt.avg < 600 && results.pingRtt.jitter < 300;

  let overallStatus: 'STABLE' | 'DEGRADED' | 'DISCONNECTED' = 'STABLE';
  if (!isAuthOk || !isTcpOk || !isDnsOk) {
    overallStatus = 'DISCONNECTED';
  } else if (!isPingStable || (results.pingRtt && results.pingRtt.avg > 800)) {
    overallStatus = 'DEGRADED';
  }

  console.log('\n===============================================================');
  console.log(` KESIMPULAN STATUS SAMBUNGAN: ${overallStatus === 'STABLE' ? '? CEMERLANG & STABIL (STABLE)' : overallStatus}`);
  console.log('===============================================================\n');
}

runStabilityDiagnostic().catch((err) => {
  console.error('DIAGNOSTIC ERROR:', err);
  process.exit(1);
});
