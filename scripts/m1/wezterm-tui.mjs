import {spawn,spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {capture,resize} from './windows-capture.mjs'
const root=resolve('.'),require=createRequire(import.meta.url),{Job,ProcessHandle,delay}=require(join(root,'out/m1/main/job-adapter.js'))
const mode=process.argv[2]==='fullscreen'?'fullscreen':'classic',directory=join(root,'.m1-scratch','wez-tui-'+mode+'-'+randomUUID()),home=join(directory,'home'),config=join(directory,'claude-config');mkdirSync(home,{recursive:true});mkdirSync(config)
const env={...process.env};for(const key of Object.keys(env))if(/^(ANTHROPIC|CLAUDE|AWS_|GOOGLE_|AZURE_)/.test(key))delete env[key]
delete env.ELECTRON_RUN_AS_NODE;delete env.BASH_ENV;delete env.ENV
Object.assign(env,{HOME:home.replaceAll('\\','/'),USERPROFILE:home,CLAUDE_CONFIG_DIR:config,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',ANTHROPIC_API_KEY:'sk-ant-local-render-test-not-a-real-key',CLAUDE_CODE_NO_FLICKER:mode==='fullscreen'?'1':'0'});if(mode==='classic')env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN='1'
writeFileSync(join(config,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'light'}))
const requests=[],server=createServer((req,res)=>{requests.push({method:req.method,url:req.url});res.writeHead(403,{'content-type':'application/json'});res.end('{"error":{"type":"authentication_error","message":"Local rendering test only"}}')});await new Promise(r=>server.listen(0,'127.0.0.1',r));env.ANTHROPIC_BASE_URL='http://127.0.0.1:'+server.address().port
const lua=join(directory,'wezterm.lua'),rc=join(directory,'bash.rc'),sockFile=join(directory,'socket.txt'),paneFile=join(directory,'pane.txt'),exe='C:/Program Files/WezTerm/wezterm.exe',gui='C:/Program Files/WezTerm/wezterm-gui.exe',cli='C:/Users/Administrator/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe',className='JianZJ-TUI-'+randomUUID()
const q=s=>"'"+s.replaceAll('\\','/').replaceAll("'","'\\''")+"'"
writeFileSync(lua,"local w=require 'wezterm';return {check_for_updates=false,font=w.font_with_fallback{'Consolas','Microsoft YaHei'},font_size=10.5,dpi=96,line_height=1.1,initial_cols=141,initial_rows=33,enable_tab_bar=false,window_padding={left=22,right=22,top=22,bottom=18},colors={foreground='#283345',background='#fbfcfe',cursor_bg='#4466b5',cursor_fg='#fbfcfe'}}")
writeFileSync(rc,"HISTFILE=/dev/null\nPS1='ref:\\w\\$ '\nprintf '%s' \"$WEZTERM_UNIX_SOCKET\" > "+q(sockFile)+"\nprintf '%s' \"$WEZTERM_PANE\" > "+q(paneFile)+"\n")
const job=new Job(),child=spawn(gui,['--config-file',lua,'start','--always-new-process','--no-auto-connect','--class',className,'--cwd',home,'C:/Program Files/Git/bin/bash.exe','--noprofile','--rcfile',rc,'-i'],{cwd:root,env,stdio:['ignore','pipe','pipe']}),report={mode,directory,requests,steps:[],version:spawnSync(exe,['--version'],{encoding:'utf8'}).stdout,settings:{fontSizePt:10.5,pixels:14,dpi:96,cols:141,rows:33,theme:'light',config:'isolated; no personal config or mux'}};let handle,stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b)
const until=async(f,ms=20000)=>{const end=Date.now()+ms;let v;while(!(v=await f())){if(handle?.exited||Date.now()>end)throw Error('WEZ_TUI_TIMEOUT:'+stderr);await delay(70)}return v}
try{
 await new Promise((r,j)=>{child.once('spawn',r);child.once('error',j)});handle=new ProcessHandle(child.pid);report.process={pid:handle.pid,createdAt:handle.createdAt};job.assign(handle);await until(()=>existsSync(paneFile)&&existsSync(sockFile));env.WEZTERM_UNIX_SOCKET=readFileSync(sockFile,'utf8');const pane=readFileSync(paneFile,'utf8')
 const run=(args)=>{const r=spawnSync(exe,['--skip-config','cli','--no-auto-start','--class',className,...args],{env,encoding:'utf8',timeout:10000});if(r.status!==0)throw Error('WEZ_CLI_FAILED:'+r.stderr);return r.stdout}
 const text=()=>run(['get-text','--pane-id',pane]),send=s=>run(['send-text','--pane-id',pane,'--no-paste',s]),shot=name=>{const c=capture(handle);writeFileSync(join(directory,name+'.png'),c.png);return {width:c.width,height:c.height}}
 send(q(cli)+" --bare --settings '{\"theme\":\"light\",\"tui\":\""+(mode==='fullscreen'?'fullscreen':'default')+"\"}'\r")
 await until(()=>/Accessing workspace|Claude Code v/.test(text()),30000);await delay(400)
 if(text().includes('Yes, I trust this folder')){send('\x1b[B\r');await delay(600)}
 await until(()=>/Do you want to use this API key\?|Claude Code v/.test(text()),15000)
 if(text().includes('Do you want to use this API key?')){send('\x1b[A\r');await delay(600)}
 await until(()=>text().includes('Claude Code v'),30000);await delay(400);report.content=shot('02-ui');report.start=text();report.grid=JSON.parse(run(['list','--format','json']));report.steps.push('real CLI startup in requested '+mode+' mode')
 send('LOCAL_RENDER_DRAFT 中文 123');await until(()=>text().includes('LOCAL_RENDER_DRAFT'));shot('03-draft');send('\x15');await until(()=>!text().includes('LOCAL_RENDER_DRAFT'));report.steps.push('edit and clear unsent CJK/English draft')
 send('/theme\r');await delay(350);shot('04-theme-menu');send('\x1b');await delay(300);report.steps.push('local theme menu and Esc')
 resize(handle,1000,680);await delay(350);shot('05-resize');report.resized=JSON.parse(run(['list','--format','json']));send('/exit\r');await until(()=>text().trimEnd().endsWith('$'));shot('06-return');report.steps.push('resize and local exit to Bash')
 if(requests.length)throw Error('UNEXPECTED_LOCAL_API_REQUEST')
 report.status='pass'
}catch(error){report.status='fail';report.error=String(error.stack||error)}finally{report.beforeCleanup=job.pids();if(report.beforeCleanup.length)await job.terminate();report.remaining=job.pids();handle?.dispose();job.dispose();server.close();writeFileSync(join(directory,'stdout.log'),stdout);writeFileSync(join(directory,'stderr.log'),stderr);writeFileSync(join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.status==='fail')process.exitCode=1}
