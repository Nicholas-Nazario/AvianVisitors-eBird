// Local-only acceptance of a built image; never deploys or contacts production.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const image=process.argv[2]||'avianvisitors:candidate';
const name=`avian-acceptance-${process.pid}`;
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const temp=mkdtempSync(path.join(os.tmpdir(),'avian-container-'));
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
async function ready(container){for(let i=0;i<100;i++){try{docker('exec',container,'node','-e',"fetch('http://127.0.0.1:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))");return;}catch{await new Promise(r=>setTimeout(r,100));}}throw new Error('startup timeout');}
function run(container,source){return JSON.parse(docker('exec',container,'node','--input-type=module','-e',source));}
try{
  docker('run','-d','--name',name,'--network','none',image);await ready(name);
  const result=run(name,`import fs from 'node:fs';import cp from 'node:child_process';
const out={uid:process.getuid(),node:process.versions.node,paths:{},apis:{}};
for(const url of ['/','/apt.js','/config.js','/favicon.png','/avian/frontend/index.html','/avian/assets/illustrations/corvus-brachyrhynchos.png','/avian/data/ebird.json','/server/config.ts','/package.json','/.git/config']){const r=await fetch('http://127.0.0.1:8080'+url);out.paths[url]=r.status;}
for(const route of ['birdnet-api.php','menu.php','wiki.php','cutout.php']){const r=await fetch('http://127.0.0.1:8080/avian/api/'+route);const o=await fetch('http://127.0.0.1:8080/avian/api/'+route,{method:'OPTIONS'});out.apis[route]=[r.status,r.headers.get('access-control-allow-origin'),o.status];}
fs.writeFileSync('/app/avian/data/acceptance-write','ok');out.writable=fs.readFileSync('/app/avian/data/acceptance-write','utf8');fs.unlinkSync('/app/avian/data/acceptance-write');
out.privatePaths=['/app/tests','/app/server','/app/docs','/app/scripts','/app/node_modules/vitest','/app/node_modules/typescript'].filter(p=>fs.existsSync(p));
const imageGet=await fetch('http://127.0.0.1:8080/avian/api/cutout.php?sci=Corvus%20brachyrhynchos');const imageBytes=await imageGet.arrayBuffer();const imageHead=await fetch('http://127.0.0.1:8080/avian/api/cutout.php?sci=Corvus%20brachyrhynchos',{method:'HEAD'});out.cutout={get:imageGet.status,head:imageHead.status,length:Number(imageHead.headers.get('content-length')),bytes:imageBytes.byteLength,headBytes:(await imageHead.arrayBuffer()).byteLength};const menu=await fetch('http://127.0.0.1:8080/avian/api/menu.php',{method:'POST',headers:{Authorization:'Basic synthetic'}});out.menu={status:menu.status,body:await menu.json()};
out.forbidden=cp.execFileSync('find',['/app','-type','f','(','-name','*.php','-o','-name','ebird.json',')'],{encoding:'utf8'}).trim()+cp.execFileSync('sh',['-c','command -v php || true; command -v apache2 || true'],{encoding:'utf8'}).trim();console.log(JSON.stringify(out));`);
  check(result.uid===1000,'nonroot uid');check(result.node==='24.22.1','pinned runtime');check(result.writable==='ok','writable data');check(result.forbidden==='','no PHP/Apache/private config');
  check(result.privatePaths.length===0,'production files and dependencies only');check(result.cutout.get===200&&result.cutout.head===200&&result.cutout.length===result.cutout.bytes&&result.cutout.headBytes===0,'image GET/HEAD agreement');check(result.menu.status===200&&result.menu.body.items.length===0,'menu POST with proxy authorization');
  for(const [url,status]of Object.entries(result.paths))check(status===(['/avian/data/ebird.json','/server/config.ts','/package.json','/.git/config'].includes(url)?404:200),url);
  for(const [route,[status,cors,options]]of Object.entries(result.apis)){check(status===({'birdnet-api.php':503,'menu.php':200,'wiki.php':400,'cutout.php':400}[route]),route);check(cors==='*'&&options===204,route+' CORS');}
  docker('restart',name);await ready(name);check(true,'entrypoint restart');
  docker('stop','--time','30',name);check(docker('inspect','-f','{{.State.ExitCode}}',name)==='0','idle SIGTERM');docker('rm',name);
  // Only test transport/clock are injected. Routes, filesystem caches and static serving are compiled production modules.
  writeFileSync(path.join(temp,'fixture.mjs'),`import {createApp} from '/app/dist/server/app.js';import {loadConfig} from '/app/dist/server/config.js';
const config=loadConfig('/app',{EBIRD_API_KEY:'synthetic',AV_DATA_DIR:'/app/avian/data',TZ:'UTC'});let calls=0;
const app=createApp({config,now:()=>new Date('2026-10-21T12:00:00Z'),http:async(url)=>{calls++;if(url.includes('/ref/hotspot/'))return {status:200,body:Buffer.from('[{"locId":"L1","locName":"Fixture"}]')};if(url.includes('nearby'))return {status:200,body:Buffer.from('[]')};return {status:200,body:Buffer.from('[{"sciName":"Corvus brachyrhynchos","comName":"American Crow","speciesCode":"amecro","obsDt":"2026-10-21 11:00","howMany":3,"locId":"L1","locName":"Fixture"}]')};}});
const {createServer}=await import('node:http');const server=createServer((q,r)=>{if(q.url==='/acceptance-calls'){r.setHeader('Content-Type','application/json');r.end(JSON.stringify(calls));}else app(q,r);}).listen(8080,'0.0.0.0');process.on('SIGTERM',()=>server.close());`);
  docker('create','--name',name,'--network','none','--entrypoint','node',image,'/tmp/fixture.mjs');docker('cp',path.join(temp,'fixture.mjs'),name+':/tmp/fixture.mjs');docker('start',name);await ready(name);
  const fixture=run(name,`const base='http://127.0.0.1:8080/avian/api/birdnet-api.php';const out={};for(const action of ['dashboard','species&sci=Corvus%20brachyrhynchos','hotspots','nearby-species&speciesCode=amecro']){const r=await fetch(base+'?action='+action);out[action]={status:r.status,body:await r.json()};}out.calls=await(await fetch('http://127.0.0.1:8080/acceptance-calls')).json();console.log(JSON.stringify(out));`);
  for(const action of ['dashboard','species&sci=Corvus%20brachyrhynchos','hotspots','nearby-species&speciesCode=amecro'])check(fixture[action].status===200,action);
  check(fixture.dashboard.body.recent.species[0].n===3,'compiled aggregation');check(fixture.calls===3,'warm cache prevents second upstream');
  docker('restart',name);await ready(name);
  const restart=run(name,`const r=await fetch('http://127.0.0.1:8080/avian/api/birdnet-api.php');console.log(JSON.stringify({status:r.status,calls:await(await fetch('http://127.0.0.1:8080/acceptance-calls')).json()}));`);
  check(restart.status===200&&restart.calls===0,'disk cache survives process restart');
  docker('stop','--time','30',name);check(docker('inspect','-f','{{.State.ExitCode}}',name)==='0','fixture SIGTERM');
  docker('rm',name);
  docker('run','-d','--name',name,'--network','none','-e','EBIRD_API_KEY=synthetic',image);await ready(name);
  const cold=run(name,`const r=await fetch('http://127.0.0.1:8080/avian/api/birdnet-api.php');console.log(JSON.stringify({status:r.status,body:await r.json()}));`);
  check(cold.status===502&&cold.body.status===0,'cold unavailable upstream');
  run(name,`import fs from 'node:fs';import {cacheFilename} from '/app/dist/server/ebird/cache.js';import {loadConfig} from '/app/dist/server/config.js';const c=loadConfig();fs.writeFileSync(c.dataDir+'/'+cacheFilename('observations',c.ebird),JSON.stringify({fetched_at:1,obs:[]}));console.log('{}');`);
  const stale=run(name,`const r=await fetch('http://127.0.0.1:8080/avian/api/birdnet-api.php');console.log(JSON.stringify({status:r.status,body:await r.json()}));`);
  check(stale.status===200&&stale.body.recent.species.length===0,'stale disk cache during network outage');
  docker('stop','--time','30',name);check(docker('inspect','-f','{{.State.ExitCode}}',name)==='0','outage container SIGTERM');
  console.log(JSON.stringify({image,id:docker('image','inspect','-f','{{.Id}}',image),checks,result:'PASS'},null,2));
}finally{try{docker('rm','-f',name);}catch{}rmSync(temp,{recursive:true,force:true});}
