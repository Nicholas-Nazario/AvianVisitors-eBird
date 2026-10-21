import { expect,it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtemp,readFile,rm,readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { loadConfig } from '../../server/config.js';
import { parseQuery } from '../../server/http/query.js';
import { createCutoutRouter } from '../../server/routes/cutout.js';
/** Optional equipped-environment check, deliberately excluded from offline suite. */
it.skipIf(!process.env.AV_REAL_REMBG)('executes a real u2netp renderer and caches postprocessed PNG',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'avian-real-renderer-'));
  try {
    const config=loadConfig(root,{AV_REMBG_PATH:process.env.AV_REAL_REMBG});
    const photo=await readFile('tests/fixtures/reference/gd/alpha-resize-input.png');
    const app=express();app.set('query parser',parseQuery);app.use('/',createCutoutRouter({config,now:()=>new Date(),http:async url=>({status:200,body:url.includes('/summary/')?Buffer.from('{"originalimage":{"source":"https://upload.wikimedia.org/synthetic.png"}}'):photo})}));
    const response=await request(app).get('/?sci=Test+species');expect(response.status).toBe(200);
    expect(await sharp(response.body).metadata()).toMatchObject({width:800,height:403,hasAlpha:true});
    expect(await readdir(config.imageCacheDir)).toEqual(['test-species.png']);
    expect(await readFile(path.join(config.imageCacheDir,'test-species.png'))).toEqual(response.body);
  } finally {await rm(root,{recursive:true,force:true});}
},120000);
