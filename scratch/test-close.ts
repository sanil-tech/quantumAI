import 'dotenv/config';
import { TradingRepository } from '@iati/database';

async function testClose() {
  const repo = new TradingRepository();
  try {
    const res = await repo.closePositionTransaction({
      positionId: 'trade_285434142',
      closePrice: 216.795,
      realizedProfit: 0,
      pnlPips: 0,
      closeReason: 'BROKER_SIDE_CLOSED',
      accountId: '48282756'
    });
    console.log('Close success:', res);
  } catch (err: any) {
    console.error('Close failed with error:', err.message);
  }
  process.exit(0);
}

testClose().catch(console.error);
