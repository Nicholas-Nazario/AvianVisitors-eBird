import {test,expect} from '@playwright/test';
import {createServer,type Server} from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createApp} from '../../server/app.js';
import {loadConfig} from '../../server/config.js';
const reference=JSON.parse(readFileSync('tests/fixtures/reference/dashboard-mixed.json','utf8'));
let server:Server,base:string,temp:string,rows:unknown[],replay=false,guardMenu=false;
const proxyAttempts:{method:string;authorized:boolean}[]=[];
const dashboardHours:string[]=[];
test.beforeEach(async({page})=>{
 temp=await mkdtemp(path.join(os.tmpdir(),'avian-remaining-'));rows=reference.input.rows;replay=false;guardMenu=false;proxyAttempts.length=0;dashboardHours.length=0;
 const config=loadConfig(process.cwd(),{AV_DATA_DIR:temp,EBIRD_API_KEY:'synthetic',TZ:'UTC',AV_REMBG_PATH:path.join(temp,'absent')});
 const app=createApp({config,now:()=>new Date('2026-10-21T12:00:00Z'),http:async url=>({status:200,body:Buffer.from(new URL(url).hostname==='en.wikipedia.org'?JSON.stringify({extract:'Fixture description',title:'Fixture'}):JSON.stringify(rows))})});
 server=createServer((req,res)=>{
  const url=new URL(req.url||'/', 'http://localhost');
  if(guardMenu&&url.pathname.endsWith('/menu.php')){const authorized=req.headers.authorization==='Basic '+Buffer.from('birdnet:synthetic-password').toString('base64');proxyAttempts.push({method:req.method||'',authorized});if(!authorized){res.writeHead(401,{'WWW-Authenticate':'Basic realm=fixture'});res.end();return;}}
  if(url.pathname.endsWith('birdnet-api.php')&&url.searchParams.get('action')==='dashboard'){
   dashboardHours.push(url.searchParams.get('hours')||'24');
   // Only the oracle side replays independently captured PHP output. Candidate uses actual Express routes.
   if(replay){res.setHeader('Content-Type','application/json');res.end(reference.expected.body);return;}
  }
  app(req,res);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('address');base='http://127.0.0.1:'+address.port;
 await page.addInitScript(()=>{Math.random=()=>0.25;});
});
test.afterEach(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(temp,{recursive:true,force:true});});

test('custom windows clamp limits, truncate fractions, reject empty input and persist',async({page})=>{
 await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
 for(const [input,hours] of [['0',24],['1',24],['30',720],['31',720],['-2',24],['2.9',48]] as const){
  await page.locator('#customWindowBtn').click();await page.locator('#customWindowDays').fill(input);await page.locator('#customWindowDays').press('Enter');
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('bird:window'))).toBe(String(hours));await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');expect(dashboardHours.at(-1)).toBe(String(hours));
 }
 await page.locator('#customWindowBtn').click();await page.locator('#customWindowDays').fill('');const requests=dashboardHours.length;await page.locator('#customWindowApply').click();await expect(page.locator('#customWindowDays')).toHaveValue('2');expect(dashboardHours.length).toBe(requests);await page.locator('#customWindowDays').focus();await page.keyboard.press('Escape');await expect(page.locator('#customWindowPopover')).toHaveAttribute('aria-hidden','true');
 await page.reload();await expect(page.locator('#customWindowBtn')).toHaveAttribute('aria-current','true');expect(await page.evaluate(()=>localStorage.getItem('bird:window'))).toBe('48');
});

test('stats values, timeline order, distances, highlights and atlas links match baseline data',async({page})=>{
 await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');await page.locator('#slider [data-i="1"]').click();
 await expect(page.locator('#statsTopSpec li > span:nth-child(2)')).toHaveText(['American Crow','Black-capped Chickadee','American Robin']);await expect(page.locator('#statsTopSpec .ct')).toHaveText(['4','2','1']);
 await expect(page.locator('.stats-tl-col .sci')).toHaveText(['Turdus migratorius','Corvus brachyrhynchos','Poecile atricapillus']);await expect(page.locator('.stats-tl-ytick')).toHaveText(['0','1','2','3','4']);
 expect(await page.locator('.stats-tl-square').evaluateAll(elements=>elements.map(el=>(el as HTMLElement).style.bottom))).toEqual(['13.8%','55%','27.5%']);
 await expect(page.locator('.stats-hotspot h4')).toHaveText(['Near','Far','No coordinates']);await expect(page.locator('.stats-hotspot').nth(0)).toContainText('<0.1 km away');await expect(page.locator('.stats-hotspot').nth(1)).toContainText('23.1 km away');await expect(page.locator('.stats-hotspot').nth(2)).toContainText('distance unavailable');await expect(page.locator('.stats-hotspot').nth(0).locator('tbody tr td:nth-child(2)')).toHaveText(['2','1']);
 const crow='Corvus brachyrhynchos';const row=page.locator('#statsTopSpec [data-sci="'+crow+'"]'),column=page.locator('.stats-tl-col[data-sci="'+crow+'"]');await row.hover();await expect(column).toHaveClass(/sync-hi/);await page.mouse.move(1,1);await expect(column).not.toHaveClass(/sync-hi/);await column.hover();await expect(row).toHaveClass(/sync-hi/);await row.click();await expect(page.locator('#detail-modal')).toHaveAttribute('aria-hidden','false');await expect(page).toHaveURL(/#sci=Corvus%20brachyrhynchos/);
});

test('top ten and desktop subset retain counts while mobile graph scrolls all species',async({page})=>{
 rows=Array.from({length:40},(_,i)=>({sciName:'Fixture species'+i,comName:'Fixture '+i,speciesCode:'fixture'+i,howMany:i+1,obsDt:'2026-10-21 11:'+String(i).padStart(2,'0'),locId:'L1',locName:'Fixture',lat:40.79,lng:-73.95}));
 await page.setViewportSize({width:1000,height:800});await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');await page.locator('#slider [data-i="1"]').click();await expect(page.locator('#statsTopSpec li')).toHaveCount(10);await expect(page.locator('#statsTopSpec .ct')).toHaveText(['40','39','38','37','36','35','34','33','32','31']);const desktop=await page.locator('.stats-tl-col').count();expect(desktop).toBeLessThan(40);expect(desktop).toBeGreaterThanOrEqual(3);await expect(page.locator('.stats-tl-footer')).toContainText(desktop+' most observed of 40');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.stats-tl-col')).toHaveCount(40);expect(await page.locator('#statsTimeline').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);await expect(page.locator('.stats-tl-col .sci').first()).toHaveText('Fixture species0');await expect(page.locator('.stats-tl-col .sci').last()).toHaveText('Fixture species39');
});

test('collage sizes follow counts and real silhouette pointer opens matching species',async({page})=>{
 await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');await expect(page.locator('#collage .gtile')).toHaveCount(3);
 const areas=await page.locator('#collage .gtile').evaluateAll(elements=>Object.fromEntries(elements.map(el=>{const b=el.getBoundingClientRect();return [el.getAttribute('data-sci'),b.width*b.height];})));expect(areas['Corvus brachyrhynchos']).toBeGreaterThan(areas['Poecile atricapillus']!);expect(areas['Poecile atricapillus']).toBeGreaterThan(areas['Turdus migratorius']!);
 const tile=page.locator('#collage .gtile[data-sci="Corvus brachyrhynchos"]');const box=await tile.boundingBox();if(!box)throw Error('missing tile');let point:{x:number;y:number}|undefined;
 for(let y=1;y<9&&!point;y++)for(let x=1;x<9&&!point;x++){const p={x:box.x+box.width*x/10,y:box.y+box.height*y/10};await page.mouse.move(p.x,p.y);if(await tile.evaluate(el=>el.classList.contains('is-hover')))point=p;}
 expect(point).toBeDefined();await expect(page.locator('#collageTip')).toContainText('American Crow');await expect(page.locator('#collageTip .ct-n')).toHaveText('4');await page.mouse.click(point!.x,point!.y);await expect(page.locator('#detail-modal')).toHaveAttribute('aria-hidden','false');await expect(page).toHaveURL(/#sci=Corvus%20brachyrhynchos/);
});

test('browser geolocation permission grant uses the native API',async({page,context})=>{
 await context.setGeolocation({latitude:41.234567,longitude:-72.345678});await context.grantPermissions(['geolocation'],{origin:base});
 await page.goto(base);await page.locator('#locationBtn').click();await page.locator('#geoLocate').click();await expect(page.locator('#geoLocationStatus')).toHaveText('location found');await expect(page.locator('#geoLat')).toHaveValue('41.234567');await expect(page.locator('#geoLng')).toHaveValue('-72.345678');expect(await page.evaluate(()=>localStorage.getItem('bird:lat'))).toBe('41.234567');
});

test('browser geolocation permission denial preserves saved location',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','Explicit permission denial is exercised via Chromium browser permission protocol; no navigator override.');
 const session=await context.newCDPSession(page);await session.send('Browser.setPermission',{permission:{name:'geolocation'},setting:'denied',origin:base});
 await page.goto(base);await page.locator('#locationBtn').click();const lat=await page.locator('#geoLat').inputValue();await page.locator('#geoLocate').click();await expect(page.locator('#geoLocationStatus')).toHaveText('location permission denied');await expect(page.locator('#geoLat')).toHaveValue(lat);await expect(page.locator('#geoLocate')).toBeEnabled();
});

for(const viewport of [{width:1280,height:900},{width:390,height:844}])for(const theme of ['light','dark']){
 test(`PHP golden and Express refreshed views render identical pixels at ${viewport.width}px in ${theme} theme; open client survives handover`,async({page,browser},testInfo)=>{
  await page.setViewportSize(viewport);await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));await page.addInitScript(theme=>localStorage.setItem('bird:theme',theme),theme);
  replay=true;await page.goto(base);await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
  const capture=async(target=page)=>{const images:Buffer[]=[];for(const view of [0,1,2]){await target.locator('#slider [data-i="'+view+'"]').click();await expect.poll(()=>target.locator('#v'+view+' img').evaluateAll(images=>images.every(img=>(img as HTMLImageElement).complete))).toBe(true);await target.waitForTimeout(1200);images.push(await target.locator('#v'+view).screenshot({animations:'disabled'}));}return images;};
  const cold=await capture();
  const refresh=async()=>{await page.locator('#refreshBtn').click();await page.locator('#geoRefreshBtn').click();await expect(page.locator('#geoRefreshBtn')).toBeEnabled();await page.locator('#refresh-dd [data-menu-close]').click();await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');};
  // Establish the oracle's own refreshed layout before comparing a candidate refresh.
  // Chromium can lay out a decoded cached mobile image differently from its cold lazy image.
  await refresh();const baseline=await capture();
  await testInfo.attach('oracle-cold-atlas',{body:cold[2]!,contentType:'image/png'});await testInfo.attach('oracle-refreshed-atlas',{body:baseline[2]!,contentType:'image/png'});
  // The already-loaded byte-identical legacy client now reaches replacement Express without navigation/reload.
  await page.evaluate(()=>{(window as unknown as {handoverMarker:string}).handoverMarker='original-open-document';});replay=false;
  const navigation=page.url();await refresh();
  expect(await page.evaluate(()=>(window as unknown as {handoverMarker:string}).handoverMarker)).toBe('original-open-document');expect(page.url()).toBe(navigation);
  const candidate=await capture();
  for(let i=0;i<baseline.length;i++){
   const expected=await sharp(baseline[i]).ensureAlpha().raw().toBuffer({resolveWithObject:true});const actual=await sharp(candidate[i]).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   await testInfo.attach('php-golden-view-'+i,{body:baseline[i]!,contentType:'image/png'});await testInfo.attach('express-view-'+i,{body:candidate[i]!,contentType:'image/png'});
   expect(actual.info).toEqual(expected.info);let changed=0;for(let p=0;p<actual.data.length;p+=4)if(!actual.data.subarray(p,p+4).equals(expected.data.subarray(p,p+4)))changed++;
   expect(changed,'changed pixels in refreshed view '+i).toBe(0);
   await writeFile(testInfo.outputPath('express-view-'+i+'.png'),candidate[i]!);
  }
  const coldContext=await browser.newContext({viewport});
  try {
   const coldPage=await coldContext.newPage();await coldPage.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));await coldPage.addInitScript(theme=>{Math.random=()=>0.25;localStorage.setItem('bird:theme',theme);},theme);
   await coldPage.goto(base);await expect(coldPage.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');const coldCandidate=await capture(coldPage);
   for(let i=0;i<cold.length;i++){
    const expected=await sharp(cold[i]).ensureAlpha().raw().toBuffer({resolveWithObject:true}),actual=await sharp(coldCandidate[i]).ensureAlpha().raw().toBuffer({resolveWithObject:true});expect(actual.info).toEqual(expected.info);expect(actual.data.equals(expected.data),'cold pixels in view '+i).toBe(true);
   }
  } finally {await coldContext.close();}
  const coldPixels=await sharp(cold[2]).ensureAlpha().raw().toBuffer(),warmPixels=await sharp(baseline[2]).ensureAlpha().raw().toBuffer();let coldWarmChanged=0;for(let i=0;i<coldPixels.length;i+=4)if(!coldPixels.subarray(i,i+4).equals(warmPixels.subarray(i,i+4)))coldWarmChanged++;
  await writeFile(testInfo.outputPath('visual-comparison.json'),JSON.stringify({viewport,theme,refreshedCandidateChangedPixels:0,coldCandidateMatches:true,oracleColdVsRefreshedAtlasChangedPixels:coldWarmChanged},null,2));
 });
}

test('already-open production client continues against local Express after browser-only API handover',async({page})=>{
 test.skip(process.env.AV_LIVE_CLIENT!=='1','Opt-in read-only production client smoke; candidate transport remains synthetic.');
 await page.addInitScript(()=>{localStorage.setItem('bird:window','24');localStorage.setItem('bird:refreshMs','3600000');localStorage.setItem('bird:theme','dark');});
 await page.goto('https://avianvisitors-ebird.fly.dev/');await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');
 const original=await page.evaluate(()=>{(window as unknown as {migrationDocument:string}).migrationDocument='loaded-from-production';return {href:location.href,scripts:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('/apt.js')).length};});
 let candidateRequests=0;
 await page.route('https://avianvisitors-ebird.fly.dev/avian/api/**',async route=>{
  const url=new URL(route.request().url());candidateRequests++;const response=await route.fetch({url:base+url.pathname+url.search});await route.fulfill({response});
 });
 await page.locator('#refreshBtn').click();await page.locator('#geoRefreshBtn').click();await expect(page.locator('#geoRefreshBtn')).toBeEnabled();await page.locator('#refresh-dd [data-menu-close]').click();await expect(page.locator('#ebirdLoading')).toHaveAttribute('aria-hidden','true');expect(candidateRequests).toBeGreaterThan(0);
 await page.locator('#slider [data-i="2"]').click();await expect(page.locator('#atlasGrid .bird-card[data-sci="Corvus brachyrhynchos"] .stat .n')).toHaveText('4');await page.locator('#atlasGrid .bird-card[data-sci="Corvus brachyrhynchos"]').click();await expect(page.locator('#modalDesc')).toHaveText('Fixture description');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 expect(await page.evaluate(()=>(window as unknown as {migrationDocument:string}).migrationDocument)).toBe('loaded-from-production');expect(await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.endsWith('/apt.js')).length)).toBe(original.scripts);expect(new URL(page.url()).origin).toBe(new URL(original.href).origin);
});


test('external proxy menu challenge rejects wrong password and unlocks through Express POST',async({page})=>{
 guardMenu=true;await page.goto(base);await page.evaluate(()=>{document.body.classList.replace('av-local','av-forwarded');});await page.locator('#locationBtn').click();await expect(page.locator('#unlockForm')).toBeVisible();await page.locator('#lockPass').fill('wrong');await page.locator('#unlockForm button').click();await expect(page.locator('#lockHint')).toHaveText('wrong password.');await page.locator('#lockPass').fill('synthetic-password');await page.locator('#unlockForm button').click();await expect(page.locator('#geoLat')).toBeVisible();await expect(page.locator('#location-locked')).not.toBeVisible();// Browsers may retry a request after a native Basic Auth challenge (observed in WebKit).
 const phases=proxyAttempts.filter((attempt,i,all)=>i===0||attempt.method!==all[i-1]!.method||attempt.authorized!==all[i-1]!.authorized);expect(phases).toEqual([{method:'GET',authorized:false},{method:'POST',authorized:false},{method:'POST',authorized:true}]);
});
