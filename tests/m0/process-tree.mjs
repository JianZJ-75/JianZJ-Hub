import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const directory = resolve(process.argv[2]), role = process.argv[3]
if (!['child', 'grandchild'].includes(role)) throw new Error('INVALID_TEST_ROLE')
writeFileSync(join(directory, `${role}.json`), JSON.stringify({ pid: process.pid, role, started: new Date().toISOString() }))
if (role === 'child') {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), directory, 'grandchild'], { env: process.env, stdio: 'ignore', windowsHide: true, detached: true })
  child.on('error', error => { console.error(error); process.exit(1) })
  child.unref()
}
setInterval(() => {}, 1000)
