import { Router, type Response } from 'express';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Dependencies } from '../contracts.js';
import { phpInt, phpTruthy } from '../http/query.js';
import { allowedPhoto, scientificName, summaryUrl, validName } from '../images/common.js';
import { pngProcessor } from '../images/process.js';
import { renderImage } from '../images/renderer.js';
async function existing(file: string,minimum=1025): Promise<boolean> {try {const s=await stat(file);return s.isFile()&&s.size>=minimum;} catch {return false;}}
function error(res: Response,status: number,body: string,plain=false): void {res.status(status).set('Content-Type',plain?'text/plain; charset=utf-8':'text/html; charset=UTF-8').send(body);}
async function serve(res: Response,file: string): Promise<void> {const bytes=await readFile(file);res.set({'Content-Type':'image/png','Cache-Control':'public, max-age=86400','Content-Length':String(bytes.length)}).send(bytes);}
export function createCutoutRouter(deps: Dependencies): Router {
  const router=Router();
  router.all('/',async(req,res)=>{
    const sci=scientificName(req.query.sci);
    if(!sci||!validName(sci)) {error(res,400,sci?'invalid sci':'sci required');return;}
    const slug=sci.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    let pose=req.query.pose===undefined?1:phpInt(req.query.pose);if(pose<1||pose>99)pose=1;
    const assets=path.join(deps.config.rootDir,'avian/assets');
    const candidates=[path.join(assets,'illustrations',slug+(pose===1?'':`-${pose}`)+'.png')];
    if(pose!==1)candidates.push(path.join(assets,'illustrations',slug+'.png'));
    candidates.push(path.join(assets,'cutouts',slug+'.png'),path.join(deps.config.legacyImageCacheDir,slug+'.png'),path.join(deps.config.imageCacheDir,slug+'.png'));
    for(const file of candidates) if(await existing(file)) {await serve(res,file);return;}
    try {await access(deps.config.rendererPath,constants.X_OK);} catch {error(res,404,`no illustration bundled for ${sci} (install rembg-cli to enable Wikipedia fallback)`);return;}
    const options={headers:{'User-Agent':deps.config.userAgent},timeoutMs:12000};
    let source: unknown;
    try {const response=await deps.http(summaryUrl(sci),options);if(response.status<400){const data=JSON.parse(response.body.toString());source=data?.originalimage?.source??data?.thumbnail?.source;}} catch { /* missing photo */ }
    if(!phpTruthy(source)||!allowedPhoto(source)) {error(res,404,`no Wikipedia photo for ${sci}`);return;}
    let photo: Buffer;
    try {const response=await deps.http(String(source),options);if(response.status>=400||response.body.length<1024)throw new Error('photo');photo=response.body;} catch {error(res,503,'failed to fetch source image');return;}
    let temporary: string|undefined;
    try {
      await mkdir(deps.config.imageCacheDir,{recursive:true});
      temporary=await mkdtemp(path.join(deps.config.imageCacheDir,'.rembg-'));
      const input=path.join(temporary,'input.jpg'),output=path.join(temporary,'output.png');
      await writeFile(input,photo);
      await renderImage(deps.config.rendererPath,input,output);
      if(!await existing(output,1024)) {await rm(temporary,{recursive:true,force:true});temporary=undefined;error(res,500,"rembg failed (see your Pi's logs for details)",true);return;}
      const processed=await (deps.imageProcessor??pngProcessor).process(await readFile(output));
      await writeFile(output,processed);
      const destination=path.join(deps.config.imageCacheDir,slug+'.png');
      await rename(output,destination);
      await rm(temporary,{recursive:true,force:true});temporary=undefined;
      await serve(res,destination);
    } finally {if(temporary)await rm(temporary,{recursive:true,force:true});}
  });
  return router;
}
