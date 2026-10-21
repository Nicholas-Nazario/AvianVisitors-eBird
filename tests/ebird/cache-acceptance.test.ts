import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../server/config.js';
import { cacheFilename, fetchCached, phpJson } from '../../server/ebird/cache.js';
import type { Dependencies } from '../../server/contracts.js';
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function setup(){
 const root=await mkdtemp(path.join(os.tmpdir(),'avian-cache-acceptance-'));roots.push(root);
 const config=loadConfig(process.cwd(),{AV_DATA_DIR:root,EBIRD_API_KEY:'synthetic-token',TZ:'UTC'});
 const deps:Dependencies={config,now:()=>new Date('2026-10-21T12:00:00Z'),http:vi.fn(async()=>({status:200,body:Buffer.from('[{"sciName":"Synthetic bird"}]')}))};
 return {root,deps};
}
describe.each(['observations','hotspots'] as const)('%s cache acceptance',kind=>{
 const field=kind==='observations'?'obs':'hotspots';
 it('survives application dependency reconstruction and returns stale data during outage',async()=>{
  const {root,deps}=await setup();
  const value=await fetchCached(deps,deps.config.ebird,kind,'geo',[],false);
  const restarted:Dependencies={config:loadConfig(process.cwd(),{AV_DATA_DIR:root,EBIRD_API_KEY:'synthetic-token',TZ:'UTC'}),now:()=>new Date('2026-10-21T12:00:59Z'),http:vi.fn(async()=>{throw Error('outage');})};
  expect(await fetchCached(restarted,restarted.config.ebird,kind,'geo',[],false)).toEqual(value);
  expect(restarted.http).not.toHaveBeenCalled();
  restarted.now=()=>new Date('2026-10-22T12:00:00Z');
  expect(await fetchCached(restarted,restarted.config.ebird,kind,'geo',[],false)).toEqual(value);
  expect(restarted.http).toHaveBeenCalledTimes(1);
 });
 it.each(['{broken','null','{"fetched_at":1792584000}','{"fetched_at":1792584000,"FIELD":null}'])('ignores unusable cache %s',async raw=>{
  const {root,deps}=await setup();
  await writeFile(path.join(root,cacheFilename(kind,deps.config.ebird)),raw.replace('FIELD',field));
  expect(await fetchCached(deps,deps.config.ebird,kind,'geo',[],false)).toEqual([{sciName:'Synthetic bird'}]);
  expect(deps.http).toHaveBeenCalledTimes(1);
 });
 it('fails cold outage rather than returning a partial result',async()=>{
  const {deps}=await setup();deps.http=vi.fn(async()=>{throw Error('outage');});
  await expect(fetchCached(deps,deps.config.ebird,kind,'geo',[],false)).rejects.toMatchObject({status:502,body:{status:0}});
 });
 it('retains successful upstream response and cleans temporary files if atomic rename fails',async()=>{
  const {root,deps}=await setup(),filename=cacheFilename(kind,deps.config.ebird);
  await mkdir(path.join(root,filename));
  expect(await fetchCached(deps,deps.config.ebird,kind,'geo',[],false)).toEqual([{sciName:'Synthetic bird'}]);
  expect(await readdir(root)).toEqual([filename]);
 });
 it('writes complete atomic files under simultaneous refreshes without mixing locations',async()=>{
  const {root,deps}=await setup();let serial=0;
  deps.http=vi.fn(async url=>{const id=++serial;await new Promise(resolve=>setTimeout(resolve,id%3));return {status:200,body:Buffer.from(JSON.stringify([{id,lat:new URL(url).searchParams.get('lat')}]))};});
  const configs=[deps.config.ebird,{...deps.config.ebird,lat:41.12345}];
  const values=await Promise.all(Array.from({length:24},(_,i)=>fetchCached(deps,configs[i%2]!,kind,'geo',[],true)));
  const ids:number[]=[];
  for(let i=0;i<values.length;i++){const rows=values[i] as {id:number;lat:string}[];expect(rows).toHaveLength(1);expect(rows[0]!.lat).toBe(String(configs[i%2]!.lat));ids.push(rows[0]!.id);}
  expect(ids.sort((a,b)=>a-b)).toEqual(Array.from({length:24},(_,i)=>i+1));
  expect((await readdir(root)).sort()).toEqual(configs.map(c=>cacheFilename(kind,c)).sort());
  for(const config of configs){const cached=JSON.parse(await readFile(path.join(root,cacheFilename(kind,config)),'utf8'));expect(cached.fetched_at).toBe(1792584000);expect(cached[field]).toHaveLength(1);expect(cached[field][0].lat).toBe(String(config.lat));}
 });
});
it('matches independently captured PHP number serialization and MD5 values',async()=>{
 const reference=JSON.parse(await readFile('tests/fixtures/reference/runtime-characterization.json','utf8'));
 for(const row of reference.keys){const value=row.json==='[-0]'?-0:row.value;expect(phpJson([value])).toBe(row.json);expect(createHash('md5').update(phpJson([value])).digest('hex')).toBe(row.md5);}
});

it('keeps ordered hotspot batches isolated from geographic and discovery caches',async()=>{
 const {root,deps}=await setup();
 const batches=[['L1','L2'],['L2','L1']];
 deps.http=vi.fn(async url=>({status:200,body:Buffer.from(JSON.stringify([{source:new URL(url).searchParams.get('r')??'geo'}]))}));
 await Promise.all(batches.map(regions=>fetchCached(deps,deps.config.ebird,'observations','hotspot',regions,true)));
 await fetchCached(deps,deps.config.ebird,'observations','geo',[],true);
 await fetchCached(deps,deps.config.ebird,'hotspots','geo',[],true);
 deps.http=vi.fn(async()=>{throw Error('outage');});
 for(const regions of batches)expect(await fetchCached(deps,deps.config.ebird,'observations','hotspot',regions,false)).toEqual([{source:regions.join(',')}]);
 expect(await fetchCached(deps,deps.config.ebird,'observations','geo',[],false)).toEqual([{source:'geo'}]);
 expect(await fetchCached(deps,deps.config.ebird,'hotspots','geo',[],false)).toEqual([{source:'geo'}]);
 expect(deps.http).not.toHaveBeenCalled();expect(await readdir(root)).toHaveLength(4);
});
