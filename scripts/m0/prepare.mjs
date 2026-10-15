import { extractZip } from './zip.mjs'
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { root, lock, receiptFile, check, fail, fileBytes, verifyHash, verifyPE, verifyVersions, tree, record, run, nativeFiles, nativeLicenses, saveJSON, sha256 } from './preparation.mjs'

async function download(item, destination) {
  const stage = join(root, '.m0-scratch/downloads/intake-' + randomUUID())
  mkdirSync(stage, { recursive: true })
  const url = new URL(item.url)
  if (url.protocol !== 'https:' || url.username || url.password) fail('M0_DOWNLOAD_URL', item.url)
  console.log(`Downloading ${item.url}; expected SHA-256=${item.sha256}; source=${item.checksumSource || item.metadataSource}`)
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) })
  if (!response.ok) fail('M0_DOWNLOAD_FAILED', `${item.url}; HTTP ${response.status}`)
  const chunks = []; let length = 0
  for await (const chunk of response.body) {
    length += chunk.length
    if (length > item.size) fail('M0_DOWNLOAD_SIZE', `${item.url}; exceeds expected ${item.size}`)
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  writeFileSync(join(stage, 'download.part'), bytes)
  if (length !== item.size) fail('M0_DOWNLOAD_SIZE', `${item.url}; expected=${item.size}; actual=${length}`)
  verifyHash(bytes, item.sha256, item.url)
  if (item.gitBlob) {
    const actual = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')
    if (actual !== item.gitBlob) fail('M0_SOURCE_BLOB_MISMATCH', item.url)
  }
  if (existsSync(destination)) fail('M0_WOULD_OVERWRITE', destination)
  mkdirSync(dirname(destination), { recursive: true }); copyFileSync(join(stage, 'download.part'), destination)
  const finalUrl = new URL(response.url); finalUrl.search = ''; finalUrl.hash = ''
  saveJSON(root, '.m0-scratch/downloads/' + stage.split(/[\\/]/).pop() + '/source.json', { ...item, received: new Date().toISOString(), bytes: length, verifiedSha256: sha256(bytes), finalUrl: finalUrl.href })
}
async function prepare() {
  verifyVersions(root)
  if (existsSync(join(root, receiptFile))) { const receipt = check(); console.log(JSON.stringify({ status: 'already-prepared', checkedFiles: receipt.files.length })); return }
  if (!process.argv.includes('--allow-downloads')) fail('M0_DOWNLOAD_NOT_AUTHORIZED', 'explicit --allow-downloads required')
  const env = { ...process.env, electron_config_cache: join(root, '.m0-scratch/cache/electron'), ELECTRON_BUILDER_CACHE: join(root, '.m0-scratch/cache/builder') }
  for (const key of Object.keys(env)) if (/^(NODE_PATH|NODE_OPTIONS|ELECTRON_(OVERRIDE_DIST_PATH|MIRROR|CUSTOM_DIR|CUSTOM_FILENAME|RUN_AS_NODE|SKIP_BINARY_DOWNLOAD)|npm_config_(build_from_source|arch|platform|target|runtime|disturl|electron.*)|electron_(mirror|use_remote_checksums))$/i.test(key)) delete env[key]
  env.ELECTRON_INSTALL_PLATFORM = 'win32'; env.ELECTRON_INSTALL_ARCH = 'x64'
  const protectedPaths = ['node_modules/electron/dist', 'node_modules/node-pty/build/Release', lock.simple.archive, lock.simple.directory, '.m0-scratch/downloads/simple-license']
  for (const file of protectedPaths) if (existsSync(join(root, file))) fail('M0_EXISTING_UNVERIFIED_RESOURCE', `${file}; existing environment preserved; use a new clean directory, or inspect a previous failed preparation manually`)
  const npmLock = JSON.parse(fileBytes(root, 'package-lock.json'))
  for (const [name, version] of Object.entries(lock.versions)) {
    const entry = npmLock.packages['node_modules/' + name]
    if (entry?.version !== version || !entry.resolved?.startsWith('https://registry.npmjs.org/') || !entry.integrity?.startsWith('sha512-')) fail('M0_NPM_LOCK_MISMATCH', name)
  }
  for (const file of [nativeFiles[0], nativeFiles[1], nativeFiles[4], nativeFiles[5]]) verifyPE(fileBytes(root, file), file)
  for (const file of nativeLicenses) fileBytes(root, file)
  const checksums = JSON.parse(fileBytes(root, 'node_modules/electron/checksums.json'))
  if (checksums[`electron-v${lock.versions.electron}-win32-x64.zip`] !== lock.electron.sha256) fail('M0_ELECTRON_CHECKSUM_SOURCE_MISMATCH', 'npm checksums.json and pinned official Release digest differ')
  run(process.execPath, [join(root, 'node_modules/electron/install.js')], { env })
  const cacheZips = tree(root, '.m0-scratch/cache/electron').filter(p => p.endsWith(`electron-v${lock.versions.electron}-win32-x64.zip`))
  if (cacheZips.length !== 1) fail('M0_ELECTRON_ARCHIVE_MISSING', JSON.stringify(cacheZips))
  verifyHash(fileBytes(root, cacheZips[0]), lock.electron.sha256, cacheZips[0])
  run(process.execPath, [join(root, 'node_modules/node-pty/scripts/prebuild.js')], { env })
  run(process.execPath, [join(root, 'node_modules/node-pty/scripts/post-install.js')], { env })
  for (const file of ['conpty.dll', 'OpenConsole.exe']) verifyHash(fileBytes(root, `node_modules/node-pty/build/Release/conpty/${file}`), sha256(fileBytes(root, `node_modules/node-pty/third_party/conpty/${lock.conpty}/win10-x64/${file}`)), file)
  await download(lock.simple, join(root, lock.simple.archive))
  extractZip(fileBytes(root, lock.simple.archive), join(root, lock.simple.directory))
  for (const file of lock.simple.files) fileBytes(root, `${lock.simple.directory}/${lock.simple.prefix}/${file}`)
  for (const item of lock.licenses) await download({ ...item, size: item.bytes }, join(root, '.m0-scratch/downloads/simple-license', item.file))
  const probes = {}
  for (const [name, executable, extra] of [['host', process.execPath, {}], ['electron', join(root, 'node_modules/electron/dist/electron.exe'), { ELECTRON_RUN_AS_NODE: '1' }]]) {
    const result = run(executable, [join(root, 'scripts/m0/native-probe.cjs')], { env: { ...env, ...extra }, encoding: 'utf8', stdio: 'pipe' })
    console.log(`${name} native probe:\n${result.stdout}`)
    probes[name] = JSON.parse(result.stdout)
    if (name === 'electron' && probes[name].versions.electron !== lock.versions.electron) fail('M0_ELECTRON_RUNTIME_MISMATCH', result.stdout)
  }
  const files = [...nativeFiles, ...nativeLicenses, lock.simple.archive, ...tree(root, 'node_modules/electron/dist'), 'node_modules/electron/path.txt', ...tree(root, lock.simple.directory), ...lock.licenses.map(x => `.m0-scratch/downloads/simple-license/${x.file}`)]
  const receipt = { schema: 1, prepared: new Date().toISOString(), lockSha256: sha256(fileBytes(root, 'scripts/m0/resources.lock.json')), npmLockSha256: sha256(fileBytes(root, 'package-lock.json')), versions: lock.versions, probes, files: record(root, files) }
  saveJSON(root, receiptFile, receipt)
  check(); console.log(JSON.stringify({ status: 'pass', prepared: receipt.prepared, files: receipt.files.length }))
}
prepare().catch(error => { console.error(String(error.stack || error)); process.exitCode = 1 })
