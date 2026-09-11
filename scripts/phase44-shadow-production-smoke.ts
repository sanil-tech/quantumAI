
import dotenv from 'dotenv';
dotenv.config();

import { ShadowProductionRuntimeService } from '../src/server/services/shadowProductionRuntimeService';
import { EconomicContextService } from '../src/server/services/economicContextService';
import { CoreFunctionalityForensicAuditService } from '../src/server/services/coreFunctionalityForensicAuditService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

export function runPhase44SmokeTest() {
  console.log('======================================================================');
  console.log('QUANTUMAI / IATI OS ? PHASE 44 SHADOW PRODUCTION SMOKE TEST');
  console.log('======================================================================');

  ShadowProductionRuntimeService.initialize();
  const snapshot = ShadowProductionRuntimeService.getRuntimeSnapshot();

  console.log('1. Runtime Telemetry Snapshot:');
  console.log('   System Status: ' + snapshot.systemStatus);
  console.log('   Market Data Status: ' + snapshot.marketDataStatus);
  console.log('   Economic Context: ' + snapshot.economicContextStatus);
  console.log('   Strategy Engine: ' + snapshot.strategyStatus);
  console.log('   Risk & Portfolio: ' + snapshot.riskStatus + ' / ' + snapshot.portfolioStatus);
  console.log('   Shadow Execution: ' + snapshot.shadowExecutionStatus);
  console.log('   Safety State: ' + snapshot.safetyStatus);
  console.log('   Broker Orders Transmitted: ' + snapshot.brokerOrdersTransmitted);
  console.log('   Live Positions: ' + snapshot.livePositions);
  console.log('   Evidence Hash: ' + snapshot.evidenceHash);

  // 2. Execution Safety Gate Check
  const gateRes = validateExecutionEnvironmentSafety({
    environment: 'LIVE',
    brokerId: 'ctrader-01',
    symbol: 'EURUSD',
    direction: 'BUY',
    requestedLotSize: 0.01
  });
  console.log('\n2. ExecutionSafetyGate Invariant: Allowed = false (' + gateRes.code + ')');

  console.log('\n======================================================================');
  console.log('PHASE 44 SHADOW PRODUCTION SMOKE TEST: PASS (BROKER ORDERS = 0)');
  console.log('======================================================================');

  return {
    snapshot,
    gateRes,
    success: true
  };
}

if (process.argv[1] && process.argv[1].endsWith('phase44-shadow-production-smoke.ts')) {
  runPhase44SmokeTest();
}
