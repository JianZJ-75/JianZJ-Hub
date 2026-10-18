import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { ProcessHandle, StartupGate, delay } from '../adapters/windows/job-object'
import type { SessionInfo, TerminalEvent } from '../shared/m0-protocol'
import { Service } from './m0-service'
export interface Evidence { checks: { name: string; status: 'pass' | 'fail'; detail: unknown }[]; [key: string]: unknown }
export async function until<T>(read: () => T | Promise<T>, matches: (v: T) => boolean, timeout = 15000): Promise<T> {
  const end = Date.now() + timeout
  let value: T
  do { value = await read(); if (matches(value)) return value; await delay(50) } while (Date.now() < end)
  throw new Error(`CONDITION_TIMEOUT:${JSON.stringify(value)}`)
}
export async function verify(win: BrowserWindow, pty: Service, data: Service, root: string, evidenceDir: string, resource: string, fixture: string, mode: string, evidence: Evidence, sessions: Map<string, SessionInfo>) {
  const outputs = new Map<string, string>(), events: TerminalEvent[] = []
  pty.on('terminal', (event: TerminalEvent) => { events.push(event); if (event.data) outputs.set(event.sessionId, ((outputs.get(event.sessionId) || '') + event.data).slice(-262144)) })
  const payload = (s: SessionInfo, extra = {}) => ({ sessionId: s.sessionId, generation: s.generation, ...extra })
  const check = async (name: string, run: () => Promise<unknown>) => {
    try { const detail = await run(); evidence.checks.push({ name, status: 'pass', detail }) }
    catch (error) { evidence.checks.push({ name, status: 'fail', detail: String(error) }); throw error }
  }
  const command = async (s: SessionInfo, code: string, marker: string) => {
    outputs.set(s.sessionId, '')
    await pty.request('write', payload(s, { data: code + '\r' }))
    return until(() => outputs.get(s.sessionId) || '', text => text.includes(marker))
  }
  const tree = async (s: SessionInfo, label: string) => {
    const dir = join(evidenceDir, label); mkdirSync(dir, { recursive: true })
    await pty.request('write', payload(s, { data: `$env:ELECTRON_RUN_AS_NODE='1'; & '${process.execPath.replaceAll("'", "''")}' '${fixture.replaceAll("'", "''")}' '${dir.replaceAll("'", "''")}' child\r` }))
    try { await until(() => existsSync(join(dir, 'grandchild.json')), Boolean) }
    catch (error) { writeFileSync(join(dir, 'tree-output.txt'), outputs.get(s.sessionId) || ''); throw error }
    const child = JSON.parse(readFileSync(join(dir, 'child.json'), 'utf8')), grandchild = JSON.parse(readFileSync(join(dir, 'grandchild.json'), 'utf8'))
    const handles = [new ProcessHandle(s.pid, false), new ProcessHandle(child.pid, false), new ProcessHandle(grandchild.pid, false)]
    const inspect = await pty.request<{ sessions: (SessionInfo & { pids: number[] })[] }>('inspect')
    const own = inspect.sessions.find(v => v.sessionId === s.sessionId)!
    for (const h of handles) assert.ok(own.pids.includes(h.pid), `child not assigned to session job:${h.pid}`)
    return { handles, pids: own.pids, records: handles.map(h => ({ pid: h.pid, createdAt: h.createdAt })) }
  }
  await check('data-service SQLite/simple Chinese, pinyin and jieba', () => data.request('database', { resource }))
  let a!: SessionInfo
  await check('actual GUI click and xterm keyboard input/output', async () => {
    await until(() => win.webContents.executeJavaScript("!!document.querySelector('#create')"), Boolean)
    await win.webContents.executeJavaScript("document.querySelector('#create').click()")
    await until(() => sessions.size, n => n === 1)
    a = [...sessions.values()][0]
    await until(() => outputs.get(a.sessionId) || '', text => /PS .*>/.test(text))
    await win.webContents.insertText('Write-Output ("M0_UI_"+(10+7))')
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    const output = await until(() => outputs.get(a.sessionId) || '', text => text.includes('M0_UI_17'))
    win.show(); win.focus(); win.moveTop()
    const captureErrors: string[] = []
    let captured = false
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await delay(500); const image = await win.webContents.capturePage()
        assert.ok(!image.isEmpty()); writeFileSync(join(evidenceDir, 'gui.png'), image.toPNG()); captured = true; break
      } catch (error) { captureErrors.push(String(error)) }
    }
    evidence.captureErrors = captureErrors
    assert.ok(captured, `GUI_CAPTURE_FAILED:${captureErrors.join(',')}`)
    return { session: a, output }
  })
  const cwd = join(evidenceDir, '中文 cwd'); mkdirSync(cwd, { recursive: true })
  const baselineServicePids = pty.job.pids()
  const b = await pty.request<SessionInfo>('create', { cwd, cols: 80, rows: 24 }); sessions.set(b.sessionId, b)
  await until(() => outputs.get(b.sessionId) || '', text => /PS .*>/.test(text))
  await check('PTY Unicode input and real arithmetic', async () => ({ output: await command(b, 'Write-Output ("M0_中文_"+(19+23))', 'M0_中文_42'), session: b }))
  await check('PSReadLine history is disabled and uses test-local path', async () => {
    await command(b, `$o=Get-PSReadLineOption; Write-Output ('M0_HISTORY_'+$o.HistorySaveStyle); Write-Output ('M0_HISTORY_LOCAL_'+$o.HistorySavePath.StartsWith('${cwd.replaceAll("'", "''")}'))`, 'M0_HISTORY_SaveNothing')
    const output = await until(() => outputs.get(b.sessionId) || '', text => text.includes('M0_HISTORY_LOCAL_True'))
    return { disabled: true, testLocalPath: true, output }
  })
  await check('PTY resize observed by real Shell', async () => {
    await pty.request('resize', payload(b, { cols: 111, rows: 37 }))
    const output = await command(b, 'Write-Output ("M0_SIZE_"+$Host.UI.RawUI.WindowSize.Width+"x"+$Host.UI.RawUI.WindowSize.Height)', 'M0_SIZE_111x37')
    return { output }
  })
  await check('invalid size and stale generation rejected', async () => {
    await assert.rejects(pty.request('resize', payload(b, { cols: 0, rows: 24 })), /INVALID_SIZE/)
    await assert.rejects(pty.request('write', payload(b, { generation: 2, data: 'echo invalid\r' })), /STALE_SESSION/)
    return { rejected: ['INVALID_SIZE', 'STALE_SESSION'] }
  })
  if (mode === 'concurrent-exit') {
    await check('ten pairs of simultaneous natural exits preserve broker and surviving session', async () => {
      const rounds = []
      for (let round = 0; round < 10; round++) {
        const gate = new StartupGate(), pair: SessionInfo[] = [], handles: ProcessHandle[] = []
        try {
          for (let i = 0; i < 2; i++) {
            const info = await pty.request<SessionInfo>('create', { cwd: root, cols: 80, rows: 24 })
            pair.push(info); sessions.set(info.sessionId, info); handles.push(new ProcessHandle(info.pid, false))
            await command(info, `$g=[System.Threading.EventWaitHandle]::OpenExisting('${gate.name}'); Write-Output ('M0_SYNC_'+'READY'); if(-not $g.WaitOne(15000)){exit 91}; $g.Dispose(); Write-Output ('M0_LAST_'+(40+2)); exit 5`, 'M0_SYNC_READY')
          }
          gate.release(); await Promise.all(handles.map(h => h.waitForExit()))
          await until(() => pair.every(info => events.some(e => e.type === 'exit' && e.sessionId === info.sessionId && e.exitCode === 5)), Boolean).catch(error => {
            evidence.concurrentFailure = { processes: handles.map(h => ({ pid: h.pid, exited: h.exited })), events: events.filter(e => e.type === 'exit' && pair.some(s => s.sessionId === e.sessionId)), outputs: pair.map(s => outputs.get(s.sessionId)) }
            throw error
          })
          for (const info of pair) {
            const exitEvents = events.filter(e => e.type === 'exit' && e.sessionId === info.sessionId)
            assert.equal(exitEvents.length, 1); assert.equal(exitEvents[0].exitCodeSource, 'process-handle')
            assert.ok((outputs.get(info.sessionId) || '').includes('M0_LAST_42'), 'last Shell output lost before exit')
            assert.ok(!events.some(e => e.type === 'fault' && e.sessionId === info.sessionId))
          }
          const inspect = await pty.request<{ pid: number; native: string[]; sessions: (SessionInfo & { pids: number[]; workerPid: number; nativeExitCode?: number; workerExitCode?: number })[] }>('inspect')
          assert.ok(!inspect.native.some(p => p.includes('node-pty')))
          const closed = inspect.sessions.filter(s => pair.some(info => info.sessionId === s.sessionId))
          assert.equal(new Set(closed.map(s => s.workerPid)).size, 2)
          for (const info of closed) { assert.equal(info.state, 'exited'); assert.deepEqual(info.pids, []); assert.equal(info.workerExitCode, 0) }
          await command(a, 'Write-Output ("M0_STILL_ALIVE_"+(21+21))', 'M0_STILL_ALIVE_42')
          rounds.push({ round, brokerPid: inspect.pid, sessions: closed, survivorPid: a.pid })
        } finally { gate.dispose(); handles.forEach(h => h.dispose()) }
      }
      return rounds
    })
    return
  }
  if (mode === 'worker-fault') {
    const t = await tree(b, 'worker-fault')
    await check('one native worker failure does not kill broker or another session', async () => {
      const inspect = await pty.request<{ sessions: (SessionInfo & { workerPid: number })[] }>('inspect')
      const own = inspect.sessions.find(s => s.sessionId === b.sessionId)!
      const worker = new ProcessHandle(own.workerPid)
      try {
        worker.terminate(); await worker.waitForExit()
        await until(() => events.some(e => e.type === 'fault' && e.sessionId === b.sessionId), Boolean)
        await Promise.all(t.handles.map(h => h.waitForExit()))
        await command(a, 'Write-Output ("M0_WORKER_SURVIVOR_"+(20+22))', 'M0_WORKER_SURVIVOR_42')
        await assert.rejects(pty.request('write', payload(b, { data: 'invalid' })), /SESSION_NOT_RUNNING/)
        const after = await pty.request<{ sessions: (SessionInfo & { pids: number[] })[] }>('inspect')
        const failed = after.sessions.find(s => s.sessionId === b.sessionId)!
        assert.equal(failed.state, 'failed'); assert.deepEqual(failed.pids, [])
        assert.ok(!events.some(e => e.type === 'exit' && e.sessionId === b.sessionId), 'fault relabeled as normal exit')
        return { workerPid: worker.pid, tracked: t.records, fault: events.find(e => e.type === 'fault' && e.sessionId === b.sessionId), survivorPid: a.pid }
      } finally { worker.dispose(); t.handles.forEach(h => h.dispose()) }
    })
    return
  }
  if (mode === 'service-fault' || mode === 'main-crash') {
    const t = await tree(b, mode)
    evidence.managed = t.records
    evidence.serviceBefore = pty.job.pids()
    writeFileSync(join(evidenceDir, 'armed.json'), JSON.stringify({ managed: t.records, service: pty.process.pid, main: process.pid }, null, 2))
    if (mode === 'main-crash') { await new Promise(() => {}); return }
    await check('service forced exit reclaims managed Shell and descendants', async () => {
      assert.ok(pty.child.kill(), 'utilityProcess.kill failed')
      await Promise.all(t.handles.map(h => h.waitForExit()))
      const result = { processes: t.records, allExited: t.handles.every(h => h.exited), serviceExit: pty.exitCode }
      t.handles.forEach(h => h.dispose()); return result
    })
    return
  }
  const t = await tree(b, 'single-close')
  await check('single session closes child/grandchild and is idempotent', async () => {
    const result = await pty.request('close', payload(b))
    await Promise.all(t.handles.map(h => h.waitForExit()))
    await pty.request('close', payload(b))
    t.handles.forEach(h => h.dispose())
    const after = await until(() => pty.job.pids(), pids => pids.every(pid => baselineServicePids.includes(pid)))
    return { result, tracked: t.records, baselineServicePids, after }
  })
  await check('other session remains interactive', async () => ({ output: await command(a, 'Write-Output ("M0_SURVIVOR_"+(40+2))', 'M0_SURVIVOR_42') }))
  const c = await pty.request<SessionInfo>('create', { cwd: root, cols: 80, rows: 24 }); sessions.set(c.sessionId, c)
  const natural = new ProcessHandle(c.pid, false)
  await check('natural Shell exit is not restored and rejects further input', async () => {
    await pty.request('write', payload(c, { data: 'exit 7\r' })); await natural.waitForExit()
    await until(() => events.find(e => e.type === 'exit' && e.sessionId === c.sessionId), e => e?.exitCode === 7)
    await assert.rejects(pty.request('write', payload(c, { data: 'echo forbidden\r' })), /SESSION_NOT_RUNNING/)
    natural.dispose(); return { pid: c.pid, exitCode: 7 }
  })
  await check('failed creation cleans only its worker and leaves broker usable', async () => {
    const baseline = pty.job.pids()
    await assert.rejects(pty.request('create', { cwd: join(evidenceDir, 'does-not-exist'), cols: 80, rows: 24 }), /INVALID_SHELL_OR_CWD/)
    const after = await until(() => pty.job.pids(), pids => pids.every(pid => baseline.includes(pid)))
    return { baseline, after }
  })
  await check('concurrent creates and concurrent closes preserve another session', async () => {
    const pair = await Promise.all([0, 1].map(() => pty.request<SessionInfo>('create', { cwd: root, cols: 80, rows: 24 })))
    const handles = pair.map(s => new ProcessHandle(s.pid, false))
    try {
      for (const s of pair) sessions.set(s.sessionId, s)
      const results = await Promise.all(pair.map(s => pty.request('close', payload(s))))
      await Promise.all(handles.map(h => h.waitForExit()))
      await command(a, 'Write-Output ("M0_PARALLEL_SURVIVOR_"+(20+22))', 'M0_PARALLEL_SURVIVOR_42')
      return { processes: pair, results }
    } finally { handles.forEach(h => h.dispose()) }
  })
  await check('signaled process can legitimately exit with code 259', async () => {
    const s = await pty.request<SessionInfo>('create', { cwd: root, cols: 80, rows: 24 }); sessions.set(s.sessionId, s)
    const handle = new ProcessHandle(s.pid, false)
    try {
      await pty.request('write', payload(s, { data: 'exit 259\r' })); await handle.waitForExit()
      const event = await until(() => events.find(e => e.type === 'exit' && e.sessionId === s.sessionId), e => e?.exitCode === 259)
      assert.equal(handle.exitCode, 259); assert.equal(event?.exitCodeSource, 'process-handle')
      return { pid: s.pid, createdAt: s.createdAt, event }
    } finally { handle.dispose() }
  })
  const d = await pty.request<SessionInfo>('create', { cwd: root, cols: 80, rows: 24 }); sessions.set(d.sessionId, d)
  const remainingTree = await tree(d, 'service-stop')
  await check('service normal shutdown reclaims remaining process trees', async () => {
    evidence.ptyNative = await pty.request('inspect')
    const creationDuringStop = pty.request('create', { cwd: root, cols: 80, rows: 24 }).then(
      value => ({ ok: true as const, value }), error => ({ ok: false as const, error: String(error) })
    )
    const result = await pty.stop()
    const inFlight = await creationDuringStop
    assert.equal(inFlight.ok, false, 'in-flight create should fail when shutdown starts')
    if (!inFlight.ok) assert.match(inFlight.error, /SERVICE_CLOSING/)
    await Promise.all(remainingTree.handles.map(h => h.waitForExit()))
    remainingTree.handles.forEach(h => h.dispose())
    return { result, inFlight, tracked: remainingTree.records }
  })
}
