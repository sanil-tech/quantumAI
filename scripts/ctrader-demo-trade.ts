import 'dotenv/config';
import { CTraderConfigValidator } from '../src/server/services/ctraderConfigValidator';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';
import { TradeProposal, RiskClearedPayload } from '@iati/core-types';

async function runControlledDemoTrade() {
  console.log('====================================================');
  console.log('QuantumAI Phase 3B — Controlled cTrader DEMO Trade Execution');
  console.log('====================================================\n');

  if (process.env.DEMO_CONFIRM_EXECUTION !== 'true') {
    console.error('[SAFETY_GATE_REJECTION] DEMO execution aborted.');
    console.error('Explicit confirmation flag required: DEMO_CONFIRM_EXECUTION=true');
    console.error('Command example: DEMO_CONFIRM_EXECUTION=true npm run ctrader:demo:trade');
    process.exit(1);
  }

  try {
    const config = CTraderConfigValidator.validateDemoConfig();
    console.log(`[CONFIG] EXECUTION_ENVIRONMENT: ${config.environment}`);
    console.log(`[CONFIG] Account ID: ${config.accountId}\n`);

    const adapter = new CTraderAdapter(config);
    await adapter.connect();

    const router = new ExecutionRouter();
    router.registerBroker(adapter);

    const proposalId = `prop-cli-demo-${Date.now()}`;
    const approvalId = `gov-cli-demo-${Date.now()}`;
    const symbol = 'EURUSD';
    const direction = 'BUY';
    const lotSize = 0.01;

    const proposal: TradeProposal = {
      id: proposalId,
      symbol,
      direction,
      confidence: 95,
      evidence: ['Controlled CLI DEMO Trade Test'],
      agent_votes: [],
      why_direction: 'Controlled cTrader DEMO Execution Test',
      invalidate_conditions: [],
      timestamp: new Date(),
      stopLoss: 1.0800,
      takeProfit: 1.0950
    };

    const token = createRiskApprovalToken({
      approvalId,
      signalId: proposalId,
      symbol,
      direction,
      approvedLotSize: lotSize,
      maxAllowedDrawdown: 5.0,
      calculatedRiskAmount: 10,
      status: 'APPROVED'
    });

    const payload: RiskClearedPayload & { environment?: any; credentials?: any } = {
      proposal_id: proposalId,
      symbol,
      account_id: config.accountId,
      approval_id: approvalId,
      risk_score: 5,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: approvalId,
        status: 'APPROVED',
        risk_score: 5,
        checks: [],
        timestamp: new Date(),
        decision_authority: 'RiskGov',
        token
      },
      approval_token: token,
      timestamp: new Date(),
      broker_id: 'ctrader-broker-01',
      environment: 'DEMO',
      credentials: config
    };

    console.log('[EXECUTION] Routing order through canonical ExecutionRouter...');
    const result = await router.handleRiskCleared(payload);

    console.log('\n====================================================');
    console.log('REAL CTRADER DEMO EXECUTION RESULT: SUCCESS');
    console.log('====================================================');
    console.log(`Order ID: ${result.order.order_id}`);
    console.log(`Status: ${result.order.status}`);
    console.log(`Broker Order ID: ${result.report.broker_order_id}`);
    console.log(`Broker Position ID: ${result.report.broker_position_id}`);
    console.log(`Broker Deal ID: ${result.report.broker_deal_id}`);
    console.log(`Filled Price: ${result.report.filled_price}`);
    process.exit(0);
  } catch (err: any) {
    console.error('\n====================================================');
    console.error('REAL CTRADER DEMO EXECUTION RESULT: FAILED');
    console.error('====================================================');
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

runControlledDemoTrade();
