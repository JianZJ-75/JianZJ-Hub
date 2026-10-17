import { app, BrowserWindow, ipcMain, dialog, nativeTheme, clipboard } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdirSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Service } from './service'
import { gitBash } from '../../adapters/windows/workstation/shell'
import { object, id, generation, size, input, LIMITS, preferences, workspace, senderAllowed } from '../../shared/workstation/rules.mjs'
export async function startWorkstation(entryDir: string) {
  const directory = app.getPath('userData'); mkdirSync(directory, { recursive: true })
  const defaultShell = gitBash()
  const defaultTerminal = { id: 'terminal-' + randomUUID(), name: '终端', cwd: app.getPath('home'), layout: 'single' as const }
  const historyDir = join(directory, 'shell-history-disabled'); mkdirSync(historyDir, { recursive: true })
  const pty = new Service(join(entryDir, 'pty-service.js'), directory), data = new Service(join(entryDir, 'data-service.js'), directory)
  let win: BrowserWindow | undefined, ending = false, finished = false, exitAttempt: Promise<void> | undefined
  const owners = new Map<string, any>(), endedOwners = new Map<string, any>(), creates = new Map<string, { paneId: string; signature: string; task: Promise<any> }>()
  let saved: any, saveChain = Promise.resolve()
  const url = pathToFileURL(join(entryDir, '../renderer/index.html')).href
  try { await Promise.all([pty.ready, data.ready]); saved = await data.request('load') }
  catch (error) { await Promise.allSettled([pty.reclaim(), data.reclaim()]); throw error }
  win = new BrowserWindow({ title: '工作站', width: 1440, height: 960, minWidth: 640, minHeight: 480, backgroundColor: '#e9edf2', webPreferences: { preload: join(entryDir, '../preload/workstation.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false, spellcheck: false } })
  const window = win
  window.setMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)
  const current = (p: any) => { id(p.sessionId); generation(p.generation); const owner = owners.get(p.sessionId) || endedOwners.get(p.sessionId); if (!owner || owner.windowId !== window.id) throw new Error('SESSION_GONE'); if (owner.generation !== p.generation) throw new Error('STALE_SESSION'); return owner }
  const configSave = (operation: string, payload: any, apply: () => void) => {
    const task = saveChain.then(async () => { await data.request(operation, payload); apply() }); saveChain = task.catch(() => {}); return task
  }
  let pendingRequests = 0
  ipcMain.handle('workstation:request', async (event, request) => {
    try {
      if (!senderAllowed(event, window.webContents, url)) throw new Error('INVALID_SENDER')
      object(request, ['operation', 'payload']); const { operation, payload: p } = request
      if (typeof operation !== 'string') throw new Error('INVALID_OPERATION')
      if (ending && !['ack', 'close', 'load'].includes(operation)) throw new Error('WORKSTATION_CLOSING')
      if (pendingRequests >= 128 && operation !== 'ack') throw new Error('IPC_BUSY')
      pendingRequests++
      try {
        let result: any
        if (operation === 'load') { object(p, []); result = { ...saved, defaultTerminal, defaultShell, dark: nativeTheme.shouldUseDarkColors, dataDirectory: directory } }
        else if (operation === 'selectDirectory') { object(p, []); const choice = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: '选择工作区目录' }); result = choice.canceled ? null : choice.filePaths[0] }
        else if (operation === 'saveWorkspace') {
          workspace(p); if (!statSync(p.cwd).isDirectory()) throw new Error('INVALID_CWD')
          const task = saveChain.then(async () => {
            const list = saved.workspaces.filter((w: any) => w.id !== p.id).concat(p)
            if (list.length > 200) throw new Error('TOO_MANY_WORKSPACES')
            await data.request('workspaces', { workspaces: list }); saved.workspaces = list
          }); saveChain = task.catch(() => {}); await task
        } else if (operation === 'savePreferences') { preferences(p); await configSave('preferences', p, () => { saved.preferences = p }) }
        else if (operation === 'create') {
          object(p, ['requestId', 'workspaceId', 'paneId', 'cols', 'rows']); id(p.requestId); id(p.workspaceId); id(p.paneId); size(p.cols, p.rows)
          const w = p.workspaceId === defaultTerminal.id ? defaultTerminal : saved.workspaces.find((w: any) => w.id === p.workspaceId); if (!w) throw new Error('WORKSPACE_GONE')
          const signature = [p.workspaceId, p.paneId, p.cols, p.rows].join('|'), prior = creates.get(p.requestId)
          if (prior) { if (prior.signature !== signature) throw new Error('REQUEST_CONFLICT'); result = await prior.task }
          else {
            if ([...owners.values()].some(o => o.paneId === p.paneId)) throw new Error('PANE_ALREADY_BOUND')
            if (!statSync(w.cwd).isDirectory()) throw new Error('INVALID_CWD')
            const sessionId = 'session-' + randomUUID(), owner = { sessionId, generation: 1, paneId: p.paneId, workspaceId: p.workspaceId, windowId: window.id }
            owners.set(sessionId, owner)
            const task = pty.request('create', { ...owner, shell: 'git-bash', cwd: w.cwd, cols: p.cols, rows: p.rows, historyDir }).catch(error => { owners.delete(sessionId); throw error })
            creates.set(p.requestId, { paneId: p.paneId, signature, task }); if (creates.size > 128) creates.delete(creates.keys().next().value!)
            result = await task
          }
        } else if (['write', 'resize', 'ack', 'close'].includes(operation)) {
          object(p, ['sessionId', 'generation', ...(operation === 'write' ? ['data'] : operation === 'resize' ? ['cols', 'rows'] : operation === 'ack' ? ['seq'] : [])]); current(p)
          if (operation === 'write') input(p.data)
          if (operation === 'resize') size(p.cols, p.rows)
          if (operation === 'ack' && (!Number.isSafeInteger(p.seq) || p.seq < 0)) throw new Error('INVALID_ACK')
          result = await pty.request(operation, p)
          if (operation === 'close') { const owner = owners.get(p.sessionId); if (owner) endedOwners.set(p.sessionId, owner); owners.delete(p.sessionId); if (endedOwners.size > 128) endedOwners.delete(endedOwners.keys().next().value!) }
        } else if (operation === 'clipboardRead') { object(p, []); if (!window.isFocused()) throw new Error('WINDOW_NOT_FOCUSED'); result = await clipboard.readText(); if (typeof result !== 'string') throw new Error('INVALID_CLIPBOARD_TEXT'); if (Buffer.byteLength(result, 'utf8') > LIMITS.input) throw new Error('CLIPBOARD_TOO_LARGE') }
        else if (operation === 'clipboardWrite') { object(p, ['text']); if (typeof p.text !== 'string') throw new Error('INVALID_CLIPBOARD_TEXT'); input(p.text); await clipboard.writeText(p.text) }
        else if (operation === 'quit') { object(p, []); void end(); result = {} }
        else throw new Error('INVALID_OPERATION')
        return { ok: true, result }
      } finally { pendingRequests-- }
    } catch (error) { return { ok: false, error: { code: 'WORKSTATION_ERROR', message: String(error) } } }
  })
  pty.on('terminal', event => {
    const owner = owners.get(event.sessionId)
    if (owner && !window.isDestroyed()) window.webContents.send('workstation:terminal', event)
    if (owner && event.type !== 'data') { endedOwners.set(event.sessionId, owner); owners.delete(event.sessionId); if (endedOwners.size > 128) endedOwners.delete(endedOwners.keys().next().value!) }
  })
  pty.on('lost', () => { if (!ending && !pty.closing && !window.isDestroyed()) { for (const owner of owners.values()) window.webContents.send('workstation:terminal', { ...owner, type: 'fault', error: '终端服务已断开；会话进程由 Job 回收，不会自动恢复。', outputComplete: false }); void pty.reclaim().then(() => { for (const owner of owners.values()) { if (!window.isDestroyed()) window.webContents.send('workstation:terminal', { ...owner, type: 'fault', error: '终端服务断开；受管理进程已确认回收。输出可能不完整。', cleanup: { remaining: [] }, outputComplete: false }); endedOwners.set(owner.sessionId, owner) } owners.clear(); while (endedOwners.size > 128) endedOwners.delete(endedOwners.keys().next().value!) }).catch(console.error) } })
  const theme = () => { if (!window.isDestroyed()) window.webContents.send('workstation:theme', nativeTheme.shouldUseDarkColors) }
  nativeTheme.on('updated', theme)
  async function end() {
    if (exitAttempt || finished) return exitAttempt
    exitAttempt = (async () => {
      const inspect = pty.disposed || pty.exited ? { active: [] } : await pty.request('inspect')
      if (inspect.active.length || owners.size) {
        const answer = await dialog.showMessageBox(window, { type: 'warning', title: '关闭工作站？', message: '结束全部工作区中的受管理终端？', detail: 'Shell 及其子进程将结束。下次打开不恢复进程或重放命令。', buttons: ['继续工作', '结束全部终端并退出'], defaultId: 0, cancelId: 0, noLink: true })
        if (answer.response !== 1) return
      }
      ending = true
      try {
        await Promise.allSettled([...creates.values()].map(v => v.task)); await saveChain
        await pty.stop(); await data.stop(); owners.clear(); creates.clear(); nativeTheme.removeListener('updated', theme); ipcMain.removeHandler('workstation:request')
        finished = true; window.destroy(); app.quit()
      } catch (error) { ending = false; await dialog.showMessageBox(window, { type: 'error', message: '退出未完成；窗口已保留', detail: String(error) + '\n请重试关闭。未确认清理成功前不会隐藏窗口。' }) }
    })().catch(async error => { if (!window.isDestroyed()) await dialog.showMessageBox(window, { type: 'error', message: '退出失败', detail: String(error) }) }).finally(() => { exitAttempt = undefined })
    return exitAttempt
  }
  window.on('close', event => { if (!finished) { event.preventDefault(); void end() } })
  app.on('before-quit', event => { if (!finished) { event.preventDefault(); void end() } })
  window.webContents.on('render-process-gone', () => { void Promise.allSettled([pty.reclaim(), data.reclaim()]).then(() => { owners.clear(); finished = true; window.destroy(); app.quit() }) })
  await window.loadFile(join(entryDir, '../renderer/index.html'))
  return { win: window, pty, data, owners, directory }
}
