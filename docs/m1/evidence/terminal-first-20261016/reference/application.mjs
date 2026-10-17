import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const root = resolve('.'), require = createRequire(import.meta.url), manifest = JSON.parse(readFileSync('.m1-scratch/latest-package.json'))
const directory = join(root, '.m1-scratch', 'terminal-first-view-' + randomUUID()), dataDirectory = join(directory, 'userData')
mkdirSync(directory, { recursive: true }); mkdirSync(join(directory,'claude-config'))
const { Job, ProcessHandle, delay } = require(join(root, 'out/m1/main/job-adapter.js'))
const job = new Job(), controlJob = new Job(), tracked = [], checks = []
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex'), beforeArchive = sha(manifest.archive)
const control = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true })
await new Promise((r, j) => { control.once('spawn', r); control.once('error', j) })
const controlHandle = new ProcessHandle(control.pid); controlJob.assign(controlHandle)
let socket, mainHandle, exitPromise, currentChild
function connect(url) {
  return new Promise((resolve, reject) => { const ws = new WebSocket(url); ws.addEventListener('open', () => resolve(ws), { once: true }); ws.addEventListener('error', reject, { once: true }) })
}
let serial = 0, pending = new Map()
function send(method, params = {}) {
  const id = ++serial
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP_TIMEOUT:' + method)) }, 30000)
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
  })
}
async function js(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result?.value
}
async function until(read, accept = Boolean, timeout = 30000) { const end = Date.now() + timeout; let value; do { value = await read(); if (accept(value)) return value; await delay(30) } while (Date.now() < end); throw new Error('PACKAGED_CONDITION_TIMEOUT:' + String(value)) }
async function launch(label) {
  const env = { ...process.env, JIANZJ_M1_DATA: dataDirectory, CLAUDE_CONFIG_DIR: join(directory,'claude-config'), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1', DISABLE_AUTOUPDATER:'1', DISABLE_TELEMETRY:'1', DISABLE_ERROR_REPORTING:'1' }; delete env.ELECTRON_RUN_AS_NODE
  currentChild = spawn(manifest.executable, ['--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = '', endpoint
  currentChild.stdout.pipe(createWriteStream(join(directory, label + '.stdout.log')))
  const log = createWriteStream(join(directory, label + '.stderr.log'))
  currentChild.stderr.on('data', bytes => { log.write(bytes); stderr = (stderr + bytes).slice(-262144); endpoint = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/.exec(stderr)?.[1] })
  await new Promise((r, j) => { currentChild.once('spawn', r); currentChild.once('error', j) })
  mainHandle = new ProcessHandle(currentChild.pid); tracked.push(mainHandle); job.assign(mainHandle)
  exitPromise = new Promise(r => currentChild.once('exit', r))
  await until(() => { if (mainHandle.exited) throw new Error('PACKAGED_EARLY_EXIT:' + stderr); return endpoint })
  const target = await until(async () => { const targets = await (await fetch('http://' + new URL(endpoint).host + '/json/list')).json(); return targets.find(t => t.type === 'page' && t.url.startsWith('file:')) })
  socket = await connect(target.webSocketDebuggerUrl)
  socket.addEventListener('message', e => { const message = JSON.parse(e.data), waiter = pending.get(message.id); if (waiter) { clearTimeout(waiter.timer); pending.delete(message.id); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result) } })
  await send('Runtime.enable'); await send('Page.enable')
  await until(() => js(`document.querySelector('.terminal-pane')?.dataset.state==='running'`))
  return target
}
const click = text => js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('BUTTON_MISSING');b.click()})()`)
const aria = label => js(`document.querySelector('[aria-label=${JSON.stringify(label)}]').click()`)
async function fill(selector, value) { await js(`document.querySelector(${JSON.stringify(selector)}).focus()`); await send('Input.insertText', { text: value }) }
async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(directory, name + '.png'), Buffer.from(result.data, 'base64')) }
async function waitExit(promise) { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PACKAGED_EXIT_TIMEOUT')), 45000) })]) } finally { clearTimeout(timer) } }
async function check(name, run) { const detail = await run(); checks.push({ name, status: 'pass', detail }); writeFileSync(join(directory, 'result.json'), JSON.stringify({ status: 'running', checks }, null, 2)) }

try {
 await launch('first');await screenshot('startup')
 const before=await js('window.workstation.load()');assert.equal(before.workspaces.length,0);assert.equal(await js('!!document.querySelector(".drawer")'),false)
 await js("window.__out='';window.workstation.onTerminal(e=>{if(e.type==='data')window.__out=(window.__out+e.data).slice(-524288)});true")
 const sample="cls; Write-Output 'PowerShell  /  Terminal sample'; Write-Output ''; Write-Output 'English 0123456789  ABCDEFGHIJKLMNOPQRSTUVWXYZ'; Write-Output '中文对齐  全角字符  混合 ABC 123'; Write-Output ('0123456789'*8); Write-Output ''; [Console]::Write([char]27+'[32mSUCCESS'+[char]27+'[0m  '+[char]27+'[31mERROR'+[char]27+'[0m'); Write-Output ''; Write-Output 'PS > '; [Console]::Write([char]27+']1337;SAMPLE_READY'+[char]7); Start-Sleep -Seconds 90"
 const code="Invoke-Expression ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+Buffer.from(sample).toString('base64')+"')))"
 await send('Page.bringToFront');await js("document.querySelector('.terminal-pane textarea').focus()")
 for(const text of code)await send('Input.dispatchKeyEvent',{type:'char',text})
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
 await until(()=>js("window.__out.includes('SAMPLE_READY')"))
 const metrics=await js(`(()=>{const n=document.querySelector('.terminal-pane');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;const p=f.memoizedProps.pane,t=p.term;const r=document.querySelector('.terminal-slot').getBoundingClientRect();return {slot:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},font:t.options.fontFamily,fontSize:t.options.fontSize,cell:t._core._renderService.dimensions.css.cell,grid:{cols:t.cols,rows:t.rows},applied:p.dimensions,defaultTerminal:document.querySelector('.breadcrumb h2').textContent,drawer:!!document.querySelector('.drawer')}})()`)
 await screenshot('sample-light');const crop=await send('Page.captureScreenshot',{format:'png',clip:{...metrics.slot,scale:1}});writeFileSync(join(directory,'terminal-crop.png'),Buffer.from(crop.data,'base64'))
 const handles=job.pids().filter(pid=>pid!==mainHandle.pid).map(pid=>new ProcessHandle(pid,false));tracked.push(...handles)
 await js('window.workstation.quit()');const {invokeOwnDialog}=await import('../../scripts/m1/native-dialog.mjs');await invokeOwnDialog(mainHandle,'结束全部终端并退出');const codeExit=await waitExit(exitPromise);assert.equal(codeExit,0);await until(()=>job.pids(),p=>p.length===0)
 writeFileSync(join(directory,'view.json'),JSON.stringify({status:'pass',metrics,scope:'fresh home shell, no project, no restored process, same synthetic sample as WezTerm',remaining:job.pids()},null,2));writeFileSync(join(root,'.m1-scratch/terminal-first-reference/application-view.json'),JSON.stringify({directory,metrics},null,2));console.log(JSON.stringify({directory,metrics}))
} catch(error){console.error(error);process.exitCode=1}finally{socket?.close();for(const w of pending.values())clearTimeout(w.timer);pending.clear();if(job.pids().length)await job.terminate();for(const h of tracked)h.dispose();job.dispose();await controlJob.terminate();controlHandle.dispose();controlJob.dispose()}
