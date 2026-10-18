import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source='D:/Code/JianZJ-Hub',evidence=path.join(source,'docs/m0/evidence/closeout-20261015'),sha=b=>createHash('sha256').update(b).digest('hex')
const baseline=JSON.parse(fs.readFileSync(path.join(evidence,'baseline.json'),'utf8'))
const allowed=new Set(['README.md','docs/m0/README.md','package.json','scripts/m0/package.mjs'])
const changed=[],unexpected=[]
for(const item of baseline.tracked){const b=fs.readFileSync(path.join(source,item.file)),actual=sha(b);if(actual!==item.sha256){changed.push({file:item.file,before:item.sha256,after:actual});if(!allowed.has(item.file))unexpected.push(item.file)}}
const preserved=baseline.preserved.map(item=>({...item,actual:sha(fs.readFileSync(path.join(source,item.file)))}))
const inputs=JSON.parse(fs.readFileSync(path.join(base,'evidence/input-manifest-final.json'),'utf8')).files
const mismatchedInputs=inputs.filter(item=>sha(fs.readFileSync(path.join(source,item.file)))!==item.sha256).map(x=>x.file)
const preservation={checked:new Date().toISOString(),changedTracked:changed,unexpectedChangedTracked:unexpected,preserved,sourceVsTestedInputMismatches:mismatchedInputs,protectedTrackedUnchanged:baseline.tracked.length-changed.length}
fs.writeFileSync(path.join(base,'evidence/preservation.json'),JSON.stringify(preservation,null,2))
if(unexpected.length||preserved.some(x=>x.sha256!==x.actual)||mismatchedInputs.length)throw Error('PRESERVATION_OR_INPUT_MISMATCH')
const commands=[]
function indexCommands(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())indexCommands(p);else if(e.name==='command.json')commands.push({...JSON.parse(fs.readFileSync(p,'utf8')),record:path.relative(base,p).split(path.sep).join('/')})}}
indexCommands(path.join(base,'evidence/commands'))
fs.writeFileSync(path.join(base,'evidence/command-index.json'),JSON.stringify(commands,null,2))
fs.cpSync(path.join(base,'evidence'),path.join(evidence,'reproduction'),{recursive:true})
fs.cpSync(path.join(base,'intake/upstream-metadata'),path.join(evidence,'reproduction/upstream-metadata'),{recursive:true})
fs.cpSync(path.join(base,'harness'),path.join(evidence,'reproduction/harness'),{recursive:true})
const manifest=[]
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()){const rel=path.relative(evidence,p).split(path.sep).join('/');if(rel==='manifest.json')continue;const b=fs.readFileSync(p);manifest.push({file:rel,bytes:b.length,sha256:sha(b)})}}}
walk(evidence)
fs.writeFileSync(path.join(evidence,'manifest.json'),JSON.stringify({recorded:new Date().toISOString(),files:manifest},null,2))
console.log(JSON.stringify({status:'pass',files:manifest.length,bytes:manifest.reduce((a,x)=>a+x.bytes,0),changedTracked:changed.map(x=>x.file),preserved:preserved.length,inputFiles:inputs.length},null,2))
