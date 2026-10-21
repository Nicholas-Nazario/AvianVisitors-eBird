import { describe,it,expect } from 'vitest';
import request from 'supertest';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
describe('public hosting boundary',()=>{
  const app=createApp({config:loadConfig(),http:async()=>{throw new Error('unexpected upstream');}});
  it('serves root and unchanged frontend files',async()=>{
    for(const url of ['/','/index.html','/apt.js','/config.js','/styles.css','/dims.json','/masks.json','/nest.webp','/favicon.png','/avian/frontend/index.html'])expect((await request(app).get(url)).status,url).toBe(200);
  });
  it('keeps configuration, implementation, dependencies and caches private',async()=>{
    for(const url of ['/avian/data/ebird.example.json','/avian/data/ebird.json','/server/config.ts','/package.json','/.git/config','/avian/api/bootstrap.php','/avian/scripts/generate.py','/node_modules/express/package.json','/avian/assets/references/test.png'])expect((await request(app).get(url)).status,url).toBe(404);
  });
  it('preserves HEAD and all-method routes with configured CORS',async()=>{
    const config=loadConfig(process.cwd(),{EBIRD_API_KEY:'synthetic',AV_CORS_ORIGIN:'https://frontend.example',TZ:'UTC'});
    const temporary=await mkdtemp(path.join(os.tmpdir(),'avian-methods-'));config.dataDir=temporary;
    const fixture=createApp({config,http:async()=>({status:200,body:Buffer.from('[]')})});
    for(const query of ['action=dashboard','action=species&sci=Corvus+brachyrhynchos','action=hotspots','action=nearby-species&speciesCode=amecro']){
      const head=await request(fixture).head('/avian/api/birdnet-api.php?'+query);
      expect(head.status).toBe(200);expect(head.text).toBeUndefined();expect(head.headers['access-control-allow-origin']).toBe('https://frontend.example');
    }
    for(const method of ['get','post','put','head'] as const){
      const response=await request(fixture)[method]('/avian/api/menu.php').set('Authorization','Basic synthetic-proxy');
      expect(response.status).toBe(200);expect(response.headers['cache-control']).toBe('no-store');
      if(method==='head')expect(response.text).toBeUndefined();else expect(response.body).toEqual({items:[]});
    }
    const image=await request(fixture).head('/avian/api/cutout.php?sci=Corvus+brachyrhynchos');expect(image.status).toBe(200);expect(image.text).toBeUndefined();expect(Number(image.headers['content-length'])).toBeGreaterThan(1024);
    const wiki=await request(fixture).head('/avian/api/wiki.php?sci=Corvus+brachyrhynchos');expect(wiki.status).toBe(200);expect(wiki.text).toBeUndefined();await rm(temporary,{recursive:true,force:true});
  });
  it('answers preflight before credentials for each compatibility path',async()=>{
    for(const endpoint of ['birdnet-api.php','cutout.php','wiki.php','menu.php']){
      const response=await request(app).options('/avian/api/'+endpoint);
      expect(response.status).toBe(204);expect(response.headers['access-control-allow-methods']).toBe('GET, OPTIONS');expect(response.headers['access-control-allow-headers']).toBe('Content-Type');
    }
  });
});
