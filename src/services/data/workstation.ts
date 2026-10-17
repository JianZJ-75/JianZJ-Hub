import Database from 'better-sqlite3'
import { join } from 'node:path'
import { preferences, workspace } from '../../shared/workstation/rules.mjs'
const port = process.parentPort!
let db: Database.Database | undefined
port.on('message', ({ data }: any) => {
  if (data.type === 'initialize') {
    db = new Database(join(process.cwd(), 'workstation.sqlite'))
    db.pragma('journal_mode = WAL')
    const version = db.pragma('user_version', { simple: true }) as number
    if (version > 1) throw new Error('NEWER_DATABASE_SCHEMA')
    db.exec('CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version=1')
    port.postMessage({ type: 'ready' }); return
  }
  try {
    let result: any = {}
    if (data.operation === 'load') {
      const rows = db!.prepare('SELECT key,value FROM config').all() as { key: string; value: string }[]
      result = { workspaces: [], preferences: { theme: 'system', fontSize: 14, density: 'comfortable' } }
      for (const row of rows) result[row.key] = JSON.parse(row.value)
      preferences(result.preferences); result.workspaces.forEach(workspace)
    } else if (data.operation === 'preferences') {
      preferences(data.payload); db!.prepare('INSERT OR REPLACE INTO config VALUES (?,?)').run('preferences', JSON.stringify(data.payload))
    } else if (data.operation === 'workspaces') {
      if (!Array.isArray(data.payload.workspaces) || data.payload.workspaces.length > 200) throw new Error('INVALID_WORKSPACES')
      data.payload.workspaces.forEach(workspace)
      db!.prepare('INSERT OR REPLACE INTO config VALUES (?,?)').run('workspaces', JSON.stringify(data.payload.workspaces))
    } else if (data.operation === 'shutdown') { db!.close(); db = undefined }
    else throw new Error('INVALID_OPERATION')
    port.postMessage({ requestId: data.requestId, ok: true, result })
  } catch (error) { port.postMessage({ requestId: data.requestId, ok: false, error: String(error) }) }
})
