import {Candidate,Bar} from './xauReplay';
import {IndicatorValues} from '../../types';
export const VARIANTS=['BASELINE','TREND_ALIGNMENT','MOMENTUM_CONFIRMATION','NO_OVEREXTENSION','EMA_PULLBACK'] as const;
export function indicatorCandidate(variant:string,base:Candidate|null,b:Bar,previous:Bar,i:IndicatorValues):Candidate|null {
 const buy=base?.direction==='BUY';
 const trend=(long:boolean)=>long ? i.ema50>i.ema200&&i.superTrend.trend==='BULLISH'&&i.adx.plusDI>i.adx.minusDI : i.ema50<i.ema200&&i.superTrend.trend==='BEARISH'&&i.adx.minusDI>i.adx.plusDI;
 if(variant==='BASELINE')return base;
 if(variant==='TREND_ALIGNMENT')return base&&i.adx.adx>=25&&trend(buy)?base:null;
 if(variant==='MOMENTUM_CONFIRMATION')return base&&(buy?i.rsi>=50&&i.rsi<=65&&i.macd.histogram>0:i.rsi>=35&&i.rsi<=50&&i.macd.histogram<0)?base:null;
 if(variant==='NO_OVEREXTENSION')return base&&i.atr>0&&Math.abs(b.close-i.ema20)<=i.atr&&i.adx.adx>=20&&(buy?i.rsi<70:i.rsi>30)?base:null;
 if(variant!=='EMA_PULLBACK'||!(i.atr>0)||i.adx.adx<25)return null;
 const long=trend(true)&&b.low<=i.ema20&&b.close>i.ema20&&b.close>b.open&&i.rsi>=50&&i.rsi<=65;
 const short=trend(false)&&b.high>=i.ema20&&b.close<i.ema20&&b.close<b.open&&i.rsi>=35&&i.rsi<=50;
 if(!long&&!short)return null;
 const sign=long?1:-1,entry=i.ema20,sl=long?Math.min(b.low,previous.low,entry)-0.5*i.atr:Math.max(b.high,previous.high,entry)+0.5*i.atr;
 const risk=Math.abs(entry-sl);return {direction:long?'BUY':'SELL',entry,sl,tp1:entry+sign*2*risk,tp2:entry+sign*3.6*risk,confidence:75};
}
