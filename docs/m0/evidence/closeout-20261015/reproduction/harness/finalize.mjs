import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),project=path.join(base,'project'),require=createRequire(path.join(project,'package.json')),sha=b=>createHash('sha256').update(b).digest('hex')
const {ProcessHandle}=require(path.join(project,'out/main/job-adapter.js'))
const directory=path.join(project,'.m0-scratch/evidence'),identities=new Map(),reports=[],missing=[],sourceFiles=[]
function walk(dir,callback){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('SYMLINK:'+p);if(e.isDirectory())walk(p,callback);else if(e.isFile())callback(p)}}
function collect(value){if(!value||typeof value!=='object')return;if(Number.isInteger(value.pid)&&typeof value.createdAt==='string')identities.set(value.pid+':'+value.createdAt,{pid:value.pid,createdAt:value.createdAt});if(Number.isInteger(value.workerPid)&&typeof value.workerCreatedAt==='string')identities.set(value.workerPid+':'+value.workerCreatedAt,{pid:value.workerPid,createdAt:value.workerCreatedAt});for(const child of Object.values(value))collect(child)}
walk(directory,p=>{if(!p.endsWith('.json'))return;const r=JSON.parse(fs.readFileSync(p,'utf8'));collect(r);if(path.basename(p)==='supervisor.json')reports.push({source:p,...r});if(!p.includes(path.sep+'userData'+path.sep))sourceFiles.push(p)})
assert.equal(reports.length,16,'full regression expected 16 supervised launches')
let pairs=0
for(const r of reports){assert.equal(r.status,'pass',r.source);assert.deepEqual(r.afterAppExit,[],r.source);assert.deepEqual(r.fallbackPids,[],r.source);assert.equal(r.controlSurvived,true,r.source);if(r.mode==='main-crash'){assert.equal(r.exitCode,1);assert.equal(r.mainCrashManagedCleanup.allExited,true)}else{assert.equal(r.exitCode,0);assert.ok(r.appResult.checks.every(c=>c.status==='pass'));if(r.mode==='concurrent-exit'){const c=r.appResult.checks.find(c=>c.name.startsWith('ten pairs'));assert.equal(c.detail.length,10);pairs+=c.detail.length}}}
assert.equal(pairs,60)
const live=[],unknown=[],gone=[],reused=[]
for(const identity of identities.values()){
 let handle
 try{handle=new ProcessHandle(identity.pid,false);if(handle.createdAt!==identity.createdAt)reused.push({...identity,currentCreatedAt:handle.createdAt});else if(!handle.exited)live.push(identity);else gone.push(identity)}
 catch(e){if(/OpenProcess.*Win32 87/.test(String(e)))gone.push(identity);else unknown.push({...identity,error:String(e)})}
 finally{handle?.dispose()}
}
const cleanup={checked:new Date().toISOString(),identitiesChecked:identities.size,matchingLiveIdentities:live,unavailable:unknown,pidReusedNotKilled:reused,confirmedExited:gone.length,source:'current isolated run supervisor/result/fixture identities; process handles, never kill by name'}
fs.writeFileSync(path.join(base,'evidence/cleanup-verification.json'),JSON.stringify(cleanup,null,2))
const nativePaths=new Set()
function checkNative(value){if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(key==='native'&&Array.isArray(child))for(const file of child){assert.ok(file.toLowerCase().startsWith((project+path.sep).toLowerCase()),'external native module: '+file);nativePaths.add(file)}checkNative(child)}}
for(const r of reports)checkNative(r)
const cases=reports.map(r=>({target:r.target,mode:r.mode,directory:r.directory,started:r.started,finished:r.finished,status:r.status,appExitCode:r.exitCode,checks:r.appResult?.checks.map(c=>({name:c.name,status:c.status})),afterAppExit:r.afterAppExit,fallbackPids:r.fallbackPids,controlSurvived:r.controlSurvived}))
const summary={recorded:new Date().toISOString(),scope:'same-machine clean-directory reproduction, not independent-machine validation',supervisedLaunches:reports.length,concurrentPairs:pairs,nativePaths:[...nativePaths],cases,cleanup}
fs.writeFileSync(path.join(base,'evidence/regression-summary.json'),JSON.stringify(summary,null,2))
assert.deepEqual(live,[],'test identities remain alive');assert.deepEqual(unknown,[],'test identities unavailable')
const commands=[]
walk(path.join(base,'evidence/commands'),p=>{if(path.basename(p)==='command.json')commands.push({...JSON.parse(fs.readFileSync(p,'utf8')),record:path.relative(base,p).split(path.sep).join('/')})})
fs.writeFileSync(path.join(base,'evidence/command-index.json'),JSON.stringify(commands,null,2))
const manifest=[]
walk(project,p=>{const rel=path.relative(project,p).split(path.sep).join('/');if(/^(src\/|scripts\/m0\/|tests\/m0\/)/.test(rel)||['package.json','package-lock.json','tsconfig.json','electron.vite.config.ts','electron-builder.m0.json'].includes(rel)){const b=fs.readFileSync(p);manifest.push({file:rel,bytes:b.length,sha256:sha(b)})}})
fs.writeFileSync(path.join(base,'evidence/input-manifest-final.json'),JSON.stringify({recorded:new Date().toISOString(),baseHead:'524f107e93ec1782554f10b8c799d2cfca6a3497',files:manifest},null,2))
const resourceReports=['.m0-scratch/prepared.json','.m0-scratch/package-verification.json']
for(const file of resourceReports)fs.copyFileSync(path.join(project,file),path.join(base,'evidence',path.basename(file)))
for(const folder of fs.readdirSync(path.join(project,'.m0-scratch/downloads'))){if(!folder.startsWith('intake-'))continue;const source=path.join(project,'.m0-scratch/downloads',folder,'source.json');if(fs.existsSync(source)){const to=path.join(base,'evidence/resource-sources');fs.mkdirSync(to,{recursive:true});const r=JSON.parse(fs.readFileSync(source,'utf8'));if(r.finalUrl){const url=new URL(r.finalUrl);const hadQuery=Boolean(url.search||url.hash);url.search='';url.hash='';r.finalUrl=url.href;if(hadQuery)r.redaction='Only temporary redirect query/fragment omitted in this archive copy; original record retained in isolated intake. Download bytes and hashes unchanged.'}fs.writeFileSync(path.join(to,folder+'.json'),JSON.stringify(r,null,2))}}
const raw=path.join(base,'evidence/runtime');fs.mkdirSync(raw,{recursive:true})
walk(directory,p=>{const rel=path.relative(directory,p);if(rel.split(path.sep).includes('userData'))return;if(!/\.(json|png|txt|log)$/.test(p))return;let to=path.join(raw,rel);if(p.endsWith('.log'))to+='.txt';fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(p,to)})
console.log(JSON.stringify({status:'pass',supervisedLaunches:reports.length,concurrentPairs:pairs,cleanup,commands:commands.length},null,2))
