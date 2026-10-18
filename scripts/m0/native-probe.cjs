const path = require('node:path')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../..'), local = createRequire(path.join(root, 'package.json'))
for (const name of ['node-pty', 'better-sqlite3', 'koffi']) {
  const resolved = local.resolve(name)
  if (!resolved.toLowerCase().startsWith((root + path.sep).toLowerCase())) throw Error('M0_EXTERNAL_MODULE:' + resolved)
}
local('./node_modules/node-pty/prebuilds/win32-x64/conpty.node')
const koffi = local('koffi'), kernel = koffi.load('kernel32.dll')
const currentPid = kernel.func('uint32_t __stdcall GetCurrentProcessId()')()
if (currentPid !== process.pid) throw Error('M0_KOFFI_CALL_FAILED')
const Database = local('better-sqlite3'), db = new Database(':memory:')
let sqlite
try {
  const resource = path.join(root, '.m0-scratch/downloads/simple-0.7.1/extracted/libsimple-windows-x64')
  db.loadExtension(path.join(resource, 'simple.dll'))
  db.prepare('SELECT jieba_dict(?)').get(path.join(resource, 'dict'))
  db.exec("CREATE VIRTUAL TABLE probe USING fts5(body, tokenize='simple')")
  db.prepare('INSERT INTO probe VALUES (?)').run('工作站支持中文搜索，周杰伦')
  for (const [query, value] of [['simple_query', '中文'], ['simple_query', 'zjl'], ['jieba_query', '中文搜索']]) {
    if (db.prepare(`SELECT body FROM probe WHERE probe MATCH ${query}(?)`).all(value).length !== 1) throw Error('M0_SQLITE_SIMPLE_QUERY_FAILED')
  }
  sqlite = db.prepare('SELECT sqlite_version() AS version').get()
} finally { db.close() }
const bindings = Object.keys(require.cache).filter(p => p.endsWith('.node'))
for (const file of bindings) if (!file.toLowerCase().startsWith((root + path.sep).toLowerCase())) throw Error('M0_EXTERNAL_NATIVE:' + file)
console.log(JSON.stringify({ versions: process.versions, platform: process.platform, arch: process.arch, executable: process.execPath, sqlite, currentPid, bindings }, null, 2))
