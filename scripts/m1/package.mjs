import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { check, nativeFiles, nativeLicenses, fileBytes, verifyHash } from '../m0/preparation.mjs'
const root = resolve('.'), source = resolve(process.env.M1_RESOURCE_SOURCE || 'D:/Code/JianZJ-Hub-M0-repro-20261015-37002e9f/project')
const receipt = check(source), lock = readFileSync(join(root, 'package-lock.json'))
for (const name of ['probe', 'desktop', 'stress', 'fault', 'tui', 'bash', 'visual', 'paste', 'ime']) if (existsSync(join(root, 'out/m1/main', name + '.js'))) throw new Error('PRODUCT_BUILD_REQUIRED: run npm run m1:build without M1_TEST_BUILD')
verifyHash(lock, receipt.npmLockSha256, 'current package-lock')
const key = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8)
const stage = join(root, '.m1-scratch', 'package-' + key), output = join(root, 'release/m1', key)
mkdirSync(stage, { recursive: true }); mkdirSync(output, { recursive: true })
// Offline, immutable source reuse; never run preparation against the old workspace.
cpSync(join(source, 'node_modules'), join(stage, 'node_modules'), { recursive: true })
cpSync(join(root, 'out/m1'), join(stage, 'out/m1'), { recursive: true, filter: path => !/[/\\](probe|desktop|stress|fault|tui|bash|visual|paste|ime)\.js$/.test(path) })
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: pkg.name, version: '0.1.0', private: true, description: '工作站 — M1 真实终端工作区', main: 'out/m1/main/index.js', dependencies: Object.fromEntries(['node-pty', 'koffi', 'better-sqlite3'].map(name => [name, pkg.dependencies[name]])) }, null, 2))
mkdirSync(join(stage, 'licenses'))
for (const [name, file] of [['node-pty', 'LICENSE'], ['better-sqlite3', 'LICENSE'], ['koffi', 'LICENSE.txt'], ['react', 'LICENSE'], ['react-dom', 'LICENSE'], ['@xterm/xterm', 'LICENSE'], ['@xterm/addon-fit', 'LICENSE']]) cpSync(join(source, 'node_modules', name, file), join(stage, 'licenses', name.replaceAll('/', '-') + '.txt'))
for (const file of [...nativeFiles, ...nativeLicenses]) verifyHash(fileBytes(stage, file), receipt.files.find(x => x.file === file).sha256, file)
const env = { ...process.env, ELECTRON_BUILDER_CACHE: join(root, '.m1-scratch', 'builder-cache') }; delete env.ELECTRON_RUN_AS_NODE
const args = [join(root, 'node_modules/electron-builder/cli.js'), '--projectDir', stage, '--win', '--x64', '--dir', '--publish', 'never', '--config', join(root, 'electron-builder.m1.json'), '--config.directories.output=' + output, '--config.electronDist=' + join(source, 'node_modules/electron/dist')]
const child = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
writeFileSync(join(output, 'builder.stdout.log'), child.stdout || ''); writeFileSync(join(output, 'builder.stderr.log'), child.stderr || '')
process.stdout.write(child.stdout || ''); process.stderr.write(child.stderr || '')
if (child.error || child.status !== 0) throw child.error || new Error('BUILDER_FAILED:' + child.status)
const require = createRequire(import.meta.url), asar = require('@electron/asar'), archive = join(output, 'win-unpacked/resources/app.asar')
const comparisons = []
for (const file of [...nativeFiles, ...nativeLicenses]) {
  const expected = receipt.files.find(x => x.file === file).sha256
  verifyHash(asar.extractFile(archive, join(...file.split('/'))), expected, 'asar:' + file)
  verifyHash(readFileSync(join(output, 'win-unpacked/resources/app.asar.unpacked', file)), expected, 'unpacked:' + file)
  comparisons.push({ file, sha256: expected })
}
const list = asar.listPackage(archive)
if (list.some(path => /[/\\](probe|desktop|stress|fault|tui|bash|visual|paste|ime)\.js$/.test(path))) throw new Error('TEST_ENTRY_IN_PRODUCT')
const exe = join(output, 'win-unpacked/Workstation.exe')
if (!existsSync(exe)) throw new Error('EXECUTABLE_MISSING')
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const manifest = { created: new Date().toISOString(), source, sourceReceiptSha256: sha(join(source, '.m0-scratch/prepared.json')), staging: stage, output, executable: exe, archive, artifacts: [exe, archive].map(file => ({ file, sha256: sha(file) })), nativeComparisons: comparisons, signed: false, downloads: false }
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2)); writeFileSync(join(root, '.m1-scratch/latest-package.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify(manifest, null, 2))
