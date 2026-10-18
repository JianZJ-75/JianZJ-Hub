// node-pty 1.1.0 ConoutConnection compatibility seam. MIT upstream attribution:
// Copyright (c) 2020 Microsoft Corporation. See node-pty/LICENSE in distribution.
// Unlike upstream's 1000ms reader termination, EOF propagates through pipe.finish.
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
export class ConoutConnection {
  private worker: Worker
  private listeners = new Set<() => void>()
  constructor(private pipe: string) {
    this.worker = new Worker(join(__dirname, 'conout-reader.js'), { workerData: { pipe } })
    this.worker.on('message', message => { if (message === 'ready') for (const f of this.listeners) f() })
    this.worker.on('error', error => { throw error })
  }
  onReady = (listener: () => void) => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) } }
  connectSocket(socket: import('node:net').Socket) { socket.connect(this.pipe + '-worker') }
  dispose() { /* Reader exits on real EOF and writable finish, never on elapsed time. */ }
}
export function installConout() {
  const module = require('node-pty/lib/windowsConoutConnection')
  module.ConoutConnection = ConoutConnection
}
