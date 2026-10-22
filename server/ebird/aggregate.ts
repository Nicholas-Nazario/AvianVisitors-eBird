import { legacyInt, isNumeric, legacyString, trimAscii, isTruthy } from '../http/query.js';
import { observationHour, parseObservationDate } from './time.js';
export type Row = Record<string, unknown>;
export function isCollection(value: unknown): value is Row | unknown[] {return value!==null&&typeof value==='object';}
export function rows(value: unknown): Row[] {return isCollection(value)?Object.values(value).filter(isCollection) as Row[]:[];}
const str=(value:unknown)=>legacyString(value);
const count=(row:Row)=>row.howMany==null?1:Math.max(1,legacyInt(row.howMany));
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
export function filterHours(obs:Row[],hours:number,now:Date,timezone:string):Row[]{
  const cutoff=Math.floor(now.getTime()/1000)*1000-hours*3600000;
  return obs.filter(row=>{const t=parseObservationDate(str(row.obsDt),timezone);return t!==null&&t>=cutoff;});
}
export function aggregateSpecies(obs:Row[]) {
  const by=new Map<string,{sci:string;com:string;speciesCode:string;n:number;last_observed:string;last_locName:unknown;first_observed:string;best_conf:null;top_file:null;top_at:string}>();
  for(const row of obs){
    const sci=trimAscii(str(row.sciName));if(!sci)continue;
    const com=trimAscii(str(row.comName??sci)),dt=str(row.obsDt);
    let item=by.get(sci);
    if(!item){item={sci,com,speciesCode:trimAscii(str(row.speciesCode)),n:0,last_observed:dt,last_locName:row.locName??null,first_observed:dt,best_conf:null,top_file:null,top_at:dt};by.set(sci,item);}
    item.n+=count(row);if(isTruthy(row.speciesCode))item.speciesCode=trimAscii(str(row.speciesCode));if(com)item.com=com;
    if(dt&&(!item.last_observed||cmp(dt,item.last_observed)>0)){item.last_observed=dt;item.last_locName=row.locName??null;item.top_at=dt;}
    if(dt&&(!item.first_observed||cmp(dt,item.first_observed)<0))item.first_observed=dt;
  }
  return [...by.values()].sort((a,b)=>cmp(b.last_observed,a.last_observed));
}
export function distanceKm(latA:number,lngA:number,latB:number,lngB:number){
  const rad=(v:number)=>v*Math.PI/180,dLat=rad(latB-latA),dLng=rad(lngB-lngA);
  const a=Math.sin(dLat/2)**2+Math.cos(rad(latA))*Math.cos(rad(latB))*Math.sin(dLng/2)**2;
  return 6371.0088*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
}
export function aggregateHotspots(obs:Row[],originLat:number,originLng:number){
  type Species={sci:string;com:string;n:number;last_observed:string};
  type Hotspot={locId:string|null;locName:string;lat:number|null;lng:number|null;n:number;last_observed:string;species:Map<string,Species>};
  const by=new Map<string,Hotspot>();
  for(const row of obs){
    const locId=trimAscii(str(row.locId)),locName=trimAscii(str(row.locName)),sci=trimAscii(str(row.sciName));
    if((!locId&&!locName)||!sci)continue;
    const key=locId||locName,com=trimAscii(str(row.comName??sci)),dt=str(row.obsDt),n=count(row);
    const lat=isNumeric(row.lat)?Number(row.lat):null,lng=isNumeric(row.lng)?Number(row.lng):null;
    let h=by.get(key);if(!h){h={locId:locId||null,locName:locName||key,lat,lng,n:0,last_observed:dt,species:new Map()};by.set(key,h);}
    h.n+=n;if(locName)h.locName=locName;if(h.lat===null&&lat!==null)h.lat=lat;if(h.lng===null&&lng!==null)h.lng=lng;
    if(dt&&(!h.last_observed||cmp(dt,h.last_observed)>0))h.last_observed=dt;
    let s=h.species.get(sci);if(!s){s={sci,com,n:0,last_observed:dt};h.species.set(sci,s);}s.n+=n;if(com)s.com=com;
    if(dt&&(!s.last_observed||cmp(dt,s.last_observed)>0))s.last_observed=dt;
  }
  return [...by.values()].map(h=>({...h,species:[...h.species.values()].sort((a,b)=>b.n-a.n||cmp(b.last_observed,a.last_observed)),distance_km:h.lat!==null&&h.lng!==null?distanceKm(originLat,originLng,h.lat,h.lng):null})).sort((a,b)=>a.distance_km===null&&b.distance_km!==null?1:a.distance_km!==null&&b.distance_km===null?-1:(a.distance_km??0)-(b.distance_km??0)||cmp(b.last_observed,a.last_observed));
}
export function buildTimeseries(obs:Row[],days:number,now:Date,timezone:string){
  const dates=new Map<string,{observations:number;species:Set<string>}>(),hours=Array<number>(24).fill(0);
  for(const row of filterHours(obs,days*24,now,timezone)){
    const dt=str(row.obsDt),ts=parseObservationDate(dt,timezone);if(ts===null)continue;
    const date=dt.slice(0,10),hour=observationHour(ts,timezone),n=count(row),sci=str(row.sciName);
    let d=dates.get(date);if(!d){d={observations:0,species:new Set()};dates.set(date,d);}d.observations+=n;if(sci)d.species.add(sci);hours[hour]+=n;
  }
  return {days,daily:[...dates].sort(([a],[b])=>cmp(a,b)).map(([date,d])=>({date,observations:d.observations,species:d.species.size})),by_hour:hours.flatMap((observations,hour)=>observations>0?[{hour,observations}]:[])};
}
