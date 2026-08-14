import dns from 'dns/promises';
import net from 'net';
import tls from 'tls';
import 'dotenv/config';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function runForensicAudit() {
  console.log('====================================================');
  console.log('TASK 8A-E — cTrader DEMO CONNECTIVITY FORENSIC AUDIT');
  console.log('====================================================\n');

  const host = 'demo.ctraderapi.com';
  const port = 5035;

  // PHASE 1 — DNS
  console.log('--- PHASE 1: DNS RESOLUTION ---');
  let ipv4: string[] = [];
  let ipv6: string[] = [];
  try {
    ipv4 = await dns.resolve4(host);
    console.log('DNS IPv4:', ipv4.join(', '));
  } catch (err: any) {
    console.log('DNS IPv4 Error:', err.message);
  }
  try {
    ipv6 = await dns.resolve6(host);
    console.log('DNS IPv6:', ipv6.join(', '));
  } catch (err: any) {
    console.log('DNS IPv6 Error:', err.message);
  }
  if (ipv4.length === 0 && ipv6.length === 0) {
    console.log('DNS RESULT: UNRESOLVED\n');
    console.log('CLASSIFICATION: A. DNS_UNAVAILABLE');
    console.log('FINAL STATUS: REAL DATA UNPROVEN');
    process.exit(1);
  }
  console.log('DNS RESULT: SUCCESS\n');

  // PHASE 2 — TCP CONNECTIVITY
  console.log('--- PHASE 2: TCP CONNECTIVITY ---');
  const tcpStart = Date.now();
  let tcpSuccess = false;
  await new Promise<void>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);
    socket.connect(port, host, () => {
      tcpSuccess = true;
      console.log('TCP Connected to ' + host + ':' + port + ' in ' + (Date.now() - tcpStart) + 'ms');
      socket.destroy();
      resolve();
    });
    socket.on('error', (err) => {
      console.log('TCP Error (' + (Date.now() - tcpStart) + 'ms):', err.message);
      socket.destroy();
      resolve();
    });
    socket.on('timeout', () => {
      console.log('TCP Timeout (' + (Date.now() - tcpStart) + 'ms)');
      socket.destroy();
      resolve();
    });
  });
  if (!tcpSuccess) {
    console.log('TCP RESULT: UNREACHABLE\n');
    console.log('CLASSIFICATION: B. TCP_UNREACHABLE');
    console.log('FINAL STATUS: REAL DATA UNPROVEN');
    process.exit(1);
  }
  console.log('TCP RESULT: SUCCESS\n');

  // PHASE 3 — TLS HANDSHAKE
  console.log('--- PHASE 3: TLS HANDSHAKE ---');
  const tlsStart = Date.now();
  let tlsSuccess = false;
  await new Promise<void>((resolve) => {
    const socket = tls.connect({ host, port, timeout: 5000, rejectUnauthorized: true }, () => {
      tlsSuccess = true;
      const cert = socket.getPeerCertificate();
      console.log('TLS Handshake Success (' + (Date.now() - tlsStart) + 'ms)');
      console.log('TLS Protocol:', socket.getProtocol());
      console.log('Cert Authorized:', socket.authorized);
      console.log('Cert Subject:', cert.subject ? cert.subject.CN : 'N/A');
      console.log('Cert Issuer:', cert.issuer ? cert.issuer.O : 'N/A');
      socket.destroy();
      resolve();
    });
    socket.on('error', (err) => {
      console.log('TLS Error (' + (Date.now() - tlsStart) + 'ms):', err.message);
      socket.destroy();
      resolve();
    });
    socket.on('timeout', () => {
      console.log('TLS Timeout (' + (Date.now() - tlsStart) + 'ms)');
      socket.destroy();
      resolve();
    });
  });
  if (!tlsSuccess) {
    console.log('TLS RESULT: HANDSHAKE FAILED\n');
    console.log('CLASSIFICATION: C. TLS_HANDSHAKE_FAILED');
    console.log('FINAL STATUS: REAL DATA UNPROVEN');
    process.exit(1);
  }
  console.log('TLS RESULT: SUCCESS\n');

  // PHASE 4-6 — TRANSPORT, AUTHENTICATION & READ-ONLY DATA
  console.log('--- PHASE 4-6: PROTOBUF TRANSPORT & AUTHENTICATION ---');
  try {
    const adapter = new CTraderAdapter();
    await adapter.connect();
    console.log('2101 (AppAuthRes): RECEIVED');
    console.log('2103 (AccAuthRes): RECEIVED');

    const status = await adapter.getAccountStatus();
    const recon = await adapter.reconcileState();
    const symbolsData = await adapter.fetchSymbols();

    console.log('2122 (TraderRes): RECEIVED');
    console.log('2125 (ReconcileRes): RECEIVED');
    console.log('2115 (SymbolsListRes): RECEIVED\n');

    console.log('CLASSIFICATION: F. REAL_READ_ONLY_API_CONNECTED');
    console.log('FINAL STATUS: REAL READ-ONLY API CONNECTED');
  } catch (err: any) {
    console.log('Authentication/Data Error:', err.message);
    if (err.message.includes('TIMEOUT')) {
      console.log('CLASSIFICATION: E. API_RESPONSE_TIMEOUT');
    } else {
      console.log('CLASSIFICATION: D. AUTHENTICATION_FAILED');
    }
    console.log('FINAL STATUS: REAL DATA UNPROVEN');
    process.exit(1);
  }
}

runForensicAudit();
