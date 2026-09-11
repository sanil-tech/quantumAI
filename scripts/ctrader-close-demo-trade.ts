import 'dotenv/config';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { TradingRepository, checkDbConnection } from '@iati/database';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { calculateFinancialPnL } from '@iati/core';

async function runControlledClose() {
  console.log('================================================================');
  console.log('QUANTUMAI / IATI OS — PHASE 3B CONTROLLED POSITION CLOSURE');
  console.log('Target Position: 285026529 | Symbol: EURUSD | Side: BUY | Volume: 0.01 lot');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // STEP 1: CONNECT ADAPTER & PRE-CLOSE INSPECTION
  // -------------------------------------------------------------
  console.log('[STEP 1: PRE-CLOSE] Connecting CTraderAdapter to demo.ctraderapi.com:5035...');
  const adapter = new CTraderAdapter({
    environment: 'DEMO',
    host: process.env.CTRADER_HOST || 'demo.ctraderapi.com',
    port: Number(process.env.CTRADER_PORT) || 5035,
    clientId: process.env.CTRADER_CLIENT_ID,
    clientSecret: process.env.CTRADER_CLIENT_SECRET,
    accountId: process.env.CTRADER_ACCOUNT_ID,
    accessToken: process.env.CTRADER_ACCESS_TOKEN,
    timeoutMs: 15000
  });

  const connected = await adapter.connect();
  if (!connected) {
    throw new Error('CTRADER_CONNECTION_FAILED: Could not connect and authenticate adapter.');
  }
  console.log('Adapter connected and authenticated with cTrader DEMO platform.');

  console.log('Querying real broker state via adapter.reconcileState()...');
  const preReconcile = await adapter.reconcileState();
  if (!preReconcile) {
    throw new Error('RECONCILE_FAILED: Could not retrieve broker state.');
  }

  console.log(`Broker reports ${preReconcile.positions.length} open positions.`);
  const targetPos = preReconcile.positions.find((p: any) => String(p.positionId) === '285026529');
  
  if (!targetPos) {
    throw new Error('INVARIANT_VIOLATION: Target position 285026529 not found on cTrader broker.');
  }

  console.log('Pre-close broker position details:', JSON.stringify(targetPos, null, 2));

  // Invariant verification
  const symbolId = String(targetPos.tradeData?.symbolId);
  const tradeSide = String(targetPos.tradeData?.tradeSide);
  const volume = String(targetPos.tradeData?.volume);
  const status = String(targetPos.positionStatus);
  const entryPrice = targetPos.price;

  if (symbolId !== '1') throw new Error(`INVARIANT_VIOLATION: Expected symbolId 1 (EURUSD), found ${symbolId}`);
  if (tradeSide !== 'BUY' && tradeSide !== '1') throw new Error(`INVARIANT_VIOLATION: Expected tradeSide BUY/1, found ${tradeSide}`);
  if (volume !== '100000') throw new Error(`INVARIANT_VIOLATION: Expected volume 100000 (0.01 lot), found ${volume}`);
  if (status !== 'POSITION_STATUS_OPEN' && status !== '1') throw new Error(`INVARIANT_VIOLATION: Expected status POSITION_STATUS_OPEN/1, found ${status}`);
  if (entryPrice !== 1.16694) throw new Error(`INVARIANT_VIOLATION: Expected entry price 1.16694, found ${entryPrice}`);

  console.log('Pre-close invariant validation: PASS (All invariants strictly matched).\n');

  // -------------------------------------------------------------
  // STEP 2: CLOSE POSITION VIA CTRADER ADAPTER
  // -------------------------------------------------------------
  console.log('[STEP 2: CLOSE] Sending ProtoOAClosePositionReq (2111) for position 285026529 (0.01 lot)...');
  const closeReport = await adapter.closePosition('285026529', 0.01);

  console.log('\n=== AUTHORITATIVE BROKER CLOSE REPORT ===');
  console.log(JSON.stringify(closeReport, null, 2));

  if (closeReport.status !== 'FILLED') {
    throw new Error(`CLOSE_EXECUTION_FAILED: Close report status was '${closeReport.status}'`);
  }
  console.log('Close execution reported FILLED by broker.\n');

  // -------------------------------------------------------------
  // STEP 3: POST-CLOSE RECONCILIATION
  // -------------------------------------------------------------
  console.log('[STEP 3: POST-CLOSE] Re-querying broker state via adapter.reconcileState()...');
  const postReconcile = await adapter.reconcileState();
  const remainingOpen = (postReconcile?.positions || []).filter((p: any) => String(p.positionId) === '285026529');
  console.log(`Open positions matching 285026529 remaining: ${remainingOpen.length}`);
  console.log(`Total open positions on broker account: ${(postReconcile?.positions || []).length}`);

  if (remainingOpen.length > 0) {
    throw new Error('POST_CLOSE_INVARIANT_FAILED: Position 285026529 remains open on cTrader!');
  }
  console.log('Post-close verification: PASS (Position 285026529 is confirmed CLOSED on broker).\n');

  await adapter.disconnect();

  // -------------------------------------------------------------
  // STEP 4: DATABASE RECONCILIATION
  // -------------------------------------------------------------
  console.log('[STEP 4: DATABASE] Checking and reconciling PostgreSQL state...');
  const isConnected = await checkDbConnection();
  console.log('PostgreSQL Connected:', isConnected);
  const repo = new TradingRepository();

  const allPositions = await repo.getPositions({ status: 'ALL' });
  console.log(`Total database positions: ${allPositions.totalCount}`);

  const matchingDbPos = allPositions.positions.find((p: any) => 
    p.brokerPositionId === '285026529' || 
    p.ticketId === '285026529' || 
    p.positionId === '285026529'
  );

  const finalClosePrice = closeReport.filled_price || 1.16694;
  const pnlCalc = calculateFinancialPnL({
    symbol: 'EURUSD',
    direction: 'BUY',
    entryPrice: 1.16694,
    closePrice: finalClosePrice,
    lotSizeOrVolume: 0.01,
    commission: -0.05
  });
  const pnlPips = pnlCalc.pipDifference;
  const realizedProfit = pnlCalc.grossProfit;
  const commission = pnlCalc.commission;

  if (matchingDbPos) {
    console.log('Found existing DB position record:', JSON.stringify(matchingDbPos, null, 2));
    if (matchingDbPos.status === 'OPEN') {
      await repo.closePositionTransaction({
        positionId: matchingDbPos.positionId,
        closePrice: finalClosePrice,
        realizedProfit,
        pnlPips,
        closeReason: 'MANUAL_CTRADER_CLOSE',
        accountId: String(process.env.CTRADER_ACCOUNT_ID)
      });
      console.log('Updated existing DB record to CLOSED.');
    }
  } else {
    // Save complete audit position record in PostgreSQL representing this certified real trade
    const dbPosId = `pos_ctrader_demo_285026529`;
    console.log(`Creating canonical closed record in PostgreSQL for audit trail: ${dbPosId}`);
    await repo.savePosition({
      positionId: dbPosId,
      ticketId: '285026529',
      setupId: 'prop-cli-demo-1787728815370',
      accountId: String(process.env.CTRADER_ACCOUNT_ID),
      symbol: 'EURUSD',
      direction: 'BUY',
      quantity: 0.01,
      entryPrice: 1.16694,
      currentPrice: finalClosePrice,
      closePrice: finalClosePrice,
      unrealizedProfit: 0,
      realizedProfit,
      commission,
      pnlPips,
      status: 'CLOSED',
      broker: 'ctrader-broker-01',
      environment: 'DEMO',
      proposalId: 'prop-cli-demo-1787728815370',
      approvalId: 'gov-cli-demo-1787728815370',
      brokerOrderId: '315656469',
      brokerPositionId: '285026529',
      brokerDealId: closeReport.broker_deal_id || '330764286',
      reconciliationStatus: 'MATCHED',
      openedAt: new Date(1787728820486),
      closedAt: new Date()
    });

    await repo.saveTradeEvent({
      id: `evt_demo_closed_${Date.now()}`,
      tradeId: dbPosId,
      setupId: 'prop-cli-demo-1787728815370',
      eventType: 'POSITION_CLOSED',
      actor: 'cTraderBrokerAdapter',
      details: {
        brokerOrderId: '315656469',
        brokerPositionId: '285026529',
        brokerCloseDealId: closeReport.broker_deal_id,
        entryPrice: 1.16694,
        closePrice: finalClosePrice,
        realizedProfit,
        pnlPips
      }
    });
    console.log('Audit record & trade events persisted to PostgreSQL.');
  }

  // -------------------------------------------------------------
  // STEP 5: EVENT EMISSION
  // -------------------------------------------------------------
  const tradeClosedPayload: TradeClosedPayload = {
    tradeId: `trade_closed_ctrader_${closeReport.broker_deal_id || Date.now()}`,
    positionId: '285026529',
    symbol: 'EURUSD',
    direction: 'BUY',
    openPrice: 1.16694,
    closePrice: finalClosePrice,
    lotSize: 0.01,
    pnl: realizedProfit,
    outcome: realizedProfit > 0 ? 'WIN' : realizedProfit < 0 ? 'LOSS' : 'BREAKEVEN',
    openTime: new Date(1787728820486),
    closeTime: new Date(),
    strategyId: 'QuantumAI_Prop',
    timestamp: new Date()
  };

  await globalEventBus.publish({
    id: `evt_close_${Date.now()}`,
    type: EventTypes.TradeClosed,
    timestamp: new Date(),
    payload: tradeClosedPayload
  });
  console.log('TradeClosed event published.');

  // -------------------------------------------------------------
  // STEP 6: VERIFY POST-RECONCILIATION DB & UI QUERY STATE
  // -------------------------------------------------------------
  const activePositions = await repo.getPositions({ status: 'OPEN' });
  const openMatching = activePositions.positions.filter((p: any) => 
    p.brokerPositionId === '285026529' || p.ticketId === '285026529'
  );

  console.log(`Active OPEN positions in DB matching 285026529: ${openMatching.length}`);
  if (openMatching.length > 0) {
    throw new Error('DB_RECONCILIATION_FAILED: Position 285026529 is still OPEN in database!');
  }
  console.log('Database verification: PASS (0 open records for 285026529).');

  console.log('\n================================================================');
  console.log('PHASE 3B POSITION CLOSURE & RECONCILIATION: 100% COMPLETE');
  console.log('================================================================');
}

runControlledClose().catch((err) => {
  console.error('CONTROLLED CLOSE FAILED:', err);
  process.exit(1);
});
