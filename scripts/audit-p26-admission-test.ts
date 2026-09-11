import 'dotenv/config';
import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { shadowObservationRepository } from '../packages/database/src/shadowObservationRepository';
import { shadowWalService } from '../packages/database/src/shadowWal';

async function testAdmission() {
  console.log('=== P26 SECTION 4: POST-P25 ADMISSION TEST ===');

  await continuousLearningObservatoryService.initPersistence();
  continuousLearningObservatoryService.startObservatory();

  const activeBefore = continuousLearningObservatoryService.getActiveObservations().length;
  console.log('Active observations in observatory before test:', activeBefore);

  const testPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
  const results = [];

  for (const pair of testPairs) {
    const opp = {
      id: `p26-audit-sig-${pair.replace('/', '')}-${Date.now()}`,
      pair,
      action: 'BUY',
      entryPrice: pair === 'USD/JPY' ? 159.25 : 1.1670,
      stopLoss: pair === 'USD/JPY' ? 159.00 : 1.1650,
      takeProfit1: pair === 'USD/JPY' ? 159.50 : 1.1710,
      takeProfit2: pair === 'USD/JPY' ? 159.80 : 1.1750,
      setupType: 'ORDER_BLOCK_RETEST',
      timeframe: 'M1'
    };

    const res = continuousLearningObservatoryService.evaluateMarketOpportunity({
      opportunity: opp as any,
      session: 'LONDON'
    });

    results.push({
      symbol: pair,
      actionTaken: res.actionTaken,
      reason: (res as any).reason,
      success: res.success
    });
  }

  const activeAfter = continuousLearningObservatoryService.getActiveObservations().length;
  console.log('Active observations in observatory after test:', activeAfter);
  console.log('Admission Evaluation Results:');
  console.table(results);

  console.log('Did active count increase?', activeAfter > activeBefore ? 'YES (FAILURE)' : 'NO (PASSED)');
}

testAdmission();
