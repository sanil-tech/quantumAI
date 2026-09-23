import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {signalIntelligenceService} from '../apps/decision-agent/src/services/signalIntelligenceService';
import {calculateAllIndicators} from '../src/lib/indicators';
import {analyzeSmcStructures} from '../src/lib/smcEngine';
import {validateHistory,replay,assessResearch,type Candidate} from '../src/server/research/xauReplay';
const input=process.argv[2],out=process.argv[3];
if(!input||!out)throw new Error('Usage: replay <broker-history.json> <report.json>');
const data=JSON.parse(fs.readFileSync(input,'utf8'));validateHistory(data);
const candles=data.candles,split=Math.floor(candles.length*0.7),candidates=new Map<number,Candidate>();
for(let i=250;i<candles.length;i++){
 const closed=candles.slice(Math.max(0,i-299),i+1);
 const result=signalIntelligenceService.evaluateResearchCandidate({pair:'XAU/USD',timeframe:'H1',currentPrice:closed.at(-1)!.close,candles:closed,indicators:calculateAllIndicators(closed),smc:analyzeSmcStructures(closed,'H1')});
 if((result.action==='BUY'||result.action==='SELL')&&result.entryZone&&result.stopLoss&&result.takeProfit1&&result.takeProfit2)candidates.set(i,{direction:result.action,confidence:result.confidence,entry:result.action==='BUY'?result.entryZone.min:result.entryZone.max,sl:result.stopLoss,tp1:result.takeProfit1,tp2:result.takeProfit2});
}
const config={initialEquity:10000,riskPct:0.25,minConfidence:85,pendingBars:24,holdingBars:120,spec:data.spec};
const scenarios=[{name:'BASE_ASSUMED',costs:{spread:0.3,slippage:0.1,commissionPerLot:7}},{name:'DOUBLE_COST_STRESS',costs:{spread:0.6,slippage:0.2,commissionPerLot:14}}];
const runs=scenarios.map(s=>({name:s.name,assumedCosts:s.costs,development:replay(candles,i=>candidates.get(i)||null,{...config,costs:s.costs},250,split),outOfSample:replay(candles,i=>candidates.get(i)||null,{...config,costs:s.costs},split,candles.length)}));
const report={generatedAt:new Date().toISOString(),instrument:'XAU/USD',timeframe:'H1',dataSource:data.source,brokerSymbol:data.brokerSymbol,candleCount:candles.length,dataHash:crypto.createHash('sha256').update(JSON.stringify(candles)).digest('hex'),strategySourceHash:crypto.createHash('sha256').update(fs.readFileSync('apps/decision-agent/src/services/signalIntelligenceService.ts')).update(fs.readFileSync('src/server/services/pairDailyRangeService.ts')).digest('hex'),period:{from:new Date(candles[0].time*1000).toISOString(),to:new Date(candles.at(-1)!.time*1000).toISOString(),holdoutFrom:new Date(candles[split].time*1000).toISOString()},configuration:config,actionableCandidates:candidates.size,qualification:assessResearch(runs[0].outOfSample),brokerOrdersTransmitted:0,limitations:['Deterministic candidate engine only: not the complete autonomous scanner or Gemini pipeline.','Historical learning, news blackouts and second opinions are not replayed.','Broker bid OHLC interpretation; spread/slippage/commission are declared assumptions, not measured historical costs.','Stop-first OHLC ambiguity; same-fill-bar target profits are disallowed.','Drawdown uses realized PnL and bar-close marks, not tick-level equity.','Only H1 tested. No parameter optimization was performed.','Unknown missing sessions are not silently synthesized. Market-calendar completeness remains unverified.','Live XAU quarantine is unchanged.'],runs};
if(runs[1].outOfSample.expectancy===null||runs[1].outOfSample.expectancy<=0)report.qualification.blockers.push('STRESS_COST_EDGE_NOT_DEMONSTRATED');
fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,runs:runs.map(r=>({...r,development:{...r.development,trades:undefined},outOfSample:{...r.outOfSample,trades:undefined}}))},null,2));
