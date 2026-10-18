// One authority for state; a transport hint alone is never an exit code.
export class Lifecycle {
  state = 'creating'
  emittedExit = false
  closing = false
  running() {
    if (this.state !== 'creating') throw new Error('INVALID_STATE')
    this.state = 'running'
  }
  beginClose() {
    this.closing = true
    if (this.state !== 'exited' && this.state !== 'failed') this.state = 'closing'
  }
  fault() { if (this.state !== 'exited') this.state = 'failed' }
  complete(exitCode) {
    if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 0xffffffff) throw new Error('INVALID_EXIT_CODE')
    if (this.emittedExit) return false
    this.emittedExit = true
    if (this.state !== 'failed') this.state = 'exited'
    return true
  }
}
