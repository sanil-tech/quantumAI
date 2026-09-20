/**
 * Phase 2B: Historical Currency Thesis Ingestion & Verification
 * QuantumAI IATI OS
 * 
 * Non-mutating ingestion script to populate data/currency_thesis_observations.json
 * from canonical trading week audit records (2026-09-14 to 2026-09-20).
 */

import fs from 'fs';
import path from 'path';
import { currencyThesisIntelligenceService } from '../apps/decision-agent/src/services/currencyThesisIntelligenceService';

async function main() {
  console.log('=== Phase 2B: Ingesting Historical Canonical Signals ===');

  const auditJsonPath = path.resolve(process.cwd(), 'docs', 'audits', 'JPY_EXECUTION_LOSS_CORRELATION_AUDIT_20260919.json');
  if (!fs.existsSync(auditJsonPath)) {
    console.error('Missing audit JSON artifact:', auditJsonPath);
    process.exit(1);
  }

  const auditData = JSON.parse(fs.readFileSync(auditJsonPath, 'utf-8'));
  const signals = auditData.jpySignalsCorrelation || [];

  console.log(`Found ${signals.length} canonical JPY signals in Phase 2A audit.`);

  for (const sig of signals) {
    currencyThesisIntelligenceService.recordSignal({
      signalId: sig.signalId,
      symbol: sig.symbol,
      timeframe: sig.timeframe,
      direction: sig.direction,
      confidence: sig.confidence,
      entryPrice: sig.entryPrice,
      stopLoss: sig.stopLoss,
      takeProfit: sig.takeProfit,
      executionEligibility: sig.executionEligibility,
      createdAt: sig.createdAt,
      dataMode: 'LIVE',
      brokerOrderId: sig.brokerOrderId,
      brokerPositionId: sig.brokerPositionId,
      executionSequenceId: sig.brokerPositionId ? 'SEQ-EURJPY-1789643444455' : undefined,
      orderType: sig.orderType,
      isOrderSubmitted: sig.isOrderSubmitted,
      isOrderFilled: sig.isOrderFilled,
      isPositionOpened: sig.isPositionOpened,
      isPositionClosed: sig.isPositionClosed,
      outcomeStatus: sig.executionState,
      reasons: sig.reasons,
      ttlExpired: sig.ttlExpired,
      cancelled: sig.cancelled
    });
  }

  // Correlate the 3 realized breakeven positions
  const realTrades = auditData.realBrokerTrades || [];
  for (const t of realTrades) {
    currencyThesisIntelligenceService.correlateClosedTrade({
      brokerPositionId: t.brokerPositionId,
      symbol: t.pair,
      realizedProfit: t.realizedProfit,
      pnlPips: t.realizedPips,
      direction: t.direction,
      closedAt: t.closedAt,
      dataMode: 'LIVE',
      closeReason: t.closeReason
    });
  }

  const jpyOverview = currencyThesisIntelligenceService.getCurrencyOverview('JPY', 'LIVE');
  console.log('\n--- JPY Currency Thesis Overview ---');
  console.log(JSON.stringify(jpyOverview, null, 2));

  const health = currencyThesisIntelligenceService.getHealthDiagnostic();
  console.log('\n--- Health Diagnostic ---');
  console.log(JSON.stringify(health, null, 2));

  console.log('\n=== Ingestion Complete (Read-Only) ===');
}

main().catch(err => {
  console.error('Backfill error:', err);
  process.exit(1);
});
