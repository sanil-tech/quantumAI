// Broker membership wins; local metadata only enriches the same ticket.
import { PairDailyRangeService } from '../server/services/pairDailyRangeService';

export function masterPositionSnapshot(local: any[], snapshot: any): any[] {
  if (snapshot?.success !== true || !Array.isArray(snapshot.normalizedPositions)) return local;
  const metadata = new Map((local || []).map(t => [String(t.brokerTicket || t.positionId || t.id?.replace(/^trade_/, '')), t]));

  return snapshot.normalizedPositions.map((p: any) => {
    const meta = metadata.get(p.positionId) || {};
    const pair = p.pair || p.symbol || meta.pair || meta.symbol || 'EUR/USD';
    const entryPrice = Number(p.entryPrice || p.price || meta.entryPrice || 0);
    const direction = p.direction || meta.direction || 'BUY';

    // Recalculate dynamic scalping targets if local metadata had cross-symbol mis-mapped SL/TP
    const targets = PairDailyRangeService.calculateIntradayTargets(pair, direction, entryPrice, 'M5');

    const rawSl = Number(p.stopLoss || meta.stopLoss || 0);
    const rawTp1 = Number(p.takeProfit || p.takeProfit1 || meta.takeProfit1 || 0);

    const profile = PairDailyRangeService.getProfile(pair);
    const isSlInvalid = rawSl <= 0 || Math.abs(entryPrice - rawSl) / profile.pipMultiplier > 150;
    const isTpInvalid = rawTp1 <= 0 || Math.abs(rawTp1 - entryPrice) / profile.pipMultiplier > 150;

    const stopLoss = isSlInvalid ? targets.slPrice : rawSl;
    const takeProfit1 = isTpInvalid ? targets.tp1Price : rawTp1;
    const takeProfit2 = targets.tp2Price;

    return {
      ...meta,
      ...p,
      pair,
      symbol: pair,
      entryPrice,
      direction,
      stopLoss,
      takeProfit: takeProfit1,
      takeProfit1,
      takeProfit2
    };
  });
}
