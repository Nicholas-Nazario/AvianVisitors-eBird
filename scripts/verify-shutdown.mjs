// Local-only signal smoke against the production entrypoint.
import {execFileSync,spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const image=process.argv[2]||'avianvisitors:candidate';
const name='avian-active-shutdown-'+process.pid;
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try {
  docker('run','-d','--name',name,'--network','none',image);
  let ready=false;
  for(let i=0;i<100;i++) {
    try {docker('exec',name,'node','-e',"fetch('http://127.0.0.1:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))");ready=true;break;}
    catch {await new Promise(r=>setTimeout(r,100));}
  }
  assert.ok(ready,'startup');
  const child=spawn('docker',['exec',name,'node','--input-type=module','-e',`
import http from 'node:http';
http.get('http://127.0.0.1:8080/avian/assets/illustrations/coccyzus-americanus-2.png',res=>{
  if(res.statusCode!==200){process.exit(2);return;}
  res.once('data',()=>{res.pause();console.log('ACTIVE 200');setTimeout(()=>res.resume(),500);});
  res.on('end',()=>console.log('DONE'));
}).on('error',()=>process.exit(3));
`],{stdio:['ignore','pipe','pipe']});
  const exited=new Promise(resolve=>child.once('exit',resolve));
  await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(new Error('response timeout')),10000);child.stdout.once('data',data=>{clearTimeout(deadline);assert.match(String(data),/ACTIVE 200/);resolve();});child.once('error',reject);child.once('exit',code=>{clearTimeout(deadline);reject(new Error('response exited before signal: '+code));});});
  docker('kill','--signal','SIGTERM',name);
  await exited;
  for(let i=0;i<100;i++){if(docker('inspect','-f','{{.State.Running}}',name)==='false')break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(docker('inspect','-f','{{.State.Running}}',name),'false');
  assert.equal(docker('inspect','-f','{{.State.ExitCode}}',name),'0');
  console.log('PASS production entrypoint SIGTERM during paused HTTP 200 image response');
} finally {try{docker('rm','-f',name);}catch{}}
