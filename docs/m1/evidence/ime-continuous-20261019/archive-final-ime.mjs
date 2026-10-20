import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const root = resolve('.'), scratch = join(root, '.m1-scratch'), dest = join(root, 'docs/m1/evidence/ime-continuous-20261019'), require = createRequire(import.meta.url)
mkdirSync(dest, { recursive: true })
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const copy = (file, name) => { const target = join(dest, name); mkdirSync(join(target, '..'), { recursive: true }); copyFileSync(file, target) }
const manifest = JSON.parse(readFileSync(join(scratch, 'latest-package.json')))
for (const item of [...manifest.artifacts, manifest.zip]) if (sha(item.file) !== item.sha256) throw Error('ARTIFACT_CHANGED:' + item.file)
const zipTest = spawnSync(join(root, 'node_modules/electron-winstaller/vendor/7z-x64.exe'), ['t', manifest.zip.file], { encoding: 'utf8' })
writeFileSync(join(dest, 'zip-test.stdout.log.txt'), zipTest.stdout || ''); writeFileSync(join(dest, 'zip-test.stderr.log.txt'), zipTest.stderr || '')
if (zipTest.error || zipTest.status !== 0) throw Error('ZIP_TEST_FAILED')
const asar = require('@electron/asar'), packageList = asar.listPackage(manifest.archive)
if (packageList.some(file => /[\\/](probe|desktop|stress|fault|tui|bash|visual|paste|ime)\.js$/.test(file))) throw Error('TEST_ENTRY_IN_PRODUCT')
const protectedPaths = ['docs/m0','scripts/m0','tests/m0','src/adapters/windows/job-object.ts','src/main/index.ts','src/main/m0-checks.ts','src/main/m0-service.ts','src/preload/index.ts','src/renderer/m0.tsx','src/renderer/m0.css','src/renderer/index.html','src/services/pty/m0.ts','src/services/pty/session.m0.ts','src/services/pty/lifecycle.mjs','src/services/data/m0.ts','src/shared/m0-protocol.ts','src/shared/validation.mjs','package-lock.json','electron.vite.config.ts','electron-builder.m0.json']
if (spawnSync('git', ['diff','--exit-code','HEAD','--',...protectedPaths]).status !== 0) throw Error('PROTECTED_BASELINE_CHANGED')
const prototypeSha256 = sha(join(root,'prototypes/comfort-redesign/workstation-comfort.html'))
if (prototypeSha256 !== '1033c2dab321312f09ac220450d2fea7fbbf0f905ade18c450a5ed1281e6917a') throw Error('PROTOTYPE_CHANGED')
const identities = new Map(), commands = []
function collect(value) {
  if (!value || typeof value !== 'object') return
  for (const [pid, time] of [['pid','createdAt'],['mainPid','createdAt'],['workerPid','workerCreatedAt']]) {
    if (Number.isInteger(value[pid]) && /^\d+$/.test(value[time] || '')) identities.set(value[pid] + ':' + value[time], { pid: value[pid], createdAt: value[time] })
  }
  for (const item of Object.values(value)) if (typeof item === 'object') collect(item)
}
for (const entry of readdirSync(scratch)) {
  const dir = join(scratch, entry)
  if (!statSync(dir).isDirectory() || !/^(ime|probe|desktop|stress|bash|paste|fault|tui|visual|packaged)-/.test(entry)) continue
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    if (!statSync(file).isFile() || !(/\.(json|jsonl|png|log)$/.test(name))) continue
    copy(file, 'runtime/' + entry + '/' + name + (name.endsWith('.log') ? '.txt' : ''))
    if (name.endsWith('.json')) collect(JSON.parse(readFileSync(file)))
  }
}
for (const entry of readdirSync(join(scratch, 'commands'))) {
  const dir = join(scratch, 'commands', entry), file = join(dir, 'command.json')
  if (!existsSync(file)) continue
  const command = JSON.parse(readFileSync(file)); if (!command.finished) continue
  commands.push(command)
  for (const name of ['command.json','stdout.log','stderr.log']) if (existsSync(join(dir, name))) copy(join(dir, name), 'commands/' + entry + '/' + name + (name.endsWith('.log') ? '.txt' : ''))
}
const { ProcessHandle } = require(join(root, 'out/m1/main/job-adapter.js')), records = []
for (const identity of identities.values()) {
  let handle
  try { handle = new ProcessHandle(identity.pid, false); records.push({ ...identity, status: handle.createdAt !== identity.createdAt ? 'pid-reused' : handle.exited ? 'exited' : 'matching-live', currentCreatedAt: handle.createdAt }) }
  catch (error) { records.push({ ...identity, status: /Win32 87\b/.test(String(error)) ? 'not-present' : 'unverifiable', error: String(error) }) }
  finally { handle?.dispose() }
}
const cleanup = { checked: new Date().toISOString(), identities: records.length, matchingLive: records.filter(r => r.status === 'matching-live').length, unverifiable: records.filter(r => r.status === 'unverifiable').length, pidReused: records.filter(r => r.status === 'pid-reused').length, records }
writeFileSync(join(dest, 'cleanup.json'), JSON.stringify(cleanup, null, 2))
writeFileSync(join(dest, 'command-index.json'), JSON.stringify(commands, null, 2))
writeFileSync(join(dest, 'package-manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(join(dest, 'preservation.json'), JSON.stringify({ protectedPaths, noProtectedDiff: true, prototypeSha256, zipTestExitCode: zipTest.status, archiveContainsTestEntries: false }, null, 2))
const sources = []
function visitSource(dir) { for (const name of readdirSync(dir)) { const file = join(dir, name); if (statSync(file).isDirectory()) visitSource(file); else sources.push({ file: relative(root, file).split(String.fromCharCode(92)).join('/'), bytes: statSync(file).size, sha256: sha(file) }) } }
for (const dir of ['src','scripts/m1','tests/m1']) visitSource(join(root, dir))
writeFileSync(join(dest, 'source-manifest.json'), JSON.stringify(sources, null, 2))
copy(new URL(import.meta.url), 'archive-final-ime.mjs')
for (const name of ['src/renderer/workstation/keyboard.mjs','src/renderer/workstation/terminals.ts','tests/m1/composition.test.mjs','tests/m1/ime.ts']) copy(join(root, name), 'source/' + name)
const files = []
function visit(dir) { for (const name of readdirSync(dir)) { const file = join(dir, name); if (statSync(file).isDirectory()) visit(file); else if (!['archive-index.json','README.md'].includes(name)) files.push({ file: relative(dest, file).split(String.fromCharCode(92)).join('/'), bytes: statSync(file).size, sha256: sha(file) }) } }
visit(dest); writeFileSync(join(dest, 'archive-index.json'), JSON.stringify(files, null, 2))
console.log(JSON.stringify({ files: files.length, commands: commands.length, identities: cleanup.identities, matchingLive: cleanup.matchingLive, unverifiable: cleanup.unverifiable, zipTestExitCode: zipTest.status }))
if (cleanup.matchingLive || cleanup.unverifiable) process.exitCode = 1
