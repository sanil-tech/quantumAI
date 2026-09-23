import {describe,it,expect} from 'vitest';
import {closedBuckets,observeTrend,trendEvidence} from '../src/server/services/positionTrendObserver';
const candles=(n:number)=>Array.from({length:n},(_,i)=>({time:i*60,open:100,high:101,low:99,close:100,volume:1}));
describe('position trend observation safety',()=>{
 it('excludes the forming candle bucket',()=>expect(closedBuckets(candles(31),'M15',30*60)).toHaveLength(2));
 it('rejects incomplete buckets',()=>expect(closedBuckets(candles(14),'M15',900)).toHaveLength(0));
 it('rejects duplicate input',()=>expect(closedBuckets([...candles(15),candles(1)[0]],'M15',900)).toHaveLength(0));
 it('does not guess unsupported timeframe',()=>expect(closedBuckets(candles(15),'M5',900)).toHaveLength(0));
 it('reports unavailable rather than healthy with insufficient data',()=>expect(observeTrend('BUY','H1',[],3600)).toMatchObject({status:'UNAVAILABLE',executionAllowed:false}));
 it('uses DI direction and not ADX alone',()=>{const i:any={ema50:99,superTrend:{trend:'BULLISH'},adx:{adx:45,plusDI:40,minusDI:10}};expect(trendEvidence('BUY',100,i)).toEqual([]);expect(trendEvidence('SELL',100,i)).toHaveLength(3);});
 it('requires sufficient ADX for directional confirmation',()=>{const i:any={ema50:101,superTrend:{trend:'BEARISH'},adx:{adx:10,plusDI:10,minusDI:40}};expect(trendEvidence('BUY',100,i)).toHaveLength(2);});
 it('never enables execution even with reversal evidence',()=>{const raw=candles(203*15).map((c,i)=>({...c,open:10000-i,high:10001-i,low:9999-i,close:9999.5-i}));const result=observeTrend('BUY','M15',raw,203*900);expect(result).toMatchObject({status:'REVERSAL_CANDIDATE',executionAllowed:false,mode:'OBSERVE_ONLY'});});
 it('rejects stale last bars',()=>expect(observeTrend('BUY','M15',candles(203*15),210*900).status).toBe('UNAVAILABLE'));
});
