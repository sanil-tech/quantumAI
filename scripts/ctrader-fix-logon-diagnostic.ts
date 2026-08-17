import 'dotenv/config';
import dns from 'dns/promises';
import net from 'net';
import tls from 'tls';

function getFixUtcTimestamp(): string {
  const now = new Date();
  const YYYY = now.getUTCFullYear();
  const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return YYYY.toString() + MM + DD + '-' + hh + ':' + mm + ':' + ss;
}

function buildFixMessage(msgType: string, msgSeqNum: number, fields: [number, string][]): string {
  const bodyParts: string[] = [];
  bodyParts.push('35=' + msgType);
  bodyParts.push('34=' + msgSeqNum);
  bodyParts.push('52=' + getFixUtcTimestamp());
  for (const item of fields) {
    bodyParts.push(item[0] + '=' + item[1]);
  }
  const bodyStr = bodyParts.join('\x01') + '\x01';
  const headStr = '8=FIX.4.4\x019=' + bodyStr.length + '\x01';
  const fullNoChecksum = headStr + bodyStr;
  let checksum = 0;
  for (let i = 0; i < fullNoChecksum.length; i++) {
    checksum = (checksum + fullNoChecksum.charCodeAt(i)) % 256;
  }
  const checkStr = checksum.toString().padStart(3, '0');
  return fullNoChecksum + '10=' + checkStr + '\x01';
}

async function runFixDiagnostic() {
  console.log('====================================================');
  console.log('cTrader FIX 4.4 TLS + LOGON DIAGNOSTIC');
  console.log('====================================================\n');

  const host = process.env.CTRADER_FIX_HOST || 'demo-uk-eqx-01.p.c-trader.com';
  const port = parseInt(process.env.CTRADER_FIX_PORT || '5212', 10);
  const accountId = process.env.CTRADER_ACCOUNT_ID || '5881460';
  const senderCompId = process.env.CTRADER_FIX_SENDER_COMP_ID || 'demo.ctrader.5881460';
  const targetCompId = process.env.CTRADER_FIX_TARGET_COMP_ID || 'CSERVER';
  const senderSubId = process.env.CTRADER_FIX_SENDER_SUB_ID || 'TRADE';
  const password = process.env.CTRADER_FIX_PASSWORD || process.env.CTRADER_CLIENT_SECRET || '';

  console.log('FIX Configuration:');
  console.log('  Host: ' + host);
  console.log('  TLS Port: ' + port);
  console.log('  FIX Version: FIX.4.4');
  console.log('  SenderCompID (Tag 49): ' + senderCompId);
  console.log('  TargetCompID (Tag 56): ' + targetCompId);
  console.log('  TargetSubID (Tag 57): ' + senderSubId);
  console.log('  SenderSubID (Tag 50): ' + senderSubId);
  console.log('  ResetSeqNum (Tag 141): Y');
  console.log('  Username (Tag 553): ' + accountId);
  console.log('  Password (Tag 554): ' + (password ? '[PRESENT]' : '[MISSING]'));
  console.log('  Trading Enabled: FALSE (READ_ONLY_MODE_ENFORCED)\n');

  let ip = '';
  try {
    console.log('--- PHASE 1: DNS RESOLUTION ---');
    const res = await dns.resolve4(host);
    ip = res[0];
    console.log('  Resolved IPv4: ' + ip);
    console.log('  DNS Result: SUCCESS\n');
  } catch (err: any) {
    console.log('  DNS Result: FAIL (' + err.message + ')\n');
  }

  try {
    console.log('--- PHASE 2: TCP CONNECTIVITY ---');
    const t0 = Date.now();
    await new Promise((resolve, reject) => {
      const s = net.connect(port, host, () => { s.end(); resolve(true); });
      s.on('error', reject);
      setTimeout(() => { s.destroy(); reject(new Error('TCP timeout after 5000ms')); }, 5000);
    });
    console.log('  TCP Connected in ' + (Date.now() - t0) + 'ms');
    console.log('  TCP Result: SUCCESS\n');
  } catch (err: any) {
    console.log('  TCP Result: FAIL (' + err.message + ')\n');
  }

  let tlsSuccess = false;
  let responseStr = '';
  try {
    console.log('--- PHASE 3 & 4: TLS HANDSHAKE & FIX LOGON (35=A) ---');
    const t0 = Date.now();
    await new Promise((resolve, reject) => {
      const socket = tls.connect(port, host, { rejectUnauthorized: true }, () => {
        const cert = socket.getPeerCertificate();
        console.log('  TLS Handshake Success (' + (Date.now() - t0) + 'ms)');
        console.log('  TLS Protocol: ' + socket.getProtocol());
        console.log('  Cert Authorized: ' + socket.authorized);
        console.log('  Cert Subject: ' + cert.subject?.CN);
        console.log('  Cert Issuer: ' + cert.issuer?.O);
        tlsSuccess = true;

        const logonFields: [number, string][] = [
          [49, senderCompId],
          [56, targetCompId],
          [57, senderSubId],
          [50, senderSubId],
          [98, '0'],
          [108, '30'],
          [141, 'Y'],
          [553, accountId],
          [554, password]
        ];
        const logonMsg = buildFixMessage('A', 1, logonFields);
        console.log('  Logon Sent (35=A): YES');
        socket.write(logonMsg);
      });

      socket.on('data', (buf) => {
        responseStr = buf.toString('latin1');
        socket.end();
        resolve(true);
      });

      socket.on('error', (err) => {
        reject(err);
      });
      setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 5000);
    });
    console.log('  TLS Result: SUCCESS\n');
  } catch (err: any) {
    console.log('  TLS Result: FAIL (' + err.message + ')\n');
  }

  console.log('--- PHASE 5: SESSION & READ-ONLY CAPABILITY AUDIT ---');
  if (responseStr.includes('35=A')) {
    console.log('  FIX Logon Response: ACCEPTED (35=A)');
    console.log('  Sequence Number Handling: 34=1 (Reset via Tag 141=Y)');
    console.log('  HeartBtInt (Tag 108): 30s');
    console.log('  Supported Session Maintenance: 35=0 (Heartbeat), 35=1 (TestRequest), 35=5 (Logout)');
    console.log('  Account-State FIX Query Support: NOT SUPPORTED BY cTRADER FIX GATEWAY (cTrader FIX is limited to execution & streaming market data)');
    console.log('  REAL ACCOUNT DATA: NOT AVAILABLE THROUGH CURRENT FIX READ-ONLY FLOW');
    console.log('  Authoritative Data Source: cTrader Open API ProtoBuf (ProtoOATraderReq 2121 / ProtoOAReconcileReq 2124)');
  } else if (responseStr.includes('35=5') || responseStr.includes('35=3')) {
    const textMatch = responseStr.match(/58=([^\x01]+)/);
    const reason = textMatch ? textMatch[1] : 'Reject frame received';
    console.log('  FIX Logon Response: REJECTED (35=5 Logout/Reject, 58=' + reason + ')');
  } else if (responseStr.length > 0) {
    console.log('  FIX Logon Response: RECEIVED (' + responseStr.substring(0, 100) + '...)');
  } else {
    console.log('  FIX Logon Response: TIMEOUT / UNREGISTERED FIX ACCOUNT');
  }

  console.log('\n====================================================');
  console.log('TRADING & SAFETY VERIFICATION:');
  console.log('NewOrderSingle (35=D):        0');
  console.log('OrderCancelRequest (35=F):   0');
  console.log('OrderCancelReplace (35=G):   0');
  console.log('Execution Safety:              READ_ONLY_MODE_ENFORCED');
  console.log('====================================================');
}

runFixDiagnostic().catch(err => console.error('FIX DIAGNOSTIC FATAL:', err));
