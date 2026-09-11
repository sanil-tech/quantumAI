import dotenv from 'dotenv';
dotenv.config();

import { automatedTechnicalAuditService } from '../src/server/services/automatedTechnicalAuditService';

async function testAudit() {
  console.log('=== RUNNING AUTOMATED TECHNICAL & PERFORMANCE AUDIT ===');
  const report = await automatedTechnicalAuditService.runAuditCycle();
  console.log('\n--- AUDIT SUMMARY ---');
  console.log(`Health Score: ${report.healthScore}% (${report.overallStatus})`);
  console.log(`Open Positions: ${report.openPositionsCount}`);
  console.log(`Active Anomalies Detected: ${report.activeAnomaliesCount}`);
  if (report.anomalies.length > 0) {
    console.table(report.anomalies);
  } else {
    console.log('✅ Zero technical anomalies detected! All positions have valid SL/TP and zero duplicates.');
  }

  console.log('\n--- PERFORMANCE SNAPSHOT ---');
  console.log(`Total Trades: ${report.performance.totalTrades}`);
  console.log(`Win Rate: ${report.performance.winRatePct}% (${report.performance.wins} W / ${report.performance.losses} L / ${report.performance.breakevens} BE)`);
  console.log(`Net P&L: $${report.performance.netPnlDollars}`);
  console.log(`Profit Factor: ${report.performance.profitFactor}`);
  console.log(`Top Winner: ${report.performance.topPair.symbol} ($${report.performance.topPair.pnl})`);
  console.log(`Biggest Drag: ${report.performance.worstPair.symbol} ($${report.performance.worstPair.pnl})`);

  process.exit(0);
}

testAudit().catch(e => {
  console.error(e);
  process.exit(1);
});
