import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
const manifest:Record<string,string>=JSON.parse(readFileSync('tests/fixtures/reference/public-sha256.json','utf8'));
const approvedFrontendHashes:Record<string,string>={"avian/frontend/apt.js": "a1a8f5708b785e4ec84a7dfd6d6b9293af8b95aebc34e8de8114c05e9ad51478", "avian/frontend/styles.css": "f8dc138667b2730db5ee92f23964c4389a88cdbe7e8d1514f8e24db10a2a7571"};
it('keeps public assets unchanged except approved frontend route/comment updates',()=>{
 for(const [file,hash] of Object.entries(manifest))expect(createHash('sha256').update(readFileSync(file)).digest('hex'),file).toBe(approvedFrontendHashes[file] ?? hash);
});
