import { app, dialog, nativeTheme } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { startWorkstation } from '../../src/main/workstation/app'
const directory = resolve(process.env.JIANZJ_M1_EVIDENCE!)
mkdirSync(directory, { recursive: true }); mkdirSync(join(directory,'home')); app.setPath('home',join(directory,'home')); app.setPath('userData', join(directory, 'userData'))
const checks: any[] = [], consoleErrors: any[] = []
// Only this separate harness supplies native-dialog answers. Not in product builds.
;(dialog as any).showMessageBox = async () => ({ response: 1 })
app.whenReady().then(async () => {
  const runtime = await startWorkstation(__dirname), { win, pty } = runtime
  const js = <T = any>(code: string): Promise<T> => win.webContents.executeJavaScript(code, true)
  win.webContents.on('console-message', (_event: any, level: any, message: any) => { if (level >= 2) consoleErrors.push({ level, message }) })
  const until = async (code: string, timeout = 30000) => { const end = Date.now() + timeout; let last; while (!(last = await js(code))) { if (Date.now() > end) throw new Error('UI_TIMEOUT:' + code); await new Promise(r => setTimeout(r, 30)) } return last }
  const click = (text: string) => js(`(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n)throw Error('NO_BUTTON');n.click()})()`)
  const aria = (label: string) => js(`document.querySelector('[aria-label=${JSON.stringify(label)}]').click()`)
  const fill = async (selector: string, value: string) => {
    await js(`document.querySelector(${JSON.stringify(selector)}).focus()`); await win.webContents.insertText(value)
  }
  const check = async (name: string, action: () => any) => { const detail = await action(); checks.push({ name, status: 'pass', detail }); writeFileSync(join(directory, 'desktop.json'), JSON.stringify({ status: exiting ? 'pass' : 'running', checks, consoleErrors }, null, 2)) }
  const grids = () => js<any[]>(`[...document.querySelectorAll('.terminal-pane')].map(n=>{let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane?.term)f=f.return;const p=f.memoizedProps.pane,t=p.term,d=t._core._renderService.dimensions;return {paneId:p.paneId,sessionId:p.sessionId,state:p.state,visible:!!n.getClientRects().length,cols:t.cols,rows:t.rows,proposed:p.fit.proposeDimensions(),applied:p.dimensions,pending:p.resize.pending,error:p.resize.error,initial:p.initialSize,fontSize:t.options.fontSize,lineHeight:t.options.lineHeight,cell:d.css.cell,host:{w:p.host.clientWidth,h:p.host.clientHeight},footer:n.querySelector('.pane-size').textContent,dpr:devicePixelRatio,cli:p.claudeExecutable}})`)
  const aligned = async (label: string) => {
    await new Promise(r=>setTimeout(r,60))
    const end=Date.now()+10000; let records:any[]=[]
    do { records=await grids();if(records.filter(p=>p.visible).every(p=>p.state==='running'&&!p.pending&&!p.error&&p.footer===p.cols+'×'+p.rows&&p.applied===p.cols+'x'+p.rows&&p.proposed.cols===p.cols&&p.proposed.rows===p.rows))break;await new Promise(r=>setTimeout(r,30)) }while(Date.now()<end)
    const actual=(await pty.request('inspect')).active
    for(const p of records){assert.equal(p.pending,false);assert.equal(p.footer,p.cols+'×'+p.rows);assert.equal(p.applied,p.cols+'x'+p.rows);const s=actual.find((s:any)=>s.sessionId===p.sessionId);assert.equal(s.cols,p.cols);assert.equal(s.rows,p.rows)}
    const p=records.find(p=>p.visible)
    const marker='R_GEOM_'+label.replaceAll('-','_')+'_'
    let raw=''
    for(let attempt=0;attempt<8;attempt++) {
      await pty.request('write',{sessionId:p.sessionId,generation:1,data:`ttySize=$(stty size); printf '${marker}%sx%s\\n' "\${ttySize#* }" "\${ttySize% *}"\r`})
      const probeDeadline=Date.now()+2000
      do { await new Promise(r=>setTimeout(r,50)); raw=await js<string>(`window.__terminalEvents.filter(e=>e.sessionId==='${p.sessionId}'&&e.type==='data').map(e=>e.data).join('')`); if(raw.includes(`${marker}${p.cols}x${p.rows}`))return {label,records,shell:{cols:p.cols,rows:p.rows},ttyProbeAttempts:attempt+1} } while(Date.now()<probeDeadline)
    }
    throw new Error('TTY_GEOMETRY_MISMATCH:'+label+':'+JSON.stringify({wanted:{cols:p.cols,rows:p.rows},records,tail:raw.slice(-5000)}))
  }
  let exiting = false
  try {
    await until(`document.querySelector('.terminal-pane')?.dataset.state==='running'`)
    win.show(); app.focus({ steal: true }); win.focus()
    await check('startup opens one new home terminal without choosing project; last pane can reopen directly',async()=>{
      const first=(await pty.request('inspect')).active;assert.equal(first.length,1);const loaded=await js('window.workstation.load()');assert.equal(loaded.workspaces.length,0);assert.equal(loaded.defaultTerminal.cwd,join(directory,'home'));assert.equal(await js('!!document.querySelector(".drawer")'),false);assert.equal(await js('!!document.querySelector(".overlay")'),false)
      await until(`document.activeElement===document.querySelector('.terminal-pane textarea')`)
      await js('window.workstation.load();true');assert.equal((await pty.request('inspect')).active.length,1)
      const close=async()=>{await js(`document.querySelector('.terminal-pane.active [aria-label="关闭此终端"]').click()`);await click('关闭此终端');await until(`document.querySelectorAll('.terminal-pane').length===0`)}
      await close();await aria('新建终端');await until(`document.querySelector('.terminal-pane')?.dataset.state==='running'`);const second=(await pty.request('inspect')).active;assert.equal(second.length,1);assert.notEqual(second[0].sessionId,first[0].sessionId);await close();return {first:first[0].sessionId,second:second[0].sessionId,projects:0,defaultHome:loaded.defaultTerminal.cwd}
    })
    await check('actual product new-workspace form opens real Git Bash', async () => {
      await aria('新建工作区'); await fill('.dialog input', 'M1 中文工作区')
      await fill('.directory-picker input', directory)
      await click('创建并打开工作区')
      await until(`!!document.querySelector('.terminal-pane .xterm-helper-textarea') && !document.querySelector('.pane-state').textContent.includes('创建')`)
      await until(`document.querySelector('.terminal-pane')?.dataset.state==='running'`)
      await js(`window.__terminalEvents=[];window.__stopEvents=window.workstation.onTerminal(e=>{window.__terminalEvents.push(e);if(window.__terminalEvents.length>5000)window.__terminalEvents.shift()});true`)
      win.focus(); await js(`document.querySelector('.xterm-helper-textarea').focus()`)
      await win.webContents.insertText(`printf 'M1_GUI_%s\n' "$((19+23))"`)
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      await until(`window.__terminalEvents.filter(e=>e.type==='data').map(e=>e.data).join('').includes('M1_GUI_42')`)
      return (await pty.request('inspect')).active
    })
    await check('CJK input, pasted text and Shell cwd update reach the real terminal', async () => {
      await js(`document.querySelector('.terminal-pane.active .xterm-helper-textarea').focus()`)
      await win.webContents.insertText(`printf 'M1_CJK_中文\\n'`)
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      await until(`window.__terminalEvents.filter(e=>e.type==='data').map(e=>e.data).join('').includes('M1_CJK_中文')`)
      // readline echoes the typed command line; without a UTF-8 locale it octal-escapes CJK
      // as \344\275\240, so the echo is a display bug even though bytes transfer correctly.
      const cjkData = await js<string>(`window.__terminalEvents.filter(e=>e.type==='data').map(e=>e.data).join('')`)
      assert.equal(cjkData.includes('M1_CJK_\\344'), false, 'readline must not octal-escape CJK input')
      // Paste exactly as the app does after a successful clipboardRead, so we verify the
      // PTY path for pasted text and not the OS focus/clipboard IPC (guarded, unit-tested).
      // A bare term.paste has no keydown, so no stray Ctrl+V (quoted-insert) byte is sent.
      await js(`(()=>{const n=document.querySelector('.terminal-pane.active');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;f.memoizedProps.pane.term.paste(${JSON.stringify(`printf 'M1_PASTE_%s\\n' \"$((19+23))\"`)});return true})()`)
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      await until(`window.__terminalEvents.filter(e=>e.type==='data').map(e=>e.data).join('').includes('M1_PASTE_42')`)
      await win.webContents.insertText('cd /d/Code/JianZJ-Hub')
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      await until(`document.querySelector('.breadcrumb .path')?.textContent==='D:\\\\Code\\\\JianZJ-Hub'`)
      return { cjk: 'M1_CJK_中文', paste: 'M1_PASTE_42', displayUtf8: !cjkData.includes('M1_CJK_\\344'), cwd: await js(`document.querySelector('.breadcrumb .path').textContent`) }
    })
    await check('first spawn uses measured grid, not fixed 80x24, and footer matches Shell', async () => {
      const result=await aligned('first');for(const p of result.records){assert.deepEqual(p.initial,{cols:p.cols,rows:p.rows});assert.equal(p.fontSize,14);assert.ok(Math.abs(p.cell.height-18.9)<=1/p.dpr)}return result
    })
    await check('GUI keyboard input survives immediate input after applied window resize', async () => {
      const before = (await grids()).find(p => p.visible); assert.ok(before)
      win.setContentSize(1280, 800)
      const end = Date.now() + 10000; let resized: any
      do { resized = (await grids()).find(p => p.visible); if (resized && !resized.pending && resized.cols !== before.cols && resized.rows !== before.rows) break; await new Promise(r => setTimeout(r, 30)) } while (Date.now() < end)
      assert.ok(resized && !resized.pending && resized.cols !== before.cols && resized.rows !== before.rows)
      await js(`document.querySelector('.terminal-pane.active .xterm-helper-textarea').focus()`)
      await win.webContents.insertText(`printf 'M1_GUI_RESIZE_%s\\n' \"$((19+23))\"`)
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      await until(`window.__terminalEvents.filter(e=>e.type==='data').map(e=>e.data).join('').includes('M1_GUI_RESIZE_42')`)
      return { before: { cols: before.cols, rows: before.rows }, after: { cols: resized.cols, rows: resized.rows }, marker: 'M1_GUI_RESIZE_42' }
    })
    let original: any, ids: any
    await check('right/down nested splits preserve existing xterm DOM instance and session IDs', async () => {
      original = (await pty.request('inspect')).active[0]
      await js(`window.__originalHost=document.querySelector('.xterm-host');window.__originalTextarea=document.querySelector('.xterm-helper-textarea')`)
      await click('向右分屏'); await until(`document.querySelectorAll('.terminal-pane').length===2 && ![...document.querySelectorAll('.pane-state')].some(n=>n.textContent.includes('创建'))`)
      await click('向下分屏'); await until(`document.querySelectorAll('.terminal-pane').length===3 && ![...document.querySelectorAll('.pane-state')].some(n=>n.textContent.includes('创建'))`)
      await until(`document.activeElement===document.querySelector('.terminal-pane.active textarea')`)
      assert.equal(await js(`window.__originalHost===document.querySelector('[data-pane="${original.paneId}"] .xterm-host') && window.__originalTextarea===window.__originalHost.querySelector('textarea')`), true)
      ids = (await pty.request('inspect')).active
      assert.equal(new Set(ids.map((s: any) => s.workerPid)).size, 3); return ids
    })
    await check('auxiliary input focus returns to original terminal and fits nonzero sizes', async () => {
      const activeId = await js(`document.querySelector('.terminal-pane.active').dataset.pane`)
      await aria('速记'); await until(`document.activeElement===document.querySelector('.drawer textarea')`)
      await aria('收起辅助工具'); await until(`document.activeElement===document.querySelector('[data-pane="${activeId}"] textarea')`)
      return (await pty.request('inspect')).active.map((s: any) => ({ paneId: s.paneId, cols: s.cols, rows: s.rows }))
    })
    await check('zoom/focus retains all sessions and xterm elements', async () => {
      await js(`document.querySelector('.terminal-pane.active [aria-label="放大当前窗格"]').click()`)
      await until(`!!document.querySelector('.zoomed')`)
      assert.equal((await pty.request('inspect')).active.length, 3)
      await js(`document.querySelector('.terminal-pane.active [aria-label="还原分屏"]').click()`)
      await click('专注'); await until(`document.querySelector('#app').classList.contains('focus-mode')`)
      await click('退出专注'); await until(`!document.querySelector('#app').classList.contains('focus-mode')`)
      assert.equal(await js(`window.__originalTextarea===window.__originalHost.querySelector('textarea')`), true)
      return { sessions: 3 }
    })
    await check('rename keeps session; close folds only current leaf and other sessions survive', async () => {
      const activeId = await js(`document.querySelector('.terminal-pane.active').dataset.pane`)
      await js(`document.querySelector('.terminal-pane.active .pane-label').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`)
      await js(`(()=>{const e=document.querySelector('.dialog input');e.focus();e.select()})()`); await win.webContents.insertText('重命名会话'); await click('保存名称')
      await until(`document.querySelector('.terminal-pane.active .pane-label').textContent.includes('重命名会话')`)
      await js(`document.querySelector('.terminal-pane.active [aria-label="关闭此终端"]').click()`)
      const actualRequest = pty.request.bind(pty); let injected = true
      pty.request = (async (operation: string, payload: any) => { if (operation === 'close' && injected) { injected = false; throw new Error('INJECTED_TERMINATION_FAILED') } return actualRequest(operation, payload) }) as any
      await click('关闭此终端'); await until(`document.querySelector('[role="alert"]')?.textContent.includes('INJECTED_TERMINATION_FAILED')`)
      assert.equal(await js(`document.querySelectorAll('.terminal-pane').length`), 3)
      assert.equal((await actualRequest('inspect')).active.length, 3)
      await click('关闭此终端'); pty.request = actualRequest
      await until(`document.querySelectorAll('.terminal-pane').length===2`)
      const remaining = (await pty.request('inspect')).active
      assert.ok(!remaining.some((s: any) => s.paneId === activeId)); assert.ok(remaining.some((s: any) => s.sessionId === original.sessionId))
      return remaining
    })
    await until(`!document.querySelector('.toast') || document.querySelector('.toast').textContent.includes('INJECTED')`)
    await check('real pointer splitter drag resizes Shell and preserves other sessions', async () => {
      const separator = await js(`(()=>{const n=document.querySelector('.splitter'),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,value:n.getAttribute('aria-valuenow')}})()`)
      win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(separator.x), y: Math.round(separator.y), button: 'left', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(separator.x + 45), y: Math.round(separator.y), button: 'left' })
      win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(separator.x + 45), y: Math.round(separator.y), button: 'left', clickCount: 1 })
      await until(`document.querySelector('.splitter').getAttribute('aria-valuenow')!==${JSON.stringify(separator.value)}`)
      return await aligned('pointer_drag')
    })
    await check('narrow window reports space constraint without destroying hidden sessions or sending zero size', async () => {
      win.setSize(680, 600)
      await until(`!!document.querySelector('.space-hint') && !!document.querySelector('.space-constrained')`)
      const state = (await pty.request('inspect')).active; assert.ok(state.every((s: any) => s.cols > 1 && s.rows > 1))
      assert.equal(state.length, 2)
      assert.equal(await js(`[...document.querySelectorAll('.terminal-pane')].filter(n=>n.getClientRects().length).length`),1)
      win.setSize(1440,960); await until(`!document.querySelector('.space-constrained')`)
      return state.map((s: any) => ({ sessionId: s.sessionId, cols: s.cols, rows: s.rows }))
    })
    await check('Esc and Ctrl+C reach terminal unchanged when no product layer is open', async () => {
      const writes: string[] = [], actual = pty.request.bind(pty)
      pty.request = (async (operation: string, payload: any) => { if(operation==='write')writes.push(payload.data);return actual(operation,payload) }) as any
      try {
        await js(`document.querySelector('.terminal-pane.active textarea').focus()`)
        win.webContents.sendInputEvent({ type:'keyDown',keyCode:'Escape' }); win.webContents.sendInputEvent({ type:'keyUp',keyCode:'Escape' })
        await until(`true`); await new Promise(r=>setTimeout(r,50)); assert.ok(writes.includes('\x1b'))
        win.webContents.sendInputEvent({ type:'keyDown',keyCode:'C',modifiers:['control'] }); win.webContents.sendInputEvent({ type:'keyUp',keyCode:'C',modifiers:['control'] })
        await new Promise(r=>setTimeout(r,50)); assert.ok(writes.includes('\x03'))
        return {esc:true,ctrlC:true}
      } finally {pty.request=actual}
    })
    await check('four theme combinations and nativeTheme runtime updates reach product page', async () => {
      const modes: any[] = []
      for (const [theme, source] of [['light', 'dark'], ['dark', 'light'], ['system', 'light'], ['system', 'dark']]) {
        nativeTheme.themeSource = source as any
        await js(`window.workstation.savePreferences({theme:${JSON.stringify(theme)},fontSize:14,density:'comfortable'})`)
        // Drive the actual settings UI, not just persistence IPC.
        await aria('外观与设置')
        await js(`(()=>{const s=document.querySelector('[aria-label="外观主题"]');const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(s,${JSON.stringify(theme)});s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
        await until(`document.documentElement.dataset.theme===${JSON.stringify(theme === 'system' ? source : theme)}`)
        await click('完成'); await until(`!document.querySelector('.overlay')`)
        const screen = await js(`(()=>{const r=document.querySelector('.terminal-pane.active .xterm-screen').getBoundingClientRect();return {x:Math.floor(r.right-2),y:Math.floor(r.bottom-2),width:1,height:1}})()`)
        const expectedDark = (theme === 'system' ? source : theme) === 'dark'
        const expected = expectedDark ? [39,31,27] : [254,252,251]
        let pixel = Buffer.alloc(4), paintDeadline = Date.now() + 3000
        do { await js(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))`); pixel = (await win.webContents.capturePage(screen)).toBitmap() } while ([...pixel.subarray(0,3)].some((v, i) => v !== expected[i]) && Date.now() < paintDeadline)
        assert.deepEqual([...pixel.subarray(0,3)], expected)
        modes.push({ ...await js(`({theme:document.documentElement.dataset.theme,terminal:getComputedStyle(document.documentElement).getPropertyValue('--terminal'),focus:document.activeElement.tagName})`), terminalPixelBGRA: [...pixel] })
      }
      nativeTheme.themeSource = 'light'; await until(`document.documentElement.dataset.theme==='light'`)
      nativeTheme.themeSource = 'dark'; await until(`document.documentElement.dataset.theme==='dark'`)
      nativeTheme.themeSource = 'system'; return modes
    })
    await check('production bridge negative cases reject generations, dimensions, schema and navigation', async () => {
      const s = (await pty.request('inspect')).active[0]
      const result = await js(`(async()=>{const rejected=[];for(const [method,p] of [['write',{sessionId:'${s.sessionId}',generation:2,data:'invalid'}],['resize',{sessionId:'${s.sessionId}',generation:1,cols:0,rows:24}],['write',{sessionId:'${s.sessionId}',generation:1,data:'x',exec:'bad'}],['close',{sessionId:'session-00000000-0000-0000-0000-000000000000',generation:1}],['write',{sessionId:'${s.sessionId}',generation:1,data:'中'.repeat(22000)}]]){try{await window.workstation[method](p);rejected.push(false)}catch(e){rejected.push(String(e))}}return {rejected,node:typeof window.require,ipc:typeof window.workstation.invoke,newWindow:window.open('https://example.com')===null}})()`)
      assert.ok(result.rejected.every((v: any) => typeof v === 'string')); assert.equal(result.node, 'undefined'); assert.equal(result.ipc, 'undefined'); assert.equal(result.newWindow, true)
      const before = win.webContents.getURL(); await js(`location.href='https://example.com'`); assert.equal(win.webContents.getURL(), before)
      return result
    })
    await check('footer / xterm / applied PTY / Shell equality across layout, font and density changes', async () => {
      const matrix=[]
      win.setContentSize(1424,921);matrix.push(await aligned('exact_46'))
      win.setContentSize(1280,800);matrix.push(await aligned('window_small'))
      await aria('今日待办');matrix.push(await aligned('drawer_open'));await aria('收起辅助工具');matrix.push(await aligned('drawer_closed'))
      win.setContentSize(1440,900);matrix.push(await aligned('window_restored'))
      await js(`document.querySelector('.terminal-pane.active [aria-label="放大当前窗格"]').click()`);matrix.push(await aligned('zoom'))
      await js(`document.querySelector('.terminal-pane.active [aria-label="还原分屏"]').click()`);matrix.push(await aligned('unzoom'))
      for(const [size,density]of [[16,'comfortable'],[16,'compact'],[14,'comfortable']] as const){
        await aria('外观与设置')
        await js(`(()=>{const n=document.querySelector('[aria-label="终端字号"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'${size}');n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}))})()`)
        await until(`getComputedStyle(document.documentElement).getPropertyValue('--term-size')==='${size}px'`)
        await js(`(()=>{const n=document.querySelector('[aria-label="界面密度"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(n,'${density}');n.dispatchEvent(new Event('change',{bubbles:true}))})()`)
        await click('完成');const result=await aligned('font_'+size+'_'+density)
        for(const p of result.records){assert.equal(p.fontSize,size);assert.ok(Math.abs(p.cell.height-size*(density==='compact'?1.25:1.35))<=1/p.dpr)}matrix.push(result)
      }
      return matrix
    })
    await check('existing native Claude resolves in application Shell without changing execution policy', async () => {
      const p=(await grids()).find(p=>p.visible);assert.ok(p.cli?.endsWith('claude.exe'))
      await js(`window.__cliText='';window.__cliOff=window.workstation.onTerminal(e=>{if(e.type==='data')window.__cliText=(window.__cliText+e.data).slice(-524288)});document.querySelector('.terminal-pane.active textarea').focus();true`)
      const q=(s:string)=>s.replaceAll("'","''")
      const code=`printf 'CLI_NATIVE_%s\n' "$(command -v claude)"; powershell.exe -NoLogo -NoProfile -Command "Write-Output ('CLI_POLICY_'+(Get-ExecutionPolicy))"; claude --version; printf 'BARE_EXIT_%s\n' "$?"; claude.cmd --version; printf 'CMD_EXIT_%s\n' "$?"; printf 'CLI_DONE_%s\n' "$((10+7))"`
      await win.webContents.insertText(code);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'})
      await until(`window.__cliText.includes('CLI_DONE_17')`)
      const text=stripVTControlCharacters(await js<string>('window.__cliText')).replace(/\r?\n/g,'');assert.ok(/CLI_NATIVE_.*claude-code\/bin\/claude/i.test(text));assert.ok(text.includes('CLI_POLICY_Restricted'));assert.ok(text.includes('BARE_EXIT_0'));assert.ok(text.includes('CMD_EXIT_0'));assert.match(text,/\d+\.\d+\.\d+ \(Claude Code\)/);await js('window.__cliOff();true')
      return {native:p.cli,policy:'Restricted',bareExit:0,cmdExit:0,version:/\d+\.\d+\.\d+(?= \(Claude Code\))/.exec(text)![0],scope:'isolated version commands only; no login/task'}
    })
    await check('workspace switching preserves hidden session and xterm without zero-size resize', async () => {
      const before = (await pty.request('inspect')).active
      await aria('新建工作区'); await fill('.dialog input', '第二工作区'); await fill('.directory-picker input', directory); await click('创建并打开工作区')
      await until(`document.querySelector('.breadcrumb h2').textContent==='第二工作区' && document.querySelector('.terminal-pane')?.dataset.state==='running'`)
      const all = (await pty.request('inspect')).active; assert.equal(all.length, before.length + 1)
      for (const s of before) { const after = all.find((v: any) => v.sessionId === s.sessionId); assert.ok(after); assert.ok(after.cols > 1 && after.rows > 1) }
      await js(`[...document.querySelectorAll('.sidebar nav button')].find(n=>n.textContent.includes('M1 中文工作区')).click()`)
      await until(`document.querySelector('.breadcrumb h2').textContent==='M1 中文工作区'`)
      assert.equal(await js(`window.__originalHost===document.querySelector('[data-pane="${original.paneId}"] .xterm-host')`), true)
      return { sessions: all.length, persisted: (await runtime.data.request('load')).workspaces }
    })
    await check('actual rendered font fallback sample via Chromium platform font inspection', async () => {
      win.webContents.debugger.attach('1.3')
      try {
        await js(`(()=>{const n=document.createElement('span');n.id='font-probe';n.textContent='PowerShell 中文 0123456789';n.style.cssText='font:14px "Cascadia Code","Cascadia Mono",Consolas,"Microsoft YaHei",monospace;position:fixed;bottom:0';document.body.append(n)})()`)
        await win.webContents.debugger.sendCommand('DOM.enable'); await win.webContents.debugger.sendCommand('CSS.enable')
        const doc = await win.webContents.debugger.sendCommand('DOM.getDocument')
        const node = await win.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#font-probe' })
        const fonts = await win.webContents.debugger.sendCommand('CSS.getPlatformFontsForNode', { nodeId: node.nodeId })
        await js(`document.querySelector('#font-probe').remove()`); return fonts
      } finally { win.webContents.debugger.detach() }
    })
    win.show(); win.focus(); await new Promise(r => setTimeout(r, 300)); writeFileSync(join(directory, 'workspace.png'), (await win.webContents.capturePage()).toPNG())
    await check('window close finishes all managed product sessions and service processes', async () => {
      const records = (await pty.request('inspect')).active
      exiting = true
      // Preserve result before the real app quits from the actual close handler.
      writeFileSync(join(directory, 'desktop.json'), JSON.stringify({ status: 'pass', checks, consoleErrors, closingRecords: records }, null, 2))
      win.close(); return records
    })
  } catch (error) {
    writeFileSync(join(directory, 'desktop.json'), JSON.stringify({ status: 'fail', error: String(error), checks, consoleErrors }, null, 2))
    if (!win.isDestroyed()) await win.webContents.capturePage().then(image => writeFileSync(join(directory, 'failure.png'), image.toPNG())).catch(captureError => { consoleErrors.push({ captureError: String(captureError) }) })
    await Promise.allSettled([runtime.pty.reclaim(), runtime.data.reclaim()]); app.exit(1)
  }
})
