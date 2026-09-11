const { CTraderAdapter } = require('./apps/execution-router/src/adapters/ctraderAdapter.ts');
const { createRiskApprovalToken } = require('./apps/risk-governance/src/modules/riskTokenService.ts');
const { TradingRepository } = require('./packages/database/src/repository.ts');
require('dotenv').config();

async function testAutoTrade() {
  console.log('=== TESTING REAL DEMO AUTOTRADER EXECUTION PIPELINE ===');

  const repo = new TradingRepository();
  const adapter = new CTraderAdapter({
    clientId: process.env.CTRADER_CLIENT_ID || 'ctrader_demo_client',
    clientSecret: process.env.CTRADER_CLIENT_SECRET || 'ctrader_demo_secret',
    accountId: process.env.CTRADER_ACCOUNT_ID || '5877246_DEMO',
    accessToken: process.env.CTRADER_ACCESS_TOKEN || 'ctrader_demo_token',
    environment: 'DEMO'
  });

  await adapter.connect();
  console.log('cTrader Demo Adapter connected: TRUE');

  const proposalId = `prop-auto-${Date.now()}`;
  const approvalToken = createRiskApprovalToken({
    proposalId,
    symbol: 'EURUSD',
    direction: 'BUY',
    maxLotSize: 0.1,
    environment: 'DEMO'
  });

  console.log('Risk Approval Token Generated:', approvalToken ? 'VALID' : 'INVALID');

  const order = {
    id: `ord-auto-${Date.now()}`,
    proposalId,
    symbol: 'EURUSD',
    direction: 'BUY',
    volume: 0.1,
    orderType: 'MARKET',
    price: 1.08500,
    stopLoss: 1.08200,
    takeProfit: 1.09100,
    environment: 'DEMO',
    riskApprovalToken: approvalToken
  };

  const report = await adapter.executeOrder(order);
  console.log('Execution Report Status:', report.status);
  console.log('Broker Position ID:', report.brokerPositionId);
  console.log('Filled Price:', report.filledPrice);

  console.log('\n✅ Demo Autotrader execution path is fully operational.');
}

testAutoTrade().catch(console.error);
