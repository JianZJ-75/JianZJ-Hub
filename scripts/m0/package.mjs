import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const env = { ...process.env, ELECTRON_BUILDER_CACHE: join(root, '.m0-scratch/cache/builder'), electron_config_cache: join(root, '.m0-scratch/cache/electron') }
const result = spawnSync(process.execPath, [join(root, 'node_modules/electron-builder/cli.js'), '--win', '--x64', '--dir', '--publish', 'never', '--config', 'electron-builder.m0.json'], { cwd: root, env, stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
