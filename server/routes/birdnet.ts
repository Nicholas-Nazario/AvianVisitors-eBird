import { Router } from 'express';
import type { Dependencies } from '../contracts.js';
import { phpInt, phpNumeric, phpString, phpTrim, phpValues, type LegacyQuery } from '../http/query.js';
import { aggregateHotspots, aggregateSpecies, buildTimeseries, filterHours, rows } from '../ebird/aggregate.js';
import { EbirdError, fetchCached, fetchJson, queryString } from '../ebird/cache.js';
import { formatTimestamp } from '../ebird/time.js';
const clamp=(value:unknown,fallback:number,min:number,max:number)=>Math.max(min,Math.min(max,phpInt(value??fallback)));
export function createBirdnetRouter(deps:Dependencies):Router {
  const router=Router();
  router.all('/',async(req,res,next)=>{
    res.set('Content-Type','application/json; charset=utf-8').set('Cache-Control','public, max-age=30');
    try{
      const q=req.query as LegacyQuery,config={...deps.config.ebird};
      if(config.token==='')throw new EbirdError(503,{error:'eBird API token missing — set avian/data/ebird.json or EBIRD_API_KEY'});
      if(phpNumeric(q.lat))config.lat=Math.max(-90,Math.min(90,Number(q.lat)));
      if(phpNumeric(q.lng))config.lng=Math.max(-180,Math.min(180,Number(q.lng)));
      if(phpNumeric(q.dist))config.dist=clamp(q.dist,3,1,50);
      const mode=q.mode==='hotspot'?'hotspot':'geo',action=q.action??'dashboard',raw=q.regionCode??[],regions:string[]=[];
      for(const value of typeof raw==='object'?phpValues(raw):[raw]){const code=phpTrim(phpString(value));if(!code||!/^[A-Za-z0-9-]+$/.test(code))throw new EbirdError(400,{error:'invalid regionCode'});if(!regions.includes(code))regions.push(code);}
      if(mode==='hotspot'&&!regions.length&&action!=='hotspots'&&action!=='nearby-species')throw new EbirdError(400,{error:'at least one regionCode is required for hotspot mode'});
      if(regions.length>10)throw new EbirdError(400,{error:'at most ten regionCode values are allowed'});
      const refresh=q.refresh==='1',timezone=deps.config.timezone;
      if(action==='nearby-species'){
        const speciesCode=phpTrim(phpString(q.speciesCode));if(!speciesCode||!/^[A-Za-z0-9-]+$/.test(speciesCode))throw new EbirdError(400,{error:'valid speciesCode= required'});
        const back=clamp(q.back,7,1,30),dist=clamp(q.dist,25,1,50),maxResults=clamp(q.maxResults,100,1,10000);
        res.set('Cache-Control','no-store');
        const data=await fetchJson(deps,'https://api.ebird.org/v2/data/obs/geo/recent/'+encodeURIComponent(speciesCode)+'?'+queryString({lat:config.lat,lng:config.lng,back,dist,maxResults,hotspot:'true'}),config.token,'eBird nearby species fetch failed','eBird returned invalid nearby species data');
        const observations=rows(Object.values(data).slice(0,maxResults)).map(row=>({speciesCode:phpTrim(phpString(row.speciesCode??speciesCode)),locId:phpTrim(phpString(row.locId)),locName:phpTrim(phpString(row.locName)),obsDt:phpTrim(phpString(row.obsDt)),howMany:row.howMany==null?null:Math.max(1,phpInt(row.howMany))})).sort((a,b)=>a.obsDt<b.obsDt?1:a.obsDt>b.obsDt?-1:0);
        res.json({speciesCode,observations,as_of:formatTimestamp(deps.now(),timezone),source:'ebird'});return;
      }
      if(action==='hotspots'){res.json({hotspots:await fetchCached(deps,config,'hotspots',mode,regions,refresh),as_of:formatTimestamp(deps.now(),timezone)});return;}
      const all=rows(await fetchCached(deps,config,'observations',mode,regions,refresh));
      if(action==='dashboard'){
        const hours=clamp(q.hours,24,1,1000000),days=clamp(q.days,30,1,90),now=deps.now(),as_of=formatTimestamp(now,timezone),window=filterHours(all,Math.min(hours,720),now,timezone);
        res.json({recent:{hours,species:aggregateSpecies(window),hotspots:aggregateHotspots(window,Number(config.lat),Number(config.lng)),as_of,source:'ebird'},timeseries:{...buildTimeseries(all,days,now,timezone),as_of,source:'ebird'},as_of,source:'ebird'});return;
      }
      if(action==='species'){
        const sci=q.sci??'';if(sci==='')throw new EbirdError(400,{error:'sci= required'});
        const mine=all.filter(r=>(r.sciName??'')===sci).sort((a,b)=>phpString(a.obsDt)<phpString(b.obsDt)?1:phpString(a.obsDt)>phpString(b.obsDt)?-1:0);
        const observations=mine.slice(0,500).map(r=>{const dt=phpString(r.obsDt),i=dt.indexOf(' ');return {d:i<0?dt:dt.slice(0,i),t:i<0?'00:00':dt.slice(i+1),file:null,conf:null,howMany:r.howMany==null?1:phpInt(r.howMany),locName:r.locName??null};});
        const agg=aggregateSpecies(mine)[0],summary=agg?{com:agg.com,speciesCode:agg.speciesCode,total:agg.n,first_observed:agg.first_observed,last_observed:agg.last_observed,last_locName:agg.last_locName,best_conf:null}:null;
        res.json({sci,summary,observations,source:'ebird'});return;
      }
      throw new EbirdError(404,{error:'unknown action'});
    }catch(error){if(error instanceof EbirdError){res.status(error.status).json(error.body);return;}next(error);}
  });
  return router;
}
