import { spawn, type ChildProcess } from 'node:child_process';
const children=new Set<ChildProcess>();
export function shutdownRenderers(): void { for(const child of children) child.kill('SIGTERM'); }
export async function renderImage(executable: string,input: string,output: string): Promise<void> {
  await new Promise<void>((resolve)=>{
    const child=spawn(executable,['i','-m','u2netp','-ppm',input,output],{stdio:'ignore'});
    children.add(child);
    child.once('error',()=>{children.delete(child);resolve();});
    child.once('close',()=>{children.delete(child);resolve();});
  });
}
