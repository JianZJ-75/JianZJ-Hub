import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, createWriteStream, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url), root = resolve('.'), entry = process.argv[2] || 'probe', mode = process.argv[3] || 'normal', dir = join(root, '.m1-scratch', entry + '-' + mode + '-' + randomUUID())
mkdirSync(dir, { recursive: true }); mkdirSync(join(dir, 'claude-config'))
const { Job, ProcessHandle, delay } = require(join(root, 'out/m1/main/job-adapter.js'))
const ioTrace = join(dir, 'io-trace.jsonl'), env = { ...process.env, JIANZJ_M1_EVIDENCE: dir, JIANZJ_M1_IO_TRACE: ioTrace, JIANZJ_M1_MODE: mode, CLAUDE_CONFIG_DIR: join(dir, 'claude-config'), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1' }; delete env.ELECTRON_RUN_AS_NODE
const job = new Job(), controlJob = new Job()
const control = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true })
await new Promise((resolve, reject) => { control.once('spawn', resolve); control.once('error', reject) })
const controlHandle = new ProcessHandle(control.pid); controlJob.assign(controlHandle)
const child = spawn(require('electron'), [join(root, 'out/m1/main/' + entry + '.js')], { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.pipe(createWriteStream(join(dir, 'stdout.log'))); child.stderr.pipe(createWriteStream(join(dir, 'stderr.log')))
let h, timeout, tracked = [], exitPromise
const report = { entry, mode, dir, started: new Date().toISOString(), control: { pid: controlHandle.pid, createdAt: controlHandle.createdAt } }
try {
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  h = new ProcessHandle(child.pid); job.assign(h); report.app = { pid: h.pid, createdAt: h.createdAt }
  exitPromise = new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error('PROBE_TIMEOUT')), 240000); child.once('exit', resolve) })
  if (mode === 'main-crash') {
    const end = Date.now() + 30000
    while (!existsSync(join(dir, 'armed.json'))) { if (h.exited || Date.now() > end) throw new Error('ARMED_MISSING'); await delay(25) }
    const armed = JSON.parse(readFileSync(join(dir, 'armed.json')))
    tracked = armed.managed.map(r => { const p = new ProcessHandle(r.pid, false); assert.equal(p.createdAt, r.createdAt); return p })
    report.armed = armed; h.terminate(); await Promise.all(tracked.map(p => p.waitForExit())); report.identitiesExited = tracked.every(p => p.exited)
  }
  report.code = await exitPromise
  assert.equal(report.code, mode === 'main-crash' ? 1 : 0)
  const end = Date.now() + 10000
  while (job.pids().length && Date.now() < end) await delay(50)
  report.remaining = job.pids(); assert.deepEqual(report.remaining, [])
  assert.equal(controlHandle.exited, false); report.controlSurvived = true; report.status = 'pass'
} catch (error) { report.status = 'fail'; report.error = String(error); process.exitCode = 1 }
finally {
  clearTimeout(timeout); report.fallbackPids = job.pids(); if (report.fallbackPids.length) await job.terminate()
  h?.dispose(); tracked.forEach(p => p.dispose()); job.dispose(); await controlJob.terminate(); controlHandle.dispose(); controlJob.dispose()
  report.finished = new Date().toISOString(); writeFileSync(join(dir, 'supervisor.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report))
}
