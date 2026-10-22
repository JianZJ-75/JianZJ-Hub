import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
const target = process.argv[2]
function run(script, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: resolve('.'), env: { ...process.env, ...extraEnv }, stdio: 'inherit' })
  if (result.error || result.status !== 0) throw result.error || new Error('M1_TEST_FAILED:' + script + ':' + result.status)
}
if (target === 'dev') {
  run('scripts/m1/record.mjs', ['build-test', 'node_modules/electron-vite/bin/electron-vite.js', 'build', '--config', 'electron.vite.m1.config.ts'], { M1_TEST_BUILD: '1' })
  for (const [entry, mode] of [['probe','normal'], ['desktop','normal'], ['stress','normal'], ['bash','normal'], ['paste','normal'], ['ime','cdp'], ['visual','normal'], ['tui','classic'], ['tui','fullscreen'], ['fault','service-fault'], ['fault','main-crash']]) run('scripts/m1/record.mjs', [entry + '-' + mode, 'scripts/m1/probe-run.mjs', entry, mode])
} else if (target === 'packaged') run('scripts/m1/record.mjs', ['packaged-runtime', 'scripts/m1/packaged-test.mjs'])
else throw new Error('Expected dev or packaged')
