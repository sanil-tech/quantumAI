import dotenv from 'dotenv';
dotenv.config();

import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function checkSymbols() {
  const accountId = Number(process.env.CTRADER_ACCOUNT_ID || 48282756);
  const transport = new CTraderTransport();

  await transport.connect(process.env.CTRADER_HOST || 'demo.ctraderapi.com', 5035);
  await transport.sendRequest(2100, {
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET
  });
  await transport.sendRequest(2102, {
    ctidTraderAccountId: accountId,
    accessToken: process.env.CTRADER_ACCESS_TOKEN
  });

  const res = await transport.sendRequest(2114, { ctidTraderAccountId: accountId });
  const symbols = res.decodedPayload?.symbol || [];

  console.log(`Total symbols from cTrader broker: ${symbols.length}`);
  for (const s of symbols) {
    const name = s.symbolName || '';
    const norm = name.replace('/', '').toUpperCase();
    if (['EURUSD', 'GBPUSD', 'EURJPY', 'USDJPY', 'AUDUSD', 'USDCHF', 'GBPJPY', 'USDCAD', 'NZDUSD', 'XAUUSD', 'GOLD', 'BTCUSD', 'USTEC', 'NAS100'].some(k => norm.includes(k))) {
      console.log(`Symbol: ID=${s.symbolId} | Name="${s.symbolName}" | baseAssetId=${s.baseAssetId} | quoteAssetId=${s.quoteAssetId}`);
    }
  }

  // Also check existing open positions to see their SL/TP
  const recon = await transport.sendRequest(2124, { ctidTraderAccountId: accountId });
  const positions = recon.decodedPayload?.position || [];
  console.log(`\n=== Active Open Positions on Broker (${positions.length}) ===`);
  for (const p of positions) {
    const side = p.tradeData?.tradeSide === 1 ? 'BUY' : 'SELL';
    console.log(`Pos #${p.positionId} | Symbol ID=${p.tradeData?.symbolId} | ${side} | OpenPrice=${p.price} | SL=${p.stopLoss} | TP=${p.takeProfit} | Comment=${p.tradeData?.comment}`);
  }

  await transport.disconnect();
}

checkSymbols().catch(console.error);
