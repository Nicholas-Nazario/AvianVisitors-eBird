import express from 'express';
import path from 'node:path';
import type { AppOptions, Dependencies } from './contracts.js';
import { loadConfig } from './config.js';
import { transport } from './http/transport.js';
import { parseQuery } from './http/query.js';
import { createBirdnetRouter } from './routes/birdnet.js';
import { createWikiRouter } from './routes/wiki.js';
import { createCutoutRouter } from './routes/cutout.js';
import { createMenuRouter } from './routes/menu.js';
export function createApp(options: AppOptions = {}) {
  const config=options.config ?? loadConfig();
  process.env.TZ=config.timezone;
  const deps: Dependencies={config,now:options.now ?? (()=>new Date()),http:options.http ?? transport,imageProcessor:options.imageProcessor};
  const app=express();
  app.disable('x-powered-by'); app.set('query parser',parseQuery);
  app.use('/avian/api',(_req,res,next)=>{res.set({'Access-Control-Allow-Origin':config.corsOrigin,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});if(_req.method==='OPTIONS'){res.status(204).end();return;}next();});
  app.use('/avian/api/birdnet-api.php',createBirdnetRouter(deps));
  app.use('/avian/api/wiki.php',createWikiRouter(deps));
  app.use('/avian/api/cutout.php',createCutoutRouter(deps));
  app.use('/avian/api/menu.php',createMenuRouter(deps));
  const frontend=path.join(config.rootDir,'avian/frontend');
  const publicFiles=['index.html','apt.js','config.js','styles.css','dims.json','masks.json','nest.webp'];
  for(const filename of publicFiles) {
    const send: express.RequestHandler=(_req,res)=>res.sendFile(path.join(frontend,filename));
    app.get('/'+filename,send);app.get('/avian/frontend/'+filename,send);
  }
  app.get('/',(_req,res)=>res.sendFile(path.join(frontend,'index.html')));
  app.get('/favicon.png',(_req,res)=>res.sendFile(path.join(config.rootDir,'avian/assets/favicon.png')));
  // Only known public artwork trees. Reference images and working files stay private.
  for(const dir of ['illustrations','cutouts','loading-animation-cutouts']) app.use('/avian/assets/'+dir,express.static(path.join(config.rootDir,'avian/assets',dir),{dotfiles:'deny',index:false}));
  app.use((_req,res)=>{res.status(404).end();});
  app.use((error: unknown,_req: express.Request,res: express.Response,_next: express.NextFunction)=>{console.error(error instanceof Error?error.message:'Request failed');if(!res.headersSent)res.status(500).json({error:'Internal server error'});});
  return app;
}
