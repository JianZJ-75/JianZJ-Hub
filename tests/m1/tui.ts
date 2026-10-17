import {app,dialog} from 'electron'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
import {startWorkstation} from '../../src/main/workstation/app'
const root=resolve(process.env.JIANZJ_M1_EVIDENCE!),home=join(root,'home'),config=join(root,'claude-config'),mode=process.env.JIANZJ_M1_MODE==='fullscreen'?'fullscreen':'classic'
mkdirSync(home,{recursive:true});mkdirSync(config,{recursive:true});app.setPath('userData',join(root,'userData'));app.setPath('home',home)
for(const key of Object.keys(process.env))if(/^(ANTHROPIC|CLAUDE|AWS_|GOOGLE_|AZURE_)/.test(key))delete process.env[key]
process.env.CLAUDE_CONFIG_DIR=config;process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1';process.env.DISABLE_AUTOUPDATER='1';process.env.DISABLE_TELEMETRY='1';process.env.DISABLE_ERROR_REPORTING='1';process.env.ANTHROPIC_API_KEY='sk-ant-local-render-test-not-a-real-key'
process.env.CLAUDE_CODE_NO_FLICKER=mode==='fullscreen'?'1':'0';if(mode==='classic')process.env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN='1'
writeFileSync(join(config,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'light'}))
const requests:any[]=[];const server=createServer((req,res)=>{requests.push({method:req.method,url:req.url});res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:'authentication_error',message:'Local renderer test: model requests disabled'}}))})
;(dialog as any).showMessageBox=async()=>({response:1})
app.whenReady().then(async()=>{
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as any;process.env.ANTHROPIC_BASE_URL='http://127.0.0.1:'+address.port
 const runtime=await startWorkstation(__dirname),{win,pty}=runtime,events:any[]=[],checks:any[]=[];let output=''
 pty.on('terminal',e=>{if(e.type==='data')output=(output+e.data).slice(-2097152);else events.push(e)})
 const js=(s:string)=>win.webContents.executeJavaScript(s,true),delay=(ms:number)=>new Promise(r=>setTimeout(r,ms))
 const until=async(f:()=>any,timeout=20000)=>{const end=Date.now()+timeout;while(!await f()){if(Date.now()>end)throw Error('TUI_TIMEOUT');await delay(50)}}
 const capture=async(name:string)=>{await delay(200);writeFileSync(join(root,name+'.png'),(await win.webContents.capturePage()).toPNG())}
 const state=()=>js(`(()=>{const n=document.querySelector('.terminal-pane');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;const p=f.memoizedProps.pane,t=p.term,b=t.buffer.active;return {cols:t.cols,rows:t.rows,buffer:b.type,lines:Array.from({length:b.length},(_,i)=>b.getLine(i)?.translateToString(true)).filter(Boolean),dimensions:t._core._renderService.dimensions,font:t.options.fontFamily,blocks:[...document.querySelectorAll('.xterm-rows span')].filter(n=>/[▀-▟]/.test(n.textContent)).map(n=>({text:n.textContent,html:n.outerHTML,style:{font:getComputedStyle(n).fontFamily,color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor,width:getComputedStyle(n).width,height:getComputedStyle(n).height}}))}})()`)
 try{
  await until(()=>js(`document.querySelector('.terminal-pane')?.dataset.state==='running'`));const info=(await pty.request('inspect')).active[0];assert.equal(info.shellId,'git-bash')
  await js(`document.querySelector('[aria-label="外观与设置"]').click()`);await js(`(()=>{const s=document.querySelector('[aria-label="外观主题"]');s.value='light';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await until(()=>js(`document.documentElement.dataset.theme==='light'`));await js(`[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='完成').click()`)
  win.focus();await js(`document.querySelector('.terminal-pane textarea').focus()`)
  const command=`claude --bare --settings '{"theme":"light","tui":"${mode==='fullscreen'?'fullscreen':'default'}"}'`
  await win.webContents.insertText(command);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'})
  await until(()=>/Claude Code|Welcome to Claude|Choose the text style|trust/.test(output),30000);await delay(1000)
  let first=await state();await capture('01-start');writeFileSync(join(root,'01-state.json'),JSON.stringify(first,null,2))
  // Only authorize the fresh test workspace, never private user files.
  const firstText=first.lines.join(' ')
  if(firstText.includes('Yes, I trust this folder')) { win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await delay(1000) }
  await delay(500)
  if((await state()).lines.join(' ').includes('Do you want to use this API key?')) { win.webContents.sendInputEvent({type:'keyDown',keyCode:'Up'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Up'});win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await delay(1000) }
  await until(async()=>{const t=(await state()).lines.join(' ');return /Claude Code v|Welcome back|Try \"/.test(t)},30000)
  await delay(300);const started=await state();assert.equal(started.buffer,mode==='fullscreen'?'alternate':'normal');assert.ok(started.lines.some((s:string)=>s.includes('Claude Code v')));await capture('02-ui');writeFileSync(join(root,'02-state.json'),JSON.stringify(started,null,2))
  checks.push({name:'real CLI mode and startup',mode,buffer:started.buffer,cols:started.cols,rows:started.rows})
  await win.webContents.insertText('LOCAL_RENDER_DRAFT 中文 123');await until(async()=>{const s=await state();return s.lines.join(' ').includes('LOCAL_RENDER_DRAFT')});await capture('03-draft')
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'U',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'U',modifiers:['control']});await until(async()=>!(await state()).lines.join(' ').includes('LOCAL_RENDER_DRAFT'))
  checks.push({name:'editable Chinese/English draft cleared without submitting a model prompt'})
  await win.webContents.insertText('/theme');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await until(async()=>/theme|Theme/.test((await state()).lines.join(' ')));await capture('04-theme-menu')
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await delay(200)
  win.setContentSize(1200,800);await until(async()=>{const s=await state();return s.cols!==started.cols});await capture('05-resize');const resized=await state();assert.equal(resized.buffer,started.buffer)
  win.setContentSize(1440,900);await delay(150)
  await js(`[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='向右分屏').click()`);await until(()=>js(`document.querySelectorAll('.terminal-pane[data-state=running]').length===2`));const split=await state();assert.equal(split.buffer,started.buffer);await capture('06-split')
  await js(`document.querySelector('.terminal-pane .pane-label').click();document.querySelector('.terminal-pane [aria-label="放大当前窗格"]').click()`);await until(()=>js(`!!document.querySelector('.zoomed')`));await capture('07-zoom');assert.equal((await state()).buffer,started.buffer)
  await js(`document.querySelector('.terminal-pane [aria-label="还原分屏"]').click();document.querySelector('.terminal-pane textarea').focus()`)
  checks.push({name:'local menu, resize, split and zoom preserve TUI mode',resized:{cols:resized.cols,rows:resized.rows},split:{cols:split.cols,rows:split.rows}})
  await win.webContents.insertText('/exit');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await until(async()=>{const s=await state();return s.buffer==='normal'&&output.endsWith('/home$ ')},20000)
  output='';await pty.request('write',{sessionId:info.sessionId,generation:1,data:"printf 'TUI_RETURN_%s\\n' \"$((19+23))\"\r"});await until(()=>output.includes('TUI_RETURN_42'));await capture('08-return-to-bash')
  assert.equal(requests.length,0,'no API request is needed for this local rendering test')
  checks.push({name:'CLI local exit returns to same Bash; zero local API requests',requests:requests.length})
  const final=await state();await runtime.pty.stop();await runtime.data.stop()
  writeFileSync(join(root,'tui.json'),JSON.stringify({status:'pass',mode,checks,started,resized,split,final,requests,events,scope:'bare, isolated fake credentials, loopback rejection server, no model prompt submitted'},null,2));server.close();app.exit(0)

 }catch(error){await capture('failure').catch(()=>{});writeFileSync(join(root,'tui.json'),JSON.stringify({status:'fail',mode,error:String(error),output,requests,events},null,2));await Promise.allSettled([runtime.pty.reclaim(),runtime.data.reclaim()]);server.close();app.exit(1)}
})
