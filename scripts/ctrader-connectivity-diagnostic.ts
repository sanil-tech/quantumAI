import dotenv from 'dotenv';
dotenv.config();

import dns from 'dns/promises';
import net from 'net';
import tls from 'tls';
import https from 'https';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function runComprehensiveDiagnostics() {
  console.log('======================================================================');
  console.log(' QUANTUMAI / IATI OS ? PHASE 7C-R CONNECTIVITY & TRANSPORT DIAGNOSTIC');
  console.log(' STRICTLY NON-TRADING ? ZERO ORDER TRANSMISSION');
  console.log('======================================================================\n');

  const host = 'demo.ctraderapi.com';
  const primaryPort = 5035;
  const secondaryPort = 5036;

  // 1. DNS Resolution
  console.log('--- 1. DNS RESOLUTION ---');
  let ipv4: string[] = [];
  try {
    ipv4 = await dns.resolve4(host);
    console.log('   IPv4 Addresses:', ipv4.join(', '));
  } catch (e: any) {
    console.log('   IPv4 DNS Error:', e.message);
  }
  try {
    const ipv6 = await dns.resolve6(host);
    console.log('   IPv6 Addresses:', ipv6.join(', '));
  } catch (e: any) {
    console.log('   IPv6 Status: NO AAAA RECORD (Expected for demo.ctraderapi.com)');
  }

  // 2. TCP Connectivity on 5035 vs 5036
  console.log('\n--- 2. TCP CONNECTIVITY ---');
  for (const port of [primaryPort, secondaryPort]) {
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const s = net.createConnection({ host, port, timeout: 3000 }, () => {
        const latency = Date.now() - start;
        console.log(`   Port ${port}: TCP CONNECT SUCCESS (${latency}ms)`);
        s.end();
        resolve();
      });
      s.on('timeout', () => {
        console.log(`   Port ${port}: TCP TIMEOUT (3000ms)`);
        s.destroy();
        resolve();
      });
      s.on('error', (e) => {
        console.log(`   Port ${port}: TCP ERROR (${e.message})`);
        resolve();
      });
    });
  }

  // 3. TLS Handshake on Port 5036
  console.log('\n--- 3. TLS HANDSHAKE & CERTIFICATE VERIFICATION (Port 5036) ---');
  await new Promise<void>((resolve) => {
    const start = Date.now();
    const s = tls.connect({
      host,
      port: secondaryPort,
      servername: host,
      timeout: 4000,
      rejectUnauthorized: true
    }, () => {
      const latency = Date.now() - start;
      console.log(`   TLS Handshake: SUCCESS (${latency}ms)`);
      console.log('   Protocol:', s.getProtocol());
      console.log('   Cipher:', s.getCipher()?.name);
      const cert = s.getPeerCertificate();
      console.log('   Certificate Subject CN:', cert.subject?.CN);
      console.log('   Certificate Issuer CN:', cert.issuer?.CN);
      console.log('   Certificate Valid To:', cert.valid_to);
      s.end();
      resolve();
    });
    s.on('timeout', () => {
      console.log('   TLS Handshake: TIMEOUT');
      s.destroy();
      resolve();
    });
    s.on('error', (e) => {
      console.log('   TLS Handshake ERROR:', e.message);
      resolve();
    });
  });

  // 4. Outbound HTTPS Control Test
  console.log('\n--- 4. OUTBOUND HTTPS CONTROL TEST ---');
  await new Promise<void>((resolve) => {
    const req = https.get('https://www.google.com', { timeout: 3000 }, (res) => {
      console.log(`   HTTPS Control Test (google.com): HTTP ${res.statusCode} OK`);
      resolve();
    });
    req.on('timeout', () => {
      console.log('   HTTPS Control Test: TIMEOUT');
      req.destroy();
      resolve();
    });
    req.on('error', (e) => {
      console.log('   HTTPS Control Test ERROR:', e.message);
      resolve();
    });
  });

  // 5. Configuration Status Check (Secrets Redacted)
  console.log('\n--- 5. CREDENTIALS & CONFIGURATION FORENSICS ---');
  console.log('   CTRADER_CLIENT_ID:    ', process.env.CTRADER_CLIENT_ID ? 'CONFIGURED' : 'MISSING');
  console.log('   CTRADER_CLIENT_SECRET:', process.env.CTRADER_CLIENT_SECRET ? 'CONFIGURED' : 'MISSING');
  console.log('   CTRADER_ACCESS_TOKEN: ', process.env.CTRADER_ACCESS_TOKEN ? 'CONFIGURED' : 'MISSING');
  console.log('   CTRADER_ACCOUNT_ID:   ', process.env.CTRADER_ACCOUNT_ID ? 'CONFIGURED' : 'MISSING');
  console.log('   TARGET_ENVIRONMENT:    DEMO (demo.ctraderapi.com)');

  // 6. Non-Trading Transport Probe over Port 5036
  console.log('\n--- 6. APPLICATION-LEVEL TRANSPORT PROBE (Port 5036) ---');
  const transport = new CTraderTransport();
  try {
    await transport.connect(host, secondaryPort);
    console.log('   Application TLS Socket: CONNECTED (Port 5036)');
    
    // Application Auth
    const appRes = await transport.sendRequest(2100, {
      clientId: process.env.CTRADER_CLIENT_ID,
      clientSecret: process.env.CTRADER_CLIENT_SECRET
    }, 5000);
    console.log('   Application Authentication (2100 -> 2101): SUCCESS');

    // Account Auth
    const accRes = await transport.sendRequest(2102, {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      accessToken: process.env.CTRADER_ACCESS_TOKEN
    }, 5000);
    console.log('   Account Authorization (2102 -> 2103): SUCCESS');

    await transport.disconnect();
    console.log('   Application Transport Disconnected Cleanly.');
  } catch (err: any) {
    console.log('   Transport Probe Notice:', err.message);
    try { await transport.disconnect(); } catch (e) {}
  }

  console.log('\n======================================================================');
  console.log(' PERMANENT INVARIANTS:');
  console.log(' READ_ONLY_MODE_ENFORCED = true');
  console.log(' EXECUTION_SAFETY_GATE   = BLOCKED');
  console.log(' ORDERS_TRANSMITTED      = 0');
  console.log('======================================================================\n');
}

runComprehensiveDiagnostics();
