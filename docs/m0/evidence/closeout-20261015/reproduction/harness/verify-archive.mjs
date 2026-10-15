import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root='D:/Code/JianZJ-Hub',e=path.join(root,'docs/m0/evidence/closeout-20261015'),sha=b=>createHash('sha256').update(b).digest('hex')
const manifest=JSON.parse(fs.readFileSync(path.join(e,'manifest.json'),'utf8'))
for(const item of manifest.files){const b=fs.readFileSync(path.join(e,item.file));assert.equal(b.length,item.bytes,item.file);assert.equal(sha(b),item.sha256,item.file)}
const independent=JSON.parse(fs.readFileSync(path.join(e,'independent-acceptance/manifest.json'),'utf8'))
for(const item of independent){assert.equal(sha(fs.readFileSync(item.source)),item.sha256,item.source);assert.equal(sha(fs.readFileSync(path.join(e,item.file))),item.sha256,item.file)}
const broken=[]
for(const rel of ['README.md','docs/m0/README.md','docs/m0/CLOSEOUT.md','docs/m0/PROTOTYPE-HANDOFF.md','docs/m0/REPRODUCIBILITY.md','docs/m0/M1-ACCEPTANCE.md']){
 const p=path.join(root,rel),s=fs.readFileSync(p,'utf8');assert.ok(!s.includes('{{'),rel)
 for(const match of s.matchAll(/\]\(([^)]+)\)/g)){const target=match[1];if(/^(https?:|#)/.test(target))continue;if(!fs.existsSync(path.resolve(path.dirname(p),target)))broken.push({file:rel,target})}
}
assert.deepEqual(broken,[])
const unchanged=['package-lock.json','electron-builder.m0.json','electron.vite.config.ts','.gitignore','.gitattributes','src','scripts/m0/run.mjs','tests/m0/lifecycle.test.mjs','tests/m0/validation.test.mjs','docs/m0/DELIVERY-AUDIT.md','docs/m0/GIT-DELIVERY.md','docs/m0/evidence-summary.json','docs/m0/cleanup-verification.json']
execFileSync('git',['diff','--exit-code','--',...unchanged],{cwd:root})
const attribute=execFileSync('git',['check-attr','text','--','docs/m0/evidence/closeout-20261015/independent-acceptance/dev/acceptance.log.txt'],{cwd:root,encoding:'utf8'})
assert.ok(attribute.includes('unset'),attribute)
console.log(JSON.stringify({status:'pass',archiveFilesVerified:manifest.files.length,independentFilesSourceAndArchiveVerified:independent.length,brokenDocumentationLinks:broken,protectedDiff:'unchanged',evidenceTextAttribute:attribute.trim(),commitsOrPushesPerformed:false},null,2))
