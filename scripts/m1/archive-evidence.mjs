import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, statSync, existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const bashTui=process.argv.includes('--bash-tui'), terminalFirst=process.argv.includes('--terminal-first'), repair = process.argv.includes('--repair')||terminalFirst||bashTui, since = bashTui?'2026-10-15T16:45:00.000Z':terminalFirst?'2026-10-15T16:00:00.000Z':'2026-10-15T11:20:00.000Z'
const root = resolve('.'), require = createRequire(import.meta.url), scratch = join(root,'.m1-scratch'), destination = join(root,'docs/m1/evidence',bashTui?'bash-tui-20261016':terminalFirst?'terminal-first-20261016':repair?'repair-20261015':'20261015')
if(repair&&existsSync(destination))throw new Error('REPAIR_EVIDENCE_ALREADY_EXISTS')
mkdirSync(destination,{recursive:true})
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const manifest = JSON.parse(readFileSync(join(scratch,'latest-package.json')))
const compression = join(root,'node_modules/electron-winstaller/vendor/7z-x64.exe')
const zipTest = spawnSync(compression,['t',manifest.zip.file],{encoding:'utf8',maxBuffer:4*1024*1024})
const zipLog=bashTui?'bash-tui-zip-test':terminalFirst?'terminal-first-zip-test':repair?'repair-zip-test':'zip-test'
writeFileSync(join(scratch,zipLog+'.stdout.log'),zipTest.stdout||'');writeFileSync(join(scratch,zipLog+'.stderr.log'),zipTest.stderr||'')
if(zipTest.error||zipTest.status!==0)throw zipTest.error||new Error('ZIP_TEST_FAILED')
for(const item of [...manifest.artifacts,manifest.zip])if(sha(item.file)!==item.sha256)throw new Error('ARTIFACT_CHANGED:'+item.file)
const asar=require('@electron/asar'),packageList=asar.listPackage(manifest.archive)
if(packageList.some(p=>/[\\/](probe|desktop|stress|fault|tui|bash|visual)\.js$/.test(p)))throw new Error('TEST_ENTRY_PACKAGED')
const protectedPaths=['docs/m0','scripts/m0','tests/m0','src/adapters/windows/job-object.ts','src/main/index.ts','src/main/m0-checks.ts','src/main/m0-service.ts','src/preload/index.ts','src/renderer/m0.tsx','src/renderer/m0.css','src/renderer/index.html','src/services/pty/m0.ts','src/services/pty/session.m0.ts','src/services/pty/lifecycle.mjs','src/services/data/m0.ts','src/shared/m0-protocol.ts','src/shared/validation.mjs','package-lock.json','electron.vite.config.ts','electron-builder.m0.json']
const diff=spawnSync('git',['diff','--exit-code','HEAD','--',...protectedPaths],{encoding:'utf8'})
if(diff.status!==0)throw new Error('M0_BASELINE_CHANGED:'+diff.stdout)
const prototypeSha256=sha(join(root,'prototypes/comfort-redesign/workstation-comfort.html'))
if(prototypeSha256!=='1033c2dab321312f09ac220450d2fea7fbbf0f905ade18c450a5ed1281e6917a')throw new Error('PROTOTYPE_CHANGED')
const identities=new Map()
function collect(value){if(!value||typeof value!=='object')return;if(Number.isInteger(value.mainPid)&&/^\d+$/.test(value.createdAt||''))identities.set(value.mainPid+':'+value.createdAt,{pid:value.mainPid,createdAt:value.createdAt});if(Number.isInteger(value.pid)&&/^\d+$/.test(value.createdAt||''))identities.set(value.pid+':'+value.createdAt,{pid:value.pid,createdAt:value.createdAt});if(Number.isInteger(value.workerPid)&&/^\d+$/.test(value.workerCreatedAt||''))identities.set(value.workerPid+':'+value.workerCreatedAt,{pid:value.workerPid,createdAt:value.workerCreatedAt});for(const v of Object.values(value))if(typeof v==='object')collect(v)}
const files=[],commands=[]
function copy(file,published){if(published.endsWith('.log'))published+='.txt';const target=join(destination,published);mkdirSync(join(target,'..'),{recursive:true});cpSync(file,target);files.push({file:published,bytes:statSync(target).size,sha256:sha(target)})}
for(const dir of readdirSync(join(scratch,'commands'))){const folder=join(scratch,'commands',dir),commandFile=join(folder,'command.json');if(!existsSync(commandFile))continue;const command=JSON.parse(readFileSync(commandFile));if(repair&&command.started<since)continue;commands.push(command);for(const name of ['command.json','stdout.log','stderr.log']){const file=join(folder,name);if(existsSync(file))copy(file,'commands/'+dir+'/'+name)}}
const allowed=new Set(['probe.json','desktop.json','stress.json','fault.json','armed.json','supervisor.json','result.json','view.json','tui.json','bash.json','visual.json','01-state.json','02-state.json','report.json','stdout.log','stderr.log','native-dialog.json','first.stdout.log','first.stderr.log','restart.stdout.log','restart.stderr.log'])
for(const name of readdirSync(scratch)){
  if(!/^(probe|desktop|stress|fault|packaged|terminal-first-view|tui|bash|visual|wez-tui)-/.test(name)&&!(repair&&/^repair-(repro|compare)/.test(name)))continue
  const dir=join(scratch,name);if(!statSync(dir).isDirectory())continue
  for(const file of readdirSync(dir)){if(!allowed.has(file)&&!file.endsWith('.png')&&!(repair&&(/^(report|measure-|host-|prototype-host)/.test(file)||/^(compare|reproduce|prototype-host)\.(mjs|cjs)$/.test(file))))continue;const path=join(dir,file);if(repair&&statSync(path).mtime.toISOString()<since)continue;copy(path,'runtime/'+name+'/'+file);if(file.endsWith('.json'))try{collect(JSON.parse(readFileSync(path)))}catch{}}
}
const m0root=join(root,'.m0-scratch/evidence'),m0runs=[]
for(const dir of readdirSync(m0root)){
  const file=join(m0root,dir,'supervisor.json');if(!existsSync(file))continue
  const result=JSON.parse(readFileSync(file));if(repair ? result.started<since : result.started<'2026-10-15T10:09:00.000Z'||result.started>'2026-10-15T10:14:00.000Z')continue
  m0runs.push({directory:dir,status:result.status,code:result.exitCode,remaining:result.afterAppExit,fallbackPids:result.fallbackPids,controlSurvived:result.controlSurvived});collect(result);copy(file,'m0-regression/'+dir+'/supervisor.json')
}
const {ProcessHandle}=require(join(root,'out/m1/main/job-adapter.js')),cleanup=[]
for(const identity of identities.values()){
  let handle
  try{handle=new ProcessHandle(identity.pid,false);cleanup.push({...identity,status:handle.createdAt!==identity.createdAt?'pid-reused':handle.exited?'exited':'matching-live',currentCreatedAt:handle.createdAt})}
  catch(error){cleanup.push({...identity,status:/Win32 87\b/.test(String(error))?'not-present':'unverifiable',error:String(error)})}
  finally{handle?.dispose()}
}
const cleanupSummary={checked:new Date().toISOString(),identities:cleanup.length,matchingLive:cleanup.filter(x=>x.status==='matching-live').length,unverifiable:cleanup.filter(x=>x.status==='unverifiable').length,pidReused:cleanup.filter(x=>x.status==='pid-reused').length,records:cleanup}
writeFileSync(join(destination,'cleanup.json'),JSON.stringify(cleanupSummary,null,2));writeFileSync(join(destination,'command-index.json'),JSON.stringify(commands,null,2));writeFileSync(join(destination,'package-manifest.json'),JSON.stringify(manifest,null,2));writeFileSync(join(destination,'m0-regression.json'),JSON.stringify(m0runs,null,2))
writeFileSync(join(destination,'preservation.json'),JSON.stringify({checked:new Date().toISOString(),protectedPaths,noM0Diff:true,prototypeSha256,packageFiles:packageList.length,zipTestExitCode:zipTest.status,archiveContainsTestEntries:false},null,2))
for(const name of repair?[zipLog+'.stdout.log',zipLog+'.stderr.log']:['initial-build-output-cleanup.json','zip-test.stdout.log','zip-test.stderr.log'])if(existsSync(join(scratch,name)))copy(join(scratch,name),name)
if(repair){
  const previous=join(root,'release/m1/2026-10-15T10-41-08-977Z-3863d86b/win-unpacked/resources/app.asar'),oldSha=sha(previous)
  if(oldSha!=='9fde36dea5a07ff9af8c135b7c1d66d115a68a727078e3c192f39fb1b82abf42')throw new Error('ROLLBACK_ARTIFACT_CHANGED')
  writeFileSync(join(destination,'rollback.json'),JSON.stringify({previous,sha256:oldSha,unchanged:true},null,2))
  const shell=join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe')
  const query=spawnSync(shell,['-NoLogo','-NoProfile','-NonInteractive','-Command',"$c=Get-Command claude; [pscustomobject]@{Name=$c.Name;Source=$c.Source;Policy=(Get-ExecutionPolicy).ToString()} | ConvertTo-Json -Compress"],{encoding:'utf8'})
  if(query.error||query.status!==0)throw query.error||new Error('OUTSIDE_RESOLUTION_QUERY_FAILED')
  writeFileSync(join(destination,'outside-shell.stdout.log.txt'),query.stdout);writeFileSync(join(destination,'outside-shell.stderr.log.txt'),query.stderr)
  const outside=JSON.parse(query.stdout);if(outside.Name!=='claude.ps1'||outside.Policy!=='Restricted')throw new Error('OUTSIDE_SHELL_BASELINE_CHANGED')
}
if(terminalFirst){
  const reference=join(scratch,'terminal-first-reference')
  const visit=(dir,rel='')=>{for(const name of readdirSync(dir)){const file=join(dir,name),r=rel?rel+'/'+name:name;if(statSync(file).isDirectory()){if(name.startsWith('run-'))visit(file,r)}else if(/.(png|json|lua|mjs)$/.test(name))copy(file,'reference/'+r)}}
  visit(reference)
}
const sourceFiles=[]
function sources(dir){for(const name of readdirSync(dir)){const file=join(dir,name);if(statSync(file).isDirectory())sources(file);else sourceFiles.push({file:relative(root,file).replaceAll('\\','/'),bytes:statSync(file).size,sha256:sha(file)})}}
for(const dir of ['src','scripts/m1','tests/m1'])sources(join(root,dir))
for(const name of ['package.json','package-lock.json','electron.vite.m1.config.ts','electron-builder.m1.json'])sourceFiles.push({file:name,bytes:statSync(name).size,sha256:sha(name)})
writeFileSync(join(destination,'source-manifest.json'),JSON.stringify(sourceFiles,null,2));writeFileSync(join(destination,'file-manifest.json'),JSON.stringify(files,null,2))
console.log(JSON.stringify({destination,commands:commands.length,evidenceFiles:files.length,m0Runs:m0runs.length,cleanup:{identities:cleanupSummary.identities,matchingLive:cleanupSummary.matchingLive,unverifiable:cleanupSummary.unverifiable,pidReused:cleanupSummary.pidReused},zipTestExitCode:zipTest.status}))
if(cleanupSummary.matchingLive||cleanupSummary.unverifiable)process.exitCode=1
