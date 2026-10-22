import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.resolve(root,process.argv[2]??'static-site');
// Empty outputs prevent stale or private files from entering a Pages artifact.
if(destination===root||root.startsWith(destination+path.sep)||['avian','server','tests','docs','.git','scripts'].some(dir=>destination===path.join(root,dir)||destination.startsWith(path.join(root,dir)+path.sep)))throw new Error('Choose a separate empty output directory.');
await mkdir(destination,{recursive:true});
if((await readdir(destination)).length)throw new Error('Output directory must be empty.');
for(const filename of ['index.html','apt.js','config.js','styles.css','dims.json','masks.json','nest.webp'])await cp(path.join(root,'avian/frontend',filename),path.join(destination,filename));
for(const dir of ['illustrations','cutouts','loading-animation-cutouts']){
  const target=path.join(destination,'avian/assets',dir);await mkdir(path.dirname(target),{recursive:true});
  await cp(path.join(root,'avian/assets',dir),target,{recursive:true});
}
await cp(path.join(root,'avian/assets/favicon.png'),path.join(destination,'favicon.png'));
console.log(`Static frontend packaged at ${destination}. Set its config.js AV_API_BASE to your existing backend URL before publishing.`);
