import { app } from 'electron'
import { Service } from '../../src/main/workstation/service'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const root = resolve(process.env.JIANZJ_M1_EVIDENCE!)
mkdirSync(root, { recursive: true }); app.setPath('userData', join(root, 'userData'))
app.whenReady().then(async () => {
  const service = new Service(join(__dirname, 'pty-service.js'), root), events: any[] = [], hashes = new Map<string, any>()
  service.on('terminal', event => {
    events.push(event.type === 'data' ? { sessionId: event.sessionId, type: 'data', seq: event.seq, bytes: Buffer.byteLength(event.data) } : event)
    if (event.type === 'data') { hashes.get(event.sessionId)?.update(event.data); void service.request('ack', { sessionId: event.sessionId, generation: 1, seq: event.seq }).catch(console.error) }
  })
  const wait = async (f: () => any, timeout = 45000) => { const until = Date.now() + timeout; while (!f()) { if (Date.now() > until) throw new Error('TIMEOUT'); await new Promise(r => setTimeout(r, 20)) } return f() }
  try {
    await service.ready
    const make = async () => { const sessionId = 'session-' + randomUUID(); hashes.set(sessionId, createHash('sha256')); return service.request<any>('create', { sessionId, paneId: 'pane-' + randomUUID(), workspaceId: 'workspace-' + randomUUID(), generation: 1, cwd: root, historyDir: root, shell: 'powershell', cols: 100, rows: 30 }) }
    const a = await make(), b = await make()
    await service.request('write', { sessionId: a.sessionId, generation: 1, data: 'Write-Output ("TAIL_"+(40+2)); exit 259\r' })
    await wait(() => events.find(e => e.type === 'exit' && e.sessionId === a.sessionId))
    assert.equal(events.find(e => e.type === 'exit' && e.sessionId === a.sessionId).exitCode, 259)
    const close = await service.request('close', { sessionId: b.sessionId, generation: 1 })
    assert.equal(close.outputComplete, true)
    const inspect = await service.request('inspect'); assert.equal(inspect.active.length, 0)
    await service.stop()
    writeFileSync(join(root, 'probe.json'), JSON.stringify({ status: 'pass', events, inspect }, null, 2)); app.exit(0)
  } catch (error) { writeFileSync(join(root, 'probe.json'), JSON.stringify({ status: 'fail', error: String(error), events }, null, 2)); await service.reclaim(); app.exit(1) }
})
