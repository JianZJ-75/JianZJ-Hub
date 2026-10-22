import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
const root = resolve('.'), require = createRequire(import.meta.url), manifest = JSON.parse(readFileSync('.m1-scratch/latest-package.json'))
const directory = join(root, '.m1-scratch', 'packaged-' + randomUUID()), dataDirectory = join(directory, 'userData')
mkdirSync(directory, { recursive: true }); mkdirSync(join(directory,'claude-config'))
const { Job, ProcessHandle, delay } = require(join(root, 'out/m1/main/job-adapter.js'))
const localRequests=[],localServer=createServer((req,res)=>{localRequests.push({method:req.method,url:req.url});res.writeHead(403,{'content-type':'application/json'});res.end('{"error":{"type":"authentication_error","message":"local render test only"}}')});await new Promise(r=>localServer.listen(0,'127.0.0.1',r));const localBase='http://127.0.0.1:'+localServer.address().port
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
  for(const key of Object.keys(env))if(/^(ANTHROPIC|CLAUDE|AWS_|GOOGLE_|AZURE_)/.test(key))delete env[key]
  Object.assign(env,{CLAUDE_CONFIG_DIR:join(directory,'claude-config'),CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',ANTHROPIC_API_KEY:'sk-ant-local-render-test-not-a-real-key',ANTHROPIC_BASE_URL:localBase})
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
  const target = await launch('first')
  const initial=await js('window.workstation.load()');assert.equal(initial.workspaces.length,0);assert.equal(await js('!!document.querySelector(".drawer")'),false);await screenshot('startup');
  const firstId=await js("document.querySelector('.terminal-pane').dataset.pane")
  await check('unmodified packaged executable opens real workspace through form and xterm input', async () => {
    await aria('新建工作区'); await fill('.dialog input', '打包体验工作区'); await fill('.directory-picker input', directory); await click('创建并打开工作区')
    await until(() => js(`document.querySelector('.breadcrumb h2')?.textContent==='打包体验工作区' && document.querySelector('.terminal-pane')?.dataset.state==='running' && document.querySelector('.pane-size')?.dataset.sizeState==='settled'`))
    await js(`window.__events=[];window.__off=window.workstation.onTerminal(e=>{window.__events.push(e);if(window.__events.length>5000)window.__events.shift()});true`)
    await send('Page.bringToFront'); await js(`document.querySelector('.xterm-helper-textarea').focus()`)
    for (const text of `printf 'M1_PACKAGED_%s\n' "$((19+23))"`) await send('Input.dispatchKeyEvent', { type: 'char', text })
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await until(() => js(`window.__events.filter(e=>e.type==='data').map(e=>e.data).join('').includes('M1_PACKAGED_42')`))
    return { url: target.url, node: await js(`typeof window.require`), executable: manifest.executable }
  })
  for (const mode of process.env.M1_NATIVE_IME === '1' ? ['cdp', 'native'] : ['cdp']) await check('packaged consecutive CJK composition / ' + mode, async () => {
    await send('Page.bringToFront'); await js(`document.querySelector('.terminal-pane.active textarea').focus()`)
    await until(() => js('document.hasFocus()'))
    let nativeKey
    if (mode === 'native') {
      const { focusOwnWindow } = await import('./native-dialog.mjs'); focusOwnWindow(mainHandle)
      await until(() => js('document.hasFocus()'))
      const koffi = require('koffi'), user = koffi.load('user32.dll')
      const foreground = user.func('void * __stdcall GetForegroundWindow()'), owner = user.func('uint32_t __stdcall GetWindowThreadProcessId(void *, _Out_ uint32_t *)'), layout = user.func('uintptr_t __stdcall GetKeyboardLayout(uint32_t)'), input = user.func('uint32_t __stdcall SendInput(uint32_t, void *, int)')
      const own = () => { assert.equal(mainHandle.exited, false); const pid = new Uint32Array(1), tid = owner(foreground(), pid); assert.equal(pid[0], mainHandle.pid, 'native input must target only our retained packaged process'); return tid }
      assert.equal(Number(BigInt(layout(own())) & 0xffffn), 0x0804, 'native IME test needs an already selected Chinese input method')
      nativeKey = vk => { own(); const b = Buffer.alloc(80); b.writeUInt32LE(1, 0); b.writeUInt16LE(vk, 8); b.writeUInt32LE(1, 40); b.writeUInt16LE(vk, 48); b.writeUInt32LE(2, 52); assert.equal(input(2, b, 40), 2) }
    }
    const ready = 'PACK_IME_READY_' + mode
    await send('Input.insertText', { text: `printf 'PACK_IME_RE''ADY_${mode}\\n'; read -r ime_line; printf '\\nPACK_IME_${mode}_%s\\n' "$ime_line"` })
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await until(() => js(`window.__events.filter(e=>e.type==='data').map(e=>e.data).join('').includes(${JSON.stringify(ready + '\r\n')})`))
    await screenshot('ime-ready-' + mode)
    await js(`(()=>{const n=document.querySelector('.terminal-pane.active');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;const t=f.memoizedProps.pane.term;window.__packIme={chunks:[],term:t};window.__packIme.off=t.onData(data=>window.__packIme.chunks.push(data));return true})()`)
    const words = ['按这个', '方案', '继续']
    for (let index = 0; index < words.length; index++) {
      const text = words[index]
      if (mode === 'native') {
        for (const c of ['anzhege', 'fangan', 'jixu'][index]) { nativeKey(c.toUpperCase().charCodeAt(0)); await delay(50) }
        nativeKey(0x31)
      } else {
        await send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
        await send('Input.insertText', { text })
      }
      await until(() => js(`window.__packIme.chunks.join('')===${JSON.stringify(words.slice(0, index + 1).join(''))}`))
    }
    const chunks = await js('window.__packIme.chunks'), nativeValue = await js('window.__packIme.term.textarea.value')
    assert.deepEqual(chunks, words)
    await js('window.__packIme.off.dispose();true')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    const marker = 'PACK_IME_' + mode + '_' + words.join('')
    await until(() => js(`window.__events.filter(e=>e.type==='data').map(e=>e.data).join('').includes(${JSON.stringify(marker)})`))
    await screenshot('ime-' + mode)
    return { chunks, utf8Hex: Buffer.from(chunks.join('')).toString('hex'), nativeValue, shellMarker: marker, executableUnmodified: true }
  })
  await check('packaged right/down splits, drawer focus, zoom and live resize', async () => {
    await click('向右分屏'); await until(() => js(`document.querySelectorAll('.terminal-pane').length===2 && ![...document.querySelectorAll('.pane-state')].some(n=>n.textContent.includes('创建'))`))
    await click('向下分屏'); await until(() => js(`document.querySelectorAll('.terminal-pane').length===3 && ![...document.querySelectorAll('.pane-state')].some(n=>n.textContent.includes('创建'))`))
    const activeId = await js(`document.querySelector('.terminal-pane.active').dataset.pane`)
    await aria('速记'); await until(() => js(`document.activeElement===document.querySelector('.drawer textarea')`)); await aria('收起辅助工具'); await until(() => js(`document.activeElement===document.querySelector('[data-pane="${activeId}"] textarea')`))
    await js(`document.querySelector('.terminal-pane.active [aria-label="放大当前窗格"]').click()`); await until(() => js(`!!document.querySelector('.zoomed')`)); await screenshot('zoom')
    await js(`document.querySelector('.terminal-pane.active [aria-label="还原分屏"]').click()`)
    const { resizeOwnWindow } = await import('./native-dialog.mjs'); resizeOwnWindow(mainHandle, 1600, 1000)
    await until(() => js(`innerWidth>1500`))
    await until(() => js(`(()=>[...document.querySelectorAll('.terminal-pane')].filter(n=>n.getClientRects().length).every(n=>{let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;return f.memoizedProps.pane.resize.pending===false})())`))
    await send('Page.bringToFront'); await js(`document.querySelector('.terminal-pane.active .xterm-helper-textarea').focus()`)
    await send('Input.insertText', { text: `printf 'M1_PACKAGED_RESIZE_%s\\n' \"$((19+23))\"` })
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await until(() => js(`window.__events.filter(e=>e.type==='data').map(e=>e.data).join('').includes('M1_PACKAGED_RESIZE_42')`))
    await screenshot('workspace'); return { panes: await js(`[...document.querySelectorAll('.pane-foot')].map(e=>e.textContent)`), marker: 'M1_PACKAGED_RESIZE_42' }
  })
  await check('packaged explicit dark/light theme and terminal pane shutdown preserve other panes', async () => {
    const results = []
    for (const mode of ['dark', 'light']) {
      await aria('外观与设置'); await js(`(()=>{const s=document.querySelector('[aria-label="外观主题"]');s.value=${JSON.stringify(mode)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
      await until(() => js(`document.documentElement.dataset.theme===${JSON.stringify(mode)}`)); await click('完成'); await js(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))`); await screenshot(mode)
      results.push(await js(`({theme:document.documentElement.dataset.theme,terminal:getComputedStyle(document.documentElement).getPropertyValue('--terminal')})`))
    }
    await js(`document.querySelector('.terminal-pane.active [aria-label="关闭此终端"]').click()`); await click('关闭此终端'); await until(() => js(`document.querySelectorAll('.terminal-pane').length===2`))
    return results
  })
  await check('packaged real xterm consumes high output with complete record hash and Unicode tail', async () => {
    const fixture = join(directory, 'packaged-output.cjs')
    writeFileSync(fixture, `const {once}=require('events');(async()=>{for(let n=0;n<16000;n++){const s='[M1REC'+String(n).padStart(6,'0')+':'+(n*2654435761>>>0).toString(16).padStart(8,'0')+']\\r\\n';if(!process.stdout.write(s))await once(process.stdout,'drain')}process.stdout.write('M1_中文_TAIL\\r\\n')})()`)
    await js(`window.__text='';window.__logOff=window.workstation.onTerminal(e=>{if(e.type==='data')window.__text=(window.__text+e.data).slice(-2097152)});document.querySelector('.terminal-pane.active textarea').focus();true`)
    const q = value => value.replaceAll("'", "''")
    const command = `ELECTRON_RUN_AS_NODE=1 '${q(manifest.executable.replaceAll(String.fromCharCode(92),'/'))}' '${q(fixture.replaceAll(String.fromCharCode(92),'/'))}'; printf 'M1_LOGDONE_%s\\n' "$((19+23))"`
    await js(`(()=>{const n=document.querySelector('.terminal-pane.active');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;window.__testTerm=f.memoizedProps.pane.term;window.__testTerm.input(String.fromCharCode(13),true);return true})()`)
    await until(()=>js(`window.__text.endsWith('$ ')`));await js(`window.__text='';window.__testTerm.paste(${JSON.stringify(command)});window.__testTerm.input(String.fromCharCode(13),true);true`)
    await until(()=>js(`window.__text.includes('M1_LOGDONE_42')`),Boolean,60000)
    const text = await js(`window.__text`), plain = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'')
    const records = plain.match(/\[M1REC\d{6}:[0-9a-f]{8}\]/g)||[]
    const hash = createHash('sha256').update(records.join('\n')).digest('hex')
    assert.equal(records.length,16000); assert.equal(hash,'523fb0e148369899a3a413b7968e4e30642f2662dc934bde8bfe00036498f0c5'); assert.ok(plain.includes('M1_中文_TAIL'))
    await screenshot('high-output'); await js(`window.__logOff();true`)
    return {records:records.length,sha256:hash,unicodeTail:true,realXtermConsumer:true,scrollbackLimit:4000}
  })
  await check('unmodified packaged app runs real Claude classic/fullscreen without a model request', async () => {
    const states=[]
    const state=()=>js(`(()=>{const n=document.querySelector('.terminal-pane.active');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;const t=f.memoizedProps.pane.term,b=t.buffer.active;return {buffer:b.type,cols:t.cols,rows:t.rows,lines:Array.from({length:b.length},(_,i)=>b.getLine(i)?.translateToString(true)).filter(s=>s?.trim()),geometricBlockRuns:n.querySelectorAll('[data-block-run]').length}})()`)
    // Public terminal input complements Electron native-key tests in tests/m1/tui.ts.
    const input=async(text,paste=false)=>js(`(()=>{const n=document.querySelector('.terminal-pane.active');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;const t=f.memoizedProps.pane.term;t[${JSON.stringify(paste?'paste':'input')}](${JSON.stringify(text)}${paste?'':',true'});return true})()`)
    const keys=async(key,code,modifiers=0)=>input(key==='Enter'?String.fromCharCode(13):key==='ArrowDown'?String.fromCharCode(27)+'[B':key==='ArrowUp'?String.fromCharCode(27)+'[A':modifiers===2&&key==='u'?String.fromCharCode(21):key)
    const type=async(text)=>input(text,true)
    for(const mode of ['classic','fullscreen']){
      await type('clear');await keys('Enter','Enter');await until(async()=>{const t=(await state()).lines;return t.at(-1)?.trimEnd().endsWith('$')&&!t.join(' ').includes('Claude Code v')})
      const config=join(directory,'cli-'+mode);mkdirSync(config);writeFileSync(join(config,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'light',customApiKeyResponses:{approved:['-test-not-a-real-key'],rejected:[]},projects:Object.fromEntries([root,directory].map(p=>[p.replaceAll(String.fromCharCode(92),'/'),{hasTrustDialogAccepted:true,allowedTools:[],mcpServers:{}}]))}))
      const quote=s=>"'"+s.replaceAll('\\','/').replaceAll("'","'\\''")+"'"
      const command=`CLAUDE_CONFIG_DIR=${quote(config)} CLAUDE_CODE_NO_FLICKER=${mode==='fullscreen'?'1':'0'} CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=${mode==='classic'?'1':'0'} claude --bare --settings '${JSON.stringify({theme:'light',tui:mode==='fullscreen'?'fullscreen':'default'})}'`
      await js(`document.querySelector('.terminal-pane.active textarea').focus()`);await type(command);await keys('Enter','Enter')
      await until(async()=>{const t=(await state()).lines.join(' ');return t.includes('Yes, I trust this folder')||t.includes('Claude Code v')},Boolean,30000)
      if((await state()).lines.join(' ').includes('Yes, I trust this folder')){await keys('ArrowDown','ArrowDown');await keys('Enter','Enter')}
      await until(async()=>{const t=(await state()).lines.join(' ');return t.includes('Claude Code v')||t.includes('Do you want to use this API key?')&&t.includes('No (recommended)')})
      if((await state()).lines.join(' ').includes('Do you want to use this API key?')){await keys('ArrowUp','ArrowUp');await keys('Enter','Enter')}
      await until(async()=>{const s=await state();return s.lines.join(' ').includes('Claude Code v')&&s.geometricBlockRuns>0})
      const current=await state();assert.equal(current.buffer,mode==='fullscreen'?'alternate':'normal');await screenshot('claude-'+mode)
      await type('LOCAL_UNSUBMITTED_DRAFT 中文');await until(async()=>(await state()).lines.join(' ').includes('LOCAL_UNSUBMITTED_DRAFT'));await keys('u','KeyU',2);await until(async()=>!(await state()).lines.join(' ').includes('LOCAL_UNSUBMITTED_DRAFT'))
      await type('/exit');await keys('Enter','Enter');await until(async()=>{const s=await state();return s.buffer==='normal'&&s.lines.at(-1)?.trimEnd().endsWith('$')})
      states.push({mode,buffer:current.buffer,cols:current.cols,rows:current.rows,geometricBlockRuns:current.geometricBlockRuns,draftClearedWithoutSubmitting:true,returnedToBash:true})
    }
    assert.equal(localRequests.length,0);return {states,localRequests,scope:'fake local API key, --bare, isolated config, no model prompt submitted'}
  })
  await check('real native exit confirmation and full managed process-tree cleanup', async () => {
    const own = job.pids().filter(pid => pid !== mainHandle.pid).map(pid => new ProcessHandle(pid, false)); tracked.push(...own)
    const records = own.map(h => ({ pid: h.pid, createdAt: h.createdAt }))
    await js(`window.workstation.quit()`)
    const { invokeOwnDialog } = await import('./native-dialog.mjs')
    const result = await invokeOwnDialog(mainHandle, '结束全部终端并退出')
    writeFileSync(join(directory, 'native-dialog.json'), JSON.stringify(result, null, 2))
    const code = await waitExit(exitPromise); assert.equal(code, 0)
    await Promise.all(own.map(h => h.waitForExit())); assert.ok(own.every(h => h.exited)); await until(() => job.pids(), pids => pids.length === 0)
    socket.close(); return { code, nativeConfirmation: true, identities: records, allExited: true }
  })
  await check('packaged restart starts a fresh home Shell, retains optional projects and never replays commands', async () => {
    await launch('restart')
    const result = await js(`window.workstation.load()`); assert.equal(result.workspaces.length, 1); assert.equal(result.preferences.theme, 'light')
    assert.equal(await js(`document.querySelectorAll('.terminal-pane').length`), 1);assert.notEqual(await js("document.querySelector('.terminal-pane').dataset.pane"),firstId);assert.equal(await js('!!document.querySelector(".drawer")'),false)
    await screenshot('restart'); await js(`window.workstation.quit()`); const {invokeOwnDialog}=await import('./native-dialog.mjs');await invokeOwnDialog(mainHandle,'结束全部终端并退出'); const code = await exitPromise; assert.equal(code, 0); socket.close(); await until(() => job.pids(), pids => pids.length === 0)
    return { workspaces: result.workspaces, preferences: result.preferences, terminalCount: 1, code }
  })
  assert.equal(sha(manifest.archive), beforeArchive); assert.equal(controlHandle.exited, false)
  writeFileSync(join(directory, 'result.json'), JSON.stringify({ status: 'pass', checks, archiveUnmodified: true, controlSurvived: true, fallbackPids: job.pids(), manifest: manifest.artifacts }, null, 2))
  console.log(JSON.stringify({ directory, status: 'pass', checks: checks.length }))
} catch (error) {
  try { if (socket?.readyState === WebSocket.OPEN) await screenshot('failure') } catch {}
  writeFileSync(join(directory, 'result.json'), JSON.stringify({ status: 'fail', error: String(error.stack || error), checks, fallbackPids: job.pids() }, null, 2)); console.error(JSON.stringify({ directory, error: String(error) })); process.exitCode = 1
} finally {
  localServer.close(); socket?.close(); for (const w of pending.values()) { clearTimeout(w.timer); w.reject(new Error('TEST_FINISHED')) } pending.clear()
  if (job.pids().length) await job.terminate(); for (const h of tracked) h.dispose(); job.dispose(); await controlJob.terminate(); controlHandle.dispose(); controlJob.dispose()
}