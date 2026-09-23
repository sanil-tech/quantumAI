import {describe,it,expect} from 'vitest';
import {roleReversalCandidates} from '../src/server/research/roleReversal';
const history=()=>Array.from({length:30},(_,i)=>({time:i*3600,open:100,close:100,high:101,low:99,volume:1}));
const add=(a:any[],open:number,high:number,low:number,close:number)=>a.push({time:a.length*3600,open,high,low,close,volume:1});
describe('S/R role reversal research',()=>{
 it('requires breakout followed by retest, never breakout-bar entry',()=>{const a=history();add(a,101,103,100.9,102);expect(roleReversalCandidates(a,()=>1,()=>100).size).toBe(0);add(a,101.1,102,101,101.8);const r=roleReversalCandidates(a,()=>1,()=>100);expect(r.get(31)).toMatchObject({direction:'BUY',entry:101.2});});
 it('rejects a failed breakout',()=>{const a=history();add(a,101,103,101,102);add(a,101,102,99,100);expect(roleReversalCandidates(a,()=>1,()=>100).size).toBe(0);});
 it('rejects retest against EMA filter',()=>{const a=history();add(a,101,103,101,102);add(a,101,102,101,101.8);expect(roleReversalCandidates(a,()=>1,()=>110).size).toBe(0);});
 it('supports support becoming resistance',()=>{const a=history();add(a,99,99,97,98);add(a,98.9,99,97,98);expect(roleReversalCandidates(a,()=>1,()=>100).get(31)?.direction).toBe('SELL');});
 it('has prefix invariance: future candles cannot alter earlier signals',()=>{const a=history();add(a,101,103,101,102);add(a,101,102,101,101.8);const first=roleReversalCandidates(a,()=>1,()=>100);add(a,100,200,1,50);expect(roleReversalCandidates(a,()=>1,()=>100).get(31)).toEqual(first.get(31));});
});
