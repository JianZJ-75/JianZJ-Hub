import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Job, ProcessHandle, delay } from '../../../adapters/windows/job-object'
import { Credit, LIMITS, size, input, id, generation } from '../../../shared/workstation/rules.mjs'
import { ioTrace } from '../../../shared/workstation/io-trace.mjs'
const port = process.parentPort!
const send = (message: any) => port.postMessage(message)
interface Session {
  info: any; job: Job; producers: Job; worker: ChildProcess; workerHandle: ProcessHandle; shell?: ProcessHandle
  pending: Map<string, any>; credit: Credit; eof: boolean; peak: number; closing: boolean; disposing: boolean
  monitor?: NodeJS.Timeout; final?: Promise<any>; close?: Promise<any>; fault?: string
}
const active = new Map<string, Session>(), ended = new Map<string, any>(), creating = new Set<Promise<any>>()
let initialized = false, stopping = false
function remember(info: any) { ended.set(info.sessionId, info); if (ended.size > 128) ended.delete(ended.keys().next().value!) }
function lookup(p: any) { id(p.sessionId); generation(p.generation); const s = active.get(p.sessionId); if (!s) { if (ended.get(p.sessionId)?.generation === p.generation) throw new Error('SESSION_ENDED'); throw new Error('SESSION_GONE') } if (s.info.generation !== p.generation) throw new Error('STALE_SESSION'); return s }
function request(s: Session, operation: string, payload = {}): Promise<any> {
  if (!s.worker.connected) return Promise.reject(new Error('WORKER_GONE'))
  if (s.pending.size >= LIMITS.requests) return Promise.reject(new Error('WORKER_BUSY'))
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { s.pending.delete(requestId); reject(new Error('WORKER_TIMEOUT:' + operation)) }, 30000)
    s.pending.set(requestId, { resolve, reject, timer })
    const traced = payload as any
    ioTrace('broker-send-worker', { sessionId: s.info.sessionId, requestId, operation, dataHex: operation === 'write' && typeof traced.data === 'string' ? Buffer.from(traced.data).toString('hex') : undefined, cols: operation === 'resize' ? traced.cols : undefined, rows: operation === 'resize' ? traced.rows : undefined })
    s.worker.send({ requestId, operation, payload }, error => { if (error) { clearTimeout(timer); s.pending.delete(requestId); reject(error) } })
  })
}
function release(s: Session) {
  clearInterval(s.monitor); for (const w of s.pending.values()) { clearTimeout(w.timer); w.reject(new Error('SESSION_ENDED')) } s.pending.clear()
  s.worker.removeAllListeners(); s.worker.stdout?.destroy(); s.worker.stderr?.destroy()
  s.shell?.dispose(); s.workerHandle.dispose(); s.producers.dispose(); s.job.dispose(); active.delete(s.info.sessionId)
}
async function fail(s: Session, error: unknown) {
  if (s.disposing) return
  s.disposing = true; s.fault = String(error); clearInterval(s.monitor)
  try {
    const before = s.job.pids(); await s.job.terminate(); await s.workerHandle.waitForExit()
    const result = { ...s.info, state: 'failed', error: s.fault, cleanup: { before, remaining: s.job.pids() }, outputComplete: false }
    remember(result); release(s); send({ ...result, type: 'fault' })
  } catch (cleanupError) { s.disposing = false; send({ ...s.info, type: 'fault', error: s.fault + '; CLEANUP_FAILED:' + cleanupError, outputComplete: false }) }
}
async function finish(s: Session) {
  if (s.final) return s.final
  s.final = (async () => {
    // Shell and its descendants belong to a nested producer Job. Ending them
    // leaves the native reader/worker alive to deliver real EOF and all ACKs.
    if (s.producers.pids().length) await s.producers.terminate()
    const deadline = Date.now() + 30000
    // Elapsed time only bounds failure; never establishes successful drain.
    while (!s.disposing && (!s.shell?.exited || !s.eof || s.credit.bytes)) { if (Date.now() > deadline) throw new Error('OUTPUT_DRAIN_TIMEOUT'); await delay(10) }
    if (s.disposing) throw new Error('SESSION_FAILED')
    const exitCode = s.shell!.exitCode
    s.disposing = true; clearInterval(s.monitor)
    await request(s, 'shutdown'); await s.workerHandle.waitForExit()
    if (s.workerHandle.exitCode !== 0) throw new Error('WORKER_EXIT_FAILED')
    const before = s.job.pids(); await s.job.terminate()
    const result = { ...s.info, state: 'exited', exitCode, exitCodeSource: 'process-handle', outputComplete: true, lastSeq: s.credit.sent, peak: Math.max(s.peak, s.credit.peak), cleanup: { before, remaining: s.job.pids() } }
    remember(result); release(s); send({ ...result, type: 'exit' }); return result
  })().catch(async error => { s.disposing = false; await fail(s, error); throw error })
  return s.final
}
async function close(s: Session) {
  if (s.close) return s.close
  s.close = (async () => { s.closing = true; s.info.state = 'closing'; await s.producers.terminate(); return finish(s) })().catch(error => { s.close = undefined; throw error })
  return s.close
}
async function create(p: any) {
  id(p.sessionId); id(p.paneId); id(p.workspaceId); generation(p.generation); size(p.cols, p.rows)
  if (active.has(p.sessionId) || ended.has(p.sessionId)) throw new Error('DUPLICATE_SESSION')
  const job = new Job()
  const worker = fork(join(__dirname, 'pty-worker.js'), [], { execPath: process.execPath, execArgv: [], cwd: p.historyDir, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true })
  const spawned = new Promise<void>((resolve, reject) => { worker.once('spawn', resolve); worker.once('error', reject) })
  let s: Session | undefined
  try {
    await spawned
    const workerHandle = new ProcessHandle(worker.pid!)
    s = { info: { sessionId: p.sessionId, paneId: p.paneId, workspaceId: p.workspaceId, generation: p.generation, state: 'creating', cols: p.cols, rows: p.rows }, job, producers: new Job(), worker, workerHandle, credit: new Credit(), pending: new Map(), eof: false, peak: 0, closing: false, disposing: false }
    const session = s; active.set(p.sessionId, s)
    worker.on('message', (m: any) => {
      try {
        if (m.type === 'spawned') { session.shell = new ProcessHandle(m.pid); session.producers.assign(session.shell); Object.assign(session.info, { pid: m.pid, createdAt: session.shell.createdAt, workerPid: worker.pid, workerCreatedAt: workerHandle.createdAt }) }
        else if (m.type === 'data') { const bytes = Buffer.byteLength(m.data); const seq = session.credit.add(bytes); if (seq !== m.seq) throw new Error('INVALID_SEQUENCE'); send({ ...session.info, type: 'data', seq, data: m.data }) }
        else if (m.type === 'drained') { if (m.lastSeq !== session.credit.sent || session.credit.bytes) throw new Error('INVALID_DRAIN'); session.eof = true; session.peak = m.peak }
        else if (m.requestId) { const w = session.pending.get(m.requestId); if (w) { clearTimeout(w.timer); session.pending.delete(m.requestId); m.ok ? w.resolve(m.result) : w.reject(new Error(m.error)) } }
      } catch (error) { void fail(session, error) }
    })
    worker.on('error', error => { void fail(session, error) })
    worker.on('exit', code => { if (!session.disposing) void fail(session, 'WORKER_CRASH:' + code) })
    // No create message is sent until assignment succeeds.
    job.assign(workerHandle)
    const created = await request(s, 'create', p)
    Object.assign(s.info, { claudeExecutable: created.claudeExecutable, shellId: created.shellId, shellLabel: created.shellLabel, shellExecutable: created.shellExecutable })
    if (!s.shell) throw new Error('SHELL_HANDLE_MISSING')
    if (stopping) { await close(s); throw new Error('SERVICE_CLOSING') }
    s.info.state = 'running'
    s.monitor = setInterval(() => { if (!session.disposing && session.shell?.exited) void finish(session).catch(() => {}) }, 20)
    return s.info
  } catch (error) {
    if (s) await fail(s, error)
    else { if (worker.pid) { const h = new ProcessHandle(worker.pid); if (!h.exited) h.terminate(); await h.waitForExit(); h.dispose() } job.dispose() }
    throw error
  }
}
async function handle(operation: string, p: any): Promise<any> {
  if (!initialized) throw new Error('SERVICE_NOT_READY')
  if (stopping && !['ack', 'close', 'inspect', 'shutdown'].includes(operation)) throw new Error('SERVICE_CLOSING')
  if (operation === 'create') { const task = create(p); creating.add(task); try { return await task } finally { creating.delete(task) } }
  if (operation === 'inspect') return { active: [...active.values()].map(s => ({ ...s.info, bytes: s.credit.bytes, peak: s.credit.peak, pending: s.pending.size, pids: s.job.pids() })), ended: [...ended.values()], native: Object.keys(require.cache).filter(p => p.endsWith('.node')) }
  if (operation === 'shutdown') { stopping = true; await Promise.allSettled([...creating]); const results = await Promise.all([...active.values()].map(close)); return results }
  if (operation === 'close' && ended.get(p.sessionId)?.generation === p.generation) return ended.get(p.sessionId)
  const s = lookup(p)
  if (operation === 'ack') { s.credit.ack(p.seq); if (s.worker.connected) s.worker.send({ operation: 'ack', payload: { seq: p.seq } }); return {} }
  if (operation === 'close') return close(s)
  if (s.closing || s.shell?.exited || s.disposing) throw new Error('SESSION_NOT_RUNNING')
  if (operation === 'write') { input(p.data); return request(s, 'write', { data: p.data }) }
  if (operation === 'resize') { size(p.cols, p.rows); await request(s, 'resize', p); Object.assign(s.info, { cols: p.cols, rows: p.rows }); return {} }
  throw new Error('INVALID_OPERATION')
}
port.on('message', ({ data }: any) => {
  if (data.type === 'initialize') { initialized = true; send({ type: 'ready' }); return }
  void handle(data.operation, data.payload).then(result => send({ requestId: data.requestId, ok: true, result }), error => send({ requestId: data.requestId, ok: false, error: String(error) }))
})
