/** eBird's calendar values are wall times in the legacy server timezone. */
function parts(date: Date, timezone: string) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function offset(date: Date, timezone: string): number {
  const p=parts(date,timezone);
  return Date.UTC(+p.year!,+p.month!-1,+p.day!,+p.hour!,+p.minute!,+p.second!)-Math.floor(date.getTime()/1000)*1000;
}
export function formatTimestamp(date: Date, timezone: string): string {
  const p=parts(date,timezone), minutes=offset(date,timezone)/60000;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${minutes<0?'-':'+'}${String(Math.floor(Math.abs(minutes)/60)).padStart(2,'0')}:${String(Math.abs(minutes)%60).padStart(2,'0')}`;
}
export function observationHour(timestamp: number, timezone: string): number {return +parts(new Date(timestamp),timezone).hour!;}
export function parseObservationDate(value: string, timezone: string): number | null {
  const input=value.replaceAll(' ','T');
  const m=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(input);
  if(!m) return null;
  const [year,month,day,hour,minute,second]=[+m[1]!,+m[2]!,+m[3]!,+(m[4]??0),+(m[5]??0),+(m[6]??0)];
  if(month<1||month>12||day<1||day>31||hour>24||minute>59||second>60) return null;
  let wall=Date.UTC(year,month-1,day,hour,minute,second);
  if(m[7]) {const zone=m[7];if(zone!=='Z'){const z=/^([+-])(\d{2}):?(\d{2})$/.exec(zone)!;wall-=(z[1]==='-'?-1:1)*(+z[2]!*60 + +z[3]!)*60000;}return wall;}
  // Compare both sides of a timezone transition. The legacy contract selects the first fold
  // occurrence and advances nonexistent spring wall times through the gap.
  const offsets=new Set([-86400000,0,86400000].map(delta=>offset(new Date(wall+delta),timezone)));
  const candidates=[...offsets].map(o=>wall-o).sort((a,b)=>a-b);
  const exact=candidates.find(t=>t+offset(new Date(t),timezone)===wall);
  if(exact!==undefined)return exact;
  return candidates.filter(t=>t+offset(new Date(t),timezone)>wall).sort((a,b)=>a-b)[0]??candidates[0]!;
}
