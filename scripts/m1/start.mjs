import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(require('electron'), [resolve('out/m1/main/index.js')], { env, stdio: 'inherit', windowsHide: false })
child.on('exit', code => { process.exitCode = code ?? 1 }); child.on('error', error => { console.error(error); process.exitCode = 1 })
