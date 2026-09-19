import 'dotenv/config';
import { CTraderTransport } from './src/integrations/ctrader/ctraderTransport';

(async () => {
  try {
    const transport = new CTraderTransport();
    console.log('Connecting to cTrader Open API demo.ctraderapi.com:5035...');
    await transport.connect('demo.ctraderapi.com', 5035, 10000);

    const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
    const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
    const token = (process.env.CTRADER_ACCESS_TOKEN || '').trim();
    const accountId = Number(process.env.CTRADER_ACCOUNT_ID || '48282756');

    console.log('1. AppAuth (2100)...');
    await transport.sendRequest(2100, { clientId, clientSecret }, 7000);
    console.log('AppAuth SUCCESS!');

    console.log('2. AccountAuth (2102) for account', accountId);
    await transport.sendRequest(2102, { ctidTraderAccountId: accountId, accessToken: token }, 7000);
    console.log('AccountAuth SUCCESS!');

    console.log('3. Placing Test Sell Limit Order on GBP/JPY @ 208.750, SL: 208.950, TP: 207.800, Vol: 0.02 lots (200,000 cents)...');
    const payload = {
      ctidTraderAccountId: accountId,
      symbolId: 7, // GBPJPY
      orderType: 2, // 2 = LIMIT
      tradeSide: 2, // 2 = SELL
      volume: 200000, // 0.02 lots = 200,000 cents
      limitPrice: 208.750,
      stopLoss: 208.950,
      takeProfit: 207.800,
      timeInForce: 2, // 2 = GTC
      clientOrderId: 'QAI_TEST_' + Date.now(),
      comment: 'QAI_Master_OpenAPI_Test'
    };

    const orderRes = await transport.sendRequest(2106, payload, 8000);
    console.log('Order Response payloadType:', orderRes.payloadType);
    console.log('Order Details:', JSON.stringify(orderRes.decodedPayload, null, 2));

    console.log('4. Fetching all pending orders from broker (2124)...');
    const recRes = await transport.sendRequest(2124, { ctidTraderAccountId: accountId }, 6000);
    const orders = recRes.decodedPayload?.order || [];
    console.log('Total Pending Orders in cTrader (' + orders.length + '):');
    for (const o of orders) {
      console.log(' - Order #' + o.orderId + ' | Symbol: ' + o.tradeData?.symbolId + ' | Type: ' + o.orderType + ' | Price: ' + o.limitPrice + ' | SL: ' + o.stopLoss + ' | TP: ' + o.takeProfit + ' | Comment: ' + o.tradeData?.comment);
    }

    await transport.disconnect();
    console.log('--- TEST FINISHED SUCCESSFULLY ---');
  } catch (err: any) {
    console.error('Error during test:', err.message || err);
  }
})();
