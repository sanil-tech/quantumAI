import {describe,it,expect,vi,beforeEach} from 'vitest';
const disk=vi.hoisted(()=>new Map<string,string>());
vi.mock('fs',()=>({existsSync:(p:string)=>disk.has(p),readFileSync:(p:string)=>disk.get(p),writeFileSync:(p:string,s:string)=>disk.set(p,s),mkdirSync:vi.fn()}));
import {claimEntryAlert,ENTRY_ALERT_COOLDOWN_MS} from '../src/server/services/tradeAlertDedup';
const setup={pair:'EUR/JPY',direction:'BUY',timeframe:'H4'};
beforeEach(()=>disk.clear());
describe('Persistent Telegram entry anti-spam',()=>{
 it('suppresses new order IDs and small repricing for the same setup',()=>{expect(claimEntryAlert({...setup,entryPrice:180.432,brokerOrderId:'1'} as any,'ledger',1000)).toBe(true);expect(claimEntryAlert({...setup,entryPrice:180.447,brokerOrderId:'2'} as any,'ledger',121000)).toBe(false);});
 it('reads persisted state, including after service restart',()=>{disk.set('ledger',JSON.stringify({'EURJPY:BUY:H4':1000}));expect(claimEntryAlert(setup,'ledger',121000)).toBe(false);});
 it('allows a later entry after 30 minutes',()=>{claimEntryAlert(setup,'ledger',1000);expect(claimEntryAlert(setup,'ledger',1000+ENTRY_ALERT_COOLDOWN_MS)).toBe(true);});
 it('does not suppress another pair or opposite direction',()=>{claimEntryAlert(setup,'ledger',1000);expect(claimEntryAlert({...setup,direction:'SELL'},'ledger',1001)).toBe(true);expect(claimEntryAlert({...setup,pair:'GBP/JPY'},'ledger',1001)).toBe(true);});
 it('fails closed if dedup storage is malformed',()=>{disk.set('ledger','broken');expect(()=>claimEntryAlert(setup,'ledger',1000)).toThrow();});
});
