import { CandleData, IndicatorValues } from '../../types';
import { calculateAllIndicators } from '../../lib/indicators';

const periods: Record<string, number> = { M15: 900, H1: 3600, H4: 14400 };
export function trendEvidence(side: 'BUY' | 'SELL', close: number, i: IndicatorValues) {
  const against = side === 'BUY' ? 'BEARISH' : 'BULLISH';
  const reasons: string[] = [];
  if (side === 'BUY' ? close < i.ema50 : close > i.ema50) reasons.push('PRICE_AGAINST_EMA50');
  if (i.superTrend.trend === against) reasons.push('SUPERTREND_AGAINST_POSITION');
  if (i.adx.adx >= 25 && (side === 'BUY' ? i.adx.minusDI > i.adx.plusDI : i.adx.plusDI > i.adx.minusDI)) reasons.push('DIRECTIONAL_MOVEMENT_AGAINST_POSITION');
  return reasons;
}
// Only complete broker M1 buckets; never fill missing candles or rescale prices.
export function closedBuckets(raw: CandleData[], timeframe: string, now: number): CandleData[] {
  const seconds = periods[timeframe]; if (!seconds) return [];
  const buckets = new Map<number, CandleData[]>(); const seen = new Set<number>();
  for (const c of raw) {
    if (!Number.isInteger(c.time) || c.time % 60 !== 0 || seen.has(c.time)) return [];
    seen.add(c.time);
    if (![c.open,c.high,c.low,c.close].every(n => Number.isFinite(n) && n > 0) || c.high < Math.max(c.open,c.close) || c.low > Math.min(c.open,c.close)) return [];
    const time = Math.floor(c.time / seconds) * seconds;
    if (time + seconds > now) continue;
    buckets.set(time, [...(buckets.get(time) || []), c]);
  }
  return [...buckets.entries()].sort((a,b)=>a[0]-b[0]).flatMap(([time, group]) => {
    group.sort((a,b)=>a.time-b.time);
    if (group.length !== seconds/60 || group.some((c,i)=>c.time !== time+i*60)) return [];
    return [{time,open:group[0].open,close:group[group.length-1].close,high:Math.max(...group.map(c=>c.high)),low:Math.min(...group.map(c=>c.low)),volume:group.reduce((s,c)=>s+c.volume,0)}];
  });
}
export function observeTrend(side: 'BUY'|'SELL', timeframe: string, raw: CandleData[], now = Date.now()/1000) {
  return observeClosedTrend(side,timeframe,closedBuckets(raw,timeframe,now),now);
}
export function observeClosedTrend(side: 'BUY'|'SELL', timeframe: string, input: CandleData[], now=Date.now()/1000) {
  const seconds=periods[timeframe];
  const bars=input.filter(c=>c.time+seconds<=now);
  const base = { mode: 'OBSERVE_ONLY', executionAllowed: false, timeframe } as const;
  if (!seconds || bars.some((c,i)=> ![c.time,c.open,c.high,c.low,c.close].every(Number.isFinite) || c.time % seconds !== 0 || c.low<=0 || c.high<Math.max(c.open,c.close) || c.low>Math.min(c.open,c.close) || (i>0 && c.time<=bars[i-1].time))) return {...base,status:'UNAVAILABLE',reasons:['INVALID_BROKER_CANDLES']};
  if (bars.length < 202) return {...base,status:'UNAVAILABLE',reasons:['INSUFFICIENT_COMPLETE_BROKER_CANDLES']};
  const last=bars[bars.length-1],previous=bars[bars.length-2];
  if (now-last.time-seconds >= seconds || last.time-previous.time !== seconds) return {...base,status:'UNAVAILABLE',reasons:['STALE_OR_NONCONSECUTIVE_CANDLES']};
  const current=trendEvidence(side,last.close,calculateAllIndicators(bars));
  const prior=trendEvidence(side,previous.close,calculateAllIndicators(bars.slice(0,-1)));
  const status=current.length===3 && prior.length===3 ? 'REVERSAL_CANDIDATE' : current.length>=2 ? 'TREND_WEAKENING' : 'NO_CONFIRMED_REVERSAL';
  return {...base,status,reasons:current,previousReasons:prior,closedCandleAt:last.time,ruleVersion:'closed-ema50-supertrend-di-v1'};
}
