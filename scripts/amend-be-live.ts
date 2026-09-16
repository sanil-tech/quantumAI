import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';
import { Pool } from 'pg';

async function amendBE() {
  const transport = new CTraderTransport();
  await transport.connect('demo.ctraderapi.com', 5035);

  await transport.sendRequest(2100, {
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET
  });
  await transport.sendRequest(2102, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    accessToken: process.env.CTRADER_ACCESS_TOKEN
  });

  console.log('Amending Position #288564090 on cTrader to exact Break-Even (1.15462) and TP2 (1.14562)...');
  const amendRes = await transport.sendRequest(2110, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    positionId: 288564090,
    stopLoss: 1.15462,
    takeProfit: 1.14562
  });

  console.log('Amend Response:', amendRes.payloadType);

  await transport.disconnect();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    UPDATE positions
    SET stop_loss = 1.15462, take_profit = 1.14562, take_profit_2 = 1.14562, updated_at = NOW()
    WHERE position_id = 'trade_288564090'
  `);
  console.log('Database updated.');
  await pool.end();
}

amendBE().catch(console.error);
