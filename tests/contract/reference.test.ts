import { readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
const fixtureDir=path.resolve('tests/fixtures/reference');
type Capture={input:{name:string;endpoint?:string;query:string;rows:unknown;raw?:string;status?:number;transportFailure?:boolean;token?:string;method?:string;seedCache?:{filename:string;value:unknown}};expected:{status:number;headers:string[];body:string;requests:{url:string;context:{http:{timeout:number;header:string}}}[]}};
const captures=readdirSync(fixtureDir).filter(n=>n.endsWith('.json')&&!['provenance.json','runtime-characterization.json','public-sha256.json'].includes(n)).map(n=>JSON.parse(readFileSync(path.join(fixtureDir,n),'utf8')) as Capture);
function asJsonOrText(s:string):unknown{try{return JSON.parse(s);}catch{return s;}}
describe('independent PHP reference HTTP contracts',()=>{
 for(const capture of captures) it(capture.input.name,async()=>{
  const {input,expected}=capture;
  const root=await mkdtemp(path.join(os.tmpdir(),'avian-contract-'));
  try{
   const config=loadConfig(process.cwd(),{});
   config.dataDir=root;config.imageCacheDir=path.join(root,'images');config.legacyImageCacheDir=path.join(root,'legacy');config.rendererPath=path.join(root,'missing-renderer');
   if(input.seedCache)await writeFile(path.join(root,input.seedCache.filename),JSON.stringify(input.seedCache.value));
   config.ebird.token=input.token ?? 'synthetic-token';
   const calls:{url:string;options:{headers?:Record<string,string>;timeoutMs:number}}[]=[];
   const app=createApp({config,now:()=>new Date('2026-10-21T12:00:00Z'),http:async(url,options)=>{calls.push({url,options});if(input.transportFailure)throw new Error('synthetic transport failure');return {status:input.status ?? 200,body:Buffer.from(input.raw ?? JSON.stringify(input.rows))};}});
   const endpoint='/avian/api/'+(input.endpoint ?? 'birdnet-api.php')+'?'+input.query;
   const method=(input.method ?? 'GET').toLowerCase() as 'get'|'post'|'options';
   const response=await request(app)[method](endpoint);
   expect(response.status).toBe(expected.status);
   expect(asJsonOrText(response.text)).toEqual(asJsonOrText(expected.body));
   const finalHeaders:Record<string,string>={};for(const h of expected.headers){const colon=h.indexOf(':');finalHeaders[h.slice(0,colon).toLowerCase()]=h.slice(colon+1).trim();}for(const [key,value] of Object.entries(finalHeaders))expect(response.headers[key]).toBe(value);
   expect(calls.map(c=>{const u=new URL(c.url);return {origin:u.origin,path:u.pathname,params:[...u.searchParams]};})).toEqual(expected.requests.map(c=>{const u=new URL(c.url);return {origin:u.origin,path:u.pathname,params:[...u.searchParams]};}));
   for(let i=0;i<calls.length;i++)expect(calls[i]!.options.timeoutMs).toBe(expected.requests[i]!.context.http.timeout*1000);
  }finally{await rm(root,{recursive:true,force:true});}
 });
});
