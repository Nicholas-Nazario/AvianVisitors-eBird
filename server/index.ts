import { createApp } from './app.js';
import { mkdir } from 'node:fs/promises';
import { loadConfig } from './config.js';
import { shutdownRenderers } from './images/renderer.js';
const config=loadConfig();
await mkdir(config.dataDir,{recursive:true});
const port=Number(process.env.PORT || 8080);
const host=process.env.HOST || '0.0.0.0';
const server=createApp({config}).listen(port,host,()=>console.log(`AvianVisitors listening on ${host}:${port}`));
let closing=false;
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{
  if(closing)return; closing=true;
  shutdownRenderers();
  server.close(()=>{process.exitCode=0;});
  server.closeIdleConnections();
  const deadline=setTimeout(()=>{server.closeAllConnections();process.exit(1);},25_000);deadline.unref();
});
