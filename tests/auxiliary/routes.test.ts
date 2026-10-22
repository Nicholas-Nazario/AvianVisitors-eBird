import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { loadConfig } from '../../server/config.js';
import type { Dependencies, HttpTransport } from '../../server/contracts.js';
import { parseQuery } from '../../server/http/query.js';
import { createWikiRouter } from '../../server/routes/wiki.js';
import { createMenuRouter } from '../../server/routes/menu.js';
import { createCutoutRouter } from '../../server/routes/cutout.js';
import { shutdownRenderers } from '../../server/images/renderer.js';
import { pngProcessor } from '../../server/images/process.js';
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function setup() {
  const root=await mkdtemp(path.join(os.tmpdir(),'avian-aux-'));roots.push(root);
  const config=loadConfig(root,{AV_LEGACY_IMAGE_CACHE_DIR:path.join(root,'legacy'),AV_REMBG_PATH:path.join(root,'missing-renderer')});
  const http=vi.fn<HttpTransport>(async()=>({status:200,body:Buffer.from('{}')}));
  const deps:Dependencies={config,http,now:()=>new Date('2026-10-21T12:00:00Z')};
  const app=express();app.set('query parser',parseQuery);
  app.use('/wiki',createWikiRouter(deps));app.use('/menu',createMenuRouter(deps));app.use('/cutout',createCutoutRouter(deps));
  return {root,app,deps,http};
}
describe('auxiliary routes',()=>{
  it('keeps wiki validation, fallback field presence and success arrays',async()=>{
    const {app,http}=await setup();
    expect((await request(app).get('/wiki')).body).toEqual({error:'sci required'});
    expect((await request(app).get('/wiki?sci=%C2%A0Test+species%C2%A0')).body).toEqual({error:'invalid sci'});
    const invalid=await request(app).post('/wiki?sci=../bad');expect(invalid.status).toBe(400);expect(invalid.headers['cache-control']).toBe('public, max-age=86400');
    http.mockResolvedValueOnce({status:503,body:Buffer.from('{}')});
    expect((await request(app).get('/wiki?sci=Test+species')).body).toEqual({extract:null,thumbnail:null});
    http.mockResolvedValueOnce({status:200,body:Buffer.from('[]')});
    expect((await request(app).get('/wiki?sci=Test+species')).body).toEqual({extract:null,thumbnail:null,title:null});
    expect(http.mock.calls[0]?.[1]).toEqual({headers:{'User-Agent':expect.any(String)},timeoutMs:8000});
  });
  it('validates Wikipedia hostname suffixes without losing extract/title types',async()=>{
    const {app,http}=await setup();
    for(const [source,allowed] of [['https://upload.wikimedia.org/a',true],['https://WIKIPEDIA.ORG/a',true],['https://wikimedia.org.evil.test/a',false],['https://evilwikimedia.org/a',false]] as const) {
      http.mockResolvedValueOnce({status:200,body:Buffer.from(JSON.stringify({title:'Bird',extract:12,thumbnail:{source}}))});
      expect((await request(app).get('/wiki?sci=Test+species')).body).toEqual({title:'Bird',extract:12,thumbnail:allowed?{source}:null});
    }
  });
  it('preserves menu POST and HEAD',async()=>{
    const {app}=await setup();const result=await request(app).post('/menu').set('Authorization','Basic example');
    expect(result.status).toBe(200);expect(result.body).toEqual({items:[]});expect(result.headers['cache-control']).toBe('no-store');
    expect((await request(app).head('/menu')).text).toBeUndefined();
  });
  it('selects illustration poses then base, bundled cutout, legacy and generated cache with strict size threshold',async()=>{
    const {app,root,deps,http}=await setup();
    const files=[path.join(root,'avian/assets/illustrations/test-species-2.png'),path.join(root,'avian/assets/illustrations/test-species.png'),path.join(root,'avian/assets/cutouts/test-species.png'),path.join(deps.config.legacyImageCacheDir,'test-species.png'),path.join(deps.config.imageCacheDir,'test-species.png')];
    for(let i=0;i<files.length;i++){await mkdir(path.dirname(files[i]!),{recursive:true});await writeFile(files[i]!,Buffer.alloc(1025,i+1));}
    for(let i=0;i<files.length;i++) {
      const response=await request(app).get('/cutout?sci=Test+species&pose=2');expect(response.status).toBe(200);expect(response.body).toEqual(Buffer.alloc(1025,i+1));
      const head=await request(app).head('/cutout?sci=Test+species&pose=2');expect(head.status).toBe(200);expect(head.headers['content-length']).toBe('1025');expect(head.text).toBeUndefined();
      await writeFile(files[i]!,Buffer.alloc(1024));
    }
    const missing=await request(app).get('/cutout?sci=Test+species');expect(missing.status).toBe(404);expect(missing.text).toBe('no illustration bundled for Test species (install rembg-cli to enable Wikipedia fallback)');expect(http).not.toHaveBeenCalled();
  });
  it('preserves PNG alpha and expected crop/resize geometry',async()=>{
    for(const [name,width,height] of [['palette-transparent',7,3],['truecolor-trns',7,3],['palette-partial',11,7]] as const) {
      const input=await readFile(path.join('tests/fixtures/images',name+'-input.png'));
      const output=await pngProcessor.process(input);
      expect(await sharp(output).metadata()).toMatchObject({width,height,hasAlpha:true});
      if(name==='palette-partial') {
        const source=await sharp(input).ensureAlpha().raw().toBuffer();
        const processed=await sharp(output).ensureAlpha().raw().toBuffer();
        expect(Math.abs(processed[3]!-source[3]!)).toBeLessThanOrEqual(1);
      }
    }
    const transparent=await sharp({create:{width:12,height:8,channels:4,background:'#00000000'}}).png().toBuffer();
    expect(await sharp(await pngProcessor.process(transparent)).metadata()).toMatchObject({width:12,height:8,hasAlpha:true});
    const bird=await sharp({create:{width:801,height:402,channels:4,background:'#ff0000ff'}}).extend({top:5,bottom:7,left:3,right:4,background:'#00000000'}).png().toBuffer();
    expect(await sharp(await pngProcessor.process(bird)).metadata()).toMatchObject({width:800,height:409,hasAlpha:true});
  });
  it('runs renderer arguments, accepts exactly 1024 bytes and cleans temporary files',async()=>{
    const {app,root,deps,http}=await setup();
    const renderer=path.join(root,'renderer');
    await writeFile(renderer,'#!/bin/sh\n[ "$1" = i ] && [ "$2" = -m ] && [ "$3" = u2netp ] && [ "$4" = -ppm ] || exit 1\ncp "$5" "$6"\nexit 7\n');await chmod(renderer,0o755);deps.config.rendererPath=renderer;
    deps.imageProcessor={process:async input=>input};
    http.mockResolvedValueOnce({status:200,body:Buffer.from('{"originalimage":{"source":"https://upload.wikimedia.org/bird"}}')});
    http.mockResolvedValueOnce({status:200,body:Buffer.alloc(1024,9)});
    const generated=await request(app).post('/cutout?sci=Test+species');
    expect(generated.status).toBe(200);expect(generated.body).toEqual(Buffer.alloc(1024,9));
    expect(await readdir(deps.config.imageCacheDir)).toEqual(['test-species.png']);
    expect(http.mock.calls.map(call=>call[1].timeoutMs)).toEqual([12000,12000]);
    // Generated files of exactly 1024 bytes cannot be reused as existing hits.
    http.mockResolvedValueOnce({status:200,body:Buffer.from('{}')});
    expect((await request(app).get('/cutout?sci=Test+species')).status).toBe(404);
  });
  it('terminates an in-flight renderer and removes its temporary input/output directory',async()=>{
    const {app,root,deps,http}=await setup();
    const marker=path.join(root,'renderer-pid'),renderer=path.join(root,'renderer');
    await writeFile(renderer,`#!${process.execPath}
require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));
setInterval(()=>{},1000);
`);
    await chmod(renderer,0o755);deps.config.rendererPath=renderer;
    http.mockResolvedValueOnce({status:200,body:Buffer.from('{"originalimage":{"source":"https://upload.wikimedia.org/bird"}}')});
    http.mockResolvedValueOnce({status:200,body:Buffer.alloc(1024)});
    const pending=request(app).get('/cutout?sci=Test+species').then(response=>response);
    let pid=0;
    try {
      await vi.waitFor(async()=>{pid=Number(await readFile(marker,'utf8'));expect(pid).toBeGreaterThan(0);});
      expect((await readdir(deps.config.imageCacheDir)).some(name=>name.startsWith('.rembg-'))).toBe(true);
      shutdownRenderers();
      const result=await pending;expect(result.status).toBe(500);
      expect(await readdir(deps.config.imageCacheDir)).toEqual([]);
      expect(()=>process.kill(pid,0)).toThrow();
    } finally {shutdownRenderers();}
  });
  it('keeps missing photo, short download and failed renderer error contracts',async()=>{
    const {app,root,deps,http}=await setup();const renderer=path.join(root,'renderer');
    await writeFile(renderer,'#!/bin/sh\nexit 1\n');await chmod(renderer,0o755);deps.config.rendererPath=renderer;
    const summary={status:200,body:Buffer.from('{"thumbnail":{"source":"https://upload.wikimedia.org/bird"}}')};
    http.mockResolvedValueOnce({status:200,body:Buffer.from('{"originalimage":{"source":"https://evil.test/bird"}}')});
    expect((await request(app).get('/cutout?sci=Test+species')).text).toBe('no Wikipedia photo for Test species');
    http.mockResolvedValueOnce(summary).mockResolvedValueOnce({status:200,body:Buffer.alloc(1023)});
    const short=await request(app).get('/cutout?sci=Test+species');expect(short.status).toBe(503);expect(short.text).toBe('failed to fetch source image');
    http.mockResolvedValueOnce(summary).mockResolvedValueOnce({status:200,body:Buffer.alloc(1024)});
    const failed=await request(app).head('/cutout?sci=Test+species');expect(failed.status).toBe(500);expect(failed.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(await readdir(deps.config.imageCacheDir)).toEqual([]);
  });
});
