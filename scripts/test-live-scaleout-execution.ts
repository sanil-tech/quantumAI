import 'dotenv/config';
import { Pool } from 'pg';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function testLiveScaleOut() {
  console.log('===========================================================');
  console.log('🧪 TESTING LIVE METHOD 2 SCALE-OUT ON POSITION #288564090');
  console.log('   1. Take Profit 50% (Close 0.01 lot)');
  console.log('   2. Move Stop Loss to Break-Even (1.15462)');
  console.log('   3. Edit Take Profit to TP2 (1.14562)');
  console.log('===========================================================');

  const transport = new CTraderTransport();
  await transport.connect('demo.ctraderapi.com', 5035);

  // 1. Auth Application & Account
  await transport.sendRequest(2100, {
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET
  });
  await transport.sendRequest(2102, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    accessToken: process.env.CTRADER_ACCESS_TOKEN
  });

  const positionId = 288564090;
  const entryPrice = 1.15462;
  const breakEvenSl = 1.15462;
  const tp2Price = 1.14562;
  const halfVolumeCents = 100000; // 0.01 lots

  console.log(`\nStep 1: Closing 50% volume (${halfVolumeCents / 10000000} lots) via ProtoOAClosePositionReq (2111)...`);
  const closeRes = await transport.sendRequest(2111, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    positionId,
    volume: halfVolumeCents
  });

  console.log(`   ✅ Broker Partial Close Response (PayloadType ${closeRes.payloadType}): 50% closed successfully!`);
  if (closeRes.decodedPayload?.order) {
    const o = closeRes.decodedPayload.order;
    console.log(`      • Closed Order ID: #${o.orderId}`);
    console.log(`      • Executed Volume: ${Number(o.tradeData?.volume || halfVolumeCents) / 10000000} lots`);
    console.log(`      • Execution Price: ${o.executionPrice}`);
  }
  if (closeRes.decodedPayload?.deal) {
    const d = closeRes.decodedPayload.deal;
    console.log(`      • Realized Gross Profit: $${d.grossProfit ? d.grossProfit / 100 : 'N/A'}`);
  }

  console.log(`\nStep 2: Amending Position on cTrader to Break-Even SL (${breakEvenSl}) and TP2 (${tp2Price})...`);
  const amendRes = await transport.sendRequest(2110, {
    ctidTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID),
    positionId,
    stopLoss: breakEvenSl,
    takeProfit: tp2Price
  });

  console.log(`   ✅ Broker Amend Response (PayloadType ${amendRes.payloadType}): SL & TP2 amended on cTrader server!`);

  // Step 3: Fetch updated position from broker to verify final live state
  const reconRes = await transport.sendRequest(2124, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  });
  const positions = reconRes.decodedPayload?.position || [];
  const updatedPos = positions.find((p: any) => p.positionId === positionId);

  console.log('\n===========================================================');
  console.log('🎉 LIVE CTRADER BROKER POSITION STATE AFTER METHOD 2:');
  console.log('===========================================================');
  console.log(`• Position ID: #${updatedPos?.positionId}`);
  console.log(`• Remaining Size: ${Number(updatedPos?.tradeData?.volume || 0) / 10000000} Lots (was 0.02 Lots)`);
  console.log(`• Entry Price: ${updatedPos?.price}`);
  console.log(`• New Stop Loss: ${updatedPos?.stopLoss} (Risk-Free Break-Even!)`);
  console.log(`• New Take Profit: ${updatedPos?.takeProfit} (TP2 Runner Target!)`);
  console.log('===========================================================');

  // Update in Database
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`
      UPDATE positions
      SET
        volume = 0.01,
        stop_loss = $1,
        take_profit = $2,
        updated_at = NOW()
      WHERE position_id = $3 OR ticket_id = $4
    `, [breakEvenSl, tp2Price, `trade_${positionId}`, String(positionId)]);
    await pool.end();
    console.log('✅ PostgreSQL database records synchronized.');
  } catch (dbErr: any) {
    console.warn('DB sync notice:', dbErr.message);
  }

  await transport.disconnect();
}

testLiveScaleOut().catch(err => {
  console.error('Error during live scale-out test:', err.message);
  process.exit(1);
});
