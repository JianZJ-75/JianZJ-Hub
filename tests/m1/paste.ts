import { app, clipboard } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { startWorkstation } from '../../src/main/workstation/app'
// Real clipboard round-trip + real Ctrl+V / Ctrl+Shift+V keys through xterm.
// Regression for: Electron 44 clipboard APIs are async, so an un-awaited
// readText() hands the IPC a Promise and every paste fails INVALID_CLIPBOARD_TEXT.
const directory = resolve(process.env.JIANZJ_M1_EVIDENCE!)
mkdirSync(directory, { recursive: true }); mkdirSync(join(directory, 'home'))
app.setPath('home', join(directory, 'home')); app.setPath('userData', join(directory, 'userData'))
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
app.whenReady().then(async () => {
  const runtime = await startWorkstation(__dirname), { win, pty } = runtime
  const js = <T = any>(code: string): Promise<T> => win.webContents.executeJavaScript(code, true)
  const until = async (code: string, timeout = 20000) => { const end = Date.now() + timeout; let last; while (!(last = await js(code))) { if (Date.now() > end) throw new Error('UI_TIMEOUT:' + code); await sleep(40) } return last }
  const result: any = {}
  try {
    win.show(); app.focus({ steal: true }); win.focus(); await sleep(400)
    await until(`document.querySelector('.terminal-pane')?.dataset.state==='running'`)
    result.focused = win.isFocused()
    assert.equal(result.focused, true, 'window must be focused for the clipboard IPC')
    await js(`window.__ev=[];window.__off=window.workstation.onTerminal(e=>{window.__ev.push(e)});true`)
    await js(`document.querySelector('.terminal-pane.active .xterm-helper-textarea').focus()`)
    // 1. Renderer clipboardWrite -> clipboardRead round-trip (the IPC path the shortcuts use).
    result.copy = await js(`window.workstation.clipboardWrite('M1_COPY_ROUNDTRIP').then(()=>window.workstation.clipboardRead()).then(t=>({ok:typeof t==='string',value:t})).catch(e=>({ok:false,err:String(e)}))`)
    assert.equal(result.copy.ok, true, 'clipboardRead must resolve to a string')
    assert.equal(result.copy.value, 'M1_COPY_ROUNDTRIP')
    // 2. Real Ctrl+Shift+V: paste then Enter must execute the pasted command.
    await clipboard.writeText(`printf 'M1_PASTE_SV_%s\\n' "$((19+23))"`); await sleep(50)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control', 'shift'] })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control', 'shift'] })
    await sleep(400)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    await until(`window.__ev.filter(e=>e.type==='data').map(e=>e.data).join('').includes('M1_PASTE_SV_42')`)
    result.ctrlShiftV = true
    // 3. Real Ctrl+V must paste too (it used to become readline quoted-insert \x16).
    await clipboard.writeText(`printf 'M1_PASTE_CV_%s\\n' "$((19+23))"`); await sleep(50)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] })
    await sleep(400)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    await until(`window.__ev.filter(e=>e.type==='data').map(e=>e.data).join('').includes('M1_PASTE_CV_42')`)
    result.ctrlV = true
    // 4. No clipboard error may stick on the pane.
    result.paneError = await js(`(()=>{let n=document.querySelector('.terminal-pane.active');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;return f.memoizedProps.pane.error||null})()`)
    assert.equal(result.paneError, null)
    result.status = 'pass'
  } catch (error) {
    result.status = 'fail'; result.error = String(error)
  }
  writeFileSync(join(directory, 'paste-result.json'), JSON.stringify(result, null, 2))
  console.log('PASTE_RESULT', JSON.stringify(result))
  await Promise.allSettled([runtime.pty.reclaim(), runtime.data.reclaim()])
  app.exit(result.status === 'pass' ? 0 : 1)
})
