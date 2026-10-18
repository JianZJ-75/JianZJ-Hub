import { app, BrowserWindow, ipcMain } from 'electron'
import { join, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { Service } from './m0-service'
import { verify, type Evidence } from './m0-checks'
import { validateSessionId, validateSize, validateWrite } from '../shared/validation.mjs'
import type { SessionInfo, TerminalEvent } from '../shared/m0-protocol'

// M0 software rendering makes screenshot probes independent of GPU driver state.
app.disableHardwareAcceleration()
const automatic = process.env.JIANZJ_M0_AUTO === '1', mode = process.env.JIANZJ_M0_MODE || 'normal'
const root = resolve(__dirname, '../..'), evidenceDir = resolve(process.env.JIANZJ_M0_EVIDENCE || join(root, '.m0-scratch', 'manual'))
mkdirSync(evidenceDir, { recursive: true }); app.setPath('userData', join(evidenceDir, 'userData'))
const evidence: Evidence = { started: new Date().toISOString(), mode, packaged: app.isPackaged, versions: process.versions, mainPid: process.pid, checks: [] }
const save = () => writeFileSync(join(evidenceDir, 'result.json'), JSON.stringify(evidence, null, 2))
const services: Service[] = [], sessions = new Map<string, SessionInfo>()
let ending = false
async function cleanup() {
  const results = []
  for (const service of services) {
    if (service.disposed) continue
    try { if (!service.exited) results.push(await service.stop()); else { const before = service.job.pids(); if (before.length) await service.job.terminate(); results.push({ before, remaining: service.job.pids(), exitCode: service.exitCode }); service.process?.dispose(); service.job.dispose(); service.disposed = true } }
    catch (error) { results.push({ failure: String(error) }) }
  }
  evidence.cleanup = results; save()
  if (results.some(r => 'failure' in r)) throw new Error('CLEANUP_FAILED')
}
app.on('before-quit', event => {
  if (ending) return
  event.preventDefault(); ending = true
  void cleanup().then(() => app.exit(0), error => { console.error(error); app.exit(1) })
})
app.whenReady().then(async () => {
  const resource = app.isPackaged ? join(process.resourcesPath, 'simple') : join(root, '.m0-scratch/downloads/simple-0.7.1/extracted/libsimple-windows-x64')
  const fixture = app.isPackaged ? join(process.resourcesPath, 'm0-tests/process-tree.mjs') : join(root, 'tests/m0/process-tree.mjs')
  try {
    const db = new Database(':memory:')
    try { db.loadExtension(join(resource, 'simple.dll')); evidence.mainNative = { sqlite: db.prepare('SELECT sqlite_version() version').get(), native: Object.keys(require.cache).filter(p => p.endsWith('.node')) } }
    finally { db.close() }
    const terminal = new Service(join(__dirname, 'pty-service.js'), evidenceDir); services.push(terminal)
    const data = new Service(join(__dirname, 'data-service.js'), evidenceDir); services.push(data)
    await Promise.all([terminal.ready, data.ready])
    evidence.services = services.map(s => ({ pid: s.process.pid, createdAt: s.process.createdAt, jobPids: s.job.pids() }))
    const win = new BrowserWindow({ width: 1080, height: 760, show: true, webPreferences: { preload: join(__dirname, '../preload/index.js'), nodeIntegration: false, contextIsolation: true, sandbox: true } })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', event => event.preventDefault())
    const sender = (event: Electron.IpcMainInvokeEvent) => { if (ending || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || !event.senderFrame.url.startsWith('file:')) throw new Error('INVALID_SENDER') }
    const own = (p: { sessionId: string }) => { validateSessionId(p.sessionId); const s = sessions.get(p.sessionId); if (!s) throw new Error('SESSION_GONE'); return { sessionId: s.sessionId, generation: s.generation } }
    ipcMain.handle('m0:create', async event => { sender(event); const s = await terminal.request<SessionInfo>('create', { cwd: evidenceDir, cols: 80, rows: 24 }); sessions.set(s.sessionId, s); return s })
    ipcMain.handle('m0:write', (event, p) => { sender(event); validateWrite(p.data); return terminal.request('write', { ...own(p), data: p.data }) })
    ipcMain.handle('m0:resize', (event, p) => { sender(event); validateSize(p.cols, p.rows); return terminal.request('resize', { ...own(p), cols: p.cols, rows: p.rows }) })
    ipcMain.handle('m0:close', (event, p) => { sender(event); return terminal.request('close', own(p)) })
    ipcMain.handle('m0:database', event => { sender(event); return data.request('database', { resource }) })
    terminal.on('terminal', (event: TerminalEvent) => { if (!win.isDestroyed() && sessions.has(event.sessionId)) win.webContents.send('m0:terminal', event) })
    win.on('closed', () => app.quit())
    await win.loadFile(join(__dirname, '../renderer/index.html'))
    if (automatic) {
      await verify(win, terminal, data, evidenceDir, evidenceDir, resource, fixture, mode, evidence, sessions)
      evidence.finished = new Date().toISOString(); await cleanup(); ending = true; app.exit(0)
    }
  } catch (error) {
    evidence.failure = String(error instanceof Error ? error.stack : error); save(); console.error(error)
    try { await cleanup() } catch (cleanupError) { console.error(cleanupError) }
    ending = true; app.exit(1)
  }
})
