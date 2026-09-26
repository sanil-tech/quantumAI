export type Bar = {time:number;open:number;high:number;low:number;close:number;volume:number};
export type Candidate = {direction:'BUY'|'SELL';entry:number;sl:number;tp1:number;tp2:number;confidence:number};
export type Costs = {spread:number;slippage:number;commissionPerLot:number};
export type Spec = {lotSize:number;minVolume:number;maxVolume:number;stepVolume:number};
export type ReplayConfig = {initialEquity:number;riskPct:number;minConfidence:number;pendingBars:number;holdingBars:number;spec:Spec;costs:Costs;breakevenMode?:'IMMEDIATE'|'CONFIRMED_CLOSE'};
export function validateHistory(data:any): asserts data is {source:string;instrument:string;synthetic:boolean;timeframe:string;spec:Spec;candles:Bar[]} {
 if(data.source!=='CTRADER_BROKER'||data.instrument!=='XAU/USD'||data.synthetic!==false||data.timeframe!=='H1')throw new Error('BROKER_XAU_H1_HISTORY_REQUIRED');
 if(!Array.isArray(data.candles)||data.candles.length<251)throw new Error('INSUFFICIENT_HISTORY');
 let last=-Infinity;
 for(const b of data.candles){if(![b.time,b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.time<=last||b.time%3600!==0||b.low<=0||b.volume<0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close))throw new Error('INVALID_OHLC_HISTORY');last=b.time;}
 for(const key of ['lotSize','minVolume','maxVolume','stepVolume'])if(!(data.spec?.[key]>0)||!Number.isFinite(data.spec[key]))throw new Error('BROKER_SPEC_REQUIRED');
 if(data.spec.maxVolume<data.spec.minVolume)throw new Error('INVALID_VOLUME_BOUNDS');
}
export function candidateValid(c:Candidate):boolean {
 if(!c||!['BUY','SELL'].includes(c.direction)||![c.entry,c.sl,c.tp1,c.tp2,c.confidence].every(Number.isFinite)||Math.min(c.entry,c.sl,c.tp1,c.tp2)<=0)return false;
 return c.direction==='BUY'?c.sl<c.entry&&c.entry<c.tp1&&c.tp1<c.tp2:c.sl>c.entry&&c.entry>c.tp1&&c.tp1>c.tp2;
}
export function replay(bars:Bar[],candidateAt:(index:number)=>Candidate|null,config:ReplayConfig,startIndex=250,endIndex=bars.length) {
 if(!(config.initialEquity>0)||!(config.riskPct>0&&config.riskPct<=2)||Object.values(config.costs).some(v=>!Number.isFinite(v)||v<0))throw new Error('INVALID_REPLAY_CONFIG');
 const contract=config.spec.lotSize/100,stepLots=config.spec.stepVolume/config.spec.lotSize,minLots=config.spec.minVolume/config.spec.lotSize;
 let equity=config.initialEquity,peak=equity,maxDrawdownPct=0,pending:any=null,open:any=null,skippedVolume=0,expired=0,signals=0;
 const trades:any[]=[];
 const mark=(pnl:number)=>{equity+=pnl;peak=Math.max(peak,equity);maxDrawdownPct=Math.max(maxDrawdownPct,100*(peak-equity)/peak);};
 const exitLeg=(price:number,remaining:number)=>{const sign=open.c.direction==='BUY'?1:-1;return (price-open.c.entry)*sign*contract*open.lots*remaining-config.costs.commissionPerLot*open.lots*remaining;};
 const close=(price:number,reason:string,index:number)=>{const pnl=exitLeg(price,open.remaining);mark(pnl);trades.push({signalTime:bars[open.signalIndex].time,entryTime:bars[open.fillIndex].time,exitTime:bars[index].time,...open.c,lots:open.lots,netPnl:open.banked+pnl,reason});open=null;};
 for(let i=startIndex;i<endIndex;i++){
  const b=bars[i];let filledNow=false;
  if(pending){if(i-pending.index>config.pendingBars){pending=null;expired++;}else{
   const fill=pending.c.direction==='BUY'?b.low+config.costs.spread<=pending.c.entry:b.high>=pending.c.entry;
   if(fill){open={c:pending.c,lots:pending.lots,signalIndex:pending.index,fillIndex:i,remaining:1,banked:0,stop:pending.c.sl};pending=null;filledNow=true;}
  }}
  if(open){const buy=open.c.direction==='BUY',lo=b.low+(buy?0:config.costs.spread),hi=b.high+(buy?0:config.costs.spread),op=b.open+(buy?0:config.costs.spread);
   // OHLC ordering is unknown: stop-first, including the fill bar. No same-bar TP windfall.
   const stopHit=buy?lo<=open.stop:hi>=open.stop;
   if(stopHit){const stopPrice=filledNow?open.stop:(buy?Math.min(op,open.stop):Math.max(op,open.stop));close(stopPrice+(buy?-1:1)*config.costs.slippage,'STOP_OR_BE',i);}
   else if(!filledNow){
    if(open.remaining===1&&(buy?hi>=open.c.tp1:lo<=open.c.tp1)){const pnl=exitLeg(open.c.tp1,0.5);mark(pnl);open.banked+=pnl;open.remaining=0.5;open.tp1Index=i;if(config.breakevenMode!=='CONFIRMED_CLOSE')open.stop=open.c.entry;
     // Conservative intrabar ambiguity after TP1: BE takes priority over TP2.
     if(config.breakevenMode!=='CONFIRMED_CLOSE'&&(buy?lo<=open.stop:hi>=open.stop))close(open.stop+(buy?-1:1)*config.costs.slippage,'TP1_THEN_BE',i);
    }
    if(open&&open.remaining===0.5&&(buy?hi>=open.c.tp2:lo<=open.c.tp2))close(open.c.tp2,'TP2',i);
   }
   // Arm at a subsequent candle close beyond TP1, effective only on the next bar.
   if(open&&config.breakevenMode==='CONFIRMED_CLOSE'&&open.remaining===0.5&&i>open.tp1Index&&(buy?b.close>=open.c.tp1:b.close+config.costs.spread<=open.c.tp1))open.stop=open.c.entry;
   if(open&&i-open.fillIndex>=config.holdingBars)close(b.close+(buy?0:config.costs.spread)+(buy?-1:1)*config.costs.slippage,'TIME_EXIT',i);
   if(open){const floating=exitLeg(b.close+(buy?0:config.costs.spread),open.remaining);const marked=equity+floating;peak=Math.max(peak,marked);maxDrawdownPct=Math.max(maxDrawdownPct,100*(peak-marked)/peak);}
  }
  if(!open&&!pending&&equity>0){const c=candidateAt(i);if(c&&candidateValid(c)&&c.confidence>=config.minConfidence){signals++;const perLotRisk=(Math.abs(c.entry-c.sl)+config.costs.slippage)*contract+config.costs.commissionPerLot;
   // Two equal tickets: round each half down, never exceed the combined risk budget.
   const halfLots=Math.floor((equity*config.riskPct/100/perLotRisk/2)/stepLots+1e-9)*stepLots;
   const maxHalf=Math.floor(config.spec.maxVolume/config.spec.lotSize/stepLots)*stepLots;
   const lots=2*Math.min(halfLots,maxHalf);
   if(halfLots<minLots){skippedVolume++;continue;}pending={c,lots,index:i};
  }}
 }
 if(open){const buy=open.c.direction==='BUY';close(bars[endIndex-1].close+(buy?0:config.costs.spread)+(buy?-1:1)*config.costs.slippage,'END_OF_DATA',endIndex-1);}
 if(pending)expired++;
 const grossProfit=trades.reduce((s,t)=>s+Math.max(0,t.netPnl),0),grossLoss=trades.reduce((s,t)=>s+Math.max(0,-t.netPnl),0);
 return {signals,skippedVolume,expired,closedTrades:trades.length,wins:trades.filter(t=>t.netPnl>0).length,winRatePct:trades.length?100*trades.filter(t=>t.netPnl>0).length/trades.length:null,netPnl:equity-config.initialEquity,profitFactor:grossLoss>0?grossProfit/grossLoss:null,expectancy:trades.length?(equity-config.initialEquity)/trades.length:null,maxDrawdownPct,trades};
}
export function assessResearch(summary:ReturnType<typeof replay>) {
 const blockers=['HISTORICAL_NEWS_NOT_REPLAYED','SECOND_OPINION_NOT_REPLAYED','BROKER_COST_ASSUMPTIONS_UNVERIFIED','LIVE_COPY_AND_RISK_PARITY_UNVERIFIED'];
 if(summary.closedTrades<50)blockers.push('INSUFFICIENT_OUT_OF_SAMPLE_TRADES');
 if(summary.closedTrades===0)blockers.push('METRICS_UNAVAILABLE_NO_FILLED_TRADES');
 else if(!(summary.expectancy!>0)||!(summary.profitFactor!>=1.2))blockers.push('NO_DEMONSTRATED_NET_EDGE');
 if(summary.signals>0&&summary.skippedVolume===summary.signals)blockers.push('VOLUME_BUDGET_INFEASIBLE');
 if(summary.maxDrawdownPct>5)blockers.push('RESEARCH_DRAWDOWN_ABOVE_5_PERCENT');
 return {status:'NOT_QUALIFIED_FOR_AUTO_TRADE',autoTradeAllowed:false,blockers};
}
