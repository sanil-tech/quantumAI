import tls from 'tls';

async function testFixConnection() {
  const host = 'demo-uk-eqx-01.p.c-trader.com';
  const port = 5212;
  const senderCompId = 'demo.ctrader.5912914';
  const targetCompId = 'cServer';
  const password = 'Sanil88bans';

  console.log(`Connecting to FIX SSL port ${host}:${port}...`);
  const socket = tls.connect({ host, port, rejectUnauthorized: false }, () => {
    console.log(`✅ TLS Socket Connected to FIX Trade Server ${host}:${port}`);

    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const padMs = (n: number) => String(n).padStart(3, '0');
    const now = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${padMs(d.getUTCMilliseconds())}`;
    const username = '5912914';
    // Construct FIX Logon message (35=A) with 553 Username and 554 Password
    const body = `35=A\x0149=${senderCompId}\x0156=${targetCompId}\x0157=TRADE\x0134=1\x0152=${now}\x0198=0\x01108=30\x01553=${username}\x01554=${password}\x01`;
    const header = `8=FIX.4.4\x019=${body.length}\x01`;
    const rawWithoutChecksum = header + body;
    let sum = 0;
    for (let i = 0; i < rawWithoutChecksum.length; i++) {
      sum = (sum + rawWithoutChecksum.charCodeAt(i)) % 256;
    }
    const checksum = String(sum).padStart(3, '0');
    const fullMessage = rawWithoutChecksum + `10=${checksum}\x01`;

    console.log('Sending FIX Logon (35=A)...');
    socket.write(fullMessage);
  });

  socket.on('data', (data) => {
    const resStr = data.toString('utf-8').replace(/\x01/g, ' | ');
    console.log('📥 FIX Server Response:', resStr);
    if (resStr.includes('35=A') || resStr.includes('Logon') || resStr.includes('58=')) {
      console.log('🎉 FIX PROTOCOL RESPONSE RECEIVED!');
    }
    socket.end();
    process.exit(0);
  });

  socket.on('error', (err) => {
    console.error('❌ FIX Error:', err.message);
    process.exit(1);
  });

  setTimeout(() => {
    console.log('Timeout waiting for FIX response.');
    socket.destroy();
    process.exit(0);
  }, 6000);
}

testFixConnection().catch(e => {
  console.error(e);
  process.exit(1);
});
