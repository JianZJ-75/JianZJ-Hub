import { statSync } from 'node:fs'
import { installConout } from '../../../adapters/windows/workstation/conout'
import { shellLaunch } from '../../../adapters/windows/workstation/shell'
import { Credit, LIMITS, size, input } from '../../../shared/workstation/rules.mjs'
import { ioTrace } from '../../../shared/workstation/io-trace.mjs'
installConout()
const pty = require('node-pty') as typeof import('node-pty')
let term: import('node-pty').IPty | undefined, started = false, eof = false, pending = '', stopping = false
const credit = new Credit()
const send = (m: any) => { if (!process.connected) throw new Error('BROKER_GONE'); process.send!(m) }
function pump() {
  while (pending && credit.entries.size < LIMITS.events && credit.bytes <= LIMITS.window - LIMITS.chunk) {
    let count = Math.min(4096, pending.length)
    if (count < pending.length && /[\uD800-\uDBFF]/.test(pending[count - 1])) count--
    const data = pending.slice(0, count); pending = pending.slice(count)
    send({ type: 'data', seq: credit.add(Buffer.byteLength(data)), data })
  }
  if (pending || credit.entries.size >= LIMITS.events || credit.bytes > LIMITS.window - LIMITS.chunk) term?.pause(); else if (!eof) term?.resume()
  if (eof && !pending && credit.bytes === 0) send({ type: 'drained', lastSeq: credit.sent, peak: credit.peak })
}
process.on('disconnect', () => process.exit(1))
process.on('message', (req: any) => {
  const { requestId, operation, payload: p } = req
  ioTrace('worker-receive', { requestId, operation, dataHex: operation === 'write' && typeof p?.data === 'string' ? Buffer.from(p.data).toString('hex') : undefined, cols: operation === 'resize' ? p?.cols : undefined, rows: operation === 'resize' ? p?.rows : undefined })
  try {
    if (operation === 'create') {
      if (started) throw new Error('WORKER_ALREADY_STARTED'); started = true
      size(p.cols, p.rows); if (!statSync(p.cwd).isDirectory()) throw new Error('INVALID_CWD')
      const launch = shellLaunch(p.shell, p.cwd, p.historyDir)
      process.once('exit', () => launch.dispose())
      const { marker, claudeExecutable } = launch
      term = pty.spawn(launch.executable, launch.args, { cwd: p.cwd, cols: p.cols, rows: p.rows, name: 'xterm-256color', useConpty: true, useConptyDll: true, env: launch.env })
      const inputSocket = (term as any)._agent.inSocket as import('node:net').Socket
      // Per-write callbacks report pipe failures; output drain has its own EOF.
      inputSocket.on('error', () => {})
      send({ type: 'spawned', pid: term.pid })
      let ready = false, greeting = ''
      term.onData(data => {
        if (Buffer.byteLength(pending) + Buffer.byteLength(data) > 262144) throw new Error('PTY_SOURCE_CHUNK_OVERFLOW')
        pending += data; pump()
        if (!ready) { greeting = (greeting + data).slice(-4096); if (greeting.includes(marker)) { ready = true; send({ requestId, ok: true, result: { pid: term!.pid, claudeExecutable, shellId: launch.id, shellLabel: launch.label, shellExecutable: launch.executable } }) } }
      })
      // Transport close is not an exit-code authority.
      term.onExit(() => { eof = true; pump() })
      return
    }
    if (operation === 'ack') { credit.ack(p.seq); pump(); return }
    if (!term) throw new Error('SESSION_NOT_CREATED')
    if (operation === 'write') {
      if (stopping) throw new Error('SESSION_CLOSING'); input(p.data)
      const socket = (term as any)._agent.inSocket as import('node:net').Socket
      if (socket.writableLength + Buffer.byteLength(p.data) > LIMITS.input) throw new Error('INPUT_BACKPRESSURE')
      socket.write(p.data, error => { ioTrace('worker-write-callback', { requestId, ok: !error, error: error ? String(error) : undefined }); if (process.connected) send({ requestId, ok: !error, error: error ? String(error) : undefined, result: {} }) }); return
    }
    else if (operation === 'resize') {
      size(p.cols, p.rows)
      if (!eof) { term.resize(p.cols, p.rows); ioTrace('worker-resize-called', { requestId, cols: p.cols, rows: p.rows }) }
      // ConPTY can report ResizePseudoConsole complete before an interactive
      // reader has resumed after its window-size signal. Write a neutral NUL
      // fence through the same input handle before the resize ACK; this byte
      // is not derived from or appended to user data.
      const socket = (term as any)._agent.inSocket as import('node:net').Socket
      if (eof) { send({ requestId, ok: true, result: {} }); return }
      socket.write('\x00', error => { ioTrace('worker-resize-fence-callback', { requestId, ok: !error, error: error ? String(error) : undefined }); if (process.connected) send({ requestId, ok: !error, error: error ? String(error) : undefined, result: {} }) })
      return
    }
    else if (operation === 'shutdown') { if (!eof || pending || credit.bytes) throw new Error('OUTPUT_NOT_DRAINED'); process.send!({ requestId, ok: true }, () => process.exit(0)); return }
    else throw new Error('INVALID_OPERATION')
  } catch (error) { send({ requestId, ok: false, error: String(error) }) }
})
