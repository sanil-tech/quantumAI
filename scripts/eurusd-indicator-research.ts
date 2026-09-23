import fs from 'node:fs';
import crypto from 'node:crypto';
import {signalIntelligenceService} from '../apps/decision-agent/src/services/signalIntelligenceService';
import {calculateAllIndicators} from '../src/lib/indicators';
import {analyzeSmcStructures} from '../src/lib/smcEngine';
import {validateHistory,replay,type Candidate} from '../src/server/research/xauReplay';
import {indicatorCandidate,VARIANTS} from '../src/server/research/indicatorCandidates';
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
const modes=Object.fromEntries(VARIANTS.map(name=>[name,(i:number)=>indicatorCandidate(name,existing.get(i)||null,bars[i],bars[i-1],indicators[i])]));
const costs=[{name:'BASE',spread:0.0001,slippage:0.00002,commissionPerLot:7},{name:'DOUBLE_COST',spread:0.0002,slippage:0.00004,commissionPerLot:14}];
const runs:any[]=[];
for(const cost of costs)for(const [strategy,candidate] of Object.entries(modes)){
 const config={initialEquity:10000,riskPct:0.25,minConfidence:75,pendingBars:24,holdingBars:120,spec:data.spec,costs:{spread:cost.spread,slippage:cost.slippage,commissionPerLot:cost.commissionPerLot}};
 const summarize=(a:number,b:number)=>{const result=replay(bars,candidate,config,a,b);return {...result,returnPct:result.netPnl/100,naturalExits:result.trades.filter(t=>!['TIME_EXIT','END_OF_DATA'].includes(t.reason)).length,timeExits:result.trades.filter(t=>t.reason==='TIME_EXIT').length,endOfDataExits:result.trades.filter(t=>t.reason==='END_OF_DATA').length};};
 runs.push({strategy,cost:cost.name,full:summarize(start,bars.length),development:summarize(start,split),holdout:summarize(split,recent),recentPreviouslyViewed:summarize(recent,bars.length)});
}
const report={generatedAt:new Date().toISOString(),dataHash:data.dataHash,source:data.source,instrument:data.instrument,timeframe:'H1',period:{from:new Date(data.evaluationStart).toISOString(),to:new Date(data.requestedTo).toISOString(),holdoutFrom:new Date(bars[split].time*1000).toISOString()},bars:bars.length-start,warmupBars:start,variants:VARIANTS,costs,initialEquity:10000,riskPct:0.25,brokerSpec:data.spec,ruleSourceHash:crypto.createHash('sha256').update(fs.readFileSync('src/server/research/indicatorCandidates.ts')).update(fs.readFileSync('scripts/eurusd-indicator-research.ts')).update(fs.readFileSync('apps/decision-agent/src/services/signalIntelligenceService.ts')).update(fs.readFileSync('src/server/research/xauReplay.ts')).digest('hex'),limitations:['Offline deterministic candidate engine: not full live scanner, Gemini, news or adaptive learning.','Five fixed variants, no parameter optimization. Rank on first-year development only.','Next six months are chronological validation; last six months previously inspected and not an untouched holdout.','Costs assumed. H1 stop-first ordering and no same-fill-bar TP may materially affect results.','2026 broker specifications applied historically. Calendar completeness unverified.','One pending/open setup, split tickets, 24-bar expiry, 120-bar holding cap. No execution or profitability guarantee.','EMA pullback score 75 is an eligibility label, not calibrated probability.'],liveChanges:false,brokerOrdersTransmitted:0,runs};
const ranked=runs.filter(r=>r.cost==='BASE'&&r.development.closedTrades>=30).sort((a,b)=>b.development.expectancy-a.development.expectancy);
const selected=ranked[0]?.strategy||null;
Object.assign(report,{selection:{rule:'Highest development net expectancy among variants with at least 30 development trades; selection ignores validation results',selected,autoTradeApproved:false},splitDates:{developmentEnd:new Date(plusMonths(12)).toISOString(),validationEnd:new Date(plusMonths(18)).toISOString()}});
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,runs:runs.map(r=>({...r,full:{...r.full,trades:undefined},development:{...r.development,trades:undefined},holdout:{...r.holdout,trades:undefined},recentPreviouslyViewed:{...r.recentPreviouslyViewed,trades:undefined}}))},null,2));

