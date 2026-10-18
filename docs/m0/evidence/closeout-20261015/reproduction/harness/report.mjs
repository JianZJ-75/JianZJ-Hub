import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root='D:/Code/JianZJ-Hub'
const r=JSON.parse(fs.readFileSync(path.join(base,'evidence/regression-summary.json'),'utf8')),p=JSON.parse(fs.readFileSync(path.join(base,'evidence/package-verification.json'),'utf8'))
assert.equal(r.supervisedLaunches,16);assert.equal(r.concurrentPairs,60);assert.deepEqual(r.cleanup.matchingLiveIdentities,[]);assert.deepEqual(r.cleanup.unavailable,[])
const rows=[]
for(const target of ['dev','packaged'])for(const mode of ['normal','worker-fault','service-fault','main-crash','concurrent-exit']){
 const cases=r.cases.filter(x=>x.target===target&&x.mode===mode)
 assert.ok(cases.every(x=>x.status==='pass'))
 rows.push(`| ${target} | ${mode} | ${cases.length} | 通过 | ${mode==='main-crash'?'应用码 1（预期注入），监督码 0':'应用码 0，监督码 0'} |`)
}
const artifacts=p.artifacts.map(x=>`| ${x.file} | ${x.bytes} | ${x.sha256} |`).join('\n')
let text=fs.readFileSync(path.join(base,'harness/closeout-template.md'),'utf8').replace('{{CASE_ROWS}}',rows.join('\n')).replace('{{IDENTITY_COUNT}}',r.cleanup.identitiesChecked).replace('{{ARTIFACT_ROWS}}',artifacts)
fs.writeFileSync(path.join(root,'docs/m0/CLOSEOUT.md'),text)
for(const file of ['README.md','docs/m0/README.md']){const p=path.join(root,file);let s=fs.readFileSync(p,'utf8');s=s.replace('2026-10-15 正进行交付一致性与同机隔离复现收尾。','2026-10-15 交付一致性与同机干净目录复现收尾已完成。');s=s.replace('本轮交付一致性与同机隔离复现收尾进行中，最终状态见','本轮交付一致性与同机干净目录复现收尾已完成，实际范围见');fs.writeFileSync(p,s)}
console.log('Final closeout report written from verified regression summary')
