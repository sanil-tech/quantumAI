import http from 'http';

http.get('http://localhost:3000/api/autotrader/state', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const json = JSON.parse(d);
    console.log('=== GET /api/autotrader/state RESPONSE ===');
    console.log('Status code:', res.statusCode);
    console.log('Open Trades Count in state:', json.state?.openTrades?.length);
    console.log('Closed Trades Count in state:', json.state?.closedTrades?.length);
    console.log('Win Rate in performance:', json.performance?.winRatePercent, '%');
    console.log('Total PnL in performance:', json.performance?.totalPnlDollars);
    console.log('\nTop 5 Active Open Positions:');
    json.state?.openTrades?.slice(0, 5).forEach((t: any) => {
      console.log(`- Ticket: ${t.ticketId || t.id} | Pair: ${t.pair} | Dir: ${t.direction} | Lots: ${t.lotSize} | Entry: ${t.entryPrice} | Live: ${t.currentPrice} | PnL: $${t.pnlDollars} (${t.pnlPips} pips)`);
    });
    console.log('\nTop 3 Recent Closed Trades:');
    json.state?.closedTrades?.slice(0, 3).forEach((t: any) => {
      console.log(`- Ticket: ${t.ticketId || t.id} | Pair: ${t.pair} | Dir: ${t.direction} | Entry: ${t.entryPrice} | Exit: ${t.exitPrice} | Realized: $${t.pnlDollars} | Reason: ${t.closeReason}`);
    });
  });
});
