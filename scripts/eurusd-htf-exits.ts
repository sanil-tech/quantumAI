import fs from 'node:fs';
import crypto from 'node:crypto';
import {signalIntelligenceService} from '../apps/decision-agent/src/services/signalIntelligenceService';
import {calculateAllIndicators} from '../src/lib/indicators';
import {analyzeSmcStructures} from '../src/lib/smcEngine';
import {validateHistory,replay,type Candidate} from '../src/server/research/exitComparisonReplay';
import {completedBars,higherExits,HTF_RULES} from '../src/server/research/higherTimeframeExits';
const VARIANTS=['CURRENT_EXITS','H4','DAILY','H4_DAILY'];
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
const start=bars.findIndex((b:any)=>b.time*1000>=data.evaluationStart);
const plusMonths=(m:number)=>{const d=new Date(data.evaluationStart);d.setUTCMonth(d.getUTCMonth()+m);return d.getTime();};
const split=bars.findIndex((b:any)=>b.time*1000>=plusMonths(12)),recent=bars.findIndex((b:any)=>b.time*1000>=plusMonths(18));
if(start<250||split<=start||recent<=split)throw Error('INSUFFICIENT_PERIOD_COVERAGE');
const maps:Record<string,Map<number,Candidate>>={H4:new Map(),DAILY:new Map(),H4_DAILY:new Map()};
const skips:Record<string,Record<string,number>>={H4:{},DAILY:{},H4_DAILY:{}};
const h4=completedBars(bars,4,Infinity),daily=completedBars(bars,24,Infinity);
for(const [i,c] of existing){const now=bars[i].time+3600;
 for(const name of ['H4','DAILY','H4_DAILY'] as const){const result=higherExits(c,h4.filter(b=>b.time+14400<=now),daily.filter(b=>b.time+86400<=now),name);if(result.candidate)maps[name].set(i,result.candidate);if(i>=recent)skips[name][result.reason]=(skips[name][result.reason]||0)+1;}
}
const modes=Object.fromEntries(VARIANTS.map(name=>[name,(i:number)=>name==='CURRENT_EXITS'?existing.get(i)||null:maps[name].get(i)||null]));
const costs=[{name:'BASE',spread:0.0001,slippage:0.00002,commissionPerLot:7},{name:'DOUBLE_COST',spread:0.0002,slippage:0.00004,commissionPerLot:14}];
const runs:any[]=[];
for(const cost of costs)for(const [strategy,candidate] of Object.entries(modes)){
 const config={breakevenMode:'IMMEDIATE' as const,initialEquity:10000,riskPct:0.25,minConfidence:75,pendingBars:24,holdingBars:120,spec:data.spec,costs:{spread:cost.spread,slippage:cost.slippage,commissionPerLot:cost.commissionPerLot}};
 const summarize=(a:number,b:number)=>{const result=replay(bars,candidate,config,a,b);return {...result,returnPct:result.netPnl/100,naturalExits:result.trades.filter(t=>!['TIME_EXIT','END_OF_DATA'].includes(t.reason)).length,timeExits:result.trades.filter(t=>t.reason==='TIME_EXIT').length,endOfDataExits:result.trades.filter(t=>t.reason==='END_OF_DATA').length};};
 runs.push({strategy,cost:cost.name,full:summarize(start,bars.length),development:summarize(start,split),holdout:summarize(split,recent),recentPreviouslyViewed:summarize(recent,bars.length)});
}
const report={generatedAt:new Date().toISOString(),dataHash:data.dataHash,source:data.source,instrument:data.instrument,timeframe:'H1',period:{from:new Date(data.evaluationStart).toISOString(),to:new Date(data.requestedTo).toISOString(),holdoutFrom:new Date(bars[split].time*1000).toISOString()},bars:bars.length-start,warmupBars:start,variants:VARIANTS,costs,initialEquity:10000,riskPct:0.25,brokerSpec:data.spec,ruleSourceHash:crypto.createHash('sha256').update(fs.readFileSync('src/server/research/higherTimeframeExits.ts')).update(fs.readFileSync('scripts/eurusd-htf-exits.ts')).update(fs.readFileSync('apps/decision-agent/src/services/signalIntelligenceService.ts')).update(fs.readFileSync('src/server/research/exitComparisonReplay.ts')).digest('hex'),exitRules:HTF_RULES,recentCandidateDiagnostics:skips,htfBars:{h4:h4.length,daily:daily.length},limitations:['Exploratory reuse of previously inspected history: no untouched validation in this exit study.','Entry signals/prices unchanged, but structural eligibility and different holding times alter which trades the sequential portfolio takes.','Confirmed two-sided pivots over 120 complete H4 or UTC Daily candles; roles flip on closes beyond the zone. Daily candles require 24 H1 bars, excluding partial trading days. Levels fixed at entry signal.','One setup at a time, equal 0.25% risk, split tickets. Lot sizes differ with SL distance.','H1 conservative stop-first ordering, assumed costs, no fill-bar TP profit.','Offline engine excludes news, Gemini and adaptive learning.','Fixed rules before execution; no parameter optimization.'],liveChanges:false,brokerOrdersTransmitted:0,runs};
// Matched isolated experiments: identical eligible signal timestamps and entry prices for all exits.
// Overlapping experiments are NOT an investable portfolio and returns must not be compounded.
const paired:any[]=[];
for(const name of ['H4','DAILY','H4_DAILY'])for(const [i,c] of maps[name]){if(i<recent)continue;const outcomes:any={variant:name,signalTime:bars[i].time};
 for(const key of ['CURRENT_EXITS',name]){const candidate=key==='CURRENT_EXITS'?existing.get(i)!:c;const result=replay(bars,j=>j===i?candidate:null,{initialEquity:10000,riskPct:0.25,minConfidence:75,pendingBars:24,holdingBars:120,spec:data.spec,costs:{spread:0.0001,slippage:0.00002,commissionPerLot:7}},i,Math.min(bars.length,i+146));outcomes[key]={closedTrades:result.closedTrades,pnl:result.netPnl,reason:result.trades[0]?.reason||'NO_FILL'};}
 paired.push(outcomes);
}
Object.assign(report,{pairedRecent:paired,autoTradeApproved:false,splitDates:{developmentEnd:new Date(plusMonths(12)).toISOString(),validationEnd:new Date(plusMonths(18)).toISOString()}});
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,runs:runs.map(r=>({...r,full:{...r.full,trades:undefined},development:{...r.development,trades:undefined},holdout:{...r.holdout,trades:undefined},recentPreviouslyViewed:{...r.recentPreviouslyViewed,trades:undefined}}))},null,2));

