import {Bar,Candidate} from './xauReplay';
export const ROLE_RULES={lookback:24,breakBufferAtr:0.15,zoneAtr:0.2,stopBufferAtr:0.25,retestBars:12,tp1R:2,tp2R:3.6};
// Online state machine: levels use only candles preceding the breakout.
export function roleReversalCandidates(bars:Bar[],atrAt:(i:number)=>number,emaAt:(i:number)=>number) {
 const result=new Map<number,Candidate>();let setup:null|{direction:'BUY'|'SELL';level:number;index:number;atr:number}=null;
 for(let i=ROLE_RULES.lookback;i<bars.length;i++){
  const b=bars[i],atr=atrAt(i);if(!(atr>0))continue;
  if(setup){
   const buy=setup.direction==='BUY',z=setup.atr*ROLE_RULES.zoneAtr;
   if(i-setup.index>ROLE_RULES.retestBars||(buy?b.close<setup.level-z:b.close>setup.level+z)){setup=null;}
   else if(i>setup.index && (buy?b.low<=setup.level+z&&b.close>setup.level+z&&b.close>b.open:b.high>=setup.level-z&&b.close<setup.level-z&&b.close<b.open)){
    const entry=setup.level+(buy?z:-z),sl=buy?Math.min(b.low,setup.level-z)-atr*ROLE_RULES.stopBufferAtr:Math.max(b.high,setup.level+z)+atr*ROLE_RULES.stopBufferAtr;
    const risk=Math.abs(entry-sl),sign=buy?1:-1;
    // Require the role reversal to agree with the existing EMA50 trend filter.
    if((buy?b.close>emaAt(i):b.close<emaAt(i))&&risk>0)result.set(i,{direction:setup.direction,entry,sl,tp1:entry+sign*risk*2,tp2:entry+sign*risk*3.6,confidence:75});
    setup=null;continue;
   }
  }
  if(!setup){const history=bars.slice(i-ROLE_RULES.lookback,i),resistance=Math.max(...history.map(c=>c.high)),support=Math.min(...history.map(c=>c.low));
   if(b.close>resistance+atr*ROLE_RULES.breakBufferAtr)setup={direction:'BUY',level:resistance,index:i,atr};
   else if(b.close<support-atr*ROLE_RULES.breakBufferAtr)setup={direction:'SELL',level:support,index:i,atr};
  }
 }
 return result;
}
