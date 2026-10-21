import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
const manifest:Record<string,string>=JSON.parse(readFileSync('tests/fixtures/reference/public-sha256.json','utf8'));
it('keeps all 845 baseline frontend and artwork files byte-identical',()=>{
 for(const [file,hash] of Object.entries(manifest))expect(createHash('sha256').update(readFileSync(file)).digest('hex'),file).toBe(hash);
});
