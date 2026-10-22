import { describe,it,expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../server/config.js';
import { parseQuery,queryValues,legacyInt,isNumeric } from '../../server/http/query.js';
describe('configuration and query parsing',()=>{
  it('merges local configuration and only nonempty environment tokens',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'avian-config-'));await mkdir(path.join(root,'avian/data'),{recursive:true});
    await writeFile(path.join(root,'avian/data/ebird.json'),JSON.stringify({token:'local',lat:1,extra:'retained'}));
    expect(loadConfig(root,{}).ebird).toMatchObject({token:'local',lat:1,lng:-73.959878,dist:3});
    expect(loadConfig(root,{EBIRD_API_KEY:''}).ebird.token).toBe('local');
    expect(loadConfig(root,{EBIRD_API_KEY:'secret'}).ebird.token).toBe('secret');
  });
  it('keeps scalar overwrite and indexed insertion order',()=>{
    expect(parseQuery('a=first&a=last').a).toBe('last');
    const q=parseQuery('regionCode[1]=L1&regionCode[0]=L2&regionCode[]=L3&regionCode[1]=L4');
    expect(queryValues(q.regionCode as Record<string,string>)).toEqual(['L4','L2','L3']);
    expect(queryValues(parseQuery('regionCode=old&regionCode[]=L1').regionCode as Record<string,string>)).toEqual(['L1']);
  });
  it('handles integer prefix conversion and numeric override rules',()=>{
    expect(legacyInt('12birds')).toBe(12);expect(legacyInt('nonsense')).toBe(0);expect(legacyInt('1.2e2')).toBe(120);
    expect(isNumeric('12birds')).toBe(false);expect(isNumeric(' 1.2e2 ')).toBe(true);
  });
});
