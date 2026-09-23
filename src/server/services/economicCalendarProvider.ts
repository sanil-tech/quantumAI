import {EconomicEvent} from '../../types';
import {EconomicContextService} from './economicContextService';
export const CALENDAR_URL='https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const REFRESH_MS=60*60*1000,MAX_AGE_MS=6*60*60*1000;
export function parseCalendar(raw:unknown,now=Date.now()):EconomicEvent[]{
 if(!Array.isArray(raw)||!raw.length)throw Error('CALENDAR_EMPTY');
 const events:EconomicEvent[]=[];
 for(const row of raw){
  if(!row||typeof row.title!=='string'||typeof row.country!=='string'||typeof row.date!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(row.date))throw Error('CALENDAR_SCHEMA_INVALID');
  const timestamp=Date.parse(row.date);if(!Number.isFinite(timestamp))throw Error('CALENDAR_DATE_INVALID');
  if(!['High','Medium','Low','Holiday'].includes(row.impact))throw Error('CALENDAR_IMPACT_INVALID');
  if(row.impact==='Holiday')continue;
  if(!['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF','CNY'].includes(row.country))continue;
  events.push({id:row.country+':'+timestamp+':'+row.title,title:row.title,currency:row.country,impact:row.impact.toUpperCase(),timestamp,date:new Date(timestamp).toISOString().slice(0,10),time:new Date(timestamp).toISOString().slice(11,16)+' UTC',forecast:typeof row.forecast==='string'?row.forecast:undefined,previous:typeof row.previous==='string'?row.previous:undefined,warningText:'Schedule only. Actual results unavailable.',status:timestamp>now?'UPCOMING':'RELEASED'});
 }
 if(!events.length)throw Error('CALENDAR_NO_SUPPORTED_EVENTS');
 const monday=new Date(now);monday.setUTCHours(0,0,0,0);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
 const start=monday.getTime(),end=start+7*86400000;
 if(!events.some(e=>e.timestamp>=start&&e.timestamp<end)||events.some(e=>e.timestamp<start-86400000||e.timestamp>end+86400000))throw Error('CALENDAR_WEEK_MISMATCH');
 return events.sort((a,b)=>a.timestamp-b.timestamp);
}
export class EconomicCalendarProvider {
 private static instance:EconomicCalendarProvider;
 private events:EconomicEvent[]=[];private fetchedAt=0;private attemptedAt=0;private pending:Promise<void>|null=null;private error:string|null=null;
 static getInstance(){return this.instance||(this.instance=new EconomicCalendarProvider());}
 public async refresh():Promise<void>{
  if(this.pending)return this.pending;
  if(Date.now()-this.attemptedAt<REFRESH_MS)return;
  this.attemptedAt=Date.now();
  this.pending=(async()=>{try{
   const response=await fetch(CALENDAR_URL,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('CALENDAR_HTTP_'+response.status);
   this.events=parseCalendar(await response.json());this.fetchedAt=Date.now();this.error=null;
  }catch(err){this.error=err instanceof Error?err.message:'CALENDAR_FETCH_FAILED';}finally{this.syncContext();}})();
  try{await this.pending;}finally{this.pending=null;}
 }
  private syncContext(){
   if(!this.fetchedAt||Date.now()-this.fetchedAt>MAX_AGE_MS){EconomicContextService.setCalendarState('CALENDAR_UNAVAILABLE');return;}
   try{parseCalendar(this.events.map(e=>({title:e.title,country:e.currency,date:new Date(e.timestamp).toISOString(),impact:e.impact[0]+e.impact.slice(1).toLowerCase()})));}catch{EconomicContextService.setCalendarState('CALENDAR_UNAVAILABLE');return;}
   EconomicContextService.setEvents(this.events.map(e=>({eventId:e.id,source:CALENDAR_URL,timestampUtc:new Date(e.timestamp).toISOString(),currency:e.currency as any,country:e.currency,title:e.title,impact:e.impact,sourceTimestamp:new Date(this.fetchedAt).toISOString(),retrievedAt:new Date(this.fetchedAt).toISOString(),status:e.timestamp>Date.now()?'SCHEDULED':'COMPLETED'})));
  }
 public getWeeklyEvents():EconomicEvent[]{void this.refresh();this.syncContext();return EconomicContextService.getCalendarState()==='CALENDAR_READY'?this.events:[];}
 public getHealth(){this.syncContext();return {provider:'FOREX_FACTORY_PUBLIC_SCHEDULE',sourceUrl:CALENDAR_URL,status:EconomicContextService.getCalendarState(),fetchedAt:this.fetchedAt||null,lastError:this.error,actualResultsAvailable:false,historicalSurprisesAvailable:false,message:'Verified schedule only; actual releases and historical consensus are not connected.'};}
}
export const economicCalendarProvider=EconomicCalendarProvider.getInstance();
