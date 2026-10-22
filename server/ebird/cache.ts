import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Dependencies, EbirdConfig } from '../contracts.js';
import { legacyInt, isTruthy } from '../http/query.js';
import { isCollection } from './aggregate.js';
export class EbirdError extends Error {constructor(public status:number,public body:Record<string,unknown>){super(String(body.error));}}
/** Cache-key encoding omits integral .0, but retains negative zero and .0 in exponents. */
export function cacheKeyJson(value: unknown): string {
  if(typeof value==='number'){
    if(Object.is(value,-0))return '-0';
    if(value!==0&&Math.abs(value)<0.0001){let s=value.toExponential();s=s.replace(/^(\-?\d+)(e)/,'$1.0$2');return s;}
    return JSON.stringify(value);
  }
  if(Array.isArray(value))return '['+value.map(cacheKeyJson).join(',')+']';
  return JSON.stringify(value).replaceAll('/','\\/');
}
export function roundCoordinate(value:number):number {const abs=Math.abs(value)*100000;const rounded=Math.floor(abs+0.5+Number.EPSILON*abs);return (value<0||Object.is(value,-0)?-1:1)*rounded/100000;}
export function cacheFilename(kind:'observations'|'hotspots',config:EbirdConfig,mode='geo',regions:string[]=[]):string {
  let prefix:string,key:unknown;
  if(kind==='hotspots'){prefix='ebird-hotspots-';key=[roundCoordinate(Number(config.lat)),roundCoordinate(Number(config.lng)),legacyInt(config.dist)];}
  else if(mode==='hotspot'){prefix='ebird-hotspots-batch-';key=[regions,legacyInt(config.back??30)];}
  else {prefix='ebird-cache-';key=[mode,regions,roundCoordinate(Number(config.lat)),roundCoordinate(Number(config.lng)),legacyInt(config.dist),legacyInt(config.back??30)];}
  return prefix+createHash('md5').update(cacheKeyJson(key)).digest('hex')+'.json';
}
async function readCache(filename:string):Promise<Record<string,unknown>|null>{try{const data:unknown=JSON.parse(await readFile(filename,'utf8'));return isCollection(data)?data as Record<string,unknown>:null;}catch{return null;}}
async function writeCache(filename:string,value:unknown){const temp=filename+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(value));await rename(temp,filename);}catch{await unlink(temp).catch(()=>{});}}
export function queryString(values:Record<string,unknown>):string {return new URLSearchParams(Object.entries(values).map(([k,v])=>[k,String(v)])).toString();}
export async function fetchJson(deps:Dependencies,url:string,token:string,failure:string,invalid:string):Promise<unknown[]|Record<string,unknown>>{
  let result;try{result=await deps.http(url,{headers:{'X-eBirdApiToken':token,Accept:'application/json'},timeoutMs:20000});}catch{throw new EbirdError(502,{error:failure,status:0});}
  if(result.status>=400)throw new EbirdError(502,{error:failure,status:result.status});
  let parsed:unknown;try{parsed=JSON.parse(result.body.toString('utf8'));}catch{throw new EbirdError(502,{error:invalid});}
  if(!isCollection(parsed))throw new EbirdError(502,{error:invalid});return parsed;
}
export async function fetchCached(deps:Dependencies,config:EbirdConfig,kind:'observations'|'hotspots',mode:string,regions:string[],refresh:boolean){
  const field=kind==='hotspots'?'hotspots':'obs',filename=path.join(deps.config.dataDir,cacheFilename(kind,config,mode,regions)),cached=await readCache(filename);
  if(!refresh&&cached&&cached.fetched_at!=null&&isCollection(cached[field])&&Math.floor(deps.now().getTime()/1000)-legacyInt(cached.fetched_at)<60)return cached[field];
  const back=Math.max(1,Math.min(30,legacyInt(config.back??30)));
  const url=kind==='hotspots'?'https://api.ebird.org/v2/ref/hotspot/geo?'+queryString({lat:config.lat,lng:config.lng,dist:config.dist,fmt:'json'}):mode==='hotspot'?'https://api.ebird.org/v2/data/obs/US/recent?'+queryString({back,r:regions.join(',')}):'https://api.ebird.org/v2/data/obs/geo/recent?'+queryString({lat:config.lat,lng:config.lng,dist:config.dist,sort:'date',hotspot:isTruthy(config.hotspot)?'true':'false',back});
  let value;try{value=await fetchJson(deps,url,config.token,kind==='hotspots'?'eBird hotspot fetch failed':'eBird fetch failed',kind==='hotspots'?'eBird returned invalid hotspot data':'eBird returned invalid JSON');}catch(error){if(error instanceof EbirdError&&'status' in error.body&&cached&&isCollection(cached[field]))return cached[field];throw error;}
  await writeCache(filename,{fetched_at:Math.floor(deps.now().getTime()/1000),[field]:value});return value;
}
