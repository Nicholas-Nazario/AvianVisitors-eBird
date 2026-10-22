import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../../server/config.js';
import { parseQuery } from '../../server/http/query.js';
import { createBirdnetRouter } from '../../server/routes/birdnet.js';
import { cacheFilename, fetchCached, cacheKeyJson, roundCoordinate } from '../../server/ebird/cache.js';
import { parseObservationDate, formatTimestamp } from '../../server/ebird/time.js';
import type { Dependencies } from '../../server/contracts.js';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
async function setup(){
  const dir=await mkdtemp(path.join(os.tmpdir(),'avian-ebird-'));dirs.push(dir);
  const config=loadConfig(process.cwd(),{AV_DATA_DIR:dir,EBIRD_API_KEY:'synthetic-token',TZ:'UTC'});
  const deps:Dependencies={config,now:()=>new Date('2026-10-21T12:00:00Z'),http:vi.fn(async()=>({status:200,body:Buffer.from('[]')}))};
  const app=express();app.set('query parser',parseQuery);app.use('/',createBirdnetRouter(deps));return {deps,app,dir};
}
describe('eBird actions',()=>{
  it('aggregates dashboard counts, independent windows, daily buckets and ordered hotspots',async()=>{
    const {deps,app}=await setup();const observations=JSON.parse(await readFile('tests/fixtures/observations.json','utf8'));
    deps.http=vi.fn(async()=>({status:200,body:Buffer.from(JSON.stringify(observations))}));
    const response=await request(app).get('/?action=dashboard&hours=24&days=30');
    expect(response.status).toBe(200);expect(response.headers['cache-control']).toBe('public, max-age=30');
    expect(response.body.recent.species.map((row:{sci:string;n:number})=>[row.sci,row.n])).toEqual([['Poecile atricapillus',2],['Corvus brachyrhynchos',4],['Turdus migratorius',1]]);
    expect(response.body.recent.hotspots.map((row:{locName:string})=>row.locName)).toEqual(['Near','Far','No coordinates']);
    expect(response.body.recent.hotspots[1].distance_km).toBeCloseTo(23.085107,5);
    expect(response.body.timeseries.daily).toEqual([{date:'2026-10-20',observations:4,species:1},{date:'2026-10-21',observations:4,species:2},{date:'2026-10-22',observations:2,species:1}]);
    expect(response.body.as_of).toBe('2026-10-21T12:00:00+00:00');
    expect(deps.http).toHaveBeenCalledWith(expect.stringContaining('/obs/geo/recent?'),{headers:{'X-eBirdApiToken':'synthetic-token',Accept:'application/json'},timeoutMs:20000});
  });
  it('returns empty dashboards and clamps requested window limits',async()=>{
    const {app}=await setup();const response=await request(app).get('/?hours=0&days=100');
    expect(response.status).toBe(200);expect(response.body.recent).toMatchObject({hours:1,species:[],hotspots:[]});expect(response.body.timeseries).toMatchObject({days:90,daily:[],by_hour:[]});
  });
  it('batches ordered unique hotspot selections into one upstream request',async()=>{
    const {deps,app}=await setup();const response=await request(app).get('/?mode=hotspot&regionCode[]=L2&regionCode[]=L1&regionCode[]=L2');
    expect(response.status).toBe(200);expect(deps.http).toHaveBeenCalledTimes(1);
    const url=new URL(vi.mocked(deps.http).mock.calls[0]![0]);expect(url.pathname).toBe('/v2/data/obs/US/recent');expect(url.searchParams.get('r')).toBe('L2,L1');expect(url.searchParams.get('back')).toBe('30');
  });
  it('discovers hotspots without discarding upstream record fields',async()=>{
    const {deps,app}=await setup();const hotspots=[{locId:'L1',locName:'Park',lat:'40.79',lng:-73.95,extra:{value:true}}];deps.http=vi.fn(async()=>({status:200,body:Buffer.from(JSON.stringify(hotspots))}));
    const response=await request(app).get('/?action=hotspots');expect(response.status).toBe(200);expect(response.body.hotspots).toEqual(hotspots);
    expect(new URL(vi.mocked(deps.http).mock.calls[0]![0]).pathname).toBe('/v2/ref/hotspot/geo');
  });
  it('matches species exactly and caps details without truncating summary totals',async()=>{
    const {deps,app}=await setup();deps.http=vi.fn(async()=>({status:200,body:Buffer.from(JSON.stringify(Array.from({length:503},()=>({sciName:'Corvus brachyrhynchos',comName:'Crow',howMany:2,obsDt:'2026-10-21 11:00',locName:'Park'}))))}));
    const response=await request(app).get('/?action=species&sci=Corvus%20brachyrhynchos');expect(response.status).toBe(200);expect(response.body.summary.total).toBe(1006);expect(response.body.observations).toHaveLength(500);expect(response.body.observations[0]).toMatchObject({d:'2026-10-21',t:'11:00',howMany:2,locName:'Park'});
    const absent=await request(app).get('/?action=species&sci=corvus%20brachyrhynchos');expect(absent.body.summary).toBeNull();expect(absent.body.observations).toEqual([]);
  });
  it('fetches nearby reports geographically and preserves unknown counts',async()=>{
    const {deps,app}=await setup();deps.http=vi.fn(async()=>({status:200,body:Buffer.from(JSON.stringify([{locId:'L1',locName:'Park',obsDt:'2026-10-21 11:00',howMany:null},{locId:'L2',howMany:2}]))}));
    const response=await request(app).get('/?action=nearby-species&mode=hotspot&speciesCode=amecro&maxResults=1&back=100&dist=100');expect(response.status).toBe(200);expect(response.headers['cache-control']).toBe('no-store');expect(response.body.observations).toHaveLength(1);expect(response.body.observations[0].howMany).toBeNull();
    const url=new URL(vi.mocked(deps.http).mock.calls[0]![0]);expect(url.pathname).toBe('/v2/data/obs/geo/recent/amecro');expect(url.searchParams.get('back')).toBe('30');expect(url.searchParams.get('dist')).toBe('50');
  });
  it.each([['mode=hotspot',400],['mode=hotspot&regionCode=bad!',400],['action=species',400],['action=nearby-species&speciesCode=bad!',400],['action=unknown',404]])('rejects invalid request %s',async(query,status)=>{
    const {app}=await setup();expect((await request(app).get('/?'+query)).status).toBe(status);
  });
  it('rejects eleven hotspot selections and requests without a configured token',async()=>{
    const {deps,app}=await setup();const query=Array.from({length:11},(_,i)=>'regionCode[]=L'+i).join('&');expect((await request(app).get('/?mode=hotspot&'+query)).status).toBe(400);expect(deps.http).not.toHaveBeenCalled();deps.config.ebird.token='';expect((await request(app).get('/')).status).toBe(503);
  });
  it('reports upstream failures and invalid successful JSON as gateway errors',async()=>{
    const {deps,app}=await setup();deps.http=vi.fn(async()=>({status:429,body:Buffer.from('{}')}));const failed=await request(app).get('/');expect(failed.status).toBe(502);expect(failed.body.status).toBe(429);
    deps.http=vi.fn(async()=>({status:200,body:Buffer.from('{broken')}));const invalid=await request(app).get('/');expect(invalid.status).toBe(502);expect(invalid.body.error).toBe('eBird returned invalid JSON');
  });
});
describe('cache behavior',()=>{
  it('reuses age 59, refreshes exact age 60, and refresh=1 still permits stale fallback',async()=>{
    const {deps,dir}=await setup(),config=deps.config.ebird;
    const filename=path.join(dir,cacheFilename('observations',config));
    const obs=[{sciName:'Old',obsDt:'2026-10-21'}],epoch=deps.now().getTime()/1000;
    await writeFile(filename,JSON.stringify({fetched_at:epoch-59,obs}));
    expect(await fetchCached(deps,config,'observations','geo',[],false)).toEqual(obs);expect(deps.http).not.toHaveBeenCalled();
    await writeFile(filename,JSON.stringify({fetched_at:epoch-60,obs}));
    expect(await fetchCached(deps,config,'observations','geo',[],false)).toEqual([]);expect(deps.http).toHaveBeenCalledTimes(1);
    await writeFile(filename,JSON.stringify({fetched_at:1,obs}));deps.http=vi.fn(async()=>{throw new Error('network');});
    expect(await fetchCached(deps,config,'observations','geo',[],true)).toEqual(obs);
  });
  it('falls back on upstream HTTP errors but never on invalid success JSON',async()=>{
    const {deps,dir}=await setup(),config=deps.config.ebird;
    await writeFile(path.join(dir,cacheFilename('hotspots',config)),JSON.stringify({fetched_at:0,hotspots:[{locId:'L1'}]}));
    deps.http=vi.fn(async()=>({status:429,body:Buffer.from('{}')}));
    expect(await fetchCached(deps,config,'hotspots','geo',[],false)).toEqual([{locId:'L1'}]);
    deps.http=vi.fn(async()=>({status:200,body:Buffer.from('null')}));
    await expect(fetchCached(deps,config,'hotspots','geo',[],false)).rejects.toMatchObject({status:502,body:{error:'eBird returned invalid hotspot data'}});
  });
  it('keeps configured back and ordered batch selections in cache identities',async()=>{
    const {deps}=await setup(),config=deps.config.ebird;
    expect(cacheFilename('observations',config,'hotspot',['L1','L2'])).not.toBe(cacheFilename('observations',config,'hotspot',['L2','L1']));
    expect(cacheFilename('observations',config)).not.toBe(cacheFilename('observations',{...config,back:29}));
    expect(roundCoordinate(-1.234565)).toBe(-1.23457);expect(cacheKeyJson([-0,0.000001,1])).toBe('[-0,1.0e-6,1]');
  });
  it('tolerates cache write failure and leaves no temporary file after success',async()=>{
    const {deps,dir}=await setup();deps.config.dataDir=path.join(dir,'missing');
    expect(await fetchCached(deps,deps.config.ebird,'observations','geo',[],false)).toEqual([]);
    deps.config.dataDir=dir;await fetchCached(deps,deps.config.ebird,'observations','geo',[],false);
    expect(await readdir(dir)).toEqual([cacheFilename('observations',deps.config.ebird)]);
  });
});
it('parses observation dates and formats timezone-aware timestamps',()=>{
  expect(parseObservationDate('2026-10-21','UTC')).toBe(Date.parse('2026-10-21T00:00:00Z'));
  expect(parseObservationDate('2026-10-21T10:00:00-04:00','UTC')).toBe(Date.parse('2026-10-21T14:00:00Z'));
  for(const input of ['bad',''])expect(parseObservationDate(input,'UTC')).toBeNull();
  expect(formatTimestamp(new Date('2026-10-21T12:00:00.999Z'),'UTC')).toBe('2026-10-21T12:00:00+00:00');
  expect(formatTimestamp(new Date(parseObservationDate('2026-11-01 01:30','America/New_York')!),'America/New_York')).toBe('2026-11-01T01:30:00-04:00');
  expect(formatTimestamp(new Date(parseObservationDate('2026-03-08 02:30','America/New_York')!),'America/New_York')).toBe('2026-03-08T03:30:00-04:00');
});
