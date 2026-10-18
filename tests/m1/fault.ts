import { app } from 'electron'
import { Service } from '../../src/main/workstation/service'
import { ProcessHandle, delay } from '../../src/adapters/windows/job-object'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const directory = resolve(process.env.JIANZJ_M1_EVIDENCE!), mode = process.env.JIANZJ_M1_MODE || 'service-fault'
mkdirSync(directory, { recursive: true }); app.setPath('userData', join(directory, 'userData'))
app.whenReady().then(async () => {
  const service = new Service(join(__dirname, 'pty-service.js'), directory), handles: ProcessHandle[] = []
  service.on('terminal', e => { if (e.type === 'data') void service.request('ack', { sessionId: e.sessionId, generation: 1, seq: e.seq }).catch(() => {}) })
  const until = async (f: () => boolean) => { const end = Date.now() + 20000; while (!f()) { if (Date.now() > end) throw new Error('FAULT_SETUP_TIMEOUT'); await delay(20) } }
  try {
    await service.ready
    const s = await service.request('create', { sessionId: 'session-' + randomUUID(), workspaceId: 'workspace-' + randomUUID(), paneId: 'pane-' + randomUUID(), generation: 1, cwd: directory, historyDir: directory, shell: 'powershell', cols: 100, rows: 30 })
    const q = (s: string) => s.replaceAll("'", "''")
    await service.request('write', { sessionId: s.sessionId, generation: 1, data: `$env:ELECTRON_RUN_AS_NODE='1'; & '${q(process.execPath)}' '${q(resolve('tests/m0/process-tree.mjs'))}' '${q(directory)}' child\r` })
    await until(() => existsSync(join(directory, 'grandchild.json')))
    const records = ['child', 'grandchild'].map(role => JSON.parse(readFileSync(join(directory, role + '.json'), 'utf8')))
    const pids = service.job.pids()
    for (const r of records) assert.ok(pids.includes(r.pid))
    for (const pid of pids) handles.push(new ProcessHandle(pid, false))
    const armed = { mode, service: service.process!.pid, managed: handles.map(h => ({ pid: h.pid, createdAt: h.createdAt })), tree: records }
    writeFileSync(join(directory, 'armed.json'), JSON.stringify(armed, null, 2))
    if (mode === 'main-crash') { await new Promise(() => {}); return }
    service.process!.terminate(); await Promise.all(handles.map(h => h.waitForExit()))
    assert.ok(handles.every(h => h.exited)); await service.reclaim()
    writeFileSync(join(directory, 'fault.json'), JSON.stringify({ status: 'pass', ...armed, allExited: true }, null, 2)); app.exit(0)
  } catch (error) { writeFileSync(join(directory, 'fault.json'), JSON.stringify({ status: 'fail', error: String(error) }, null, 2)); await service.reclaim(); app.exit(1) }
  finally { handles.forEach(h => h.dispose()) }
})
