import { existsSync, readFileSync, readdirSync, lstatSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, relative, isAbsolute, dirname, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const lock = JSON.parse(readFileSync(new URL('./resources.lock.json', import.meta.url), 'utf8'))
export const receiptFile = '.m0-scratch/prepared.json'
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export function fail(code, detail) { throw new Error(`${code}: ${detail}. Run npm run m0:prepare -- --allow-downloads in a clean project; no automatic rebuild/toolchain fallback.`) }
export function inside(base, file) {
  const full = resolve(base, file), rel = relative(base, full)
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) fail('M0_PATH_OUTSIDE_PROJECT', file)
  return full
}
export function fileBytes(base, file) {
  const full = inside(base, file)
  if (!existsSync(full)) fail('M0_FILE_MISSING', file)
  const stat = lstatSync(full)
  if (!stat.isFile() || stat.isSymbolicLink()) fail('M0_NOT_REGULAR_FILE', file)
  inside(base, realpathSync(full))
  return readFileSync(full)
}
export function verifyHash(bytes, expected, label) {
  const actual = sha256(bytes)
  if (actual !== expected) fail('M0_HASH_MISMATCH', `${label}; expected=${expected}; actual=${actual}`)
  return actual
}
export function verifyPlatform(platform = process.platform, arch = process.arch) {
  if (platform !== lock.platform || arch !== lock.arch) fail('M0_PLATFORM_MISMATCH', `expected=win32/x64; actual=${platform}/${arch}`)
}
export function verifyPE(bytes, label) {
  const offset = bytes.length >= 64 ? bytes.readUInt32LE(60) : -1
  if (bytes.toString('ascii', 0, 2) !== 'MZ' || offset < 0 || offset + 6 > bytes.length || bytes.readUInt32LE(offset) !== 0x4550 || bytes.readUInt16LE(offset + 4) !== 0x8664) fail('M0_ARCH_MISMATCH', `${label}; expected PE AMD64`)
}
export function verifyVersions(base) {
  verifyPlatform()
  for (const [name, expected] of Object.entries(lock.versions)) {
    const actual = JSON.parse(fileBytes(base, `node_modules/${name}/package.json`)).version
    if (actual !== expected) fail('M0_VERSION_MISMATCH', `${name}; expected=${expected}; actual=${actual}`)
  }
}
export function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.error || result.status !== 0) fail('M0_COMMAND_FAILED', `${executable} ${args.join(' ')}; exit=${result.status}; ${result.error || result.stderr || ''}`)
  return result
}
export function tree(base, folder) {
  const result = []
  function visit(file) {
    const full = inside(base, file), stat = lstatSync(full)
    if (stat.isSymbolicLink()) fail('M0_LINK_NOT_ALLOWED', file)
    if (stat.isDirectory()) for (const name of readdirSync(full).sort()) visit(join(file, name))
    else if (stat.isFile()) result.push(file.split(sep).join('/'))
    else fail('M0_NOT_REGULAR_FILE', file)
  }
  visit(folder)
  return result
}
export const nativeFiles = [
  'node_modules/node-pty/prebuilds/win32-x64/conpty.node',
  'node_modules/node-pty/prebuilds/win32-x64/conpty_console_list.node',
  'node_modules/node-pty/build/Release/conpty/conpty.dll',
  'node_modules/node-pty/build/Release/conpty/OpenConsole.exe',
  'node_modules/better-sqlite3/prebuilds/win32-x64.node',
  'node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node'
]
export const nativeLicenses = ['node_modules/node-pty/LICENSE', 'node_modules/better-sqlite3/LICENSE', 'node_modules/koffi/LICENSE.txt']
export function record(base, files) {
  return [...new Set(files)].sort().map(file => { const bytes = fileBytes(base, file); return { file, bytes: bytes.length, sha256: sha256(bytes) } })
}
export function check(base = root) {
  verifyVersions(base)
  if (!existsSync(join(base, receiptFile))) fail('M0_PREPARATION_MISSING', receiptFile)
  const receipt = JSON.parse(fileBytes(base, receiptFile))
  if (receipt.schema !== 1 || receipt.lockSha256 !== sha256(fileBytes(base, 'scripts/m0/resources.lock.json'))) fail('M0_PREPARATION_STALE', 'resource lock changed')
  if (receipt.npmLockSha256 !== sha256(fileBytes(base, 'package-lock.json'))) fail('M0_PREPARATION_STALE', 'npm lock changed')
  const required = ['node_modules/electron/dist/version', 'node_modules/electron/path.txt', lock.simple.archive, ...nativeFiles, ...nativeLicenses, 'node_modules/electron/dist/electron.exe', 'node_modules/electron/dist/LICENSE', 'node_modules/electron/dist/LICENSES.chromium.html', ...lock.simple.files.map(p => `${lock.simple.directory}/${lock.simple.prefix}/${p}`), ...lock.licenses.map(x => `.m0-scratch/downloads/simple-license/${x.file}`)]
  const entries = new Map(receipt.files.map(x => [x.file, x]))
  for (const file of required) if (!entries.has(file)) fail('M0_RECEIPT_INCOMPLETE', file)
  for (const item of receipt.files) verifyHash(fileBytes(base, item.file), item.sha256, item.file)
  verifyHash(fileBytes(base, lock.simple.archive), lock.simple.sha256, lock.simple.archive)
  for (const item of lock.licenses) verifyHash(fileBytes(base, `.m0-scratch/downloads/simple-license/${item.file}`), item.sha256, item.file)
  for (const file of [...nativeFiles, 'node_modules/electron/dist/electron.exe', `${lock.simple.directory}/${lock.simple.prefix}/simple.dll`]) verifyPE(fileBytes(base, file), file)
  if (fileBytes(base, 'node_modules/electron/dist/version').toString().trim().replace(/^v/, '') !== lock.versions.electron) fail('M0_ELECTRON_VERSION_MISMATCH', 'dist/version')
  return receipt
}
export function saveJSON(base, file, value) { const full = inside(base, file); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, JSON.stringify(value, null, 2) + '\n') }
