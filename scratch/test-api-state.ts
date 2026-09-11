async function testApi() {
  const res = await fetch('http://localhost:3000/api/autotrader/state?accountId=48282756');
  const json = await res.json();
  console.log('Open trades count:', json.openTrades?.length);
  for (const pos of json.openTrades || []) {
    console.log(`  Pos #${pos.brokerTicket || pos.id} | ${pos.pair} | ${pos.direction} | ${pos.lotSize} lots | Entry: ${pos.entryPrice} | SL: ${pos.stopLoss} | TP: ${pos.takeProfit1}`);
  }
}

testApi().catch(console.error);
