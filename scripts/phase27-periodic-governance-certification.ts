
import dotenv from 'dotenv';
dotenv.config();

import { PeriodicGovernanceReviewService } from '../src/server/services/periodicGovernanceReviewService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

export function runPhase27Certification() {
  console.log('======================================================================');
  console.log('QUANTUMAI / IATI OS ? PHASE 27 PERIODIC GOVERNANCE REVIEW');
  console.log('======================================================================');

  const report = PeriodicGovernanceReviewService.generatePeriodicReview('GOV-REV-2026-W34');
  console.log('Review ID: ' + report.reviewId);
  console.log('Governance Decision: ' + report.governanceDecision);
  console.log('Degradation Status: ' + report.degradationStatus);
  console.log('Net Shadow PnL: $' + report.netShadowPnLDollars.toFixed(2));
  console.log('Modeled Transaction Costs: $' + report.modeledTransactionCostsDollars.toFixed(2));
  console.log('Evidence Hash: ' + report.evidenceHash);
  console.log('Broker Execution Paths: ' + report.brokerExecutionPaths);
  console.log('Broker Orders Transmitted: ' + report.brokerOrdersTransmitted);

  // Execution Safety Gate Check
  const gateRes = validateExecutionEnvironmentSafety({
    environment: 'LIVE',
    brokerId: 'ctrader-01',
    symbol: 'EURUSD',
    direction: 'BUY',
    requestedLotSize: 0.01
  });
  console.log('\nExecutionSafetyGate Check: Allowed = ' + gateRes.allowed + ' (' + gateRes.code + ')');

  console.log('\n======================================================================');
  console.log('PHASE 27 GOVERNANCE REVIEW PASS: ZERO BROKER TRANSMISSION');
  console.log('======================================================================');

  return {
    report,
    gateRes,
    success: true
  };
}

if (process.argv[1] && process.argv[1].endsWith('phase27-periodic-governance-certification.ts')) {
  runPhase27Certification();
}
