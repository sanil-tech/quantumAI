import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function setupLiveOpenTrades() {
  console.log('===========================================================');
  console.log('⚡ SETTING UP METHOD 2 ON CTRADER LIVE OPEN TRADE');
  console.log('===========================================================');

  const transport = new CTraderTransport();
  await transport.connect('demo.ctraderapi.com', 5035);

  // 1. Auth Application
  await transport.sendRequest(2100, {
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET
  });

  // 2. Auth Account
  await transport.sendRequest(2102, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    accessToken: process.env.CTRADER_ACCESS_TOKEN
  });

  // 3. Fetch Live Positions from cTrader Broker
  const reconRes = await transport.sendRequest(2124, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  });

  const positions = reconRes.decodedPayload?.position || [];
  console.log(`Found ${positions.length} active live positions on cTrader broker.\n`);

  const symbolsRes = await transport.sendRequest(2114, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  });
  const symbolMap: Record<number, string> = {};
  (symbolsRes.decodedPayload?.symbol || []).forEach((s: any) => {
    symbolMap[s.symbolId] = s.symbolName;
  });

  for (const pos of positions) {
    const rawSym = symbolMap[pos.tradeData?.symbolId] || 'UNKNOWN';
    const formattedSym = rawSym.length === 6 ? `${rawSym.slice(0, 3)}/${rawSym.slice(3)}` : rawSym;
    const direction = pos.tradeData?.tradeSide === 2 ? 'SELL' : 'BUY';
    const volumeLots = Number(pos.tradeData?.volume || 200000) / 10000000;
    const entryPrice = Number(pos.price);
    const posId = pos.positionId;

    const isJpy = formattedSym.includes('JPY');
    const decimals = isJpy ? 3 : 5;
    const currentSl = Number(pos.stopLoss || 0);
    const slDist = currentSl > 0 ? Math.abs(currentSl - entryPrice) : (isJpy ? 0.60 : 0.0030);

    const tp1Dist = Number((slDist * 1.5).toFixed(decimals));
    const tp2Dist = Number((slDist * 3.0).toFixed(decimals));

    const tp1 = direction === 'SELL' 
      ? Number((entryPrice - tp1Dist).toFixed(decimals))
      : Number((entryPrice + tp1Dist).toFixed(decimals));

    const tp2 = direction === 'SELL'
      ? Number((entryPrice - tp2Dist).toFixed(decimals))
      : Number((entryPrice + tp2Dist).toFixed(decimals));

    const breakEvenSl = entryPrice;

    console.log(`📡 Amending cTrader Broker for Position #${posId} (${formattedSym} ${direction} ${volumeLots}L):`);
    console.log(`   - Entry Price: ${entryPrice}`);
    console.log(`   - Initial SL:  ${currentSl > 0 ? currentSl : (direction === 'SELL' ? entryPrice + slDist : entryPrice - slDist)}`);
    console.log(`   - Target 1 (TP1 - 50% Scale-Out): ${tp1}`);
    console.log(`   - Break-Even SL Target:           ${breakEvenSl}`);
    console.log(`   - Target 2 (TP2 - Runner Target): ${tp2}`);

    // Send ProtoOAAmendPositionSLTPReq (2110) directly to cTrader broker
    const amendReq = {
      ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
      positionId: posId,
      stopLoss: currentSl > 0 ? currentSl : Number((direction === 'SELL' ? entryPrice + slDist : entryPrice - slDist).toFixed(decimals)),
      takeProfit: tp1
    };

    try {
      const amendRes = await transport.sendRequest(2110, amendReq);
      console.log(`   ✅ Broker Response (PayloadType ${amendRes.payloadType}): SL & TP1 set directly on cTrader server!`);
    } catch (e: any) {
      console.warn(`   ⚠️ Broker amend notice: ${e.message}`);
    }
    console.log('');
  }

  await transport.disconnect();
}

setupLiveOpenTrades().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
