import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Job, ProcessHandle, delay } from '../../adapters/windows/job-object'
import { Lifecycle } from './lifecycle.mjs'
import { validateSessionId, validateSize, validateWrite } from '../../shared/validation.mjs'
import type { Request, Reply, SessionInfo, TerminalEvent } from '../../shared/m0-protocol'

// Broker never loads node-pty. Each Job owns one worker plus its descendants.
const port = process.parentPort
if (!port) throw new Error('UTILITY_PROCESS_REQUIRED')
const send = (message: Reply | TerminalEvent | Record<string, unknown>) => port.postMessage(message)
interface Waiter { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }
interface Session {
  info: SessionInfo; lifecycle: Lifecycle; worker: ChildProcess; workerProcess?: ProcessHandle
  process?: ProcessHandle; job: Job; seq: number; pending: Map<string, Waiter>
  monitor?: NodeJS.Timeout; finalize?: Promise<void>; closePromise?: Promise<unknown>
  intentionalStop: boolean; lastData: number; nativeExitObserved: boolean; nativeExitCode?: number
  native: string[]; cleanupPids: number[]; workerExitCode?: number | null; disposed: boolean
}
const sessions = new Map<string, Session>()
const creating = new Set<Promise<SessionInfo>>()
let initialized = false, stopping = false
function session(p: Record<string, unknown>) {
  validateSessionId(p.sessionId)
  const s = sessions.get(String(p.sessionId)); if (!s) throw new Error('SESSION_GONE')
  if (p.generation !== s.info.generation) throw new Error('STALE_SESSION')
  return s
}
function state(s: Session) { s.info.state = s.lifecycle.state }
function request<T = unknown>(s: Session, operation: Request['operation'], payload: Record<string, unknown>): Promise<T> {
  if (!s.worker.connected) return Promise.reject(new Error('WORKER_GONE'))
  const requestId = randomUUID()
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { s.pending.delete(requestId); reject(new Error(`WORKER_TIMEOUT:${operation}`)) }, 18000)
    s.pending.set(requestId, { resolve: v => resolve(v as T), reject, timer })
    s.worker.send({ requestId, operation, payload }, error => {
      if (error) { clearTimeout(timer); s.pending.delete(requestId); reject(error) }
    })
  })
}
function fault(s: Session, error: unknown) {
  if (s.lifecycle.state === 'failed' || s.lifecycle.emittedExit || s.lifecycle.closing) return
  s.lifecycle.fault(); state(s)
  send({ type: 'fault', sessionId: s.info.sessionId, generation: 1, seq: ++s.seq, code: 'PTY_WORKER_FAILED', message: String(error) })
}
async function finalize(s: Session) {
  if (s.finalize) return s.finalize
  s.finalize = (async () => {
    if (!s.process?.exited) throw new Error('SHELL_EXIT_NOT_OBSERVED')
    if (s.monitor) clearInterval(s.monitor)
    const exitCode = s.process.exitCode
    // Drain short M0 output before reclaiming the worker. M1 flow control is separate.
    const deadline = Date.now() + 2000
    while (!s.lifecycle.closing && Date.now() < deadline && (!s.nativeExitObserved || Date.now() - s.lastData < 100)) await delay(25)
    s.cleanupPids = s.job.pids(); s.intentionalStop = true
    if (!s.lifecycle.closing && s.worker.connected) {
      await request(s, 'shutdown', {})
      await s.workerProcess?.waitForExit()
      if (s.workerProcess?.exitCode !== 0) throw new Error(`NATURAL_WORKER_EXIT_FAILED:${s.workerProcess?.exitCode}`)
    }
    await s.job.terminate(); await s.workerProcess?.waitForExit()
    if (s.lifecycle.complete(exitCode)) {
      state(s)
      if (s.info.state === 'failed') return
      send({ type: 'exit', sessionId: s.info.sessionId, generation: 1, seq: ++s.seq, exitCode, exitCodeSource: 'process-handle' })
    }
  })()
  return s.finalize
}
async function close(s: Session) {
  if (s.closePromise) return s.closePromise
  s.closePromise = (async () => {
    const before = s.job.pids()
    s.lifecycle.beginClose(); state(s); s.intentionalStop = true
    if (s.monitor) clearInterval(s.monitor)
    if (s.finalize) await s.finalize
    else {
      await s.job.terminate(); await s.process?.waitForExit(); await s.workerProcess?.waitForExit()
      if (s.process) await finalize(s)
    }
    return { pid: s.info.pid, createdAt: s.info.createdAt, workerPid: s.workerProcess?.pid, before, remaining: s.job.pids(), state: s.info.state }
  })().catch(error => { s.lifecycle.fault(); state(s); s.closePromise = undefined; throw error })
  return s.closePromise
}
async function create(p: Record<string, unknown>) {
  validateSize(p.cols, p.rows)
  const job = new Job(), lifecycle = new Lifecycle()
  let worker: ChildProcess
  try { worker = fork(join(__dirname, 'pty-session.js'), [], {
    cwd: process.cwd(), execPath: process.execPath, execArgv: [],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true
  }) } catch (error) { job.dispose(); throw error }
  const s: Session = {
    info: { sessionId: `m0-${randomUUID()}`, generation: 1, pid: 0, createdAt: '', cols: Number(p.cols), rows: Number(p.rows), state: 'creating' },
    lifecycle, worker, job, seq: 0, pending: new Map(), intentionalStop: false,
    lastData: Date.now(), nativeExitObserved: false, native: [], cleanupPids: [], disposed: false
  }
  sessions.set(s.info.sessionId, s)
  worker.stdout?.on('data', data => console.log(`pty worker ${worker.pid}: ${data}`))
  worker.stderr?.on('data', data => console.error(`pty worker ${worker.pid}: ${data}`))
  worker.on('message', (msg: any) => {
    if (msg.type === 'spawned') {
      try {
        s.process = new ProcessHandle(msg.pid, false)
        s.info.pid = s.process.pid; s.info.createdAt = s.process.createdAt; s.native = msg.native
      } catch (error) { fault(s, error) }
    } else if (msg.type === 'data') {
      s.lastData = Date.now()
      if (!s.lifecycle.emittedExit) send({ type: 'data', sessionId: s.info.sessionId, generation: 1, seq: ++s.seq, data: msg.data })
    } else if (msg.type === 'nativeExit') { s.nativeExitObserved = true; s.nativeExitCode = msg.exitCode }
    else if (msg.requestId) {
      const waiter = s.pending.get(msg.requestId)
      if (waiter) { clearTimeout(waiter.timer); s.pending.delete(msg.requestId); if (msg.ok) waiter.resolve(msg.result); else waiter.reject(new Error(`${msg.error?.code}:${msg.error?.message}`)) }
    }
  })
  worker.on('error', error => fault(s, error))
  worker.on('exit', code => {
    s.workerExitCode = code
    for (const w of s.pending.values()) { clearTimeout(w.timer); w.reject(new Error(`WORKER_GONE:${code}`)) }
    s.pending.clear()
    if (!s.intentionalStop) {
      fault(s, `worker exited unexpectedly:${code}`)
      // Reclaim this session only; retain the fault, never relabel it as success.
      void close(s).catch(error => console.error(error))
    }
  })
  let assigned = false
  try {
    await new Promise<void>((resolve, reject) => { worker.once('spawn', resolve); worker.once('error', reject) })
    s.workerProcess = new ProcessHandle(worker.pid!); job.assign(s.workerProcess); assigned = true
    // No worker may spawn a Shell before it is owned by this Job.
    await request(s, 'create', p)
    if (!s.process) throw new Error('SHELL_HANDLE_MISSING')
    if (stopping) throw new Error('SERVICE_CLOSING')
    lifecycle.running(); state(s)
    s.monitor = setInterval(() => {
      if (s.process!.exited) void finalize(s).catch(error => { fault(s, error); console.error(error) })
    }, 25)
    return s.info
  } catch (error) {
    s.intentionalStop = true
    if (s.workerProcess) {
      // Only an assignment failure needs direct termination of our pre-spawn worker.
      // An assigned worker may be dying after Job termination; do not kill it twice.
      if (!assigned && !s.workerProcess.exited) s.workerProcess.terminate()
      await job.terminate(); await s.workerProcess.waitForExit()
    }
    s.process?.dispose(); s.workerProcess?.dispose(); job.dispose(); s.disposed = true
    sessions.delete(s.info.sessionId); throw error
  }
}
async function handle(req: Request): Promise<unknown> {
  const p = req.payload
  if (!initialized && req.operation !== 'inspect') throw new Error('SERVICE_NOT_INITIALIZED')
  if (stopping && !['shutdown', 'inspect'].includes(req.operation)) throw new Error('SERVICE_CLOSING')
  switch (req.operation) {
    case 'create': {
      const pending = create(p); creating.add(pending)
      try { return await pending } finally { creating.delete(pending) }
    }
    case 'write': { const s = session(p); if (s.info.state !== 'running' || s.process?.exited) throw new Error('SESSION_NOT_RUNNING'); validateWrite(p.data); return request(s, 'write', { data: p.data }) }
    case 'resize': { const s = session(p); if (s.info.state !== 'running' || s.process?.exited) throw new Error('SESSION_NOT_RUNNING'); validateSize(p.cols, p.rows); await request(s, 'resize', p); s.info.cols = Number(p.cols); s.info.rows = Number(p.rows); return s.info }
    case 'close': return close(session(p))
    case 'inspect': return {
      pid: process.pid, versions: process.versions, initialized,
      sessions: [...sessions.values()].map(s => ({ ...s.info, pids: s.job.pids(), workerPid: s.workerProcess?.pid, workerCreatedAt: s.workerProcess?.createdAt, workerExitCode: s.workerExitCode, native: s.native, nativeExitObserved: s.nativeExitObserved, nativeExitCode: s.nativeExitCode, cleanupPids: s.cleanupPids })),
      native: Object.keys(require.cache).filter(p => p.endsWith('.node'))
    }
    case 'shutdown': {
      stopping = true
      // Drain in-flight handshakes before disposing their Jobs or process handles.
      await Promise.allSettled([...creating])
      const results = []
      for (const s of sessions.values()) results.push(await close(s))
      for (const s of sessions.values()) if (!s.disposed) { s.process?.dispose(); s.workerProcess?.dispose(); s.job.dispose(); s.disposed = true }
      setTimeout(() => process.exit(0), 100); return results
    }
    default: throw new Error('INVALID_OPERATION')
  }
}
port.on('message', ({ data }: { data: Request | { type: string } }) => {
  if ('type' in data && data.type === 'initialize') { initialized = true; send({ type: 'ready', pid: process.pid }); return }
  if (!('requestId' in data)) return
  void handle(data).then(result => send({ requestId: data.requestId, ok: true, result }), error => send({ requestId: data.requestId, ok: false, error: { code: 'PTY_ERROR', message: String(error) } }))
})
send({ type: 'booted', pid: process.pid })
