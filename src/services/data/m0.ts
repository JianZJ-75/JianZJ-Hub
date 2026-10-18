import Database from 'better-sqlite3'
import { join } from 'node:path'
import type { Request, Reply } from '../../shared/m0-protocol'
const port = process.parentPort
if (!port) throw new Error('UTILITY_PROCESS_REQUIRED')
port.on('message', ({ data }: { data: Request | { type: string } }) => {
  if ('type' in data && data.type === 'initialize') { port.postMessage({ type: 'ready', pid: process.pid }); return }
  if (!('requestId' in data)) return
  const reply: Reply = { requestId: data.requestId, ok: true }
  try {
    if (data.operation === 'shutdown') { reply.result = { shutdown: true }; setTimeout(() => process.exit(0), 100) }
    else if (data.operation === 'database') {
      const resource = String(data.payload.resource), db = new Database(':memory:')
      try {
        db.loadExtension(join(resource, 'simple.dll'))
        db.prepare('SELECT jieba_dict(?)').get(join(resource, 'dict'))
        db.exec("CREATE VIRTUAL TABLE content USING fts5(body, tokenize='simple')")
        db.prepare('INSERT INTO content(body) VALUES(?)').run('工作站支持中文搜索，周杰伦')
        const chinese = db.prepare('SELECT body FROM content WHERE content MATCH simple_query(?)').all('中文')
        const pinyin = db.prepare('SELECT body FROM content WHERE content MATCH simple_query(?)').all('zjl')
        const jieba = db.prepare('SELECT body FROM content WHERE content MATCH jieba_query(?)').all('中文搜索')
        if (chinese.length !== 1 || pinyin.length !== 1 || jieba.length !== 1) throw new Error('FTS_QUERY_FAILED')
        reply.result = { versions: process.versions, sqlite: db.prepare('SELECT sqlite_version() AS version').get(), resource, chinese, pinyin, jieba, native: Object.keys(require.cache).filter(p => p.endsWith('.node')) }
      } finally { db.close() }
    } else throw new Error('INVALID_OPERATION')
  } catch (error) { reply.ok = false; reply.error = { code: 'DATA_ERROR', message: String(error) } }
  port.postMessage(reply)
})
port.postMessage({ type: 'booted', pid: process.pid })
