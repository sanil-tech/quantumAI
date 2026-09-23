import {describe,it,expect} from 'vitest';
import {structureExits} from '../src/server/research/structureExits';
import {replay} from '../src/server/research/exitComparisonReplay';
const c:any={direction:'BUY',entry:100,sl:98,tp1:102,tp2:106,confidence:80};
const bar=(i:number,low:number,high:number,close:number)=>({time:i*3600,open:close,low,high,close,volume:1});
const config:any={initialEquity:10000,riskPct:1,minConfidence:75,pendingBars:24,holdingBars:120,spec:{lotSize:10000,minVolume:100,stepVolume:100,maxVolume:10000000},costs:{spread:0,slippage:0,commissionPerLot:0}};
describe('exit comparison',()=>{
 it('requires confirmed structural zones',()=>expect(structureExits(c,[bar(0,99,101,100)],1)).toBeNull());
 it('does not change entry or direction when zones qualify',()=>{const b=Array.from({length:20},(_,i)=>bar(i,100.5,101,100.7));b[3]=bar(3,99,101,100.7);b[8]=bar(8,100.5,104,101);b[14]=bar(14,100.5,108,101);const r=structureExits(c,b,1);expect(r).toMatchObject({entry:100,direction:'BUY',sl:98.65,tp1:103.8,tp2:107.8});});
 it('does not use an unconfirmed final pivot',()=>{const b=Array.from({length:20},(_,i)=>bar(i,100.5,101,100.7));b[3]=bar(3,99,101,100.7);b[8]=bar(8,100.5,104,101);b[19]=bar(19,100.5,108,101);expect(structureExits(c,b,1)).toBeNull();});
 it('delayed BE cannot apply retroactively on the confirming bar',()=>{const b=[bar(0,100,101,100),bar(1,99.5,101,100),bar(2,100.5,103,102.5),bar(3,99,103,102.5),bar(4,100,107,106)];const a=replay(b,i=>i===0?c:null,config,0);const d=replay(b,i=>i===0?c:null,{...config,breakevenMode:'CONFIRMED_CLOSE'},0);expect(a.trades[0].exitTime).toBe(10800);expect(d.trades[0].exitTime).toBe(14400);});
});
