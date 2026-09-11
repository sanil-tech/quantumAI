import 'dotenv/config';
import { TradingRepository } from '@iati/database';

async function auditCorrection() {
  const repo = new TradingRepository();
  const dbPosId = 'pos_ctrader_demo_285026529';

  // 1. Record immutable audit correction event FIRST
  const auditEvent = await repo.saveTradeEvent({
    id: `evt_audit_correction_${Date.now()}`,
    tradeId: dbPosId,
    setupId: 'prop-cli-demo-1787728815370',
    eventType: 'POSITION_UPDATED',
    actor: 'FINANCIAL_RECONCILIATION_AUDIT',
    details: {
      action: 'REMEDIATE_INTEGER_ROUNDING_DEFECT',
      originalPersistedGrossProfit: 0.20,
      originalPnlPips: 2.0,
      defectReason: 'Math.round(1.6) produced 2 integer pips, resulting in 2 * 0.10 USD = 0.20 USD',
      authoritativeGrossProfit: 0.16,
      authoritativePnlPips: 1.60,
      commission: -0.05,
      authoritativeNetProfit: 0.11,
      symbol: 'EURUSD',
      entryPrice: 1.16694,
      closePrice: 1.16710,
      volume: 0.01
    }
  });

  console.log('Recorded immutable audit event:', JSON.stringify(auditEvent, null, 2));

  // 2. Update position with authoritative gross profit and commission
  const updatedPos = await repo.savePosition({
    positionId: dbPosId,
    ticketId: '285026529',
    setupId: 'prop-cli-demo-1787728815370',
    accountId: '48282756',
    symbol: 'EURUSD',
    direction: 'BUY',
    quantity: 0.01,
    entryPrice: 1.16694,
    currentPrice: 1.16710,
    closePrice: 1.16710,
    unrealizedProfit: 0,
    realizedProfit: 0.16,
    commission: -0.05,
    pnlPips: 1.60,
    status: 'CLOSED',
    broker: 'ctrader-broker-01',
    environment: 'DEMO',
    proposalId: 'prop-cli-demo-1787728815370',
    approvalId: 'gov-cli-demo-1787728815370',
    brokerOrderId: '315656469',
    brokerPositionId: '285026529',
    brokerDealId: '330783329',
    reconciliationStatus: 'MATCHED',
    openedAt: new Date(1787728820486),
    closedAt: new Date()
  });

  console.log('Position record updated with authoritative values:', JSON.stringify(updatedPos, null, 2));
  process.exit(0);
}

auditCorrection().catch(err => {
  console.error(err);
  process.exit(1);
});
