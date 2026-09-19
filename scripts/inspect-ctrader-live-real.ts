import 'dotenv/config';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function main() {
  const host = 'demo.ctraderapi.com';
  const port = 5035;
  const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
  const accessToken = (process.env.CTRADER_ACCESS_TOKEN || '').trim();
  const accountId = Number((process.env.CTRADER_ACCOUNT_ID || '48282756').trim());

  console.log(`Connecting to cTrader Broker (${host}:${port}) for Master Account ${accountId}...`);

  const transport = new CTraderTransport();
  try {
    await transport.connect(host, port, 10000);

    // 1. App Auth
    const appAuth = await transport.sendRequest(2100, { clientId, clientSecret });
    if (appAuth.payloadType !== 2101) throw new Error(`App auth failed (${appAuth.payloadType})`);

    // 2. Account Auth
    const accAuth = await transport.sendRequest(2102, { ctidTraderAccountId: accountId, accessToken });
    if (accAuth.payloadType !== 2103) throw new Error(`Account auth failed (${accAuth.payloadType})`);

    // 3. Trader Info
    const traderRes = await transport.sendRequest(2121, { ctidTraderAccountId: accountId });
    const trader = traderRes.decodedPayload?.trader;
    console.log('\n====================================================');
    console.log('      cTRADER MASTER BROKER ACCOUNT REALITY        ');
    console.log('====================================================');
    console.log(`Account ID (cTID) : ${trader?.ctidTraderAccountId}`);
    console.log(`Trader Login      : ${trader?.traderLogin || '5881460'}`);
    console.log(`Balance           : $${(Number(trader?.balance || 0) / 100).toFixed(2)} USD`);
    console.log(`Leverage          : 1:${(trader?.leverageInCents ? trader.leverageInCents / 100 : trader?.leverage || 100)}`);

    // 4. Symbols Map
    const symRes = await transport.sendRequest(2114, { ctidTraderAccountId: accountId });
    const symbols = symRes.decodedPayload?.symbol || [];
    const symMap = new Map<number, string>();
    for (const s of symbols) {
      symMap.set(Number(s.symbolId), s.symbolName);
    }

    // 5. Open Positions on Broker
    const reconRes = await transport.sendRequest(2124, { ctidTraderAccountId: accountId });
    const openPositions: any[] = reconRes.decodedPayload?.position || [];
    console.log(`\n--- LIVE OPEN POSITIONS ON BROKER (${openPositions.length} Total) ---`);
    if (openPositions.length > 0) {
      console.table(openPositions.map((p: any) => {
        const symName = symMap.get(Number(p.tradeData?.symbolId)) || `ID_${p.tradeData?.symbolId}`;
        const side = p.tradeData?.tradeSide === 1 || p.tradeData?.tradeSide === 'BUY' ? 'BUY' : 'SELL';
        const vol = (Number(p.tradeData?.volume || 0) / 10000000).toFixed(2) + ' Lots';
        const entryPrice = p.price;
        const sl = p.stopLoss || 'NONE';
        const tp = p.takeProfit || 'NONE';
        const openTime = new Date(Number(p.tradeData?.openTimestamp || 0)).toISOString();
        return {
          'Position ID': p.positionId,
          'Symbol': symName,
          'Side': side,
          'Volume': vol,
          'Entry Price': entryPrice,
          'SL': sl,
          'TP': tp,
          'Opened (UTC)': openTime
        };
      }));
    } else {
      console.log('No open positions.');
    }

    // 6. Real Closed Deals for Today & Recent Days from Broker
    const now = Date.now();
    const fromTimestamp = now - 2 * 24 * 3600 * 1000; // last 48 hours
    const dealsRes = await transport.sendRequest(2133, {
      ctidTraderAccountId: accountId,
      fromTimestamp,
      toTimestamp: now,
      maxRows: 100
    }, 10000);

    const rawDeals: any[] = dealsRes.decodedPayload?.deal || [];
    const closedDeals = rawDeals.filter((d: any) => d.closePositionDetail != null);

    console.log(`\n--- REAL CLOSED DEALS ON BROKER (LAST 48 HOURS: ${closedDeals.length} Total) ---`);
    if (closedDeals.length > 0) {
      console.table(closedDeals.map((d: any) => {
        const symName = symMap.get(Number(d.symbolId)) || `ID_${d.symbolId}`;
        const side = d.tradeSide === 1 || d.tradeSide === 'BUY' ? 'BUY' : 'SELL';
        const moneyDigits = d.closePositionDetail?.moneyDigits ?? 2;
        const profit = (Number(d.closePositionDetail?.grossProfit || 0) / Math.pow(10, moneyDigits)).toFixed(2);
        const closeTime = new Date(Number(d.executionTimestamp || 0)).toISOString();
        return {
          'Deal ID': d.dealId,
          'Position ID': d.positionId,
          'Symbol': symName,
          'Side': side,
          'Realized PnL ($)': `$${profit}`,
          'Closed At (UTC)': closeTime
        };
      }));
    } else {
      console.log('No closed deals in the last 48 hours on this account.');
    }

    console.log('\n====================================================');
    console.log('BROKER GROUND TRUTH EXTRACTION COMPLETE.');
    console.log('====================================================\n');

  } catch (err: any) {
    console.error('Error fetching broker reality:', err.message);
  } finally {
    await transport.disconnect();
  }
}

main().catch(console.error);
