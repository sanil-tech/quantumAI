import {describe,it,expect} from 'vitest';
import {indicatorCandidate} from '../src/server/research/indicatorCandidates';
const base:any={direction:'BUY',confidence:80,entry:100,sl:98,tp1:104,tp2:107.2};
const bar:any={time:0,open:100,close:102,low:99,high:103,volume:1};
const ind:any={ema20:100,ema50:99,ema200:98,atr:2,rsi:55,superTrend:{trend:'BULLISH'},adx:{adx:30,plusDI:30,minusDI:10},macd:{histogram:1}};
describe('indicator research variants',()=>{
 it('leaves baseline unchanged',()=>expect(indicatorCandidate('BASELINE',base,bar,bar,ind)).toBe(base));
 it('filters conflicting trend without reversing an entry',()=>expect(indicatorCandidate('TREND_ALIGNMENT',base,bar,bar,{...ind,ema200:101})).toBeNull());
 it('requires directional movement agreement',()=>expect(indicatorCandidate('TREND_ALIGNMENT',base,bar,bar,{...ind,adx:{adx:40,plusDI:5,minusDI:30}})).toBeNull());
 it('rejects exhausted momentum',()=>expect(indicatorCandidate('MOMENTUM_CONFIRMATION',base,bar,bar,{...ind,rsi:80})).toBeNull());
 it('rejects extended entries',()=>expect(indicatorCandidate('NO_OVEREXTENSION',base,bar,bar,{...ind,atr:0.5})).toBeNull());
 it('creates pullback only with valid directional SL and targets',()=>expect(indicatorCandidate('EMA_PULLBACK',null,bar,bar,ind)).toMatchObject({direction:'BUY',entry:100,sl:98,tp1:104,tp2:107.2}));
 it('does not create a missing baseline trade with filter variants',()=>expect(indicatorCandidate('TREND_ALIGNMENT',null,bar,bar,ind)).toBeNull());
 it('rejects unknown variants',()=>expect(indicatorCandidate('other',base,bar,bar,ind)).toBeNull());
});
