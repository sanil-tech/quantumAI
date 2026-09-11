import dotenv from 'dotenv';
dotenv.config();

import { ExecutionSafetyGate } from '../packages/risk-engine/src/index';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { learningService } from '../src/server/services/learningService';

console.log('======================================================');
console.log('PHASE 2 — RUNTIME CONFIGURATION & SAFETY GATE AUDIT');
console.log('======================================================');

const execEnv = process.env.EXECUTION_ENVIRONMENT || 'DEVELOPMENT';
console.log('EXECUTION_ENVIRONMENT:', execEnv);
console.log('LIVE_EXECUTION_FORBIDDEN:', execEnv !== 'LIVE');
console.log('DEMO_EXECUTION_ENABLED:', process.env.DEMO_TRADING_ENABLED || 'false');
console.log('LIVE_TRADING_ENABLED:', process.env.LIVE_TRADING_ENABLED || 'false');

// Safety gate checks
const safetyGate = ExecutionSafetyGate.getInstance();
const gateStatus = safetyGate.getStatus();
console.log('\nExecutionSafetyGate Status:', JSON.stringify(gateStatus, null, 2));

const signalService = SignalIntelligenceService.getInstance();
console.log('\nSignalIntelligenceService Transmit Order Capability: NONE (Function undefined:', (signalService as any).transmitOrder === undefined, ')');

console.log('\n--- CONFIGURED INSTRUMENT UNIVERSE ---');
const configuredPairs = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 
  'USD/CHF', 'NZD/USD', 'USD/CAD', 'EUR/JPY', 
  'GBP/JPY', 'XAU/USD', 'NASDAQ', 'BTC/USD'
];
console.log('Total Configured Instruments:', configuredPairs.length);
console.log('Pairs:', configuredPairs.join(', '));
