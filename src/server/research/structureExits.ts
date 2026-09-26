import {Bar,Candidate,candidateValid} from './xauReplay';
export const EXIT_RULES={lookback:120,pivotWidth:2,zoneHalfAtr:0.1,stopBufferAtr:0.25,targetBufferAtr:0.1,minNetRewardRisk:1.2};
export function structureExits(c:Candidate,bars:Bar[],atr:number):Candidate|null {
 if(!(atr>0)||bars.length<10)return null;
 const window=bars.slice(-EXIT_RULES.lookback),supports:number[]=[],resistances:number[]=[];
 // Two candles on the right must already be closed before a pivot is available.
 for(let j=2;j<window.length-2;j++){
  const neighbors=[window[j-2],window[j-1],window[j+1],window[j+2]];
  if(neighbors.every(b=>window[j].low<b.low))supports.push(window[j].low);
  if(neighbors.every(b=>window[j].high>b.high))resistances.push(window[j].high);
 }
 const buy=c.direction==='BUY',sign=buy?1:-1;
 const behind=(buy?supports:resistances).filter(p=>buy?p<c.entry:p>c.entry).sort((a,b)=>Math.abs(a-c.entry)-Math.abs(b-c.entry));
 const ahead=(buy?resistances:supports).filter(p=>buy?p>c.entry:p<c.entry).sort((a,b)=>Math.abs(a-c.entry)-Math.abs(b-c.entry));
 const zones:number[]=[];for(const p of ahead)if(!zones.some(x=>Math.abs(x-p)<0.2*atr))zones.push(p);
 if(!behind.length||zones.length<2)return null;
 const sl=behind[0]-sign*0.35*atr,tp1=zones[0]-sign*0.2*atr,tp2=zones[1]-sign*0.2*atr;
 const out={...c,sl,tp1,tp2};if(!candidateValid(out))return null;
 // EURUSD base spread + slippage + roundtrip commission expressed in price units.
 const allowance=0.0001+0.00002+7/100000;
 if((Math.abs(tp1-c.entry)-allowance)/(Math.abs(c.entry-sl)+allowance)<1.2)return null;
 return out;
}
