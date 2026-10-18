import { spawn } from 'node:child_process'
import { mkdirSync, createWriteStream, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
const [label, script, ...args] = process.argv.slice(2), directory = resolve('.m1-scratch/commands', label + '-' + randomUUID())
mkdirSync(directory, { recursive: true })
const record = { cwd: process.cwd(), executable: process.execPath, args: [script, ...args], started: new Date().toISOString(), directory }
const child = spawn(process.execPath, [script, ...args], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
const stdout = createWriteStream(join(directory, 'stdout.log')), stderr = createWriteStream(join(directory, 'stderr.log'))
child.stdout.on('data', bytes => { stdout.write(bytes); process.stdout.write(bytes) }); child.stderr.on('data', bytes => { stderr.write(bytes); process.stderr.write(bytes) })
child.on('error', error => { record.error = String(error) })
child.on('close', code => { record.finished = new Date().toISOString(); record.exitCode = code; stdout.end(); stderr.end(); writeFileSync(join(directory, 'command.json'), JSON.stringify(record, null, 2)); console.log(JSON.stringify(record)); process.exitCode = code ?? 1 })
