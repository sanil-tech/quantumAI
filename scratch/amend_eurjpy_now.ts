import 'dotenv/config';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function fixPosition() {
  const ctrader = new CTraderAdapter({ accountId: '48282756' });
  await ctrader.connect();

  console.log('Amending position 286399810 on cTrader...');
  // Entry: 180.829
  // SL: 181.179 (35 pips above entry for SELL)
  // TP: 180.129 (70 pips below entry for SELL)
  const result = await ctrader.amendPositionSLTP('286399810', 181.179, 180.129);
  console.log('Amend result:', result);

  const updatedPositions = await ctrader.getOpenPositions();
  const targetPos = updatedPositions.find(p => p.positionId === '286399810');
  console.log('Updated Position 286399810:', targetPos);

  process.exit(0);
}

fixPosition().catch(console.error);
