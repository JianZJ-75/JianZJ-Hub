import { join } from 'node:path'
import { createRequire } from 'node:module'
import { root, lock, check, run, fileBytes, verifyHash, saveJSON, record, nativeFiles, nativeLicenses } from './preparation.mjs'
try {
  const receipt = check(), require = createRequire(import.meta.url)
  for (const file of ['out/main/index.js', 'out/main/pty-service.js', 'out/main/pty-session.js', 'out/main/data-service.js', 'out/main/job-adapter.js', 'out/preload/index.js', 'out/renderer/index.html']) fileBytes(root, file)
  const config = JSON.parse(fileBytes(root, 'electron-builder.m0.json'))
  if (config.npmRebuild !== false) throw new Error('M0_NPM_REBUILD_MUST_REMAIN_DISABLED')
  const env = { ...process.env, ELECTRON_BUILDER_CACHE: join(root, '.m0-scratch/cache/builder'), electron_config_cache: join(root, '.m0-scratch/cache/electron') }
  for (const key of Object.keys(env)) if (/^(NODE_PATH|NODE_OPTIONS|ELECTRON_(OVERRIDE_DIST_PATH|MIRROR|CUSTOM_DIR|CUSTOM_FILENAME|RUN_AS_NODE)|npm_config_(build_from_source|arch|platform|target|runtime|disturl|electron.*))$/i.test(key)) delete env[key]
  run(process.execPath, [join(root, 'node_modules/electron-builder/cli.js'), '--win', '--x64', '--dir', '--publish', 'never', '--config', 'electron-builder.m0.json', `--config.electronDist=${join(root, 'node_modules/electron/dist')}`], { env })
  const archive = join(root, 'release/m0/win-unpacked/resources/app.asar'), asar = require('@electron/asar')
  const comparisons = []
  for (const file of [...nativeFiles, ...nativeLicenses]) {
    const bytes = asar.extractFile(archive, join(...file.split('/'))), expected = receipt.files.find(x => x.file === file).sha256
    verifyHash(bytes, expected, `packaged ${file}`)
    verifyHash(fileBytes(root, 'release/m0/win-unpacked/resources/app.asar.unpacked/' + file), expected, `unpacked ${file}`)
    comparisons.push({ file, sha256: expected })
  }
  const resourcePrefix = `${lock.simple.directory}/${lock.simple.prefix}/`
  for (const item of receipt.files.filter(x => x.file.startsWith(resourcePrefix) || x.file.startsWith('.m0-scratch/downloads/simple-license/'))) {
    const destination = item.file.startsWith(resourcePrefix) ? item.file.slice(resourcePrefix.length) : 'licenses/' + item.file.split('/').pop()
    verifyHash(fileBytes(root, 'release/m0/win-unpacked/resources/simple/' + destination), item.sha256, destination)
    comparisons.push({ file: 'resources/simple/' + destination, sha256: item.sha256 })
  }
  for (const [source, destination] of [['LICENSE', 'LICENSE.electron.txt'], ['LICENSES.chromium.html', 'LICENSES.chromium.html']]) verifyHash(fileBytes(root, 'release/m0/win-unpacked/' + destination), receipt.files.find(x => x.file === 'node_modules/electron/dist/' + source).sha256, destination)
  saveJSON(root, '.m0-scratch/package-verification.json', { checked: new Date().toISOString(), comparisons, artifacts: record(root, ['release/m0/win-unpacked/JianZJ Hub M0.exe', 'release/m0/win-unpacked/resources/app.asar']) })
  console.log(`M0_PACKAGE_VERIFIED: ${comparisons.length} native/resource/license comparisons`)
} catch (error) { console.error(String(error.stack || error)); process.exitCode = 1 }
