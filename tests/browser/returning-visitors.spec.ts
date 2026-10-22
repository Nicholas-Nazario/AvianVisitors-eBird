import {test,expect} from '@playwright/test';
import {createServer,type Server} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../../server/app.js';
import {loadConfig} from '../../server/config.js';
let server:Server,apiServer:Server,base:string,apiBase:string,temp:string;
const calls:string[]=[];
let empty=false,nearbyFailure=false;
const mixed=JSON.parse(readFileSync('tests/fixtures/reference/dashboard-mixed.json','utf8')).input.rows;
async function listen(s:Server){await new Promise<void>(resolve=>s.listen(0,'127.0.0.1',resolve));const a=s.address();if(!a||typeof a==='string')throw new Error('missing address');return 'http://127.0.0.1:'+a.port;}
test.beforeAll(async()=>{
 temp=await mkdtemp(path.join(os.tmpdir(),'avian-browser-'));const config=loadConfig(process.cwd(),{});config.dataDir=temp;config.ebird.token='synthetic-token';config.rendererPath=path.join(temp,'no-renderer');
 const app=createApp({config,now:()=>new Date('2026-10-21T12:00:00Z'),http:async(url)=>{calls.push(url);const u=new URL(url);if(u.hostname==='en.wikipedia.org')return {status:200,body:Buffer.from(JSON.stringify({extract:'Synthetic crow description',title:'American Crow'}))};if(u.pathname.endsWith('/hotspot/geo'))return {status:200,body:Buffer.from(JSON.stringify(Array.from({length:11},(_,i)=>({locId:'L'+(i+1),locName:i===0?'Fixture Park':'Fixture Park '+(i+1),lat:40.79,lng:-73.95}))))};if(u.pathname.includes('/recent/'))return {status:nearbyFailure?503:200,body:Buffer.from(JSON.stringify([{speciesCode:'amecro',locId:'L1',locName:'Fixture Park',obsDt:'2026-10-21 11:30',howMany:null}]))};return {status:200,body:Buffer.from(JSON.stringify(empty?[]:mixed))};}});
 server=createServer(app);apiServer=createServer(app);base=await listen(server);apiBase=await listen(apiServer);
});
test.afterAll(async()=>{await Promise.all([server,apiServer].map(s=>new Promise<void>(r=>s.close(()=>r()))));await rm(temp,{recursive:true,force:true});});
test.beforeEach(async({page})=>{empty=false;nearbyFailure=false;calls.length=0;await page.addInitScript(()=>{Math.random=()=>0.25;});});
test('unchanged frontend renders collage, stats, atlas, modal and same-origin persistence',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('bird:theme','dark');if(!localStorage.getItem('bird:atlasSort'))localStorage.setItem('bird:atlasSort','alpha');localStorage.setItem('bird:window','24');localStorage.setItem('bird:lat','40.794618');localStorage.setItem('bird:lng','-73.959878');localStorage.setItem('bird:dist','3');localStorage.setItem('bird:refreshMs','900000');});
 await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('#collage [data-sci]')).not.toHaveCount(0);
 await page.locator('#slider [data-i="1"]').click();await expect(page.locator('#statsTopSpec')).toContainText('Crow');await expect(page.locator('#statsHotspots')).toContainText('Near');
 await page.locator('#slider [data-i="2"]').click();await expect(page.locator('#atlasGrid .bird-card')).toHaveCount(3);
 await page.locator('#atlasGrid .bird-card[data-sci="Corvus brachyrhynchos"]').click();await expect(page.locator('#detail-modal')).toHaveAttribute('aria-hidden','false');await expect(page.locator('#modalDesc')).toHaveText('Synthetic crow description');await expect(page.locator('#modalSightingsBody')).toContainText('Fixture Park');
 await expect(page.locator('#modalWiki')).toHaveAttribute('href',/wikipedia.org/);await expect(page.locator('#modalEbird')).toHaveAttribute('href',/ebird.org/);
 await page.keyboard.press('Escape');await expect(page.locator('#detail-modal')).toHaveAttribute('aria-hidden','true');
 await page.locator('#atlasSort [data-sort="recent"]').click();await page.reload();await expect(page.locator('#atlasSort [data-sort="recent"]')).toHaveAttribute('aria-current','true');expect(await page.evaluate(()=>localStorage.getItem('bird:refreshMs'))).toBe('900000');
});
test('bookmarks, old hotspot preference and separate API origin keep working',async({page})=>{
 await page.route('**/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.AV_API_BASE='+JSON.stringify(apiBase)+';'}));
 await page.addInitScript(({apiBase})=>{(window as unknown as {AV_API_BASE:string}).AV_API_BASE=apiBase;localStorage.setItem('bird:sourceMode','hotspot');localStorage.setItem('bird:regionCode','L1');localStorage.setItem('bird:regionName','Fixture Park');}, {apiBase});
 await page.goto(base+'/#sci=Corvus%20brachyrhynchos');await expect(page.locator('#detail-modal')).toHaveAttribute('aria-hidden','false');await expect(page.locator('#modalDesc')).toHaveText('Synthetic crow description');await expect(page.locator('#staticLocation')).toContainText('Fixture Park');
 expect(calls.some(u=>new URL(u).searchParams.get('r')==='L1')).toBe(true);expect(calls.some(u=>new URL(u).pathname.includes('/geo/recent/amecro'))).toBe(true);
 await page.keyboard.press('Escape');await page.goto(base+'/#about');await expect(page.locator('#about-modal')).toHaveAttribute('aria-hidden','false');await page.keyboard.press('Escape');await expect(page.locator('#about-modal')).toHaveAttribute('aria-hidden','true');
});
test('mobile, light theme, custom windows and nearby refresh failure preserve visible rows',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
 await page.locator('#customWindowBtn').click();await page.locator('#customWindowDays').fill('7');await page.locator('#customWindowApply').click();await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
 await page.locator('#slider [data-i="2"]').click();await page.locator('#atlasGrid .bird-card[data-sci="Corvus brachyrhynchos"]').click();await expect(page.locator('#modalSightingsBody')).toContainText('Fixture Park');nearbyFailure=true;await page.locator('#modalSightingsRefresh').click();await expect(page.locator('#modalSightingsStatus')).toContainText(/unable|failed|could|error/i);await expect(page.locator('#modalSightingsBody')).toContainText('Fixture Park');
});

test('all window presets and refresh preferences persist; manual refresh reaches Express',async({page})=>{
 await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
 for(const hours of [168,336,720,24]){await page.locator('#winPick [data-h="'+hours+'"]').click();await expect.poll(()=>page.evaluate(()=>localStorage.getItem('bird:window'))).toBe(String(hours));await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');}
 await page.locator('#refreshBtn').click();await expect(page.locator('#geoRefreshSeg')).toBeVisible();
 for(const ms of [60000,300000,900000,3600000]){await page.locator('#geoRefreshSeg [data-ms="'+ms+'"]').click();await expect.poll(()=>page.evaluate(()=>localStorage.getItem('bird:refreshMs'))).toBe(String(ms));}
 await expect(page.locator('#geoNextRefresh')).not.toBeEmpty();const before=calls.length;await page.locator('#geoRefreshBtn').click();await expect.poll(()=>calls.length).toBeGreaterThan(before);await expect(page.locator('#geoRefreshBtn')).toBeEnabled();
});

test('geolocation success updates saved coordinates and denial preserves them',async({page})=>{
 await page.addInitScript(()=>{let attempt=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(ok:(p:unknown)=>void,fail:(e:unknown)=>void)=>{if(attempt++===0)ok({coords:{latitude:41.123456,longitude:-72.654321}});else fail({code:1,PERMISSION_DENIED:1});}}});});
 await page.goto(base);await page.locator('#locationBtn').click();await page.locator('#geoLocate').click();await expect(page.locator('#geoLocationStatus')).toHaveText('location found');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('bird:lat'))).toBe('41.123456');await expect(page.locator('#geoLng')).toHaveValue('-72.654321');
 await page.locator('#geoLocate').click();await expect(page.locator('#geoLocationStatus')).toHaveText('location permission denied');await expect(page.locator('#geoLocate')).toBeEnabled();expect(await page.evaluate(()=>localStorage.getItem('bird:lat'))).toBe('41.123456');
 await page.locator('#geoDistVal').fill('12');await page.locator('#geoDistVal').press('Tab');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('bird:dist'))).toBe('12');
});

test('hotspot discovery search selection deselection and clear retain preference shape',async({page})=>{
 await page.goto(base);await page.locator('#locationBtn').click();await page.locator('#geoSourceSeg [data-source="hotspot"]').click();await page.locator('#hotspotSearch').fill('Fixture');await expect(page.locator('[data-hotspot-id="L1"]')).toBeVisible();await page.locator('[data-hotspot-id="L1"]').click();await expect(page.locator('#hotspotCount')).toHaveText('1 of 10 selected');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('bird:hotspots'))).toBe(JSON.stringify([{locId:'L1',locName:'Fixture Park'}]));
 await page.locator('[data-hotspot-id="L1"]').click();await expect(page.locator('#hotspotCount')).toHaveText('0 of 10 selected');await page.locator('[data-hotspot-id="L1"]').click();await page.locator('#clearHotspots').click();await expect(page.locator('#hotspotCount')).toHaveText('0 of 10 selected');expect(await page.evaluate(()=>localStorage.getItem('bird:hotspots'))).toBe('[]');
 await page.locator('#hotspotSearch').fill('absent');await expect(page.locator('#hotspotResults')).toContainText('no hotspots found');
});

test('empty observations render empty atlas and stats without a stuck loader',async({page})=>{
 empty=true;await page.addInitScript(()=>{localStorage.setItem('bird:lat','12.345');localStorage.setItem('bird:lng','67.89');});await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');await page.locator('#slider [data-i="2"]').click();await expect(page.locator('#atlasGrid .bird-card')).toHaveCount(0);await page.locator('#slider [data-i="1"]').click();await expect(page.locator('#statsHotspots')).toContainText('no hotspot observations');
});


test('ten selected hotspots disable an eleventh and selection survives reload',async({page})=>{
 await page.goto(base);await page.locator('#locationBtn').click();await page.locator('#geoSourceSeg [data-source="hotspot"]').click();await page.locator('#hotspotSearch').fill('Fixture');
 for(let i=1;i<=10;i++)await page.locator('[data-hotspot-id="L'+i+'"]').click();
 await expect(page.locator('#hotspotCount')).toHaveText('10 of 10 selected');await expect(page.locator('[data-hotspot-id="L11"]')).toHaveAttribute('aria-disabled','true');
 await page.locator('[data-hotspot-id="L11"]').click({force:true});expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bird:hotspots')||'[]').length)).toBe(10);
 await page.reload();await page.locator('#locationBtn').click();await expect(page.locator('#hotspotCount')).toHaveText('10 of 10 selected');
});

test('hash history restores modal and unavailable artwork retains description',async({page})=>{
 await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
 await page.evaluate(()=>{location.hash='sci=Corvus%20brachyrhynchos';});await expect(page.locator('#detail-modal')).toHaveAttribute('aria-hidden','false');
 await page.goBack();await expect(page.locator('#detail-modal')).toHaveAttribute('aria-hidden','true');await page.goForward();await expect(page.locator('#detail-modal')).toHaveAttribute('aria-hidden','false');
 await page.evaluate(()=>{location.hash='sci=Unknown%20fixture';});await expect(page.locator('#modalPoseToggle')).toHaveAttribute('data-unavailable','true');await expect(page.locator('#modalDesc')).toHaveText('Synthetic crow description');await page.keyboard.press('Escape');await expect(page.locator('#detail-modal')).toHaveAttribute('aria-hidden','true');
});

test('unlimited saved window migrates; resize and both real artwork poses work',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bird:window','1000000'));await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');await expect(page.locator('#winPick [data-h="720"]')).toHaveAttribute('aria-current','true');expect(await page.evaluate(()=>localStorage.getItem('bird:window'))).toBe('720');
 await page.setViewportSize({width:600,height:850});await expect(page.locator('#collage [data-sci]')).not.toHaveCount(0);await page.setViewportSize({width:1280,height:900});
 await page.evaluate(()=>{location.hash='sci=Corvus%20brachyrhynchos';});
 for(const pose of [1,2]){const button=page.locator('#modalPoseToggle [data-pose="'+pose+'"]');await expect(button).not.toHaveAttribute('data-unavailable','true');await button.click();await expect(button).toHaveAttribute('aria-current','true');await expect.poll(async()=>new URL(await page.locator('#modalImg').getAttribute('src')||'',base).searchParams.get('pose')).toBe(pose===1?null:'2');await expect.poll(()=>page.locator('#modalImg').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);}
});

test('automatic refresh pauses while hidden and catches up on return',async({page})=>{
 let dashboards=0;page.on('request',r=>{if(r.url().includes('action=dashboard'))dashboards++;});
 await page.addInitScript(()=>{localStorage.setItem('bird:refreshMs','60000');Object.defineProperty(document,'hidden',{configurable:true,get:()=>Boolean((window as unknown as {testHidden?:boolean}).testHidden)});});
 await page.clock.install();await page.goto(base);await page.clock.runFor(2500);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
 const initial=dashboards;await page.clock.fastForward(60000);await expect.poll(()=>dashboards).toBeGreaterThan(initial);
 await page.evaluate(()=>{(window as unknown as {testHidden:boolean}).testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});const hiddenCount=dashboards;
 await page.clock.fastForward(120000);expect(dashboards).toBe(hiddenCount);
 await page.evaluate(()=>{(window as unknown as {testHidden:boolean}).testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>dashboards).toBeGreaterThan(hiddenCount);
 await page.clock.runFor(2500);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
});

test('late real dashboard response cannot replace a newer selected window',async({page})=>{
 await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let arrived=false;
 await page.route('**/birdnet-api?**',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('action')==='dashboard'&&url.searchParams.get('hours')==='168'){const response=await route.fetch();arrived=true;await gate;await route.fulfill({response});}else await route.continue();});
 await page.locator('#winPick [data-h="168"]').click();await expect.poll(()=>arrived).toBe(true);await page.locator('#winPick [data-h="24"]').click();await page.locator('#slider [data-i="2"]').click();
 await expect(page.locator('#atlasGrid .bird-card[data-sci="Corvus brachyrhynchos"] .stat .n')).toHaveText('4');release();await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');await expect(page.locator('#atlasGrid .bird-card[data-sci="Corvus brachyrhynchos"] .stat .n')).toHaveText('4');await expect(page.locator('#winPick [data-h="24"]')).toHaveAttribute('aria-current','true');
});
