import { zipEntries, extractZip } from '../../scripts/m0/zip.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { root, lock, inside, fileBytes, verifyHash, verifyPE, verifyPlatform, verifyVersions, run, check, sha256, nativeFiles, nativeLicenses, receiptFile } from '../../scripts/m0/preparation.mjs'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'jianzj-m0-preparation-test-'))
  const put = (name, bytes) => { const file = join(dir, name); mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, bytes) }
  for (const [name, version] of Object.entries(lock.versions)) put('node_modules/' + name + '/package.json', JSON.stringify({ version }))
  return { dir, put }
}
test('preparation rejects platform/architecture and non-AMD64 PE before native load', () => {
  assert.throws(() => verifyPlatform('linux', 'x64'), /M0_PLATFORM_MISMATCH/)
  assert.throws(() => verifyPlatform('win32', 'arm64'), /M0_PLATFORM_MISMATCH/)
  assert.throws(() => verifyPE(Buffer.alloc(2), 'fixture'), /M0_ARCH_MISMATCH/)
  const pe = Buffer.alloc(128); pe.write('MZ'); pe.writeUInt32LE(64, 60); pe.writeUInt32LE(0x4550, 64); pe.writeUInt16LE(0x8664, 68)
  verifyPE(pe, 'synthetic AMD64 header')
  pe.writeUInt16LE(0xaa64, 68); assert.throws(() => verifyPE(pe, 'fixture'), /M0_ARCH_MISMATCH/)
})
test('missing resources and incorrect fixed versions identify the file/module', () => {
  const { dir, put } = fixture()
  verifyVersions(dir)
  assert.throws(() => fileBytes(dir, 'missing-LICENSE'), /M0_FILE_MISSING.*missing-LICENSE/)
  put('node_modules/node-pty/package.json', JSON.stringify({ version: '0.0.0' }))
  assert.throws(() => verifyVersions(dir), /M0_VERSION_MISMATCH.*node-pty/)
})
test('cache hits are still hashed; path traversal cannot read outside project', () => {
  const { dir, put } = fixture(); put('cached.zip', 'fixture bytes')
  verifyHash(fileBytes(dir, 'cached.zip'), sha256(Buffer.from('fixture bytes')), 'cache')
  put('cached.zip', 'tampered')
  assert.throws(() => verifyHash(fileBytes(dir, 'cached.zip'), sha256(Buffer.from('fixture bytes')), 'cache'), /M0_HASH_MISMATCH.*expected=.*actual=/)
  assert.throws(() => inside(dir, '../outside'), /M0_PATH_OUTSIDE_PROJECT/)
})
test('preflight rejects incomplete receipt and missing license; it never downloads', () => {
  const { dir, put } = fixture()
  assert.throws(() => check(dir), /M0_PREPARATION_MISSING/)
  put('scripts/m0/resources.lock.json', readFileSync(join(root, 'scripts/m0/resources.lock.json')))
  put('package-lock.json', '{}')
  const required = ['node_modules/electron/dist/version', 'node_modules/electron/path.txt', lock.simple.archive, ...nativeFiles, ...nativeLicenses, 'node_modules/electron/dist/electron.exe', 'node_modules/electron/dist/LICENSE', 'node_modules/electron/dist/LICENSES.chromium.html', ...lock.simple.files.map(p => `${lock.simple.directory}/${lock.simple.prefix}/${p}`), ...lock.licenses.map(x => `.m0-scratch/downloads/simple-license/${x.file}`)]
  const files = required.map(file => ({ file, sha256: sha256(Buffer.from('fixture')) }))
  const receipt = { schema: 1, npmLockSha256: sha256(Buffer.from('{}')), lockSha256: sha256(readFileSync(join(root, 'scripts/m0/resources.lock.json'))), files }
  put(receiptFile, JSON.stringify({ ...receipt, files: [] })); assert.throws(() => check(dir), /M0_RECEIPT_INCOMPLETE/)
  for (const f of required) if (f !== '.m0-scratch/downloads/simple-license/LICENSE') put(f, 'fixture')
  put(receiptFile, JSON.stringify(receipt))
  assert.throws(() => check(dir), /M0_FILE_MISSING.*simple-license/)
  assert.equal(existsSync(join(dir, '.m0-scratch/downloads/intake')), false)
})
test('child command nonzero exit is not hidden', () => {
  assert.throws(() => run(process.execPath, ['-e', 'process.exit(23)'], { stdio: 'pipe' }), /M0_COMMAND_FAILED.*exit=23/)
})
test('offline CLI fails without receipt without creating download/cache directories', () => {
  const script = readFileSync(join(root, 'scripts/m0/preflight.mjs'), 'utf8')
  assert.ok(!/fetch|downloadArtifact/.test(script))
  const before = existsSync(join(root, '.m0-scratch')) ? readdirSync(join(root, '.m0-scratch')).sort() : []
  const result = spawnSync(process.execPath, [join(root, 'scripts/m0/preflight.mjs')], { encoding: 'utf8' })
  if (existsSync(join(root, receiptFile))) assert.equal(result.status, 0, result.stderr)
  else { assert.notEqual(result.status, 0); assert.match(result.stderr, /M0_PREPARATION_MISSING/) }
  const after = existsSync(join(root, '.m0-scratch')) ? readdirSync(join(root, '.m0-scratch')).sort() : []
  assert.deepEqual(after, before)
})
function emptyZip(name) {
  const n = Buffer.from(name), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22)
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(n.length, 26)
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(n.length, 28)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + n.length, 12); end.writeUInt32LE(local.length + n.length, 16)
  return Buffer.concat([local, n, central, n, end])
}
test('ZIP traversal and reserved Windows paths are rejected before writing', () => {
  const { dir } = fixture(), destination = join(dir, 'extracted')
  for (const name of ['../escaped.txt', '/absolute', 'C:/drive', 'CON.txt', 'folder/../bad', 'folder./bad']) assert.throws(() => extractZip(emptyZip(name), destination), /M0_UNSAFE_ZIP_ENTRY/)
  assert.equal(existsSync(destination), false)
  assert.deepEqual(zipEntries(emptyZip('valid.txt')).map(x => x.name), ['valid.txt'])
  extractZip(emptyZip('valid.txt'), destination)
  assert.equal(readFileSync(join(destination, 'valid.txt')).length, 0)
})
test('prepare requires explicit download authorization in a new project', () => {
  const { dir, put } = fixture()
  for (const name of ['prepare.mjs', 'preparation.mjs', 'zip.mjs', 'resources.lock.json']) put('scripts/m0/' + name, readFileSync(join(root, 'scripts/m0', name)))
  const result = spawnSync(process.execPath, [join(dir, 'scripts/m0/prepare.mjs')], { cwd: dir, encoding: 'utf8' })
  assert.notEqual(result.status, 0); assert.match(result.stderr, /M0_DOWNLOAD_NOT_AUTHORIZED/)
  assert.equal(existsSync(join(dir, '.m0-scratch')), false)
})
