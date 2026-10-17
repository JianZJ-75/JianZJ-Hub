import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const workerDir = join(process.cwd(), 'out/m1/main')
const shell = require(join(process.cwd(), 'out/m1/main/chunks/shell-DI64wxpp.js'))
const { Worker } = require('node:worker_threads')
const { join: pjoin } = require('node:path')
class ConoutConnection {
  constructor(pipe) { this.pipe = pipe; this.listeners = new Set(); this.worker = new Worker(pjoin(workerDir, 'conout-reader.js'), { workerData: { pipe } })
    this.worker.on('message', m => { if (m === 'ready') for (const f of this.listeners) f() }); this.worker.on('error', e => { throw e }) }
  onReady = f => { this.listeners.add(f); return { dispose: () => this.listeners.delete(f) } }
  connectSocket(socket) { socket.connect(this.pipe + '-worker') }
  dispose() {}
}
require('node-pty/lib/windowsConoutConnection').ConoutConnection = ConoutConnection
const pty = require('node-pty')
function base() { const e = { ...process.env }; for (const k of Object.keys(e)) if (/^(LANG|LC_ALL|LC_CTYPE|LC_MESSAGES|LANGUAGE|BASH_ENV|ENV|PROMPT_COMMAND)$/i.test(k)) delete e[k]; return e }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }
function show(s) { let out=''; for (const ch of s) { const cp=ch.codePointAt(0)
    if(cp===0x1b)out+='<ESC>'; else if(cp===0x0d)out+='<CR>'; else if(cp===0x0a)out+='<LF>'; else if(cp===0x07)out+='<BEL>'; else if(cp===0x5c)out+='<BS>'; else if(cp>126||cp<32)out+='<U+'+cp.toString(16)+'>'; else out+=ch } return out }
// Compose 'echo START_' and CJK and Enter as one input buffer after a clean prompt.
async function trial(label, extra, stripLocale = false) {
  const launch = shell.shellLaunch('git-bash', 'C:/', process.env.TEMP, { ...base(), ...extra })
  const env = { ...launch.env }
  // Simulate the pre-fix launch (no LC_ALL/LANG/LC_CTYPE) to show the octal echo.
  if (stripLocale) for (const k of Object.keys(env)) if (/^(LANG|LC_ALL|LC_CTYPE)$/i.test(k)) delete env[k]
  const term = pty.spawn(launch.executable, launch.args, { cwd: 'C:/', cols: 120, rows: 30, name: 'xterm-256color', useConpty: true, useConptyDll: true, env })
  let out=''; term.onData(d => out += d)
  await sleep(2000)
  await term.write(Buffer.from('echo BEG_'))   // ASCII prefix, no Enter
  await sleep(200)
  await term.write(Buffer.from('你好'))          // CJK bytes
  await sleep(250)
  await term.write('\r')                        // Enter
  await sleep(900)
  launch.dispose(); try { term.kill() } catch {}
  const idx = out.indexOf('BEG_')
  const seg = idx >= 0 ? out.slice(idx, idx + 200) : out.slice(-300)
  console.log('=== ' + label + ' ===\n  ' + show(seg))
}
await trial('BEFORE (no UTF-8 locale; pre-fix behavior)', {}, true)
await trial('AFTER (locale-free source via shellLaunch, fix applied)', {}, false)
await trial('AFTER with LANG=zh_CN.UTF-8 (explicit locale preserved)', { LANG: 'zh_CN.UTF-8' }, false)
process.exit(0)
