import { utilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { Job, ProcessHandle, delay } from '../../adapters/windows/job-object'
export class Service extends EventEmitter {
  child: Electron.UtilityProcess; job = new Job(); process?: ProcessHandle; ready: Promise<void>
  exited = false; disposed = false; closing = false; private cleanup?: Promise<void>; pending = new Map<string, any>()
  constructor(entry: string, cwd: string) {
    super(); this.child = utilityProcess.fork(entry, [], { cwd, stdio: 'ignore' })
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SERVICE_START_TIMEOUT')), 15000)
      this.child.once('spawn', () => { try { this.process = new ProcessHandle(this.child.pid!); this.job.assign(this.process); this.child.postMessage({ type: 'initialize' }) } catch (e) { reject(e) } })
      this.child.on('message', m => {
        if (m.type === 'ready') { clearTimeout(timer); resolve() }
        else if (['data', 'exit', 'fault'].includes(m.type)) this.emit('terminal', m)
        else { const w = this.pending.get(m.requestId); if (w) { clearTimeout(w.timer); this.pending.delete(m.requestId); m.ok ? w.resolve(m.result) : w.reject(new Error(m.error)) } }
      })
      this.child.once('exit', code => { clearTimeout(timer); this.exited = true; reject(new Error('SERVICE_EXIT:' + code)); for (const w of this.pending.values()) { clearTimeout(w.timer); w.reject(new Error('SERVICE_GONE')) } this.pending.clear(); this.emit('lost', code) })
    })
  }
  async request<T = any>(operation: string, payload: any = {}): Promise<T> {
    await this.ready; if (this.exited || this.disposed) throw new Error('SERVICE_GONE'); if (this.pending.size >= 256) throw new Error('SERVICE_BUSY')
    const requestId = randomUUID()
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('SERVICE_TIMEOUT:' + operation)) }, 45000); this.pending.set(requestId, { resolve, reject, timer }); this.child.postMessage({ requestId, operation, payload }) })
  }
  stop() {
    if (this.disposed) return Promise.resolve()
    if (this.cleanup) return this.cleanup
    this.closing = true
    this.cleanup = (async () => {
      if (!this.exited) await this.request('shutdown')
      if (this.job.pids().length) await this.job.terminate()
      await this.process?.waitForExit()
      this.process?.dispose(); this.job.dispose(); this.disposed = true
      for (const w of this.pending.values()) { clearTimeout(w.timer); w.reject(new Error('SERVICE_STOPPED')) } this.pending.clear(); this.removeAllListeners()
    })().catch(error => { this.cleanup = undefined; this.closing = false; throw error })
    return this.cleanup
  }
  reclaim() {
    if (this.disposed) return Promise.resolve()
    if (this.cleanup) return this.cleanup
    this.closing = true
    this.cleanup = (async () => { await this.job.terminate(); await this.process?.waitForExit(); this.process?.dispose(); this.job.dispose(); this.disposed = true })().catch(error => { this.cleanup = undefined; this.closing = false; throw error })
    return this.cleanup
  }
}
