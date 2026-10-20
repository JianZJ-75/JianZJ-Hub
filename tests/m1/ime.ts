import { app } from 'electron'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import koffi from 'koffi'
import { startWorkstation } from '../../src/main/workstation/app'

// Test-only: isolated home/window; never attach to a user's existing terminal.
const directory = resolve(process.env.JIANZJ_M1_EVIDENCE!)
mkdirSync(join(directory, 'home'), { recursive: true })
app.setPath('home', join(directory, 'home')); app.setPath('userData', join(directory, 'userData'))
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
app.whenReady().then(async () => {
  const runtime = await startWorkstation(__dirname), { win, pty } = runtime
  const js = (code: string) => win.webContents.executeJavaScript(code, true).catch(error => { throw Error(String(error) + '\n' + code) })
  const writes: any[] = [], actual = pty.request.bind(pty), result: any = { mode: process.env.JIANZJ_M1_MODE, cases: [] }
  pty.request = (async (operation: string, payload: any) => { if (operation === 'write') writes.push({ data: payload.data, hex: Buffer.from(payload.data).toString('hex') }); return actual(operation, payload) }) as any
  const until = async (code: string) => { const end = Date.now() + 15000; while (!await js(code)) { if (Date.now() > end) throw Error('IME_TIMEOUT:' + code); await delay(25) } }
  const io = () => { const path = process.env.JIANZJ_M1_IO_TRACE; return path && existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [] }
  try {
    win.show(); app.focus({ steal: true }); win.focus()
    await until(`document.querySelector('.terminal-pane')?.dataset.state==='running'`)
    await js(`(()=>{const n=document.querySelector('.terminal-pane');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;const p=f.memoizedProps.pane,t=p.term,a=t.textarea,h=t._core._compositionHelper;window.__ime={events:[],data:[],output:[],pane:p};const snap=()=>({value:a.value,start:a.selectionStart,end:a.selectionEnd,helper:{composing:h._isComposing,sending:h._isSendingComposition,position:{...h._compositionPosition},sent:h._dataAlreadySent}});for(const type of ['keydown','keyup','keypress','compositionstart','compositionupdate','compositionend','beforeinput','input','focus','blur'])a.addEventListener(type,e=>{window.__ime.events.push({type,key:e.key,code:e.keyCode,isComposing:e.isComposing,data:e.data,inputType:e.inputType,trusted:e.isTrusted,...snap()});setTimeout(()=>window.__ime.events.push({type:type+':settled',...snap()}),0)},true);t.onData(data=>window.__ime.data.push({data,...snap()}));window.workstation.onTerminal(e=>{if(e.type==='data')window.__ime.output.push(e.data)});t.focus();return true})()`)
    const s = (await actual('inspect')).active[0]
    let key: (vk: number) => void = () => { throw Error('NATIVE_NOT_INITIALIZED') }
    if (result.mode === 'native') {
      const user = koffi.load('user32.dll'), send = user.func('uint32_t __stdcall SendInput(uint32_t, void *, int)'), foreground = user.func('void * __stdcall GetForegroundWindow()'), owner = user.func('uint32_t __stdcall GetWindowThreadProcessId(void *, _Out_ uint32_t *)'), layout = user.func('uintptr_t __stdcall GetKeyboardLayout(uint32_t)')
      const own = () => { const pid = new Uint32Array(1); const tid = owner(foreground(), pid); assert.equal(pid[0], process.pid, 'native keys may only go to the isolated test window'); return tid }
      win.minimize(); win.restore(); app.focus({ steal: true }); win.focus()
      user.func('int __stdcall SetForegroundWindow(uintptr_t)')(win.getNativeWindowHandle().readBigUInt64LE())
      await until('document.hasFocus()')
      const hkl = BigInt(layout(own())); result.layout = hkl.toString(16)
      assert.equal(Number(hkl & 0xffffn), 0x0804, 'native reproduction requires the already selected Chinese IME; never change global input settings')
      key = vk => { own(); const b = Buffer.alloc(80); b.writeUInt32LE(1, 0); b.writeUInt16LE(vk, 8); b.writeUInt32LE(1, 40); b.writeUInt16LE(vk, 48); b.writeUInt32LE(2, 52); assert.equal(send(2, b, 40), 2) }
    } else win.webContents.debugger.attach('1.3')
    await js(`window.__ime.pane.term.focus();true`)
    await until(`document.activeElement===window.__ime.pane.term.textarea`)
    const enter = async () => { if (result.mode === 'native') key(0x0d); else { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }) } }
    const type = async (word: string, interval = 50) => { for (const c of word) { key(c.toUpperCase().charCodeAt(0)); await delay(interval) } }
    const compose = async (text: string) => { await win.webContents.debugger.sendCommand('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length }); await win.webContents.debugger.sendCommand('Input.insertText', { text }) }
    const run = async (name: string, expected: string, input: () => Promise<void>) => {
      // A shell read receives the bytes without treating test text as a command.
      const marker = 'IME_HEX_' + result.cases.length + '_', ready = 'IME_READY_' + result.cases.length
      await js(`window.__ime.output=[];true`)
      await actual('write', { sessionId: s.sessionId, generation: 1, data: `printf 'IME_RE''ADY_${result.cases.length}\\n'; read -r ime_line; printf '\\n${marker}%s\\n' "$(printf '%s' "$ime_line" | od -An -tx1 | tr -d ' \\n')"\r` })
      await until(`window.__ime.output.join('').includes(${JSON.stringify(ready + '\r\n')})`)
      await js(`(async()=>{await window.__ime.pane.inputChain;window.__ime.data=[];window.__ime.events=[];return true})()`)
      const start = writes.length, traceStart = io().length
      const record: any = { name, expected, expectedHex: Buffer.from(expected).toString('hex') }; result.cases.push(record)
      try {
        await input()
        record.beforeEnter = await js(`window.__ime.data.map(e=>e.data).join('')`)
        await enter()
        await until(`new RegExp(${JSON.stringify(marker + '[0-9a-f]*\\r?\\n')}).test(window.__ime.output.join('')) && window.__ime.data.some(e=>e.data===${JSON.stringify('\r')})`)
        await js(`window.__ime.pane.inputChain.then(()=>true)`)
        record.renderer = await js(`({events:window.__ime.events,data:window.__ime.data,output:window.__ime.output})`)
        record.writes = writes.slice(start)
        record.worker = io().slice(traceStart).filter(e => e.event === 'worker-receive' && e.operation === 'write')
        assert.equal(record.beforeEnter, expected)
        assert.equal(record.writes.map((e: any) => e.data).join(''), expected + '\r')
        assert.deepEqual(record.worker.map((e: any) => e.dataHex), record.writes.map((e: any) => e.hex))
        assert.ok(record.renderer.output.join('').includes(marker + record.expectedHex + '\r\n'))
        record.status = 'pass'
      } catch (error) { record.status = 'fail'; throw error }
    }
    if (result.mode === 'native') {
      await run('native-number-candidates-after-existing-CJK', '按这个方案继续', async () => {
        for (const word of ['anzhege', 'fangan', 'jixu']) {
          await type(word)
          writeFileSync(join(directory, word + '-candidate.png'), (await win.webContents.capturePage()).toPNG())
          key(0x31); await until(`!window.__ime.pane.term._core._compositionHelper._isComposing && !window.__ime.pane.term._core._compositionHelper._isSendingComposition`)
        }
      })
      await run('native-cancel-backspace-space-and-identical-words', '方案你好你好123方案', async () => {
        await type('ceshi'); key(0x1b)
        await until(`!window.__ime.pane.term._core._compositionHelper._isComposing`)
        await type('fangann'); key(8); await delay(60); key(0x20)
        await until(`window.__ime.data.map(e=>e.data).join('')==='方案'`)
        for (let n = 0; n < 2; n++) { await type('nihao', 15); key(0x31); await until(`window.__ime.data.map(e=>e.data).join('')===${JSON.stringify('方案' + '你好'.repeat(n + 1))}`) }
        await type('123')
        await until(`window.__ime.data.map(e=>e.data).join('').endsWith('123')`)
        await type('fangan'); key(0x31)
        await until(`window.__ime.data.map(e=>e.data).join('').endsWith('123方案')`)
      })
      await js(`(()=>{const a=document.createElement('textarea');a.id='ime-native-control';a.style.cssText='position:fixed;top:0;left:0;z-index:9999';window.__imeControl={events:[]};for(const type of ['keydown','input','compositionstart','compositionend'])a.addEventListener(type,e=>window.__imeControl.events.push({type,key:e.key,data:e.data,value:a.value}));document.body.append(a);a.focus();return true})()`)
      for (const c of 'nihao1nihao1') key(c.toUpperCase().charCodeAt(0))
      await delay(500)
      result.nativeBurstControl = await js(`({...window.__imeControl,value:document.querySelector('#ime-native-control').value})`)
      await js(`document.querySelector('#ime-native-control').remove();window.__ime.pane.term.focus();true`)
      await run('native-fast-consecutive-number-candidates', '你好你好', async () => {
        for (const c of 'nihao1nihao1') key(c.toUpperCase().charCodeAt(0))
        await until(`window.__ime.data.map(e=>e.data).join('')==='你好你好'`)
      })
      await run('native-Enter-commits-pinyin-without-executing-line', 'fangan', async () => {
        await type('fangan'); key(0x0d)
        await until(`window.__ime.data.map(e=>e.data).join('')==='fangan'`)
      })
    } else {
      await run('Chromium-composition-commits', '按这个方案继续', async () => {
        for (const word of ['按这个', '方案', '继续']) { await compose(word); await until(`!window.__ime.pane.term._core._compositionHelper._isSendingComposition`) }
      })
      await run('Chromium-rapid-repeated-and-surrogate-pair-commits', '你好你好😃中文', async () => {
        for (const word of ['你好', '你好', '😃中文']) await compose(word)
        await until(`!window.__ime.pane.term._core._compositionHelper._isSendingComposition`)
      })
      await run('Chromium-cancel-before-next-commit', '方案', async () => {
        await win.webContents.debugger.sendCommand('Input.imeSetComposition', { text: 'cancel', selectionStart: 6, selectionEnd: 6 })
        await win.webContents.debugger.sendCommand('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 })
        await compose('方案'); await until(`window.__ime.data.some(e=>e.data==='方案')`)
      })
      win.webContents.debugger.detach()
    }
    result.status = 'pass'
  } catch (error) { result.status = 'fail'; result.error = String(error) }
  result.lastRenderer = await js(`({events:window.__ime?.events,data:window.__ime?.data,output:window.__ime?.output})`).catch(String)
  result.writes = writes; result.io = io()
  writeFileSync(join(directory, 'ime.json'), JSON.stringify(result, null, 2))
  writeFileSync(join(directory, 'ime.png'), (await win.webContents.capturePage()).toPNG())
  console.log(JSON.stringify({ status: result.status, cases: result.cases.map((c: any) => ({ name: c.name, status: c.status, beforeEnter: c.beforeEnter })), error: result.error, directory }))
  await Promise.allSettled([pty.reclaim(), runtime.data.reclaim()]); app.exit(result.status === 'pass' ? 0 : 1)
})
