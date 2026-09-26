import {Bar,Candidate,candidateValid} from './xauReplay';
export const HTF_RULES={alignment:'UTC',pivotWidth:2,lookback:120,zoneAtr:0.1,slBufferAtr:0.25,tpBufferAtr:0.1,minNetRR:1.2};
export function completedBars(raw:Bar[],hours:number,now:number):Bar[]{
 const size=hours*3600,groups=new Map<number,Bar[]>();
 for(const b of raw){const time=Math.floor(b.time/size)*size;if(time+size<=now)groups.set(time,[...(groups.get(time)||[]),b]);}
 return [...groups].sort((a,b)=>a[0]-b[0]).flatMap(([time,g])=>{g.sort((a,b)=>a.time-b.time);if(g.length!==hours||g.some((b,i)=>b.time!==time+i*3600))return [];return [{time,open:g[0].open,close:g[g.length-1].close,high:Math.max(...g.map(b=>b.high)),low:Math.min(...g.map(b=>b.low)),volume:g.reduce((a,b)=>a+b.volume,0)}];});
}
export function swingZones(bars:Bar[]) {
 if(bars.length<20)return null;
 const recent=bars.slice(-120),tr=recent.slice(-14).map((b,j)=>{const index=recent.length-14+j,prev=recent[index-1];return Math.max(b.high-b.low,prev?Math.abs(b.high-prev.close):0,prev?Math.abs(b.low-prev.close):0);});
 const atr=tr.reduce((a,b)=>a+b,0)/tr.length;if(!(atr>0))return null;
 const levels:{price:number,role:'SUPPORT'|'RESISTANCE',flipped:boolean}[]=[];
 for(let j=2;j<recent.length-2;j++)for(const kind of ['SUPPORT','RESISTANCE'] as const){const price=kind==='SUPPORT'?recent[j].low:recent[j].high;const neighbors=[recent[j-2],recent[j-1],recent[j+1],recent[j+2]];
 if(!neighbors.every(b=>kind==='SUPPORT'?price<b.low:price>b.high))continue;
 let role: 'SUPPORT'|'RESISTANCE'=kind,flipped=false;
 for(let k=j+2;k<recent.length;k++){if(role==='RESISTANCE'&&recent[k].close>price+0.1*atr){role='SUPPORT';flipped=true;}else if(role==='SUPPORT'&&recent[k].close<price-0.1*atr){role='RESISTANCE';flipped=true;}}
 levels.push({price,role,flipped});
 }
 return {atr,levels};
}
export function higherExits(c:Candidate,h4:Bar[],daily:Bar[],mode:'H4'|'DAILY'|'H4_DAILY'):{candidate:Candidate|null;reason:string} {
 const z=swingZones(mode==='DAILY'?daily:h4);if(!z)return {candidate:null,reason:'INSUFFICIENT_HTF_HISTORY'};
 const buy=c.direction==='BUY',sign=buy?1:-1,role=buy?'SUPPORT':'RESISTANCE';
 const behind=z.levels.filter(l=>l.role===role&&(buy?l.price<c.entry:l.price>c.entry)).sort((a,b)=>Math.abs(a.price-c.entry)-Math.abs(b.price-c.entry));
 const ahead=z.levels.filter(l=>l.role!==role&&(buy?l.price>c.entry:l.price<c.entry)).sort((a,b)=>Math.abs(a.price-c.entry)-Math.abs(b.price-c.entry));
 const targets:number[]=[];for(const l of ahead)if(!targets.some(p=>Math.abs(p-l.price)<0.2*z.atr))targets.push(l.price);
 if(!behind.length||targets.length<2)return {candidate:null,reason:'MISSING_SWING_ZONES'};
 const candidate={...c,sl:behind[0].price-sign*0.35*z.atr,tp1:targets[0]-sign*0.2*z.atr,tp2:targets[1]-sign*0.2*z.atr};
 if(mode==='H4_DAILY'){
 const d=swingZones(daily);if(!d)return {candidate:null,reason:'INSUFFICIENT_DAILY_CONTEXT'};
 const obstacles=d.levels.filter(l=>l.role!==role&&(buy?l.price>c.entry:l.price<c.entry)).map(l=>l.price-sign*0.2*d.atr).sort((a,b)=>Math.abs(a-c.entry)-Math.abs(b-c.entry));
 if(obstacles.length){const cap=obstacles[0];if(buy?cap<=candidate.tp1:cap>=candidate.tp1)return {candidate:null,reason:'DAILY_ZONE_BLOCKS_TP1'};candidate.tp2=buy?Math.min(candidate.tp2,cap):Math.max(candidate.tp2,cap);}
 }
 if(!candidateValid(candidate))return {candidate:null,reason:'INVALID_EXIT_GEOMETRY'};
 const cost=0.00019;
 if((Math.abs(candidate.tp1-c.entry)-cost)/(Math.abs(candidate.sl-c.entry)+cost)<1.2)return {candidate:null,reason:'INSUFFICIENT_NET_REWARD_RISK'};
 return {candidate,reason:'ELIGIBLE'};
}
