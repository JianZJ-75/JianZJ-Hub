import {app} from 'electron'
import {Service} from '../../src/main/workstation/service'
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {ProcessHandle,delay} from '../../src/adapters/windows/job-object'
const dir=resolve(process.env.JIANZJ_M1_EVIDENCE!),cwd=join(dir,'中文 space');mkdirSync(cwd,{recursive:true});app.setPath('userData',join(dir,'userData'))
app.whenReady().then(async()=>{
 const service=new Service(join(__dirname,'pty-service.js'),dir),events:any[]=[],output=new Map<string,string>(),checks:any[]=[]
 service.on('terminal',e=>{if(e.type==='data'){output.set(e.sessionId,((output.get(e.sessionId)||'')+e.data).slice(-4194304));void service.request('ack',{sessionId:e.sessionId,generation:1,seq:e.seq}).catch(()=>{})}else events.push(e)})
 const until=async(f:()=>any)=>{const end=Date.now()+30000;while(!f()){if(Date.now()>end)throw Error('BASH_TIMEOUT');await delay(30)}return f()}
 const q=(s:string)=>"'"+s.replaceAll('\\','/').replaceAll("'","'\\''")+"'"
 const make=()=>service.request('create',{sessionId:'session-'+randomUUID(),workspaceId:'workspace-'+randomUUID(),paneId:'pane-'+randomUUID(),generation:1,shell:'git-bash',cwd,historyDir:dir,cols:100,rows:30})
 const write=(s:any,code:string)=>service.request('write',{sessionId:s.sessionId,generation:1,data:code+'\r'})
 const close=(s:any)=>service.request('close',{sessionId:s.sessionId,generation:1})
 const check=async(name:string,run:()=>any)=>{checks.push({name,status:'pass',detail:await run()})}
 try{
  await service.ready;const a=await make(),b=await make();assert.equal(a.shellId,'git-bash')
  await check('actual Git Bash supports /c /d and cd c from root with no PowerShell drive command',async()=>{
   await write(a,"cd /; cd c; printf 'DRIVE_C:%s\\n' \"$PWD\"; cd /d; printf 'DRIVE_D:%s\\n' \"$PWD\"; cd "+q(cwd)+"; printf 'CWD_UNICODE:%s\\n' \"$PWD\"; printf 'BASH_MATH_%s\\n' \"$((19+23))\"")
   await until(()=>output.get(a.sessionId)?.includes('BASH_MATH_42'));const text=output.get(a.sessionId)!;assert.ok(text.includes('DRIVE_C:/c'));assert.ok(text.includes('DRIVE_D:/d'));assert.ok(text.includes('中文 space'));return {shell:a.shellExecutable,drives:['/c','/d'],unicodePath:true}
  })
  await check('resize acknowledgement does not drop bytes for a non-readline cat reader',async()=>{
   output.set(a.sessionId,'');await write(a,'cat');await until(()=>output.get(a.sessionId)?.includes('cat'))
   const records:any[]=[]
   for(let i=0;i<40;i++){
    const cols=90+(i%31),rows=22+(i%11),before=output.get(a.sessionId)||'',payload=`P${String(i).padStart(3,'0')}`
    const resizedAt=Date.now();await service.request('resize',{sessionId:a.sessionId,generation:1,cols,rows});const ackAt=Date.now();const sentAt=Date.now();await write(a,payload)
    await until(()=>{const delta=(output.get(a.sessionId)||'').slice(before.length);return delta.includes(payload)},5000)
    const delta=(output.get(a.sessionId)||'').slice(before.length);records.push({i,cols,rows,resizedAt,ackAt,sentAt,received:delta.slice(-120),fenceVisible:delta.includes('\x00')});assert.ok(delta.includes(payload));assert.equal(delta.includes('\x00'),false)
   }
   await service.request('write',{sessionId:a.sessionId,generation:1,data:'\x03'});await until(()=>output.get(a.sessionId)?.endsWith('$ '))
   return {iterations:records.length,records}
  })
  await check('input sent while resize is in flight is delivered once and in order',async()=>{
   output.set(a.sessionId,'');const records:any[]=[]
   for(let i=0;i<100;i++){
    const before=output.get(a.sessionId)||'',marker=`RACE_FLIGHT_${String(i).padStart(3,'0')}`,cols=150-(i%61),rows=40-(i%17),resizeStartedAt=Date.now(),resize=service.request('resize',{sessionId:a.sessionId,generation:1,cols,rows}),writeStartedAt=Date.now(),writePromise=write(a,`printf '${marker}\\n'`)
    await Promise.all([resize,writePromise]);await until(()=>{const delta=(output.get(a.sessionId)||'').slice(before.length);return delta.includes(marker)||delta.includes('bash: rintf: command not found')},5000)
    const delta=(output.get(a.sessionId)||'').slice(before.length),pass=delta.includes(marker);records.push({i,cols,rows,resizeStartedAt,writeStartedAt,pass,delta:delta.slice(-240)});assert.ok(pass)
   }
   return {iterations:records.length,failures:records.filter(r=>!r.pass).length,records}
  })
  await check('resize acknowledgement followed by immediate input preserves first byte and execution',async()=>{
   output.set(a.sessionId,'');const records:any[]=[]
   for(let i=0;i<200;i++){
    const before=output.get(a.sessionId)||'', marker=`RACE_PASS_${String(i).padStart(3,'0')}`
    const cols=80+(i%71), rows=20+(i%19)
    const resizedAt=Date.now(); await service.request('resize',{sessionId:a.sessionId,generation:1,cols,rows}); const ackAt=Date.now()
    const command=`printf '${marker}\\n'`; const sentAt=Date.now(); await write(a,command)
    await until(()=>{const delta=(output.get(a.sessionId)||'').slice(before.length);return delta.length>0&&(delta.includes(marker)||delta.includes('bash: rintf: command not found')||delta.includes('bash: printf: command not found'))},5000)
    const text=output.get(a.sessionId)||'', delta=text.slice(before.length), pass=delta.includes(marker)
    records.push({i,cols,rows,resizedAt,ackAt,sentAt,pass,echo:delta.includes(command),delta:delta.slice(-240)})
    if(!pass) throw new Error('IMMEDIATE_INPUT_LOSS:'+JSON.stringify(records.at(-1)))
   }
   return {iterations:records.length,failures:records.filter(r=>!r.pass).length,records}
  })
  await check('PTY resize agrees with actual tty ioctl, not only Bash COLUMNS cache',async()=>{
   output.set(a.sessionId,'');await service.request('resize',{sessionId:a.sessionId,generation:1,cols:113,rows:37});await until(()=>output.get(a.sessionId)?.endsWith('$ '));await write(a,"printf 'STTY:%s\\n' \"$(stty size)\"");await until(()=>output.get(a.sessionId)?.includes('STTY:37 113'));return {cols:113,rows:37}
  })
  await check('Bash high output preserves 16000 records and Unicode tail at natural EOF',async()=>{
   const fixture=join(dir,'bash-output.cjs');writeFileSync(fixture,"const{once}=require('events');(async()=>{for(let i=0;i<16000;i++){if(!process.stdout.write('[BASHREC'+String(i).padStart(6,'0')+']\\r\\n'))await once(process.stdout,'drain')}process.stdout.write('BASH_中文_TAIL\\r\\n')})()")
   output.set(a.sessionId,'');await write(a,'ELECTRON_RUN_AS_NODE=1 '+q(process.execPath)+' '+q(fixture)+'; exit 7')
   await until(()=>events.find(e=>e.sessionId===a.sessionId&&e.type==='exit'));const event=events.find(e=>e.sessionId===a.sessionId&&e.type==='exit');assert.equal(event.exitCode,7);assert.equal(event.outputComplete,true)
   const text=output.get(a.sessionId)!,records=text.match(/\[BASHREC\d{6}\]/g)||[],expected=Array.from({length:16000},(_,i)=>'[BASHREC'+String(i).padStart(6,'0')+']'),sha=(r:string[])=>createHash('sha256').update(r.join('\n')).digest('hex');assert.equal(records.length,16000);assert.equal(sha(records),sha(expected));assert.ok(text.includes('BASH_中文_TAIL'));return {event,records:records.length,sha256:sha(records)}
  })
  await check('managed Bash child/grandchild close does not end surviving session',async()=>{
   const s=await make(),treeDir=join(dir,'tree');mkdirSync(treeDir);await write(s,'ELECTRON_RUN_AS_NODE=1 '+q(process.execPath)+' '+q(resolve('tests/m0/process-tree.mjs'))+' '+q(treeDir)+' child')
   await until(()=>existsSync(join(treeDir,'grandchild.json')));const records=['child','grandchild'].map(n=>JSON.parse(readFileSync(join(treeDir,n+'.json'),'utf8'))),handles=records.map(r=>new ProcessHandle(r.pid,false));try{const result=await close(s);await Promise.all(handles.map(h=>h.waitForExit()));assert.ok(handles.every(h=>h.exited));await write(b,"printf 'SURVIVOR_%s\\n' \"$((19+23))\"");await until(()=>output.get(b.sessionId)?.includes('SURVIVOR_42'));return {result,identities:handles.map(h=>({pid:h.pid,createdAt:h.createdAt,exited:h.exited}))}}finally{handles.forEach(h=>h.dispose())}
  })
  await close(b);assert.equal((await service.request('inspect')).active.length,0);await service.stop();writeFileSync(join(dir,'bash.json'),JSON.stringify({status:'pass',trace:join(dir,'io-trace.jsonl'),checks,events},null,2));app.exit(0)
 }catch(error){writeFileSync(join(dir,'bash.json'),JSON.stringify({status:'fail',trace:join(dir,'io-trace.jsonl'),error:String(error),checks,events,output:[...output]},null,2));await service.reclaim();app.exit(1)}
})
