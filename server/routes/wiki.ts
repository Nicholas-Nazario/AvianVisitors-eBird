import { Router } from 'express';
import type { Dependencies } from '../contracts.js';
import { allowedPhoto, scientificName, summaryUrl, validName } from '../images/common.js';
import { isTruthy } from '../http/query.js';
export function createWikiRouter(deps: Dependencies): Router {
  const router=Router();
  router.all('/',async (req,res)=>{
    res.set('Cache-Control','public, max-age=86400');
    const sci=scientificName(req.query.sci);
    if(!sci || !validName(sci)) {res.status(400).json({error:sci?'invalid sci':'sci required'});return;}
    let data: any;
    try {
      const response=await deps.http(summaryUrl(sci),{headers:{'User-Agent':deps.config.userAgent},timeoutMs:8000});
      if(response.status>=400) throw new Error('upstream');
      data=JSON.parse(response.body.toString());
      if(data===null || typeof data!=='object') throw new Error('shape');
    } catch {res.json({extract:null,thumbnail:null});return;}
    const thumb=data.thumbnail?.source;
    res.json({extract:data.extract??null,thumbnail:isTruthy(thumb)&&allowedPhoto(thumb)?{source:thumb}:null,title:data.title??null});
  });
  return router;
}
