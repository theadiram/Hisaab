// Calendar dates arrive as YYYY-MM-DD in the observer's own time zone. Comparing them
// with a UTC instant rejects today's date in India between midnight and 05:30.
/** Latest date that is already "today" somewhere (UTC+14), for server-side future checks. */
export function notFutureDate(value:string,now=Date.now()){return value<=new Date(now+14*3600000).toISOString().slice(0,10);}
/** Today's date in the browser's time zone, for date input `max` attributes. */
export function localToday(now=new Date()){return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);}
