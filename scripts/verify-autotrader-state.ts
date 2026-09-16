import 'dotenv/config';

async function verifyState() {
  const res = await fetch('http://localhost:3000/api/autotrader/state');
  const d = await res.json();
  const list = d.openTrades || d.state?.openTrades || [];
  console.log(`\n===========================================================`);
  console.log(`📡 VERIFIED /api/autotrader/state TRUTH SOURCE (${list.length} Open Positions):`);
  console.log(`===========================================================`);
  for (const t of list) {
    console.log(`• ${t.pair} (${t.direction}) | Lots: ${t.lotSize} | PosID: ${t.id}`);
    console.log(`  Entry: ${t.entryPrice} | SL: ${t.stopLoss}`);
    console.log(`  TP1 (Truth): ${t.takeProfit1} | TP2 (Truth): ${t.takeProfit2}`);
    console.log(`  tp1Hit: ${t.tp1Hit} | isMultiTarget: ${t.isMultiTarget}\n`);
  }
}

verifyState().catch(e => console.error(e));
