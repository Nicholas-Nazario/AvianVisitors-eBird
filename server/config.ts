import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { AppConfig, EbirdConfig } from './contracts.js';
import { legacyString } from './http/query.js';
export function loadConfig(rootDir = process.cwd(), env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = env.AV_DATA_DIR || path.join(rootDir, 'avian/data');
  let loaded: Partial<EbirdConfig> = {};
  try { const value: unknown = JSON.parse(readFileSync(path.join(dataDir,'ebird.json'),'utf8')); if(value && typeof value === 'object') loaded=value; } catch { /* Legacy ignores absent/invalid config. */ }
  const ebird = {lat:40.794618,lng:-73.959878,dist:3,hotspot:true,back:30,token:'',...loaded};
  ebird.token=legacyString(ebird.token);
  if(env.EBIRD_API_KEY && env.EBIRD_API_KEY !== '0') ebird.token=env.EBIRD_API_KEY;
  return {rootDir,dataDir,ebird,imageCacheDir:env.AV_IMAGE_CACHE_DIR || path.join(dataDir,'cutouts'),legacyImageCacheDir:env.AV_LEGACY_IMAGE_CACHE_DIR || path.resolve(rootDir,'../BirdSongs/Extracted/cutouts'),rendererPath:env.AV_REMBG_PATH || '/usr/local/bin/rembg-cli',corsOrigin:(env.AV_CORS_ORIGIN && env.AV_CORS_ORIGIN !== '0') ? env.AV_CORS_ORIGIN : '*',userAgent:(env.AV_USER_AGENT && env.AV_USER_AGENT !== '0') ? env.AV_USER_AGENT : 'AvianVisitors/1.0 (+https://github.com/Twarner491/AvianVisitors)',timezone:env.TZ || 'UTC'};
}
