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
describe('independent baseline captures',()=>{
  for(const name of ['dashboard-empty','dashboard-mixed','dashboard-coercion','species-exact','species-absent','species-limit','species-required','discovery','nearby-truncation','nearby-code-required','hotspot-batch','hotspot-required','invalid-region','unknown-action','upstream-error','invalid-json','missing-token']){
    it(name,async()=>{
      const fixture=JSON.parse(await readFile(path.join('tests/fixtures/reference',name+'.json'),'utf8'));
      const {deps,app}=await setup();
      if(name==='missing-token')deps.config.ebird.token='';
      deps.http=vi.fn(async()=>({status:fixture.input.status??200,body:Buffer.from(fixture.input.raw??JSON.stringify(fixture.input.rows??[]))}));
      // Oracle invalid JSON uses an explicit raw fixture payload.
      if(name==='invalid-json')deps.http=vi.fn(async()=>({status:200,body:Buffer.from('{broken')}));
      const response=await request(app).get('/?'+fixture.input.query);
      expect(response.status).toBe(fixture.expected.status);
      expect(response.body).toEqual(JSON.parse(fixture.expected.body));
      const calls=vi.mocked(deps.http).mock.calls;
      expect(calls.map(call=>call[0])).toEqual(fixture.expected.requests.map((r:{url:string})=>r.url));
      for(const [,options] of calls){expect(options.timeoutMs).toBe(20000);expect(options.headers).toEqual({'X-eBirdApiToken':'synthetic-token',Accept:'application/json'});}
    });
  }
});
describe('legacy cache behavior',()=>{
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
  it('keeps configured back and ordered batch selections in legacy cache identities',async()=>{
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
it('uses the captured calendar/date semantics and offset timestamp format',async()=>{
  const reference=JSON.parse(await readFile('tests/fixtures/reference/runtime-characterization.json','utf8'));
  for(const row of reference.dates)expect(parseObservationDate(row.input,'UTC')).toBe(row.timestamp===false?null:row.timestamp*1000);
  expect(formatTimestamp(new Date('2026-10-21T12:00:00.999Z'),'UTC')).toBe('2026-10-21T12:00:00+00:00');
  expect(formatTimestamp(new Date(parseObservationDate('2026-11-01 01:30','America/New_York')!),'America/New_York')).toBe('2026-11-01T01:30:00-04:00');
  expect(formatTimestamp(new Date(parseObservationDate('2026-03-08 02:30','America/New_York')!),'America/New_York')).toBe('2026-03-08T03:30:00-04:00');
});
