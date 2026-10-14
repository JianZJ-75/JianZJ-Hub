import { utilityProcess, type UtilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { Job, ProcessHandle, delay } from '../adapters/windows/job-object'
import type { Operation, Reply, TerminalEvent } from '../shared/m0-protocol'

export class Service extends EventEmitter {
  readonly child: UtilityProcess
  readonly job = new Job()
  process!: ProcessHandle
  disposed = false
  exited = false
  exitCode: number | undefined
  private pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>()
  readonly ready: Promise<void>
  constructor(entry: string, cwd: string) {
    super()
    this.child = utilityProcess.fork(entry, [], { cwd, stdio: 'pipe' })
    this.child.stdout?.on('data', data => console.log(`service stdout: ${data}`))
    this.child.stderr?.on('data', data => console.error(`service stderr: ${data}`))
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`SERVICE_START_TIMEOUT:${entry}`)), 15000)
      this.child.once('spawn', () => {
        try {
          this.process = new ProcessHandle(this.child.pid!)
          this.job.assign(this.process)
          this.child.postMessage({ type: 'initialize' })
        } catch (error) { clearTimeout(timeout); reject(error) }
      })
      this.child.on('message', msg => {
        if (msg.type === 'ready') { clearTimeout(timeout); resolve() }
        if (msg.type === 'data' || msg.type === 'exit' || msg.type === 'fault') this.emit('terminal', msg as TerminalEvent)
        if (msg.requestId) {
          const reply = msg as Reply, waiter = this.pending.get(reply.requestId)
          if (waiter) {
            clearTimeout(waiter.timer); this.pending.delete(reply.requestId)
            if (reply.ok) waiter.resolve(reply.result)
            else waiter.reject(new Error(`${reply.error?.code}:${reply.error?.message}`))
          }
        }
      })
      this.child.once('exit', code => {
        this.exited = true; this.exitCode = code; clearTimeout(timeout)
        reject(new Error(`SERVICE_EXIT:${entry}:${code}`))
        for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`SERVICE_GONE:${code}`)) }
        this.pending.clear()
      })
    })
  }
  async request<T = unknown>(operation: Operation, payload: Record<string, unknown> = {}): Promise<T> {
    await this.ready
    if (this.exited) throw new Error('SERVICE_GONE')
    const requestId = randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(`SERVICE_REQUEST_TIMEOUT:${operation}`)) }, 15000)
      this.pending.set(requestId, { resolve: value => resolve(value as T), reject, timer })
      this.child.postMessage({ requestId, operation, payload })
    })
  }
  async stop() {
    if (this.disposed) return { alreadyStopped: true }
    let failure: unknown
    if (!this.exited) {
      try { await this.request('shutdown') } catch (error) { failure = error }
      const end = Date.now() + 10000
      while (!this.exited && Date.now() < end) await delay(50)
    }
    const before = this.job.pids()
    // Own Job handle is the bounded fallback, including service-owned ConPTY wrappers.
    if (before.length) await this.job.terminate()
    await this.process?.waitForExit()
    const remaining = this.job.pids()
    this.process?.dispose(); this.job.dispose(); this.disposed = true
    if (failure) throw failure
    return { beforeFallback: before, remaining, exitCode: this.exitCode }
  }
}
