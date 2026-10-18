import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const root = resolve(fileURLToPath(new URL('../..', import.meta.url))), require = createRequire(import.meta.url)
const { Job, ProcessHandle, delay } = require(join(root, 'out/main/job-adapter.js'))
const target = process.argv[2] || 'dev', interactive = process.argv.includes('--interactive')
const requested = process.argv.find(a => a.startsWith('--mode='))?.slice(7)
if (!['dev', 'packaged'].includes(target)) throw new Error('Expected dev or packaged')
const executable = target === 'packaged' ? join(root, 'release/m0/win-unpacked/JianZJ Hub M0.exe') : require('electron')
const shell = join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
const availableModes = ['normal', 'worker-fault', 'service-fault', 'main-crash', 'concurrent-exit']
if (requested && !availableModes.includes(requested)) throw new Error('INVALID_TEST_MODE')
const repeat = Number(process.argv.find(a => a.startsWith('--repeat='))?.slice(9) || 1)
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error('INVALID_TEST_REPEAT')
const selected = interactive ? ['manual'] : requested ? [requested] : availableModes
const modes = Array.from({ length: repeat }, () => selected).flat()
async function waitUntil(read, accept, timeout = 240000) {
  const end = Date.now() + timeout
  do { const value = read(); if (accept(value)) return value; await delay(100) } while (Date.now() < end)
  throw new Error('SUPERVISOR_TIMEOUT')
}
for (const mode of modes) {
  const directory = join(root, '.m0-scratch/evidence', `${target}-${mode}-${randomUUID()}`)
  mkdirSync(directory, { recursive: true })
  const report = { target, mode, directory, started: new Date().toISOString() }
  const outer = new Job(), controlJob = new Job()
  let child, processHandle, control, controlHandle, tracked = []
  try {
    control = spawn(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 300'], { stdio: 'ignore', windowsHide: true })
    await new Promise((resolve, reject) => { control.once('spawn', resolve); control.once('error', reject) })
    controlHandle = new ProcessHandle(control.pid); controlJob.assign(controlHandle)
    report.control = { pid: controlHandle.pid, createdAt: controlHandle.createdAt }
    const env = { ...process.env, JIANZJ_M0_AUTO: interactive ? '0' : '1', JIANZJ_M0_MODE: mode, JIANZJ_M0_EVIDENCE: directory }
    delete env.ELECTRON_RUN_AS_NODE
    child = spawn(executable, target === 'dev' ? [root] : [], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false })
    let stderr = '', stdout = ''
    child.stdout.on('data', data => { stdout += data; writeFileSync(join(directory, 'stdout.log'), stdout) })
    child.stderr.on('data', data => { stderr += data; writeFileSync(join(directory, 'stderr.log'), stderr) })
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
    processHandle = new ProcessHandle(child.pid); outer.assign(processHandle)
    report.app = { pid: processHandle.pid, createdAt: processHandle.createdAt }
    let ended = false, exitCode
    child.once('exit', code => { ended = true; exitCode = code })
    if (mode === 'main-crash') {
      await waitUntil(() => ({ armed: existsSync(join(directory, 'armed.json')), ended }), v => v.armed || v.ended)
      assert.ok(existsSync(join(directory, 'armed.json')), `App failed before armed: ${stderr}`)
      const armed = JSON.parse(readFileSync(join(directory, 'armed.json'), 'utf8'))
      tracked = armed.managed.map(record => { const p = new ProcessHandle(record.pid, false); assert.equal(p.createdAt, record.createdAt); return p })
      report.beforeCrash = outer.pids()
      processHandle.terminate()
      await Promise.all(tracked.map(p => p.waitForExit()))
      report.mainCrashManagedCleanup = { managed: armed.managed, allExited: tracked.every(p => p.exited) }
    }
    if (interactive) await new Promise(resolve => child.once('exit', resolve))
    else await waitUntil(() => ended, Boolean)
    report.exitCode = exitCode
    if (mode !== 'main-crash') {
      assert.equal(exitCode, 0, `App failed: ${stderr}`)
      report.appResult = JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'))
      assert.ok(!report.appResult.failure)
      assert.ok(report.appResult.checks.every(c => c.status === 'pass'))
    }
    const timeout = Date.now() + 10000
    while (outer.pids().length && Date.now() < timeout) await delay(100)
    report.afterAppExit = outer.pids()
    assert.ok(!controlHandle.exited, 'Independent control process unexpectedly exited')
    report.controlSurvived = true
    assert.equal(report.afterAppExit.length, 0, 'Managed wrapper processes remain')
    report.status = 'pass'
  } catch (error) { report.status = 'fail'; report.error = String(error.stack || error); process.exitCode = 1 }
  finally {
    report.fallbackPids = outer.pids()
    if (report.fallbackPids.length) await outer.terminate()
    if (processHandle) { await processHandle.waitForExit(); processHandle.dispose() }
    tracked.forEach(p => p.dispose())
    await controlJob.terminate(); if (controlHandle) { await controlHandle.waitForExit(); controlHandle.dispose() }
    outer.dispose(); controlJob.dispose()
    report.finished = new Date().toISOString()
    writeFileSync(join(directory, 'supervisor.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  }
  if (report.status !== 'pass') break
}
