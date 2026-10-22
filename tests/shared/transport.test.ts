import { it,expect } from 'vitest';
import http from 'node:http';
import { transport } from '../../server/http/transport.js';
it('aborts stalled body reads by the configured deadline',async()=>{
  const server=http.createServer((_req,res)=>{res.writeHead(200);res.write('{');});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try {const address=server.address();if(!address||typeof address==='string')throw new Error('address');await expect(transport(`http://127.0.0.1:${address.port}`,{timeoutMs:50})).rejects.toThrow();}
  finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
