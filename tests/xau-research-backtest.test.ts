import {describe,it,expect} from 'vitest';
import {validateHistory,replay,assessResearch,type Bar,type ReplayConfig} from '../src/server/research/xauReplay';
import {signalIntelligenceService} from '../apps/decision-agent/src/services/signalIntelligenceService';
const bar=(i:number,open=100,high=105,low=95,close=100):Bar=>({time:3600*i,open,high,low,close,volume:20});
const cfg:ReplayConfig={initialEquity:10000,riskPct:1,minConfidence:85,pendingBars:2,holdingBars:12,spec:{lotSize:10000,minVolume:100,maxVolume:1000000,stepVolume:100},costs:{spread:0,slippage:0,commissionPerLot:0}};
const candidate={direction:'BUY' as const,entry:100,sl:90,tp1:110,tp2:120,confidence:90};
const run=(bars:Bar[],config=cfg)=>replay(bars,i=>i===0?candidate:null,config,0);
describe('XAU historical replay integrity',()=>{
 it('cannot trade on the signal candle',()=>{const r=run([bar(0,100,130,80,100)]);expect(r.closedTrades).toBe(0);});
 it('does not manufacture a TP win when neither target nor stop is reached',()=>{const r=run([bar(0),bar(1),bar(2,100,104,94,99)]);expect(r.trades[0].reason).toBe('END_OF_DATA');expect(r.netPnl).toBeLessThan(0);});
 it('uses stop-first when stop and target both appear in one bar',()=>{const r=run([bar(0),bar(1,100,125,85,101)]);expect(r.trades[0].reason).toBe('STOP_OR_BE');expect(r.netPnl).toBe(-100);});
 it('expires unfilled limits without counting a win',()=>{const r=run([bar(0),bar(1,110,115,105,110),bar(2,110,115,105,110),bar(3,110,115,105,110)]);expect(r.closedTrades).toBe(0);expect(r.expired).toBe(1);});
 it('refuses split tickets below the real broker minimum',()=>{const r=run([bar(0),bar(1)],{...cfg,initialEquity:100,riskPct:0.25});expect(r.skippedVolume).toBe(1);expect(r.closedTrades).toBe(0);});
 it('charges commission and slippage rather than treating gross returns as net',()=>{const bars=[bar(0),bar(1),bar(2,100,105,85,95)];const base=run(bars),costly=run(bars,{...cfg,costs:{spread:0.3,slippage:0.1,commissionPerLot:7}});expect(costly.trades[0].netPnl).toBeLessThan(0);expect(costly.trades[0].lots).toBeLessThanOrEqual(base.trades[0].lots);});
 it('does not fabricate profit factor when there are no closed trades',()=>{const r=run([bar(0)]);expect(r.profitFactor).toBeNull();expect(assessResearch(r).autoTradeAllowed).toBe(false);});
 it('rejects synthetic, futures-proxy and duplicate histories',()=>{const good={source:'CTRADER_BROKER',instrument:'XAU/USD',synthetic:false,timeframe:'H1',spec:cfg.spec,candles:Array.from({length:251},(_,i)=>bar(i))};expect(()=>validateHistory(good)).not.toThrow();expect(()=>validateHistory({...good,synthetic:true})).toThrow();expect(()=>validateHistory({...good,instrument:'GC=F'})).toThrow();expect(()=>validateHistory({...good,candles:good.candles.map(()=>bar(0))})).toThrow();});
 it('keeps the live gold quarantine even if callers submit a research dataMode',()=>{const r=signalIntelligenceService.evaluateCandidateSetup({pair:'XAU/USD',currentPrice:2000,indicators:{},dataMode:'HISTORICAL_RESEARCH'});expect(r.action).toBe('VETO');expect(r.executable).toBe(false);});
 it('research returns no executable proposal or canonical approval',()=>{const r=signalIntelligenceService.evaluateResearchCandidate({pair:'XAU/USD',currentPrice:2000,indicators:{}});expect(r.executable).toBe(false);expect(r).not.toHaveProperty('tradeProposal');expect(r).not.toHaveProperty('canonicalSignal');});
});
