import * as pty from 'node-pty'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { validateSize, validateWrite } from '../../shared/validation.mjs'
import type { Request, Reply } from '../../shared/m0-protocol'

// Exactly one native PTY in this process; broker owns its Job and identity.
let terminal: pty.IPty | undefined
let started = false
function send(message: unknown) { if (process.connected) process.send!(message) }
process.on('disconnect', () => process.exit(1))
process.on('message', (req: Request) => {
  const reply: Reply = { requestId: req.requestId, ok: true }
  try {
    const p = req.payload
    if (req.operation === 'create') {
      if (started) throw new Error('WORKER_ALREADY_STARTED')
      started = true
      validateSize(p.cols, p.rows)
      const shell = join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
      if (typeof p.cwd !== 'string' || !existsSync(p.cwd) || !statSync(p.cwd).isDirectory() || !existsSync(shell)) throw new Error('INVALID_SHELL_OR_CWD')
      const marker = `M0_GATE_${randomUUID()}`
      const history = join(p.cwd, `m0-history-${randomUUID()}.txt`).replaceAll("'", "''")
      const startup = `$ErrorActionPreference='Stop'; Import-Module PSReadLine; Set-PSReadLineOption -HistorySaveStyle SaveNothing -HistorySavePath '${history}'; Write-Output '${marker}'; $ErrorActionPreference='Continue'`
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
      terminal = pty.spawn(shell, ['-NoLogo', '-NoProfile', '-NoExit', '-Command', startup], {
        cwd: p.cwd, cols: Number(p.cols), rows: Number(p.rows), env,
        name: 'xterm-256color', useConpty: true, useConptyDll: true
      })
      send({ type: 'spawned', pid: terminal.pid, native: Object.keys(require.cache).filter(p => p.endsWith('.node')) })
      let startupOutput = '', ready = false
      const timer = setTimeout(() => {
        if (!ready) send({ requestId: req.requestId, ok: false, error: { code: 'STARTUP_TIMEOUT', message: 'Shell handshake missing' } })
      }, 15000)
      terminal.onData(data => {
        send({ type: 'data', data })
        if (!ready) {
          startupOutput = (startupOutput + data).slice(-8192)
          if (startupOutput.includes(marker)) { ready = true; clearTimeout(timer); send({ requestId: req.requestId, ok: true, result: { pid: terminal!.pid } }) }
        }
      })
      terminal.onExit(event => {
        // Socket-close can precede the native exit-code callback.
        send({ type: 'nativeExit', exitCode: event.exitCode })
        if (!ready) { clearTimeout(timer); send({ requestId: req.requestId, ok: false, error: { code: 'STARTUP_EXIT', message: String(event.exitCode) } }) }
      })
      return
    }
    if (req.operation === 'shutdown') { send({ requestId: req.requestId, ok: true, result: { shutdown: true } }); setTimeout(() => process.exit(0), 25); return }
    if (!terminal) throw new Error('SESSION_NOT_CREATED')
    if (req.operation === 'write') { validateWrite(p.data); terminal.write(String(p.data)); reply.result = { written: Buffer.byteLength(String(p.data)) } }
    else if (req.operation === 'resize') { validateSize(p.cols, p.rows); terminal.resize(Number(p.cols), Number(p.rows)); reply.result = { cols: p.cols, rows: p.rows } }
    else throw new Error('INVALID_WORKER_OPERATION')
  } catch (error) { reply.ok = false; reply.error = { code: 'PTY_ERROR', message: String(error) } }
  send(reply)
})
send({ type: 'booted', pid: process.pid })
