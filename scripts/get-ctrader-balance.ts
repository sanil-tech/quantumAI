import 'dotenv/config';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function getBalance() {
  const adapter = new CTraderAdapter({
    environment: 'DEMO',
    host: 'demo.ctraderapi.com',
    port: 5035,
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
    accountId: process.env.CTRADER_ACCOUNT_ID,
    accessToken: process.env.CTRADER_ACCESS_TOKEN
  });

  await adapter.connect();
  const details = await adapter.fetchTraderDetails();
  console.log('=== REAL CTRADER ACCOUNT DETAILS ===');
  console.log(JSON.stringify(details, null, 2));

  if (details && details.trader) {
    const moneyDigits = details.trader.moneyDigits || 2;
    const rawBalance = details.trader.balance;
    const realBalance = rawBalance / Math.pow(10, moneyDigits);
    console.log(`Real Balance: $${realBalance.toFixed(2)} (raw: ${rawBalance}, moneyDigits: ${moneyDigits})`);
    console.log(`Account ID: ${details.trader.ctidTraderAccountId}`);
    console.log(`Leverage: 1:${details.trader.leverageInCents ? details.trader.leverageInCents / 100 : 500}`);
  }

  process.exit(0);
}

getBalance().catch(e => {
  console.error(e);
  process.exit(1);
});
