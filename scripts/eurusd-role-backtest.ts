import fs from 'node:fs';
import crypto from 'node:crypto';
import {signalIntelligenceService} from '../apps/decision-agent/src/services/signalIntelligenceService';
import {calculateAllIndicators} from '../src/lib/indicators';
import {analyzeSmcStructures} from '../src/lib/smcEngine';
import {validateHistory,replay,type Candidate} from '../src/server/research/xauReplay';
import {roleReversalCandidates,ROLE_RULES} from '../src/server/research/roleReversal';
const [input,output]=process.argv.slice(2),data=JSON.parse(fs.readFileSync(input,'utf8'));
if(data.instrument!=='EUR/USD')throw Error('EURUSD_REQUIRED');
// Shared OHLC/spec validator; instrument checked explicitly above.
validateHistory({...data,instrument:'XAU/USD'});
const bars=data.candles,existing=new Map<number,Candidate>(),indicators:any[]=[];
for(let i=0;i<bars.length;i++){
 if(i<250){indicators.push(null);continue;}
 const closed=bars.slice(Math.max(0,i-299),i+1),ind=calculateAllIndicators(closed);indicators.push(ind);
 const c=signalIntelligenceService.evaluateResearchCandidate({pair:'EUR/USD',timeframe:'H1',currentPrice:closed.at(-1).close,candles:closed,indicators:ind,smc:analyzeSmcStructures(closed,'H1')});
 if((c.action==='BUY'||c.action==='SELL')&&c.confidence>=75&&c.entryZone&&c.stopLoss&&c.takeProfit1&&c.takeProfit2)existing.set(i,{direction:c.action,confidence:c.confidence,entry:c.action==='BUY'?c.entryZone.min:c.entryZone.max,sl:c.stopLoss,tp1:c.takeProfit1,tp2:c.takeProfit2});
}
const role=roleReversalCandidates(bars,i=>indicators[i]?.atr||0,i=>indicators[i]?.ema50||0);
const start=bars.findIndex((b:any)=>b.time*1000>=data.evaluationStart),split=start+Math.floor((bars.length-start)*0.7);
const modes={EXISTING:(i:number)=>existing.get(i)||null,ROLE_REVERSAL:(i:number)=>role.get(i)||null,COMBINED_ADDITIVE:(i:number)=>{const a=existing.get(i),b=role.get(i);return a&&b&&a.direction!==b.direction?null:a||b||null;},COMBINED_STRICT:(i:number)=>{const a=existing.get(i),b=role.get(i);return a&&b&&a.direction===b.direction?b:null;}};
const costs=[{name:'BASE',spread:0.0001,slippage:0.00002,commissionPerLot:7},{name:'DOUBLE_COST',spread:0.0002,slippage:0.00004,commissionPerLot:14}];
const runs:any[]=[];
for(const cost of costs)for(const [strategy,candidate] of Object.entries(modes)){
 const config={initialEquity:10000,riskPct:0.25,minConfidence:75,pendingBars:24,holdingBars:120,spec:data.spec,costs:{spread:cost.spread,slippage:cost.slippage,commissionPerLot:cost.commissionPerLot}};
 const summarize=(a:number,b:number)=>{const result=replay(bars,candidate,config,a,b);return {...result,returnPct:result.netPnl/100,naturalExits:result.trades.filter(t=>!['TIME_EXIT','END_OF_DATA'].includes(t.reason)).length,timeExits:result.trades.filter(t=>t.reason==='TIME_EXIT').length,endOfDataExits:result.trades.filter(t=>t.reason==='END_OF_DATA').length};};
 runs.push({strategy,cost:cost.name,full:summarize(start,bars.length),development:summarize(start,split),holdout:summarize(split,bars.length)});
}
const report={generatedAt:new Date().toISOString(),dataHash:data.dataHash,source:data.source,instrument:data.instrument,timeframe:'H1',period:{from:new Date(data.evaluationStart).toISOString(),to:new Date(data.requestedTo).toISOString(),holdoutFrom:new Date(bars[split].time*1000).toISOString()},bars:bars.length-start,warmupBars:start,roleRules:ROLE_RULES,costs,initialEquity:10000,riskPct:0.25,brokerSpec:data.spec,ruleSourceHash:crypto.createHash('sha256').update(fs.readFileSync('src/server/research/roleReversal.ts')).update(fs.readFileSync('scripts/eurusd-role-backtest.ts')).update(fs.readFileSync('apps/decision-agent/src/services/signalIntelligenceService.ts')).update(fs.readFileSync('src/server/research/xauReplay.ts')).digest('hex'),limitations:['Offline deterministic engine, not full live scanner: historical Gemini, news vetoes and adaptive learning excluded.','Role-reversal score 75 is an eligibility label, not AI probability or validated Grade A.','24-bar rolling extrema approximate previous S/R; targets use fixed 2R/3.6R, not next opposing zones.','H1 OHLC with conservative stop-first ordering; LIMIT entries only after signal bar, no same-fill-bar target profit.','Costs assumed, not measured. Limit fills assume full liquidity and no price improvement.','One setup at a time; 24-bar pending expiry, 120-bar time exit. Split tickets and BE.','Final positions liquidated at sample end and explicitly counted separately.','70/30 chronological split; no optimization. History calendar completeness unverified.','Drawdown uses bar-close equity, not tick equity. Results do not authorize live deployment.'],liveChanges:false,brokerOrdersTransmitted:0,runs};
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,runs:runs.map(r=>({...r,full:{...r.full,trades:undefined},development:{...r.development,trades:undefined},holdout:{...r.holdout,trades:undefined}}))},null,2));

