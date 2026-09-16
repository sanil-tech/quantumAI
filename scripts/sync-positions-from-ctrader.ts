import 'dotenv/config';
import { Pool } from 'pg';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

async function syncPositions() {
  console.log('[cTrader Sync] Connecting to cTrader Open API...');
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

  const symbolsRes = await transport.sendRequest(2114, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  });
  const symbolMap: Record<number, string> = {};
  (symbolsRes.decodedPayload?.symbol || []).forEach((s: any) => {
    symbolMap[s.symbolId] = s.symbolName;
  });

  const reconRes = await transport.sendRequest(2124, {
    cTraderAccountId: Number(process.env.CTRADER_ACCOUNT_ID)
  });

  const positions = reconRes.decodedPayload?.position || [];
  console.log(`[cTrader Sync] Fetched ${positions.length} active positions from cTrader.`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  for (const pos of positions) {
    const rawSym = symbolMap[pos.tradeData?.symbolId] || 'EURUSD';
    const formattedSym = rawSym.length === 6 ? `${rawSym.slice(0, 3)}/${rawSym.slice(3)}` : rawSym;
    const direction = pos.tradeData?.tradeSide === 2 ? 'SELL' : 'BUY';
    const volumeLots = (Number(pos.tradeData?.volume || 200000) / 10000000);
    const entryPrice = Number(pos.price);
    const stopLoss = Number(pos.stopLoss || 0);
    const takeProfit = Number(pos.takeProfit || 0);
    const openTime = pos.tradeData?.openTimestamp ? new Date(Number(pos.tradeData.openTimestamp)) : new Date();
    const positionId = `trade_${pos.positionId}`;
    const ticketId = String(pos.positionId);
    const comment = pos.tradeData?.comment || `cTrader_live_${rawSym}_${direction}`;

    await pool.query(
      `INSERT INTO positions (
        position_id, account_id, symbol, direction, quantity, entry_price, current_price,
        stop_loss, take_profit, status, opened_at, updated_at, ticket_id, setup_id,
        broker, environment, reconciliation_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 'OPEN', $10, NOW(), $11, $12, 'CTRADER', 'DEMO', 'MATCHED'
      )
      ON CONFLICT (position_id) DO UPDATE SET
        symbol = EXCLUDED.symbol,
        direction = EXCLUDED.direction,
        quantity = EXCLUDED.quantity,
        entry_price = EXCLUDED.entry_price,
        stop_loss = EXCLUDED.stop_loss,
        take_profit = EXCLUDED.take_profit,
        status = 'OPEN',
        opened_at = EXCLUDED.opened_at,
        updated_at = NOW(),
        ticket_id = EXCLUDED.ticket_id,
        setup_id = EXCLUDED.setup_id,
        reconciliation_status = 'MATCHED'`,
      [
        positionId,
        process.env.CTRADER_ACCOUNT_ID || '48282756',
        formattedSym,
        direction,
        volumeLots,
        entryPrice,
        entryPrice,
        stopLoss,
        takeProfit,
        openTime,
        ticketId,
        comment
      ]
    );
    console.log(`  ✓ Synced ${formattedSym} (${direction}) Pos #${pos.positionId} | Lots: ${volumeLots} | Entry: ${entryPrice} | SL: ${stopLoss} | TP: ${takeProfit} | Opened: ${openTime.toISOString()}`);
  }

  await pool.end();
  await transport.disconnect();
  console.log('[cTrader Sync] Synchronization complete.');
}

syncPositions().catch(err => console.error('[cTrader Sync Error]:', err));
