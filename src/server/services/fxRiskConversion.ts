export function quoteUnitsPerUsd(quote:string,tick:{bid:number;ask:number;timestamp:number}|null,now=Date.now()) {
 if(quote==='USD')return 1;
 if(!tick||!Number.isFinite(tick.timestamp)||now-tick.timestamp>15000||tick.timestamp>now+1000||!(tick.bid>0)||!(tick.ask>=tick.bid))throw Error('RISK_CONVERSION_QUOTE_UNAVAILABLE');
 if(['GBP','AUD','NZD','EUR'].includes(quote))return 1/tick.ask;
 if(['JPY','CHF','CAD'].includes(quote))return tick.bid;
 throw Error('UNSUPPORTED_RISK_CONVERSION');
}
