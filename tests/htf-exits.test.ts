import {it,expect} from 'vitest';
import {completedBars,swingZones,higherExits} from '../src/server/research/higherTimeframeExits';
const b=(i:number)=>({time:i*3600,open:100,high:101,low:99,close:100,volume:1});
it('excludes current H4 candle',()=>expect(completedBars(Array.from({length:8},(_,i)=>b(i)),4,7*3600)).toHaveLength(1));
it('rejects partial Daily candle',()=>expect(completedBars(Array.from({length:23},(_,i)=>b(i)),24,86400)).toHaveLength(0));
it('requires two closed bars to confirm swing',()=>{const a=Array.from({length:25},(_,i)=>b(i));a[24].high=110;expect(swingZones(a)?.levels).toHaveLength(0);});
it('turns broken resistance into support only after a close beyond it',()=>{const a=Array.from({length:25},(_,i)=>b(i));a[5].high=105;for(let k=20;k<25;k++)a[k]={...b(k),open:106,high:107,low:105.5,close:106};expect(swingZones(a)?.levels.find(l=>l.price===105)?.role).toBe('SUPPORT');});
it('wick alone does not flip resistance',()=>{const a=Array.from({length:25},(_,i)=>b(i));a[5].high=105;a[20].high=107;expect(swingZones(a)?.levels.find(l=>l.price===105)?.role).toBe('RESISTANCE');});
it('reports missing history instead of guessing',()=>expect(higherExits({direction:'BUY',entry:100,sl:99,tp1:102,tp2:104,confidence:80},[],[],'H4').reason).toBe('INSUFFICIENT_HTF_HISTORY'));

